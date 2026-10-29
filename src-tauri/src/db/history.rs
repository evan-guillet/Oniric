//! Undo and redo of the interface's writes. Temporary triggers note each row a write changes, as it was and as it
//! becomes; undoing puts the rows back as they were, last change first, and redoing plays them again.
//!
//! The screenplay's text has its own history in the editor; an action done on it from outside the text (a scene
//! put back, a version restored) only keeps its place in this line, and the editor undoes it.

use rusqlite::types::Value;
use rusqlite::{params_from_iter, Connection};
use serde_json::{Map, Value as Json};
use std::time::{Duration, Instant};

/// Steps kept; the oldest go first.
const KEEP: usize = 200;
/// Two writes of the same kind this close together are one step (a field saved as it is typed).
const MERGE_WITHIN: Duration = Duration::from_secs(2);

type Row = Map<String, Json>;

/// One row changed: inserted (`old` empty), updated, or deleted (`new` empty).
pub struct Change {
    table: String,
    old: Option<Row>,
    new: Option<Row>,
}

pub struct Step {
    pub label: String,
    pub tables: Vec<String>,
    changes: Vec<Change>,
    at: Instant,
    /// The depth of the editor's history once the action was done there, for a step the editor undoes.
    pub editor: Option<u32>,
}

/// What the interface needs to know of a step.
#[derive(Debug, Clone)]
pub struct StepInfo {
    pub label: String,
    pub tables: Vec<String>,
    pub editor: Option<u32>,
}

impl Step {
    pub fn info(&self) -> StepInfo {
        StepInfo { label: self.label.clone(), tables: self.tables.clone(), editor: self.editor }
    }
}

#[derive(Default)]
pub struct History {
    undo: Vec<Step>,
    redo: Vec<Step>,
}

fn quoted(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn literal(text: &str) -> String {
    format!("'{}'", text.replace('\'', "''"))
}

/// The columns of `table`, and which of them make its key.
fn columns(conn: &Connection, table: &str) -> rusqlite::Result<(Vec<String>, Vec<String>)> {
    let mut stmt = conn.prepare(&format!("PRAGMA main.table_info({})", quoted(table)))?;
    let mut cols = Vec::new();
    let mut key: Vec<(i64, String)> = Vec::new();
    let mut rows = stmt.query([])?;
    while let Some(r) = rows.next()? {
        let name: String = r.get(1)?;
        let pk: i64 = r.get(5)?;
        if pk > 0 {
            key.push((pk, name.clone()));
        }
        cols.push(name);
    }
    key.sort();
    Ok((cols, key.into_iter().map(|(_, n)| n).collect()))
}

/// Notes every change to the project's tables in a temporary table, for this connection only.
pub fn install(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("CREATE TEMP TABLE IF NOT EXISTS oniric_undo (seq INTEGER PRIMARY KEY, tbl TEXT NOT NULL, old TEXT, new TEXT);")?;
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM main.sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE 'oniric\\_%' ESCAPE '\\'")?
        .query_map([], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    for table in tables {
        let (cols, _) = columns(conn, &table)?;
        let row = |side: &str| format!("json_object({})", cols.iter().map(|c| format!("{}, {side}.{}", literal(c), quoted(c))).collect::<Vec<_>>().join(", "));
        let (t, name) = (quoted(&table), literal(&table));
        let trigger = |kind: &str| quoted(&format!("oniric_undo_{kind}_{table}"));
        conn.execute_batch(&format!(
            "CREATE TEMP TRIGGER IF NOT EXISTS {i} AFTER INSERT ON main.{t} BEGIN INSERT INTO oniric_undo (tbl, old, new) VALUES ({name}, NULL, {new}); END;
             CREATE TEMP TRIGGER IF NOT EXISTS {u} AFTER UPDATE ON main.{t} BEGIN INSERT INTO oniric_undo (tbl, old, new) VALUES ({name}, {old}, {new}); END;
             CREATE TEMP TRIGGER IF NOT EXISTS {d} AFTER DELETE ON main.{t} BEGIN INSERT INTO oniric_undo (tbl, old, new) VALUES ({name}, {old}, NULL); END;",
            i = trigger("i"),
            u = trigger("u"),
            d = trigger("d"),
            new = row("NEW"),
            old = row("OLD"),
        ))?;
    }
    Ok(())
}

fn parse(text: Option<String>) -> Option<Row> {
    match serde_json::from_str(&text?) {
        Ok(Json::Object(m)) => Some(m),
        _ => None,
    }
}

/// The changes noted since the last call, which empties the note.
fn take(conn: &Connection) -> rusqlite::Result<Vec<Change>> {
    let changes = conn
        .prepare("SELECT tbl, old, new FROM temp.oniric_undo ORDER BY seq")?
        .query_map([], |r| Ok(Change { table: r.get(0)?, old: parse(r.get(1)?), new: parse(r.get(2)?) }))?
        .collect::<rusqlite::Result<_>>()?;
    conn.execute_batch("DELETE FROM temp.oniric_undo;")?;
    Ok(changes)
}

/// Runs `f` and returns what it changed in the project's tables.
pub fn capture<T, E: From<rusqlite::Error>>(conn: &Connection, f: impl FnOnce() -> Result<T, E>) -> Result<(T, Vec<Change>), E> {
    conn.execute_batch("DELETE FROM temp.oniric_undo;")?;
    let value = f()?;
    Ok((value, take(conn)?))
}

fn value(v: &Json) -> Value {
    match v {
        Json::Null => Value::Null,
        Json::Bool(b) => Value::Integer(*b as i64),
        Json::Number(n) => n.as_i64().map(Value::Integer).unwrap_or_else(|| Value::Real(n.as_f64().unwrap_or(0.0))),
        Json::String(s) => Value::Text(s.clone()),
        other => Value::Text(other.to_string()),
    }
}

/// Gives the row keyed like `key` the values of `row`; inserts it when it is not there.
fn put(conn: &Connection, table: &str, key: &Row, row: &Row) -> rusqlite::Result<()> {
    let (cols, pk) = columns(conn, table)?;
    let cols: Vec<&String> = cols.iter().filter(|c| row.contains_key(*c)).collect();
    let set = cols.iter().map(|c| format!("{} = ?", quoted(c))).collect::<Vec<_>>().join(", ");
    let at = pk.iter().map(|c| format!("{} = ?", quoted(c))).collect::<Vec<_>>().join(" AND ");
    let values = cols.iter().map(|c| value(&row[*c])).chain(pk.iter().map(|c| value(key.get(c).unwrap_or(&Json::Null))));
    let updated = conn.execute(&format!("UPDATE main.{} SET {set} WHERE {at}", quoted(table)), params_from_iter(values))?;
    if updated == 0 {
        let names = cols.iter().map(|c| quoted(c)).collect::<Vec<_>>().join(", ");
        let marks = vec!["?"; cols.len()].join(", ");
        conn.execute(&format!("INSERT INTO main.{} ({names}) VALUES ({marks})", quoted(table)), params_from_iter(cols.iter().map(|c| value(&row[*c]))))?;
    }
    Ok(())
}

fn remove(conn: &Connection, table: &str, key: &Row) -> rusqlite::Result<()> {
    let (_, pk) = columns(conn, table)?;
    let at = pk.iter().map(|c| format!("{} = ?", quoted(c))).collect::<Vec<_>>().join(" AND ");
    conn.execute(&format!("DELETE FROM main.{} WHERE {at}", quoted(table)), params_from_iter(pk.iter().map(|c| value(key.get(c).unwrap_or(&Json::Null)))))?;
    Ok(())
}

/// Plays `changes` backwards (undo) or forwards (redo); the keys are checked once all of it is done.
fn apply(conn: &Connection, changes: &[Change], back: bool) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA defer_foreign_keys = ON;")?;
    let run = |c: &Change| -> rusqlite::Result<()> {
        let (from, to) = if back { (&c.new, &c.old) } else { (&c.old, &c.new) };
        match (from, to) {
            (Some(row), None) => remove(conn, &c.table, row),
            (from, Some(row)) => put(conn, &c.table, from.as_ref().unwrap_or(row), row),
            (None, None) => Ok(()),
        }
    };
    if back {
        changes.iter().rev().try_for_each(run)?;
    } else {
        changes.iter().try_for_each(run)?;
    }
    conn.execute_batch("DELETE FROM temp.oniric_undo;")
}

impl History {
    fn push(&mut self, step: Step) {
        self.redo.clear();
        self.undo.push(step);
        if self.undo.len() > KEEP {
            self.undo.remove(0);
        }
    }

    /// One write; joined to the previous step when it is the same kind of write, just after.
    pub fn record(&mut self, label: &str, tables: &[String], changes: Vec<Change>) {
        if changes.is_empty() {
            return;
        }
        if let Some(last) = self.undo.last_mut() {
            if last.editor.is_none() && last.label == label && last.tables == tables && last.at.elapsed() < MERGE_WITHIN {
                last.changes.extend(changes);
                last.at = Instant::now();
                self.redo.clear();
                return;
            }
        }
        self.push(Step { label: label.into(), tables: tables.to_vec(), changes, at: Instant::now(), editor: None });
    }

    /// An action done in the editor; with `absorb`, the write made for it just before becomes part of it.
    pub fn mark(&mut self, label: &str, depth: u32, absorb: bool) {
        let (tables, changes) = match self.undo.last() {
            Some(last) if absorb && last.editor.is_none() && last.at.elapsed() < MERGE_WITHIN => {
                let last = self.undo.pop().unwrap();
                (last.tables, last.changes)
            }
            _ => (vec![], vec![]),
        };
        self.push(Step { label: label.into(), tables, changes, at: Instant::now(), editor: Some(depth) });
    }

    pub fn next_undo(&self) -> Option<StepInfo> {
        self.undo.last().map(Step::info)
    }

    pub fn next_redo(&self) -> Option<StepInfo> {
        self.redo.last().map(Step::info)
    }

    /// Forgets the next step without undoing it (already undone in the editor).
    pub fn drop_next(&mut self, redo: bool) {
        if redo {
            self.redo.pop();
        } else {
            self.undo.pop();
        }
    }

    /// Undoes the last step in `conn`; on failure, the step stays where it was.
    pub fn undo(&mut self, conn: &Connection) -> rusqlite::Result<Option<StepInfo>> {
        let Some(step) = self.undo.pop() else { return Ok(None) };
        if let Err(e) = apply(conn, &step.changes, true) {
            self.undo.push(step);
            return Err(e);
        }
        let info = step.info();
        self.redo.push(step);
        Ok(Some(info))
    }

    /// Does again the last undone step.
    pub fn redo(&mut self, conn: &Connection) -> rusqlite::Result<Option<StepInfo>> {
        let Some(mut step) = self.redo.pop() else { return Ok(None) };
        if let Err(e) = apply(conn, &step.changes, false) {
            self.redo.push(step);
            return Err(e);
        }
        let info = step.info();
        step.at = Instant::now() - MERGE_WITHIN;
        self.undo.push(step);
        Ok(Some(info))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{write, Statement};

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE oniric_journal (id INTEGER PRIMARY KEY, at TEXT, label TEXT, tables TEXT);
             CREATE TABLE act (id TEXT PRIMARY KEY, title TEXT NOT NULL, rank REAL);
             CREATE TABLE sequence (id TEXT PRIMARY KEY, act_id TEXT REFERENCES act (id) ON DELETE SET NULL);
             CREATE TABLE beat_scene (beat_id TEXT NOT NULL, scene_id TEXT NOT NULL, PRIMARY KEY (beat_id, scene_id));",
        )
        .unwrap();
        install(&c).unwrap();
        c
    }

    fn run(c: &mut Connection, h: &mut History, label: &str, sql: &str) {
        let tx = c.transaction().unwrap();
        let tables = vec!["act".to_string()];
        let (_, changes) = capture(&tx, || write(&tx, &[Statement::new(sql, vec![])], label, &tables)).unwrap();
        tx.commit().unwrap();
        h.record(label, &tables, changes);
    }

    fn titles(c: &Connection) -> Vec<String> {
        let mut s = c.prepare("SELECT title FROM act ORDER BY id").unwrap();
        s.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect()
    }

    fn undo(c: &mut Connection, h: &mut History) -> Option<StepInfo> {
        let tx = c.transaction().unwrap();
        let info = h.undo(&tx).unwrap();
        tx.commit().unwrap();
        info
    }

    fn redo(c: &mut Connection, h: &mut History) {
        let tx = c.transaction().unwrap();
        h.redo(&tx).unwrap();
        tx.commit().unwrap();
    }

    #[test]
    fn undoes_and_redoes_through_the_guard() {
        let mut c = conn();
        let mut h = History::default();
        run(&mut c, &mut h, "Nouvel acte", "INSERT INTO act VALUES ('a', 'Départ', 1.5)");
        c.execute("INSERT INTO sequence VALUES ('s', 'a')", []).unwrap();
        run(&mut c, &mut h, "Acte supprimé", "DELETE FROM act WHERE id = 'a'");
        assert!(titles(&c).is_empty());

        assert_eq!(undo(&mut c, &mut h).unwrap().label, "Acte supprimé");
        assert_eq!(titles(&c), ["Départ"]);
        let act: Option<String> = c.query_row("SELECT act_id FROM sequence", [], |r| r.get(0)).unwrap();
        assert_eq!(act.as_deref(), Some("a"));
        let rank: f64 = c.query_row("SELECT rank FROM act", [], |r| r.get(0)).unwrap();
        assert_eq!(rank, 1.5);

        undo(&mut c, &mut h);
        assert!(titles(&c).is_empty());
        redo(&mut c, &mut h);
        assert_eq!(titles(&c), ["Départ"]);
        assert_eq!(c.query_row("SELECT count(*) FROM oniric_journal", [], |r| r.get::<_, i64>(0)).unwrap(), 2);
    }

    #[test]
    fn joins_quick_writes_of_one_kind() {
        let mut c = conn();
        let mut h = History::default();
        run(&mut c, &mut h, "Nouvel acte", "INSERT INTO act VALUES ('a', 'D', NULL)");
        run(&mut c, &mut h, "Acte", "UPDATE act SET title = 'Dé' WHERE id = 'a'");
        run(&mut c, &mut h, "Acte", "UPDATE act SET title = 'Départ' WHERE id = 'a'");
        undo(&mut c, &mut h);
        assert_eq!(titles(&c), ["D"]);
        assert_eq!(h.next_undo().unwrap().label, "Nouvel acte");
    }

    #[test]
    fn puts_back_rows_with_a_compound_key() {
        let mut c = conn();
        let mut h = History::default();
        c.execute("INSERT INTO beat_scene VALUES ('b', 's1'), ('b', 's2')", []).unwrap();
        run(&mut c, &mut h, "Point", "DELETE FROM beat_scene WHERE beat_id = 'b'");
        undo(&mut c, &mut h);
        assert_eq!(c.query_row("SELECT count(*) FROM beat_scene", [], |r| r.get::<_, i64>(0)).unwrap(), 2);
    }

    #[test]
    fn the_interface_cannot_write_the_undo_line_itself() {
        let mut c = conn();
        let tx = c.transaction().unwrap();
        let forged = Statement::new("INSERT INTO oniric_undo (tbl, old, new) VALUES ('act', NULL, '{}')", vec![]);
        assert!(matches!(write(&tx, &[forged], "x", &[]), Err(crate::db::DbError::Refused(_))));
    }
}
