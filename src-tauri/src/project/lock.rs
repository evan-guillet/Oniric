//! The `.verrou` file: present while a project is open, with the computer and process that opened it.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use super::fsx;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockInfo {
    pub host: String,
    pub pid: u32,
    pub since: u64,
}

#[derive(Debug)]
pub enum LockState {
    Free,
    /// Left by a process of this computer that no longer runs: the previous session crashed.
    Stale(Option<LockInfo>),
    HeldHere(LockInfo),
    HeldElsewhere(LockInfo),
}

pub fn host_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .or_else(|_| fs::read_to_string("/etc/hostname").map(|s| s.trim().to_string()))
        .unwrap_or_else(|_| "inconnu".into())
}

pub fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Whether the process that took the lock at `since` still runs. Windows hands out the number of a process that
/// ended to the next one, so a process that started after the lock was taken is someone else.
#[cfg(windows)]
pub fn lock_owner_alive(pid: u32, since: u64) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{GetExitCodeProcess, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return false;
        }
        let mut code = 0u32;
        let running = GetExitCodeProcess(h, &mut code) != 0 && code == STILL_ACTIVE as u32;
        let zero = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
        let (mut created, mut exited, mut kernel, mut user) = (zero, zero, zero, zero);
        let timed = GetProcessTimes(h, &mut created, &mut exited, &mut kernel, &mut user) != 0;
        CloseHandle(h);
        // FILETIME counts 100 ns steps from 1601; the lock counts seconds from 1970.
        let started = ((created.dwHighDateTime as u64) << 32 | created.dwLowDateTime as u64) / 10_000_000;
        let started = started.saturating_sub(11_644_473_600);
        running && (!timed || started <= since + 2)
    }
}

#[cfg(not(windows))]
pub fn lock_owner_alive(pid: u32, _since: u64) -> bool {
    Path::new(&format!("/proc/{pid}")).exists()
}

pub fn inspect(path: &Path) -> LockState {
    let Ok(text) = fs::read_to_string(path) else {
        return if path.exists() { LockState::Stale(None) } else { LockState::Free };
    };
    let Ok(info) = serde_json::from_str::<LockInfo>(&text) else {
        return LockState::Stale(None);
    };
    if info.host != host_name() {
        LockState::HeldElsewhere(info)
    } else if info.pid != std::process::id() && lock_owner_alive(info.pid, info.since) {
        LockState::HeldHere(info)
    } else {
        LockState::Stale(Some(info))
    }
}

pub fn acquire(path: &Path) -> io::Result<()> {
    let info = LockInfo { host: host_name(), pid: std::process::id(), since: now_secs() };
    fsx::write_atomically(path, serde_json::to_string(&info)?.as_bytes())
}

pub fn release(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_process_started_after_the_lock_does_not_hold_it() {
        let me = std::process::id();
        assert!(lock_owner_alive(me, now_secs()));
        #[cfg(windows)]
        assert!(!lock_owner_alive(me, 1_000_000_000));
    }
}
