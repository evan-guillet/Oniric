use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use oniric_crash as workload;
use oniric_lib::project::{CrashChoice, OpenOptions, Project, Source, DB, LOCK};
use rusqlite::{Connection, OpenFlags};

const USAGE: &str = "\
Oniric — test de coupure (architecture, 12.1)

  coupure lancer [--dossier D] [--travail T] [--iterations N] [--graine G]
      Tue le programme N fois à un moment aléatoire (ouverture, écriture, recopie, fermeture) et vérifie après
      chaque coupure qu'aucune base n'est corrompue et qu'aucun lot validé n'est perdu.
";

fn args_map(args: &[String]) -> HashMap<String, String> {
    args.chunks(2)
        .filter(|c| c.len() == 2 && c[0].starts_with("--"))
        .map(|c| (c[0].trim_start_matches("--").to_string(), c[1].clone()))
        .collect()
}

fn default_root() -> PathBuf {
    std::env::temp_dir().join("oniric-coupure")
}

fn options(work_root: PathBuf) -> OpenOptions {
    OpenOptions { work_root, on_crash: CrashChoice::Restore, force_lock: false }
}

fn source_name(s: Source) -> &'static str {
    match s {
        Source::ProjectFolder => "dossier",
        Source::RestoredWorkingCopy => "copie-de-travail",
        Source::RepairedFromWorkingCopy => "reparation",
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(cmd) = args.first() else {
        print!("{USAGE}");
        return ExitCode::from(2);
    };
    let opts = args_map(&args[1..]);
    let result = match cmd.as_str() {
        "lancer" => crash_test(&opts),
        "ouvrier" => worker(&opts),
        _ => {
            print!("{USAGE}");
            return ExitCode::from(2);
        }
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("ERREUR {e}");
            ExitCode::FAILURE
        }
    }
}

// ---------------------------------------------------------------- worker (child process of the crash test)

fn worker(o: &HashMap<String, String>) -> Result<(), String> {
    let dir = PathBuf::from(&o["dossier"]);
    let work = PathBuf::from(&o["travail"]);
    let flush_every = Duration::from_millis(o.get("recopie-ms").and_then(|v| v.parse().ok()).unwrap_or(40));
    let close_after: u64 = o.get("fermer-apres").and_then(|v| v.parse().ok()).unwrap_or(0);
    let out = std::io::stdout();
    let say = |line: String| {
        let mut l = out.lock();
        let _ = writeln!(l, "{line}");
        let _ = l.flush();
    };

    say("OUVERTURE".into());
    let t0 = Instant::now();
    let (mut project, report) = Project::open(&dir, &options(work)).map_err(|e| e.to_string())?;
    let mut seq = workload::current_seq(project.conn()).map_err(|e| e.to_string())?;
    say(format!("OUVERT {seq} {} {} {}", source_name(report.source), report.previous_crash, t0.elapsed().as_micros()));
    for note in report.notes {
        say(format!("NOTE {note}"));
    }

    let mut last_flush = Instant::now();
    let mut written = 0;
    loop {
        seq += 1;
        project.write(|tx| workload::write_batch(tx, seq)).map_err(|e| e.to_string())?;
        say(format!("ACK {seq}"));
        written += 1;
        if close_after > 0 && written >= close_after {
            say("FERMETURE".into());
            project.close().map_err(|e| e.to_string())?;
            say("FERME".into());
            return Ok(());
        }
        if last_flush.elapsed() >= flush_every {
            say("RECOPIE".into());
            let stats = project.flush().map_err(|e| e.to_string())?;
            if let Some(s) = stats {
                say(format!("RECOPIE-OK {} {}", s.duration.as_micros(), s.bytes));
            }
            last_flush = Instant::now();
        }
    }
}

// ---------------------------------------------------------------- crash test

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

fn check_project_file(dir: &Path) -> Result<u64, String> {
    let conn = Connection::open_with_flags(dir.join(DB), OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| e.to_string())?;
    workload::check(&conn)
}

fn copy_dir(from: &Path, to: &Path) {
    let _ = fs::create_dir_all(to);
    if let Ok(entries) = fs::read_dir(from) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                copy_dir(&p, &to.join(e.file_name()));
            } else {
                let _ = fs::copy(&p, to.join(e.file_name()));
            }
        }
    }
}

#[derive(Default)]
struct Stats {
    phases: HashMap<&'static str, u64>,
    sources: HashMap<String, u64>,
    flush_us: Vec<u64>,
    open_us: Vec<u64>,
    closes: u64,
    acked: u64,
}

fn crash_test(o: &HashMap<String, String>) -> Result<(), String> {
    let root = default_root();
    let dir = o.get("dossier").map(PathBuf::from).unwrap_or_else(|| root.join("projet"));
    let work = o.get("travail").map(PathBuf::from).unwrap_or_else(|| root.join("travail"));
    let iterations: u64 = o.get("iterations").and_then(|v| v.parse().ok()).unwrap_or(1000);
    let seed: u64 = o.get("graine").and_then(|v| v.parse().ok()).unwrap_or_else(|| lock_seed());
    let mut rng = Rng(seed | 1);
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;

    let _ = fs::remove_dir_all(&dir);
    let _ = fs::remove_dir_all(&work);
    Project::create(&dir, "Essai de coupure", &options(work.clone()))
        .map_err(|e| e.to_string())?
        .close()
        .map_err(|e| e.to_string())?;
    println!("Projet : {}\nCopie de travail : {}\nGraine : {seed}\n", dir.display(), work.display());

    let mut last_ack = 0u64;
    let mut stats = Stats::default();
    let started = Instant::now();
    for i in 1..=iterations {
        let fail = |msg: String| -> Result<(), String> {
            let evidence = root.join(format!("echec-{i}"));
            copy_dir(&dir, &evidence.join("projet"));
            copy_dir(&work, &evidence.join("travail"));
            Err(format!("essai {i} : {msg} (fichiers conservés dans {})", evidence.display()))
        };

        match check_project_file(&dir) {
            Ok(_) => {}
            Err(e) => return fail(format!("base du dossier projet invalide : {e}")),
        }

        let close_after = if rng.below(10) == 0 { 1 + rng.below(20) } else { 0 };
        let flush_ms = 5 + rng.below(60);
        let mut child = Command::new(&exe)
            .args(["ouvrier", "--dossier"])
            .arg(&dir)
            .arg("--travail")
            .arg(&work)
            .args(["--recopie-ms", &flush_ms.to_string(), "--fermer-apres", &close_after.to_string()])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        let (tx, rx) = mpsc::channel::<String>();
        let tx_err = tx.clone();
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let readers = [
            thread::spawn(move || BufReader::new(stdout).lines().map_while(Result::ok).for_each(|l| drop(tx.send(l)))),
            thread::spawn(move || BufReader::new(stderr).lines().map_while(Result::ok).for_each(|l| drop(tx_err.send(l)))),
        ];

        let delay = if rng.below(6) == 0 { rng.below(30) } else { 20 + rng.below(400) };
        let deadline = Instant::now() + Duration::from_millis(delay);
        let mut exited_alone = false;
        while Instant::now() < deadline {
            if child.try_wait().map_err(|e| e.to_string())?.is_some() {
                exited_alone = true;
                break;
            }
            thread::sleep(Duration::from_millis(1));
        }
        if !exited_alone {
            let _ = child.kill();
        }
        let status = child.wait().map_err(|e| e.to_string())?;
        for r in readers {
            let _ = r.join();
        }

        let lines: Vec<String> = rx.try_iter().collect();
        let notes: Vec<&str> = lines.iter().filter_map(|l| l.strip_prefix("NOTE ")).collect();
        let fail = |msg: String| fail(if notes.is_empty() { msg } else { format!("{msg} ; notes : {}", notes.join(" | ")) });
        let mut phase = "avant l'ouverture";
        let mut closed = false;
        for line in lines.iter() {
            let mut parts = line.splitn(2, ' ');
            let (tag, rest) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
            match tag {
                "OUVERTURE" => phase = "ouverture",
                "OUVERT" => {
                    phase = "écriture";
                    let f: Vec<&str> = rest.split(' ').collect();
                    let seq: u64 = f[0].parse().unwrap_or(0);
                    if seq < last_ack {
                        return fail(format!("perte de données : lot {last_ack} validé, mais seulement {seq} retrouvés"));
                    }
                    last_ack = seq;
                    *stats.sources.entry(f[1].to_string()).or_default() += 1;
                    stats.open_us.push(f[3].parse().unwrap_or(0));
                }
                "ACK" => {
                    phase = "écriture";
                    last_ack = rest.parse().unwrap_or(last_ack);
                    stats.acked += 1;
                }
                "RECOPIE" => phase = "recopie",
                "RECOPIE-OK" => {
                    phase = "écriture";
                    stats.flush_us.push(rest.split(' ').next().unwrap_or("0").parse().unwrap_or(0));
                }
                "FERMETURE" => phase = "fermeture",
                "FERME" => closed = true,
                "NOTE" => return fail(format!("copie de travail écartée alors qu'aucun autre PC n'a touché au projet : {rest}")),
                "ERREUR" => return fail(format!("erreur du programme : {rest}")),
                _ => return fail(format!("sortie inattendue : {line}")),
            }
        }

        if closed {
            stats.closes += 1;
            let id = Project::read_manifest(&dir).map_err(|e| e.to_string())?.id;
            if dir.join(LOCK).exists() || work.join(&id).join(DB).exists() {
                return fail("après une fermeture normale, il reste le verrou ou la copie de travail".into());
            }
            match check_project_file(&dir) {
                Ok(seq) if seq == last_ack => {}
                Ok(seq) => return fail(format!("après fermeture, le dossier contient le lot {seq} au lieu de {last_ack}")),
                Err(e) => return fail(e),
            }
        } else if exited_alone {
            return fail(format!("le programme s'est arrêté seul ({status})"));
        } else {
            *stats.phases.entry(phase).or_default() += 1;
        }

        if i % 100 == 0 || i == iterations {
            println!("{i}/{iterations} essais · lot {last_ack} · {:.0} s", started.elapsed().as_secs_f64());
        }
    }

    let avg = |v: &[u64]| if v.is_empty() { 0.0 } else { v.iter().sum::<u64>() as f64 / v.len() as f64 / 1000.0 };
    let max = |v: &[u64]| v.iter().copied().max().unwrap_or(0) as f64 / 1000.0;
    println!("\nRÉSULTAT : {iterations} essais, aucune corruption, aucun lot validé perdu.");
    println!("Coupures par phase :");
    let mut phases: Vec<_> = stats.phases.iter().collect();
    phases.sort();
    for (p, n) in phases {
        println!("  {p:<20} {n}");
    }
    println!("Fermetures normales : {}", stats.closes);
    println!("Ouvertures par source :");
    for (s, n) in &stats.sources {
        println!("  {s:<20} {n}");
    }
    println!("Lots validés : {} ; dernier lot : {last_ack}", stats.acked);
    println!("Ouverture : moyenne {:.1} ms, max {:.1} ms", avg(&stats.open_us), max(&stats.open_us));
    println!("Recopie   : moyenne {:.1} ms, max {:.1} ms ({} recopies terminées)", avg(&stats.flush_us), max(&stats.flush_us), stats.flush_us.len());
    println!("Durée totale : {:.0} s", started.elapsed().as_secs_f64());
    Ok(())
}

fn lock_seed() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(1)
}
