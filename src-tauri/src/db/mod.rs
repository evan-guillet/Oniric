//! SQL sent by the interface, executed by the core behind its guard rails (architecture, 4.2).

mod guard;
pub mod history;

pub use guard::guarded;

use rusqlite::types::{ToSqlOutput, Value, ValueRef};
use rusqlite::{Connection, Statement as SqliteStatement, Transaction};
use serde::{Deserialize, Serialize};

/// A non-null value as JavaScript sees it: SQLite integers travel as numbers, which is exact up to 2^53.
/// NULL is `None`, so that TypeScript sees `SqlValue | null`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "app", derive(specta::Type))]
#[serde(untagged)]
pub enum SqlValue {
    Bool(bool),
    Number(f64),
    Text(String),
}

impl rusqlite::ToSql for SqlValue {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(match self {
            SqlValue::Bool(b) => ToSqlOutput::Owned(Value::Integer(*b as i64)),
            SqlValue::Number(n) if n.fract() == 0.0 && n.abs() < 9_007_199_254_740_992.0 => {
                ToSqlOutput::Owned(Value::Integer(*n as i64))
            }
            SqlValue::Number(n) => ToSqlOutput::Owned(Value::Real(*n)),
            SqlValue::Text(s) => ToSqlOutput::Borrowed(ValueRef::Text(s.as_bytes())),
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "app", derive(specta::Type))]
pub struct Statement {
    pub sql: String,
    pub parameters: Vec<Option<SqlValue>>,
}

impl Statement {
    pub fn new(sql: &str, parameters: Vec<Option<SqlValue>>) -> Statement {
        Statement { sql: sql.into(), parameters }
    }
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "app", derive(specta::Type))]
pub struct Rows {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Option<SqlValue>>>,
}

#[derive(Debug)]
pub enum DbError {
    Refused(String),
    Sql(rusqlite::Error),
}

impl From<rusqlite::Error> for DbError {
    fn from(e: rusqlite::Error) -> Self {
        match e {
            rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::AuthorizationForStatementDenied => {
                DbError::Refused("requête refusée par le cœur".into())
            }
            e => DbError::Sql(e),
        }
    }
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DbError::Refused(why) => f.write_str(why),
            DbError::Sql(e) => write!(f, "erreur de base de données : {e}"),
        }
    }
}

fn bind(stmt: &mut SqliteStatement<'_>, params: &[Option<SqlValue>]) -> rusqlite::Result<()> {
    if params.len() != stmt.parameter_count() {
        return Err(rusqlite::Error::InvalidParameterCount(params.len(), stmt.parameter_count()));
    }
    for (i, p) in params.iter().enumerate() {
        stmt.raw_bind_parameter(i + 1, p)?;
    }
    Ok(())
}

fn from_sql(v: ValueRef<'_>) -> Option<SqlValue> {
    match v {
        ValueRef::Null | ValueRef::Blob(_) => None,
        ValueRef::Integer(i) => Some(SqlValue::Number(i as f64)),
        ValueRef::Real(f) => Some(SqlValue::Number(f)),
        ValueRef::Text(t) => Some(SqlValue::Text(String::from_utf8_lossy(t).into_owned())),
    }
}

/// One read, refused if it would write.
pub fn query(conn: &Connection, query: &Statement) -> Result<Rows, DbError> {
    guarded(conn, || {
        let mut stmt = conn.prepare(&query.sql)?;
        if !stmt.readonly() {
            return Err(DbError::Refused("db_query n'accepte que des lectures".into()));
        }
        bind(&mut stmt, &query.parameters)?;
        let columns: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
        let mut rows = Vec::new();
        let mut cursor = stmt.raw_query();
        while let Some(row) = cursor.next()? {
            rows.push((0..columns.len()).map(|i| row.get_ref(i).map(from_sql)).collect::<rusqlite::Result<_>>()?);
        }
        Ok(Rows { columns, rows })
    })
}

/// A batch of writes inside the caller's transaction, then one line in the change journal [PRJ-08].
pub fn write(tx: &Transaction, batch: &[Statement], label: &str, tables: &[String]) -> Result<usize, DbError> {
    let changed = guarded(tx, || {
        let mut changed = 0usize;
        for s in batch {
            let mut stmt = tx.prepare(&s.sql)?;
            if stmt.readonly() {
                return Err(DbError::Refused("db_write n'accepte que des écritures".into()));
            }
            bind(&mut stmt, &s.parameters)?;
            changed += stmt.raw_execute()?;
        }
        Ok(changed)
    })?;
    tx.execute(
        "INSERT INTO oniric_journal (at, label, tables) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?1, ?2)",
        [label, &tables.join(",")],
    )?;
    Ok(changed)
}
