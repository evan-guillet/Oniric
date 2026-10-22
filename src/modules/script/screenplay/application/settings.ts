import { db, nowIso, query, write } from "../../../../core/db/client";

export async function readSetting(key: string): Promise<string | null> {
  const rows = await query(db.selectFrom("project_setting").select("value").where("key", "=", key));
  return rows[0]?.value ?? null;
}

export function writeSetting(key: string, value: string): Promise<number> {
  const now = nowIso();
  return write("Réglage du projet", ["project_setting"], [
    db
      .insertInto("project_setting")
      .values({ key, value, updated_at: now })
      .onConflict((oc) => oc.column("key").doUpdateSet({ value, updated_at: now })),
  ]);
}
