//! Test data written like the interface writes (through the guard rails, into the real schema), and whose
//! consistency can be checked after any crash: batch `seq` adds K scenes and keeps those of the last W batches.

use oniric_lib::db::{self, DbError, SqlValue, Statement};
use rusqlite::{Connection, OptionalExtension, Transaction};

pub const SCENES_PER_BATCH: u64 = 5;
pub const WINDOW: u64 = 2000;

pub fn body(seq: u64, idx: u64) -> String {
    format!("Scène {seq}.{idx} — ").repeat(14)
}

fn content(seq: u64, idx: u64) -> String {
    format!(r#"[{{"type":"action","content":[{{"type":"text","text":"{}"}}]}}]"#, body(seq, idx))
}

fn n(v: u64) -> Option<SqlValue> {
    Some(SqlValue::Number(v as f64))
}

fn t(v: impl Into<String>) -> Option<SqlValue> {
    Some(SqlValue::Text(v.into()))
}

pub fn current_seq(conn: &Connection) -> rusqlite::Result<u64> {
    let v: Option<String> = conn.query_row("SELECT value FROM project_setting WHERE key = 'seq'", [], |r| r.get(0)).optional()?;
    Ok(v.and_then(|v| v.parse().ok()).unwrap_or(0))
}

pub fn write_batch(tx: &Transaction, seq: u64) -> Result<usize, DbError> {
    let now = "2026-10-21T09:30:00.000Z";
    let mut batch = vec![Statement::new(
        "INSERT INTO project_setting (key, value, updated_at) VALUES ('seq', ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        vec![t(seq.to_string()), t(now)],
    )];
    for idx in 0..SCENES_PER_BATCH {
        batch.push(Statement::new(
            "INSERT INTO scene (id, rank, number, content, length_eighths, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            vec![t(format!("s{seq}-{idx}")), t(format!("{seq:010}{idx}")), t(idx.to_string()), t(content(seq, idx)), n(seq), t(now), t(now)],
        ));
    }
    if seq > WINDOW {
        batch.push(Statement::new("DELETE FROM scene WHERE length_eighths <= ?", vec![n(seq - WINDOW)]));
    }
    db::write(tx, &batch, "Essai de coupure", &["scene".into(), "project_setting".into()])
}

/// Returns the batch number if the data is exactly what the batches up to it should have produced.
pub fn check(conn: &Connection) -> Result<u64, String> {
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if integrity != "ok" {
        return Err(format!("intégrité : {integrity}"));
    }
    let seq = current_seq(conn).map_err(|e| e.to_string())?;
    let first = seq.saturating_sub(WINDOW) + 1;
    let mut stmt = conn
        .prepare("SELECT length_eighths, number, content FROM scene ORDER BY rank")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)? as u64, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
        .map_err(|e| e.to_string())?;
    let mut expected = (first, 0u64);
    let mut count = 0u64;
    for row in rows {
        let (s, i, c) = row.map_err(|e| e.to_string())?;
        let i: u64 = i.parse().map_err(|_| format!("numéro de scène illisible en {s}"))?;
        if (s, i) != expected {
            return Err(format!("scène inattendue {s}.{i}, attendue {}.{}", expected.0, expected.1));
        }
        if c != content(s, i) {
            return Err(format!("contenu altéré en {s}.{i}"));
        }
        count += 1;
        expected = if i + 1 == SCENES_PER_BATCH { (s + 1, 0) } else { (s, i + 1) };
    }
    let want = SCENES_PER_BATCH * seq.min(WINDOW);
    if count != want {
        return Err(format!("{count} scènes pour le lot {seq}, {want} attendues"));
    }
    Ok(seq)
}
