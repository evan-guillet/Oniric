import type { Compilable } from "kysely";
import { db, nowIso, query, write } from "../../../../core/db/client";
import { parseJson, useLive } from "../../../../core/db/live";
import { uuidv7 } from "../../../../core/ids";
import { EMPTY_RICH } from "../../../../ui-kit/RichText";

/** A new version of a field is kept when the last one is older than this [ATL-02]. */
const VERSION_EVERY_MS = 10 * 60 * 1000;

export async function loadFields(): Promise<Map<string, unknown>> {
  const rows = await query(db.selectFrom("workshop_field").selectAll());
  return new Map(rows.map((r) => [r.key, parseJson<unknown>(r.value, null)]));
}

export function useFields(): Map<string, unknown> | undefined {
  return useLive(loadFields, ["workshop_field"]);
}

/** Writes a field; its previous value goes to the field's history at most every ten minutes. */
export async function setField(key: string, value: unknown, keepHistory = true): Promise<void> {
  const json = JSON.stringify(value ?? null);
  const now = nowIso();
  const queries: Compilable[] = [
    db
      .insertInto("workshop_field")
      .values({ key, value: json, updated_at: now })
      .onConflict((oc) => oc.column("key").doUpdateSet({ value: json, updated_at: now })),
  ];
  const tables: ("workshop_field" | "workshop_field_version")[] = ["workshop_field"];
  if (keepHistory) {
    const last = await query(db.selectFrom("workshop_field_version").select(["id", "created_at", "value"]).where("key", "=", key).orderBy("created_at", "desc").limit(1));
    if (last[0]?.value !== json) {
      if (!last[0] || Date.now() - Date.parse(last[0].created_at) > VERSION_EVERY_MS) {
        queries.push(db.insertInto("workshop_field_version").values({ id: uuidv7(), key, value: json, created_at: now }));
      } else {
        queries.push(db.updateTable("workshop_field_version").set({ value: json }).where("id", "=", last[0].id));
      }
      tables.push("workshop_field_version");
    }
  }
  await write("Atelier d'écriture", tables, queries);
}

export async function fieldHistory(key: string): Promise<{ id: string; value: unknown; createdAt: string }[]> {
  const rows = await query(db.selectFrom("workshop_field_version").selectAll().where("key", "=", key).orderBy("created_at", "desc"));
  return rows.map((r) => ({ id: r.id, value: parseJson<unknown>(r.value, null), createdAt: r.created_at }));
}

export type DocumentKind = "synopsis" | "treatment" | "continuity";

export interface ProjectDocument {
  id: string;
  kind: DocumentKind;
  content: string;
  updatedAt: string;
}

export async function loadDocument(kind: DocumentKind): Promise<ProjectDocument> {
  const rows = await query(db.selectFrom("document").selectAll().where("kind", "=", kind));
  const r = rows[0];
  return r ? { id: r.id, kind, content: r.content, updatedAt: r.updated_at } : { id: "", kind, content: EMPTY_RICH, updatedAt: "" };
}

export async function saveDocument(kind: DocumentKind, content: string): Promise<void> {
  const now = nowIso();
  await write("Document préparatoire", ["document"], [
    db
      .insertInto("document")
      .values({ id: uuidv7(), kind, content, created_at: now, updated_at: now })
      .onConflict((oc) => oc.column("kind").doUpdateSet({ content, updated_at: now })),
  ]);
}

export async function documentVersions(kind: DocumentKind): Promise<{ id: string; name: string; content: string; createdAt: string }[]> {
  const doc = await loadDocument(kind);
  if (!doc.id) return [];
  const rows = await query(db.selectFrom("document_version").selectAll().where("document_id", "=", doc.id).orderBy("created_at", "desc"));
  return rows.map((r) => ({ id: r.id, name: r.name, content: r.content, createdAt: r.created_at }));
}

/** A named, frozen copy of a document [DOC-02]. */
export async function freezeDocument(kind: DocumentKind, name: string, content: string): Promise<void> {
  await saveDocument(kind, content);
  const doc = await loadDocument(kind);
  await write("Version de document", ["document_version"], [
    db.insertInto("document_version").values({ id: uuidv7(), document_id: doc.id, name, content, created_at: nowIso() }),
  ]);
}
