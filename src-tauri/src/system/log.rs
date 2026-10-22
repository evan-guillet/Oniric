//! Technical log: local text files, one per day, the last 10 days kept, never sent anywhere (architecture, 12.4).
//! It never receives project content.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use super::{date_utc, iso_utc, now_secs};

const KEEP_DAYS: usize = 10;

static LOG: Mutex<Option<(PathBuf, String, File)>> = Mutex::new(None);

pub fn init(dir: &Path) {
    if fs::create_dir_all(dir).is_err() {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        let mut logs: Vec<PathBuf> = entries.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "log")).collect();
        logs.sort();
        let excess = logs.len().saturating_sub(KEEP_DAYS);
        for old in &logs[..excess] {
            let _ = fs::remove_file(old);
        }
    }
    *LOG.lock().unwrap() = open(dir).map(|(day, f)| (dir.to_path_buf(), day, f));
}

fn open(dir: &Path) -> Option<(String, File)> {
    let day = date_utc(now_secs());
    let file = OpenOptions::new().create(true).append(true).open(dir.join(format!("oniric-{day}.log"))).ok()?;
    Some((day, file))
}

pub fn write(level: &str, message: &str) {
    let mut guard = LOG.lock().unwrap();
    let Some((dir, day, file)) = guard.as_mut() else { return };
    let now = now_secs();
    if date_utc(now) != *day {
        if let Some((d, f)) = open(dir) {
            *day = d;
            *file = f;
        }
    }
    let _ = writeln!(file, "{} {level} {message}", iso_utc(now));
}

pub fn info(message: &str) {
    write("INFO", message);
}

pub fn error(message: &str) {
    write("ERREUR", message);
}
