use std::fs;
use std::path::PathBuf;

use oniric_crash as workload;
use oniric_lib::db::{self, Statement};
use oniric_lib::project::lock::{self, LockInfo};
use oniric_lib::project::{migrations, CrashChoice, Error, OpenOptions, Project, Source, DB, LOCK, MANIFEST};

struct Case {
    root: PathBuf,
}

impl Case {
    fn new(name: &str) -> Case {
        let root = std::env::temp_dir().join(format!("oniric-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        Case { root }
    }
    fn dir(&self) -> PathBuf {
        self.root.join("projet")
    }
    fn opts(&self, pc: &str) -> OpenOptions {
        OpenOptions { work_root: self.root.join(format!("travail-{pc}")), on_crash: CrashChoice::Restore, force_lock: false }
    }
    fn create(&self) -> Project {
        Project::create(&self.dir(), "Essai", &self.opts("a")).unwrap()
    }
}

impl Drop for Case {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn write(p: &mut Project, from: u64, to: u64) {
    for seq in from..=to {
        p.write(|tx| workload::write_batch(tx, seq)).unwrap();
    }
}

/// Leaves the working copy and the lock behind, as a crash would.
fn crash(p: Project) {
    drop(p);
}

fn seq(p: &Project) -> u64 {
    workload::check(p.conn()).unwrap()
}

#[test]
fn normal_session_round_trip() {
    let c = Case::new("normal");
    let mut p = c.create();
    write(&mut p, 1, 50);
    p.close().unwrap();
    assert!(!c.dir().join(LOCK).exists());
    let (p, report) = Project::open(&c.dir(), &c.opts("a")).unwrap();
    assert_eq!(report.source, Source::ProjectFolder);
    assert!(!report.previous_crash);
    assert_eq!(seq(&p), 50);
}

#[test]
fn crash_restores_unflushed_work() {
    let c = Case::new("crash");
    let mut p = c.create();
    write(&mut p, 1, 10);
    p.flush().unwrap();
    write(&mut p, 11, 30);
    crash(p);
    let (p, report) = Project::open(&c.dir(), &c.opts("a")).unwrap();
    assert_eq!(report.source, Source::RestoredWorkingCopy);
    assert!(report.previous_crash);
    assert_eq!(seq(&p), 30);
}

#[test]
fn crash_right_after_creation_restores() {
    let c = Case::new("creation");
    let mut p = c.create();
    write(&mut p, 1, 5);
    crash(p);
    let (p, report) = Project::open(&c.dir(), &c.opts("a")).unwrap();
    assert_eq!(report.source, Source::RestoredWorkingCopy);
    assert_eq!(seq(&p), 5);
}

/// Regression: the folder holds an older snapshot than the latest attempts, which were all interrupted.
#[test]
fn unrecorded_flush_then_failed_attempts_still_restores() {
    let c = Case::new("unrecorded");
    let mut p = c.create();
    write(&mut p, 1, 10);
    p.flush().unwrap();
    let folder_id: String = p.conn().query_row("SELECT value FROM oniric_meta WHERE key = 'flush_id'", [], |r| r.get(0)).unwrap();
    p.conn()
        .execute_batch("INSERT INTO oniric_flush (id) VALUES ('tentative-1'), ('tentative-2'); UPDATE oniric_meta SET value = 'tentative-2' WHERE key = 'flush_id';")
        .unwrap();
    p.conn().execute("DELETE FROM oniric_flush WHERE id <> ?1 AND id NOT LIKE 'tentative-%'", [&folder_id]).unwrap();
    write(&mut p, 11, 20);
    crash(p);
    let (p, report) = Project::open(&c.dir(), &c.opts("a")).unwrap();
    assert_eq!(report.source, Source::RestoredWorkingCopy, "{:?}", report.notes);
    assert_eq!(seq(&p), 20);
}

#[test]
fn project_changed_on_another_pc_keeps_local_copy_aside() {
    let c = Case::new("ailleurs");
    let mut p = c.create();
    write(&mut p, 1, 10);
    p.flush().unwrap();
    write(&mut p, 11, 15);
    crash(p);

    let other = OpenOptions { force_lock: true, ..c.opts("b") };
    let (mut q, _) = Project::open(&c.dir(), &other).unwrap();
    write(&mut q, 11, 40);
    q.close().unwrap();

    let (p, report) = Project::open(&c.dir(), &c.opts("a")).unwrap();
    assert_eq!(report.source, Source::ProjectFolder);
    assert_eq!(seq(&p), 40);
    let aside = report.kept_aside.expect("la copie locale doit être conservée");
    assert!(aside.exists());
}

#[test]
fn damaged_project_database_is_repaired_from_working_copy() {
    let c = Case::new("repare");
    let mut p = c.create();
    write(&mut p, 1, 25);
    crash(p);
    fs::write(c.dir().join(DB), b"pas une base sqlite").unwrap();
    let (p, report) = Project::open(&c.dir(), &c.opts("a")).unwrap();
    assert_eq!(report.source, Source::RepairedFromWorkingCopy);
    assert_eq!(seq(&p), 25);
    p.close().unwrap();
    let (p, _) = Project::open(&c.dir(), &c.opts("a")).unwrap();
    assert_eq!(seq(&p), 25);
}

#[test]
fn both_databases_damaged_is_reported() {
    let c = Case::new("perdu");
    let mut p = c.create();
    write(&mut p, 1, 3);
    p.close().unwrap();
    fs::write(c.dir().join(DB), b"abime").unwrap();
    assert!(matches!(Project::open(&c.dir(), &c.opts("a")), Err(Error::Damaged(_))));
    assert!(!c.dir().join(LOCK).exists(), "un échec d'ouverture ne doit pas laisser de verrou");
}

#[test]
fn lock_from_another_pc_blocks_unless_forced() {
    let c = Case::new("verrou");
    c.create().close().unwrap();
    let info = LockInfo { host: "AUTRE-PC".into(), pid: 1, since: lock::now_secs() };
    fs::write(c.dir().join(LOCK), serde_json::to_string(&info).unwrap()).unwrap();
    assert!(matches!(Project::open(&c.dir(), &c.opts("a")), Err(Error::LockedElsewhere(_))));
    let forced = OpenOptions { force_lock: true, ..c.opts("a") };
    assert!(Project::open(&c.dir(), &forced).is_ok());
}

#[test]
fn newer_format_is_refused_without_change() {
    let c = Case::new("format");
    c.create().close().unwrap();
    let path = c.dir().join(MANIFEST);
    let text = fs::read_to_string(&path).unwrap().replace("\"formatVersion\": 1", "\"formatVersion\": 99");
    fs::write(&path, &text).unwrap();
    assert!(matches!(Project::open(&c.dir(), &c.opts("a")), Err(Error::NewerFormat(99))));
    assert_eq!(fs::read_to_string(&path).unwrap(), text);
}

/// Simulates a USB key pulled out then plugged back in while the project is open.
#[test]
fn folder_disappearing_during_session_loses_nothing() {
    let c = Case::new("usb");
    let mut p = c.create();
    write(&mut p, 1, 10);
    p.flush().unwrap();
    let away = c.root.join("cle-retiree");
    fs::rename(c.dir(), &away).unwrap();
    write(&mut p, 11, 20);
    assert!(p.flush().is_err());
    assert!(p.is_dirty());
    write(&mut p, 21, 30);
    fs::rename(&away, c.dir()).unwrap();
    p.close().unwrap();
    let (p, report) = Project::open(&c.dir(), &c.opts("a")).unwrap();
    assert_eq!(report.source, Source::ProjectFolder);
    assert_eq!(seq(&p), 30);
}

#[test]
fn created_project_has_its_folders_manifest_and_schema() {
    let c = Case::new("creation-dossier");
    let p = c.create();
    for f in [MANIFEST, DB, LOCK, "medias", "exports", "versions"] {
        assert!(c.dir().join(f).exists(), "{f} manquant");
    }
    let m = Project::read_manifest(&c.dir()).unwrap();
    assert_eq!(m.format, "oniric-project");
    assert_eq!(m.id.len(), 36);
    assert_eq!(&m.id[14..15], "7", "UUID v7");
    assert_eq!(m.created_with.as_deref(), Some(env!("CARGO_PKG_VERSION")));
    assert_eq!(migrations::user_version(p.conn()).unwrap(), migrations::LATEST);
}

#[test]
fn creating_in_a_non_empty_folder_is_refused() {
    let c = Case::new("non-vide");
    fs::create_dir_all(c.dir()).unwrap();
    fs::write(c.dir().join("notes.txt"), "à garder").unwrap();
    assert!(matches!(Project::create(&c.dir(), "Essai", &c.opts("a")), Err(Error::FolderNotEmpty(_))));
    assert_eq!(fs::read_to_string(c.dir().join("notes.txt")).unwrap(), "à garder");
}

#[test]
fn probe_reports_recoverable_work_after_a_crash() {
    let c = Case::new("sonde");
    let mut p = c.create();
    let work = c.opts("a").work_root;
    write(&mut p, 1, 3);
    p.flush().unwrap();
    write(&mut p, 4, 6);
    crash(p);
    let probe = Project::probe(&c.dir(), &work).unwrap();
    assert!(probe.recoverable);
    assert!(matches!(probe.lock, lock::LockState::Stale(_)));
    let (p, _) = Project::open(&c.dir(), &c.opts("a")).unwrap();
    p.close().unwrap();
    assert!(!Project::probe(&c.dir(), &work).unwrap().recoverable);
}

#[test]
fn discarding_recovery_opens_the_folder_and_keeps_the_copy_aside() {
    let c = Case::new("ecarter");
    let mut p = c.create();
    write(&mut p, 1, 10);
    p.flush().unwrap();
    write(&mut p, 11, 20);
    crash(p);
    let discard = OpenOptions { on_crash: CrashChoice::Discard, ..c.opts("a") };
    let (p, report) = Project::open(&c.dir(), &discard).unwrap();
    assert_eq!(report.source, Source::ProjectFolder);
    assert_eq!(seq(&p), 10);
    assert!(report.kept_aside.expect("copie mise de côté").exists());
}

#[test]
fn failed_close_hands_the_project_back() {
    let c = Case::new("fermeture");
    let mut p = c.create();
    write(&mut p, 1, 5);
    let away = c.root.join("cle-retiree");
    fs::rename(c.dir(), &away).unwrap();
    let failure = p.close().unwrap_err();
    let mut p = failure.project.expect("le projet reste ouvert");
    write(&mut p, 6, 8);
    fs::rename(&away, c.dir()).unwrap();
    p.close().unwrap();
    let (p, _) = Project::open(&c.dir(), &c.opts("a")).unwrap();
    assert_eq!(seq(&p), 8);
}

#[test]
fn reader_sees_committed_writes() {
    let c = Case::new("lecteur");
    let mut p = c.create();
    let reader = p.open_reader().unwrap();
    write(&mut p, 1, 2);
    assert_eq!(workload::current_seq(&reader).unwrap(), 2);
    drop(reader);
    p.close().unwrap();
}

#[test]
fn interface_sql_is_guarded_and_journaled() {
    let c = Case::new("garde");
    let mut p = c.create();
    let refused = [
        "ATTACH DATABASE 'x.db' AS x",
        "PRAGMA journal_mode = DELETE",
        "SELECT * FROM oniric_meta",
        "SELECT * FROM sqlite_master",
        "DROP TABLE scene",
        "CREATE TABLE pirate (x)",
        "CREATE INDEX i ON scene (summary)",
        "CREATE TRIGGER t AFTER INSERT ON scene BEGIN DELETE FROM scene; END",
        "SELECT load_extension('evil')",
        "BEGIN",
        "DELETE FROM oniric_journal",
    ];
    for sql in refused {
        let r = p.write(|tx| db::write(tx, &[Statement::new(sql, vec![])], "essai", &[]));
        assert!(r.is_err(), "accepté : {sql}");
        let reader = p.open_reader().unwrap();
        assert!(db::query(&reader, &Statement::new(sql, vec![])).is_err(), "lecture acceptée : {sql}");
    }
    let reader = p.open_reader().unwrap();
    assert!(db::query(&reader, &Statement::new("UPDATE scene SET summary = 'x'", vec![])).is_err());
    assert!(p.write(|tx| db::write(tx, &[Statement::new("SELECT 1", vec![])], "essai", &[])).is_err());
    assert!(p.write(|tx| db::write(tx, &[Statement::new("SELECT ?", vec![])], "essai", &[])).is_err(), "paramètres manquants");

    write(&mut p, 1, 1);
    let rows = db::query(&reader, &Statement::new("SELECT count(*) AS n FROM scene", vec![])).unwrap();
    assert_eq!(rows.columns, vec!["n"]);
    assert_eq!(rows.rows[0][0], Some(db::SqlValue::Number(workload::SCENES_PER_BATCH as f64)));
    let journal: i64 = p.conn().query_row("SELECT count(*) FROM oniric_journal WHERE label = 'Essai de coupure'", [], |r| r.get(0)).unwrap();
    assert_eq!(journal, 1);
    drop(reader);
    p.close().unwrap();
}

/// D-11: the SQLite engine is SQLCipher, and a project without a password stays an ordinary SQLite file [FIA-03].
#[test]
fn engine_is_sqlcipher_and_projects_stay_plain_sqlite() {
    let c = Case::new("sqlcipher");
    let p = c.create();
    let version: String = p.conn().query_row("PRAGMA cipher_version", [], |r| r.get(0)).expect("SQLCipher absent");
    assert!(!version.is_empty());
    p.close().unwrap();
    let header = fs::read(c.dir().join(DB)).unwrap();
    assert_eq!(&header[..16], b"SQLite format 3\0");
}
