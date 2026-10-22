//! The application database, `application.db`: recent projects and the settings shared by all projects
//! (profile, screenplay formats, backups).

use rusqlite::{params, Connection, OptionalExtension};
use std::fs;
use std::path::Path;

use crate::project::MANIFEST;
use crate::system::{iso_utc, now_secs};

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS recent_project (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  opened_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
";

const KEEP: u32 = 20;

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[cfg_attr(feature = "app", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub path: String,
    pub title: String,
    pub opened_at: String,
    /// False when the folder is gone or unplugged (USB key).
    pub available: bool,
}

pub fn open(dir: &Path) -> rusqlite::Result<Connection> {
    fs::create_dir_all(dir).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let conn = Connection::open(dir.join("application.db"))?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;")?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}

pub fn touch(conn: &Connection, path: &str, title: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO recent_project (path, title, opened_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (path) DO UPDATE SET title = excluded.title, opened_at = excluded.opened_at",
        params![path, title, iso_utc(now_secs())],
    )?;
    conn.execute(
        "DELETE FROM recent_project WHERE path NOT IN (SELECT path FROM recent_project ORDER BY opened_at DESC LIMIT ?1)",
        [KEEP],
    )?;
    Ok(())
}

pub fn list(conn: &Connection) -> rusqlite::Result<Vec<RecentProject>> {
    let mut stmt = conn.prepare("SELECT path, title, opened_at FROM recent_project ORDER BY opened_at DESC, rowid DESC")?;
    let rows = stmt.query_map([], |r| {
        let path: String = r.get(0)?;
        let available = Path::new(&path).join(MANIFEST).exists();
        Ok(RecentProject { path, title: r.get(1)?, opened_at: r.get(2)?, available })
    })?;
    rows.collect()
}

pub fn forget(conn: &Connection, path: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM recent_project WHERE path = ?1", [path])?;
    Ok(())
}

pub fn setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM app_setting WHERE key = ?1", [key], |r| r.get(0)).optional()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO app_setting (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, iso_utc(now_secs())],
    )?;
    Ok(())
}
