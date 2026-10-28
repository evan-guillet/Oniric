import { sql, type Compilable } from "kysely";
import { db, nowIso, query, write } from "../../../../core/db/client";
import { onTablesChanged, parseJson } from "../../../../core/db/live";
import type { EntryStatus } from "../../../../core/db/schema";
import { uuidv7 } from "../../../../core/ids";
import type { WikiSource, WikiTarget } from "../ui/wikiPlugin";
import { BUILTIN_TYPES, fold, pluralize, type EntryType, type FieldDef } from "../domain/types";
import { t } from "../../../../core/i18n";

export interface Entry {
  id: string;
  type: string;
  name: string;
  aliases: string[];
  summary: string;
  /** JSON ProseMirror document. */
  content: string;
  fields: Record<string, unknown>;
  tags: string[];
  links: string[];
  status: EntryStatus;
  image: string | null;
  gallery: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface Relation {
  id: string;
  fromId: string;
  toId: string;
  kind: string;
  note: string;
  actId: string | null;
}

const TABLES = ["bible_entry"] as const;

function toEntry(r: {
  id: string;
  type: string;
  name: string;
  aliases: string;
  summary: string;
  content: string;
  fields: string;
  tags: string;
  links: string;
  status: EntryStatus;
  image: string | null;
  gallery: string;
  notes: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}): Entry {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    aliases: parseJson(r.aliases, []),
    summary: r.summary,
    content: r.content,
    fields: parseJson(r.fields, {}),
    tags: parseJson(r.tags, []),
    links: parseJson(r.links, []),
    status: r.status,
    image: r.image,
    gallery: parseJson(r.gallery, []),
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  };
}

export async function loadEntries(): Promise<Entry[]> {
  const rows = await query(db.selectFrom("bible_entry").selectAll().where("deleted_at", "is", null).orderBy("name"));
  return rows.map(toEntry).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function loadTypes(): Promise<EntryType[]> {
  const rows = await query(db.selectFrom("bible_type").selectAll().where("deleted_at", "is", null).orderBy("name"));
  return [
    ...BUILTIN_TYPES,
    ...rows.map((r) => ({ id: r.id, name: r.name, plural: pluralize(r.name), icon: r.icon, builtin: false, fields: parseJson<FieldDef[]>(r.fields, []) })),
  ];
}

export async function createEntry(type: string, name: string, extra: Partial<Entry> = {}): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Nouvelle fiche de la bible", [...TABLES], [
    db.insertInto("bible_entry").values({
      id,
      type,
      name: name.trim() || t("entry.unnamed"),
      summary: extra.summary ?? "",
      fields: JSON.stringify(extra.fields ?? {}),
      aliases: JSON.stringify(extra.aliases ?? []),
      created_at: now,
      updated_at: now,
    }),
  ]);
  return id;
}

export async function createEntries(items: { type: string; name: string }[]): Promise<void> {
  const now = nowIso();
  await write(
    "Fiches détectées dans le scénario",
    [...TABLES],
    items.map((it) => db.insertInto("bible_entry").values({ id: uuidv7(), type: it.type, name: it.name, created_at: now, updated_at: now })),
  );
}

const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;

/** Saves an entry; a copy of the previous state is kept in its history every ten minutes at most [5.2]. */
export async function saveEntry(entry: Entry, previous: Entry | null): Promise<void> {
  const now = nowIso();
  const queries: Compilable[] = [
    db
      .updateTable("bible_entry")
      .set({
        type: entry.type,
        name: entry.name.trim() || t("entry.unnamed"),
        aliases: JSON.stringify(entry.aliases),
        summary: entry.summary,
        content: entry.content,
        fields: JSON.stringify(entry.fields),
        tags: JSON.stringify(entry.tags),
        links: JSON.stringify(entry.links),
        status: entry.status,
        image: entry.image,
        gallery: JSON.stringify(entry.gallery),
        notes: entry.notes,
        updated_at: now,
      })
      .where("id", "=", entry.id),
  ];
  const tables: ("bible_entry" | "bible_entry_version")[] = ["bible_entry"];
  if (previous) {
    const last = await query(
      db.selectFrom("bible_entry_version").select("created_at").where("entry_id", "=", entry.id).orderBy("created_at", "desc").limit(1),
    );
    if (!last[0] || Date.now() - Date.parse(last[0].created_at) > SNAPSHOT_EVERY_MS) {
      queries.push(
        db.insertInto("bible_entry_version").values({ id: uuidv7(), entry_id: entry.id, data: JSON.stringify(previous), created_at: now }),
      );
      tables.push("bible_entry_version");
    }
  }
  await write("Fiche de la bible", tables, queries);
}

/** One field of an entry, without touching the others (the workshop edits the same characters as the bible). */
export async function setEntryField(id: string, key: string, value: string): Promise<void> {
  await write("Fiche de la bible", ["bible_entry"], [
    db
      .updateTable("bible_entry")
      .set({ fields: sql<string>`json_set(fields, ${`$.${key}`}, ${value})`, updated_at: nowIso() })
      .where("id", "=", id),
  ]);
}

export async function entryVersions(id: string): Promise<{ id: string; createdAt: string; entry: Entry }[]> {
  const rows = await query(db.selectFrom("bible_entry_version").selectAll().where("entry_id", "=", id).orderBy("created_at", "desc"));
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at, entry: JSON.parse(r.data) as Entry }));
}

export async function duplicateEntry(e: Entry): Promise<string> {
  const name = t("settings.copyName", { name: e.name });
  const id = await createEntry(e.type, name);
  await saveEntry({ ...e, id, name }, null);
  return id;
}

export async function archiveEntry(id: string, archived: boolean): Promise<void> {
  const now = nowIso();
  await write(archived ? "Fiche archivée" : "Fiche désarchivée", [...TABLES], [
    db.updateTable("bible_entry").set({ archived_at: archived ? now : null, updated_at: now }).where("id", "=", id),
  ]);
}

export async function deleteEntry(id: string): Promise<void> {
  const now = nowIso();
  await write("Fiche supprimée", [...TABLES], [db.updateTable("bible_entry").set({ deleted_at: now, updated_at: now }).where("id", "=", id)]);
}

/** Brings back an entry deleted a moment ago (the « Annuler » of the deletion notice). */
export async function restoreEntry(id: string): Promise<void> {
  await write("Fiche restaurée", [...TABLES], [db.updateTable("bible_entry").set({ deleted_at: null, updated_at: nowIso() }).where("id", "=", id)]);
}

/** A name found in the screenplay becomes another name of an existing entry. */
export async function addAlias(entry: Entry, alias: string): Promise<void> {
  if (entry.aliases.some((a) => fold(a) === fold(alias))) return;
  await saveEntry({ ...entry, aliases: [...entry.aliases, alias] }, entry);
}

export async function saveType(t: { id?: string; name: string; icon: string; fields: FieldDef[] }): Promise<string> {
  const now = nowIso();
  const id = t.id ?? uuidv7();
  await write("Type de fiche", ["bible_type"], [
    db
      .insertInto("bible_type")
      .values({ id, name: t.name.trim() || "Type", icon: t.icon, fields: JSON.stringify(t.fields), created_at: now, updated_at: now })
      .onConflict((oc) => oc.column("id").doUpdateSet({ name: t.name.trim() || "Type", icon: t.icon, fields: JSON.stringify(t.fields), updated_at: now })),
  ]);
  return id;
}

export async function deleteType(id: string): Promise<void> {
  const now = nowIso();
  await write("Type de fiche supprimé", ["bible_type"], [db.updateTable("bible_type").set({ deleted_at: now, updated_at: now }).where("id", "=", id)]);
}

/** Entries and scenes whose text points to `id`: the « Liens » panel [RCH-03]. */
export async function backlinks(id: string): Promise<{ entries: { id: string; name: string }[]; scenes: string[] }> {
  const like = `%${id}%`;
  const [entries, scenes] = await Promise.all([
    query(
      db
        .selectFrom("bible_entry")
        .select(["id", "name"])
        .where("deleted_at", "is", null)
        .where("id", "!=", id)
        .where((eb) => eb.or([eb("content", "like", like), eb("links", "like", like), eb("fields", "like", like)])),
    ),
    query(db.selectFrom("scene").select("id").where("deleted_at", "is", null).where("content", "like", like)),
  ]);
  return { entries, scenes: scenes.map((s) => s.id) };
}

export async function loadRelations(): Promise<Relation[]> {
  const rows = await query(db.selectFrom("relation").selectAll().orderBy("created_at"));
  return rows.map((r) => ({ id: r.id, fromId: r.from_id, toId: r.to_id, kind: r.kind, note: r.note, actId: r.act_id }));
}

export async function addRelation(r: Omit<Relation, "id">): Promise<void> {
  const now = nowIso();
  await write("Relation entre personnages", ["relation"], [
    db.insertInto("relation").values({ id: uuidv7(), from_id: r.fromId, to_id: r.toId, kind: r.kind, note: r.note, act_id: r.actId, created_at: now, updated_at: now }),
  ]);
}

export async function deleteRelation(id: string): Promise<void> {
  await write("Relation supprimée", ["relation"], [db.deleteFrom("relation").where("id", "=", id)]);
}

export interface BibleFile {
  format: "oniric-bible";
  version: 1;
  exportedAt: string;
  /** `icon` is missing from the files exported before types had one. */
  types: { id: string; name: string; icon?: string; fields: FieldDef[] }[];
  entries: Entry[];
  relations: Relation[];
}

/** The whole bible in one file, to reuse it in another project [BIB-09]. */
export async function exportBible(): Promise<BibleFile> {
  const [types, entries, relations] = await Promise.all([loadTypes(), loadEntries(), loadRelations()]);
  return {
    format: "oniric-bible",
    version: 1,
    exportedAt: nowIso(),
    types: types.filter((t) => !t.builtin).map((t) => ({ id: t.id, name: t.name, icon: t.icon ?? "", fields: t.fields })),
    entries,
    relations,
  };
}

/** Adds the entries of a bible file; an entry already present (same id) is updated only if the file is more recent. */
export async function importBible(text: string): Promise<{ added: number; updated: number }> {
  const file = JSON.parse(text) as BibleFile;
  if (file.format !== "oniric-bible") throw new Error("Ce fichier n'est pas une bible Oniric.");
  const existing = new Map((await query(db.selectFrom("bible_entry").select(["id", "updated_at"]))).map((r) => [r.id, r.updated_at]));
  const now = nowIso();
  let added = 0;
  let updated = 0;
  const queries: Compilable[] = [];
  for (const t of file.types) {
    queries.push(
      db
        .insertInto("bible_type")
        .values({ id: t.id, name: t.name, icon: t.icon ?? "", fields: JSON.stringify(t.fields), created_at: now, updated_at: now })
        // A file from before the icons keeps the icon the type has here.
        .onConflict((oc) => oc.column("id").doUpdateSet({ name: t.name, ...(t.icon !== undefined && { icon: t.icon }), fields: JSON.stringify(t.fields), updated_at: now, deleted_at: null })),
    );
  }
  for (const e of file.entries) {
    const known = existing.get(e.id);
    if (known && known >= e.updatedAt) continue;
    if (known) updated++;
    else added++;
    const values = {
      type: e.type,
      name: e.name,
      aliases: JSON.stringify(e.aliases ?? []),
      summary: e.summary ?? "",
      content: e.content,
      fields: JSON.stringify(e.fields ?? {}),
      tags: JSON.stringify(e.tags ?? []),
      links: JSON.stringify(e.links ?? []),
      status: e.status ?? "idea",
      image: null,
      gallery: "[]",
      notes: e.notes ?? "",
      updated_at: e.updatedAt,
      deleted_at: null,
      archived_at: e.archivedAt ?? null,
    };
    queries.push(
      db
        .insertInto("bible_entry")
        .values({ id: e.id, created_at: e.createdAt ?? now, ...values })
        .onConflict((oc) => oc.column("id").doUpdateSet(values)),
    );
  }
  for (const r of file.relations ?? []) {
    queries.push(
      db
        .insertInto("relation")
        .values({ id: r.id, from_id: r.fromId, to_id: r.toId, kind: r.kind, note: r.note, act_id: null, created_at: now, updated_at: now })
        .onConflict((oc) => oc.column("id").doNothing()),
    );
  }
  await write("Import d'une bible", ["bible_entry", "bible_type", "relation"], queries);
  return { added, updated };
}

/** Entries known to the wiki links of every editor, kept up to date. */
class BibleIndex implements WikiSource {
  private entries: Entry[] = [];
  private types = new Map<string, string>();
  private stop: (() => void) | null = null;
  opener: (id: string) => void = () => {};

  start(): void {
    this.stop?.();
    void this.refresh();
    this.stop = onTablesChanged(["bible_entry", "bible_type"], () => void this.refresh());
  }

  dispose(): void {
    this.stop?.();
    this.stop = null;
    this.entries = [];
  }

  private async refresh() {
    const [entries, types] = await Promise.all([loadEntries(), loadTypes()]);
    this.entries = entries.filter((e) => !e.archivedAt);
    this.types = new Map(types.map((t) => [t.id, t.name]));
  }

  private target(e: Entry): WikiTarget {
    return { id: e.id, name: e.name, typeName: this.types.get(e.type) ?? e.type, summary: e.summary };
  }

  all(): Entry[] {
    return this.entries;
  }

  search(q: string): WikiTarget[] {
    const n = fold(q);
    const scored = this.entries
      .map((e) => {
        const names = [e.name, ...e.aliases].map(fold);
        const score = names.some((x) => x.startsWith(n)) ? 0 : names.some((x) => x.includes(n)) ? 1 : 2;
        return { e, score };
      })
      .filter((x) => x.score < 2);
    scored.sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name, "fr"));
    return scored.map((x) => this.target(x.e));
  }

  get(id: string): WikiTarget | undefined {
    const e = this.entries.find((x) => x.id === id);
    return e && this.target(e);
  }

  open(id: string): void {
    this.opener(id);
  }
}

export const bibleIndex = new BibleIndex();
