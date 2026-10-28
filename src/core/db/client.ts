import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type Compilable,
  type InferResult,
} from "kysely";
import { commands, type CoreError, type SqlValue, type Statement } from "../../bindings";
import type { Database, TableName } from "./schema";

/** Kysely only compiles here: the core executes the SQL behind its guard rails (architecture, D-03). */
export const db = new Kysely<Database>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (k) => new SqliteIntrospector(k),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

export class CoreFailure extends Error {
  constructor(readonly error: CoreError) {
    super("message" in error ? error.message : error.kind);
  }
}

export function unwrap<T>(r: { status: "ok"; data: T } | { status: "error"; error: CoreError }): T {
  if (r.status === "error") throw new CoreFailure(r.error);
  return r.data;
}

function statement(q: Compilable): Statement {
  const c = q.compile();
  return { sql: c.sql, parameters: c.parameters as (SqlValue | null)[] };
}

export async function query<Q extends Compilable>(q: Q): Promise<InferResult<Q>> {
  const { columns, rows } = unwrap(await commands.dbQuery(statement(q)));
  return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]]))) as InferResult<Q>;
}

/** One batch, one transaction: all the queries are applied, or none; Ctrl+Z undoes it unless `undoable` is false. */
export async function write(label: string, tables: TableName[], queries: Compilable[], undoable = true): Promise<number> {
  if (queries.length === 0) return 0;
  return unwrap(await commands.dbWrite(queries.map(statement), { label, tables, undoable }));
}

export const nowIso = () => new Date().toISOString();
