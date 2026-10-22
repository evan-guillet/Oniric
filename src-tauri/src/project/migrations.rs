//! Numbered schema migrations, applied in order at opening (architecture, 6.8).

use rusqlite::Connection;
use std::fs;
use std::path::Path;

const MIGRATIONS: &[&str] = &[
    include_str!("../../migrations/0001_initial.sql"),
    include_str!("../../migrations/0002_ecrire.sql"),
];

pub const LATEST: u32 = MIGRATIONS.len() as u32;

pub fn user_version(conn: &Connection) -> rusqlite::Result<u32> {
    conn.query_row("PRAGMA user_version", [], |r| r.get(0))
}

/// Applies the missing migrations, each in its own transaction, and returns how many ran.
/// With `backup`, a copy of the database is kept there before the first one.
pub fn apply(conn: &Connection, backup: Option<&Path>) -> rusqlite::Result<u32> {
    let current = user_version(conn)?;
    if current >= LATEST {
        return Ok(0);
    }
    if let Some(dir) = backup {
        fs::create_dir_all(dir).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let file = dir.join(format!("avant-migration-v{}.db", current + 1));
        let _ = fs::remove_file(&file);
        conn.execute("VACUUM INTO ?1", [file.to_string_lossy()])?;
    }
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let version = i as u32 + 1;
        conn.execute_batch(&format!("BEGIN; {sql}\nPRAGMA user_version = {version}; COMMIT;"))
            .inspect_err(|_| {
                let _ = conn.execute_batch("ROLLBACK");
            })?;
    }
    Ok(LATEST - current)
}
