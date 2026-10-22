//! File operations that never leave a half-written file under its final name.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    path.with_file_name(format!("{name}{suffix}"))
}

pub fn sync_file(path: &Path) -> io::Result<()> {
    fs::OpenOptions::new().read(true).write(true).open(path)?.sync_all()
}

#[cfg(windows)]
pub fn replace_atomically(from: &Path, to: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};
    let wide = |p: &Path| p.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<u16>>();
    let (f, t) = (wide(from), wide(to));
    let ok = unsafe { MoveFileExW(f.as_ptr(), t.as_ptr(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) };
    if ok == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
pub fn replace_atomically(from: &Path, to: &Path) -> io::Result<()> {
    fs::rename(from, to)?;
    if let Some(dir) = to.parent() {
        fs::File::open(dir)?.sync_all()?;
    }
    Ok(())
}

pub fn copy_atomically(from: &Path, to: &Path) -> io::Result<()> {
    let tmp = sibling(to, ".copie");
    let _ = fs::remove_file(&tmp);
    fs::copy(from, &tmp)?;
    sync_file(&tmp)?;
    replace_atomically(&tmp, to)
}

pub fn write_atomically(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = sibling(path, ".tmp");
    fs::write(&tmp, bytes)?;
    sync_file(&tmp)?;
    replace_atomically(&tmp, path)
}

/// Removes a SQLite database and its WAL companions; a stale WAL next to a new database would corrupt it.
pub fn remove_database(path: &Path) -> io::Result<()> {
    for p in [path.to_path_buf(), sibling(path, "-wal"), sibling(path, "-shm")] {
        match fs::remove_file(&p) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => return Err(e),
            _ => {}
        }
    }
    Ok(())
}

/// Moves a database and its WAL companions together, to keep a copy aside instead of deleting it.
pub fn move_database(from: &Path, to: &Path) -> io::Result<()> {
    if let Some(dir) = to.parent() {
        fs::create_dir_all(dir)?;
    }
    for suffix in ["-wal", "-shm"] {
        let f = sibling(from, suffix);
        if f.exists() {
            fs::rename(&f, sibling(to, suffix))?;
        }
    }
    fs::rename(from, to)
}
