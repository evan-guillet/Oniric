//! Where Oniric keeps its own files, the technical log, and small helpers tied to the file system.

pub mod log;

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Folders of the application itself (architecture, 6.1).
#[derive(Debug, Clone)]
pub struct Paths {
    /// `%APPDATA%\Oniric`: application database (recent projects, settings).
    pub app_data: PathBuf,
    /// `%LOCALAPPDATA%\Oniric`: working copies and logs, never synchronized.
    pub local: PathBuf,
    pub portable: bool,
}

impl Paths {
    /// `ONIRIC_DONNEES` (tests) or a `portable` file next to the executable keep everything in one folder [CPT-02].
    pub fn resolve(roaming: PathBuf, local: PathBuf, exe_dir: Option<&Path>) -> Paths {
        if let Some(dir) = std::env::var_os("ONIRIC_DONNEES") {
            let dir = PathBuf::from(dir);
            return Paths { app_data: dir.clone(), local: dir, portable: true };
        }
        if let Some(exe_dir) = exe_dir.filter(|d| d.join("portable").exists()) {
            let dir = exe_dir.join("donnees");
            return Paths { app_data: dir.clone(), local: dir, portable: true };
        }
        Paths { app_data: roaming.join("Oniric"), local: local.join("Oniric"), portable: false }
    }

    pub fn work_root(&self) -> PathBuf {
        self.local.join("travail")
    }

    pub fn logs(&self) -> PathBuf {
        self.local.join("journaux")
    }
}

pub fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn now_nanos() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
}

/// Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm).
fn civil(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

/// `2026-10-21T09:30:00Z`, in UTC.
pub fn iso_utc(secs: u64) -> String {
    let (y, m, d) = civil((secs / 86_400) as i64);
    let s = secs % 86_400;
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", s / 3600, s / 60 % 60, s % 60)
}

pub fn date_utc(secs: u64) -> String {
    iso_utc(secs)[..10].to_string()
}

/// `2026-10-21_09-30-00`, in local time on Windows: the name of a backup copy, readable in the Explorer.
#[cfg(windows)]
pub fn local_stamp() -> String {
    use windows_sys::Win32::System::SystemInformation::GetLocalTime;
    let t = unsafe {
        let mut t = std::mem::zeroed();
        GetLocalTime(&mut t);
        t
    };
    format!("{:04}-{:02}-{:02}_{:02}-{:02}-{:02}", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond)
}

#[cfg(not(windows))]
pub fn local_stamp() -> String {
    iso_utc(now_secs())[..19].replace('T', "_").replace(':', "-")
}

/// A title turned into a file or folder name that Windows accepts.
pub fn file_name(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { '-' } else { c })
        .collect();
    // Windows drops a final dot or space, so the name asked for would not be the name made.
    let tidy = |s: &str| s.trim().trim_end_matches(['.', ' ']).to_string();
    let trimmed = tidy(&cleaned.chars().take(120).collect::<String>());
    let stem = trimmed.split('.').next().unwrap_or("").trim_end().to_ascii_uppercase();
    if trimmed.is_empty() || is_reserved(&stem) {
        format!("Projet {trimmed}").trim().to_string()
    } else {
        trimmed
    }
}

/// Device names that Windows refuses as file names, with or without an extension.
fn is_reserved(stem: &str) -> bool {
    if matches!(stem, "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$") {
        return true;
    }
    let digit = |s: &str| matches!(s, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³");
    stem.strip_prefix("COM").or_else(|| stem.strip_prefix("LPT")).is_some_and(digit)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates() {
        assert_eq!(iso_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_utc(1_792_575_000), "2026-10-21T09:30:00Z");
        assert_eq!(date_utc(951_782_400), "2000-02-29");
    }

    #[test]
    fn file_names() {
        assert_eq!(file_name("Les Heures Bleues"), "Les Heures Bleues");
        assert_eq!(file_name("Film : version 2/3?"), "Film - version 2-3-");
        assert_eq!(file_name("  Fin...  "), "Fin");
        assert_eq!(file_name("con"), "Projet con");
        assert_eq!(file_name(""), "Projet");
        assert_eq!(file_name("lpt9.txt"), "Projet lpt9.txt");
        assert_eq!(file_name("COM²"), "Projet COM²");
        assert_eq!(file_name("Comète"), "Comète");
        let long = format!("{}. suite", "a".repeat(119));
        assert_eq!(file_name(&long), "a".repeat(119));
    }
}
