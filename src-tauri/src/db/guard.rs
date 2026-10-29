//! The SQLite authorizer that limits what the interface's SQL may do.

use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::Connection;

const INTERNAL_PREFIX: &str = "oniric_";

fn decide(ctx: AuthContext<'_>) -> Authorization {
    let internal = |t: &str| t.starts_with(INTERNAL_PREFIX) || t.starts_with("sqlite_");
    match ctx.action {
        // The core notes the rows a write changes, through its own triggers [history]; the interface's SQL may not.
        AuthAction::Insert { table_name: "oniric_undo" } if ctx.accessor.is_some_and(|a| a.starts_with("oniric_undo_")) => {
            Authorization::Allow
        }
        AuthAction::Read { table_name, .. }
        | AuthAction::Insert { table_name }
        | AuthAction::Update { table_name, .. }
        | AuthAction::Delete { table_name }
            if internal(table_name) =>
        {
            Authorization::Deny
        }
        AuthAction::Attach { .. }
        | AuthAction::Detach { .. }
        | AuthAction::Pragma { .. }
        | AuthAction::Transaction { .. }
        | AuthAction::Savepoint { .. }
        | AuthAction::CreateTable { .. }
        | AuthAction::CreateIndex { .. }
        | AuthAction::DropTable { .. }
        | AuthAction::DropIndex { .. }
        | AuthAction::CreateTempTable { .. }
        | AuthAction::CreateTrigger { .. }
        | AuthAction::CreateTempTrigger { .. }
        | AuthAction::CreateView { .. }
        | AuthAction::AlterTable { .. }
        | AuthAction::CreateVtable { .. }
        | AuthAction::DropVtable { .. } => Authorization::Deny,
        AuthAction::Function { function_name } if function_name.eq_ignore_ascii_case("load_extension") => {
            Authorization::Deny
        }
        _ => Authorization::Allow,
    }
}

/// Runs `f` with the guard installed; the core's own statements (flush, migrations, journal) run without it.
pub fn guarded<T, E: From<rusqlite::Error>>(conn: &Connection, f: impl FnOnce() -> Result<T, E>) -> Result<T, E> {
    conn.authorizer(Some(decide))?;
    let out = f();
    conn.authorizer(None::<fn(AuthContext<'_>) -> Authorization>)?;
    out
}
