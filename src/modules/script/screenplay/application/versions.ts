import { commands } from "../../../../bindings";
import { db, nowIso, query, unwrap, write } from "../../../../core/db/client";
import { markEditorStep } from "../../../../core/history";
import { uuidv7 } from "../../../../core/ids";
import type { ScreenplayFormat } from "../domain/formats";
import type { VersionScene } from "../domain/diff";
import type { TitlePage } from "../domain/titlePage";
import type { ScriptSession } from "./scriptSession";
import { loadStory } from "../../views/application/story";
import { sceneContent } from "../ui/editor/schema";

/** A frozen version: a self-contained JSON file in `versions/` (architecture, 6.5) [REE-01]. */
export interface VersionFile {
  format: "oniric-screenplay-version";
  version: 1;
  oniric: string;
  name: string;
  createdAt: string;
  title: string;
  screenplayFormat: ScreenplayFormat;
  titlePage: TitlePage | null;
  acts: { id: string; title: string; rank: string }[];
  sequences: { id: string; title: string; rank: string; actId: string | null; summary: string }[];
  scenes: {
    id: string;
    heading: string;
    /** JSON of the scene's elements, as in the database. */
    content: string;
    text: string;
    sequenceId: string | null;
    summary: string;
    status: string | null;
    color: string | null;
    tags: string[];
    plotlines: string[];
  }[];
  pages: number;
}

export interface VersionRow {
  id: string;
  name: string;
  file: string;
  sha256: string;
  pages: number;
  scenes: number;
  createdAt: string;
}

export async function listVersions(): Promise<VersionRow[]> {
  const rows = await query(db.selectFrom("script_version").selectAll().orderBy("created_at", "desc"));
  return rows.map((r) => ({ id: r.id, name: r.name, file: r.file, sha256: r.sha256, pages: r.pages, scenes: r.scenes, createdAt: r.created_at }));
}

/** The screenplay as it is now, in the form of a version. */
export async function currentVersion(session: ScriptSession, title: string, format: ScreenplayFormat, titlePage: TitlePage | null, name = "Actuelle"): Promise<VersionFile> {
  const story = await loadStory();
  const scenes = session.scenes();
  return {
    format: "oniric-screenplay-version",
    version: 1,
    oniric: "0.5.0",
    name,
    createdAt: nowIso(),
    title,
    screenplayFormat: format,
    titlePage,
    acts: story.acts.map((a) => ({ id: a.id, title: a.title, rank: a.rank })),
    sequences: story.sequences.map((s) => ({ id: s.id, title: s.title, rank: s.rank, actId: s.actId, summary: s.summary })),
    scenes: scenes.map((s) => {
      const m = story.meta.get(s.id);
      return {
        id: s.id,
        heading: s.heading,
        content: sceneContent(s.node),
        text: s.text,
        sequenceId: m?.sequenceId ?? null,
        summary: m?.summary ?? "",
        status: m?.status ?? null,
        color: m?.color ?? null,
        tags: m?.tags ?? [],
        plotlines: m?.plotlines ?? [],
      };
    }),
    pages: session.snapshot?.pagination.pages.length ?? 0,
  };
}

export async function freezeVersion(snapshot: VersionFile): Promise<VersionRow> {
  const saved = unwrap(await commands.versionSave(snapshot.name, JSON.stringify(snapshot, null, 1)));
  const row = { id: uuidv7(), name: snapshot.name, file: saved.path, sha256: saved.sha256, pages: snapshot.pages, scenes: snapshot.scenes.length, created_at: snapshot.createdAt };
  await write("Version figée", ["script_version"], [db.insertInto("script_version").values(row)]);
  return { ...row, createdAt: row.created_at };
}

export async function readVersion(file: string): Promise<VersionFile> {
  return JSON.parse(unwrap(await commands.versionRead(file))) as VersionFile;
}

export function versionScenes(v: VersionFile): VersionScene[] {
  return v.scenes.map((s) => ({ id: s.id, heading: s.heading, text: s.text }));
}

/** Only the name in the list changes: the file keeps the one it was frozen under. */
export async function renameVersion(id: string, name: string): Promise<void> {
  await write("Version renommée", ["script_version"], [db.updateTable("script_version").set({ name }).where("id", "=", id)]);
}

export async function deleteVersionRow(id: string): Promise<void> {
  await write("Version retirée de la liste", ["script_version"], [db.deleteFrom("script_version").where("id", "=", id)]);
}

export interface CutScene {
  id: string;
  heading: string;
  content: string;
  rank: string;
  deletedAt: string;
}

/** Scenes removed from the screenplay, most recent first [REE-06, RG-01]. */
export async function cutScenes(): Promise<CutScene[]> {
  const rows = await query(
    db
      .selectFrom("scene")
      .select(["id", "heading_int_ext", "heading_location", "heading_time", "content", "rank", "deleted_at"])
      .where("deleted_at", "is not", null)
      .orderBy("deleted_at", "desc"),
  );
  return rows.map((r) => {
    let heading = "";
    try {
      const first = JSON.parse(r.content)[0];
      if (first?.type === "scene_heading") heading = (first.content ?? []).map((t: { text: string }) => t.text).join("");
    } catch {
      heading = [r.heading_int_ext, r.heading_location, r.heading_time].filter(Boolean).join(" ");
    }
    return { id: r.id, heading, content: r.content, rank: r.rank, deletedAt: r.deleted_at! };
  });
}

/** Puts a cut scene back where its rank places it among the current scenes. */
export async function reinstate(session: ScriptSession, cut: CutScene): Promise<void> {
  const editor = session.editor;
  if (!editor) return;
  const ranks = await query(db.selectFrom("scene").select(["id", "rank"]).where("deleted_at", "is", null));
  const rankOf = new Map(ranks.map((r) => [r.id, r.rank]));
  const ids = editor.sceneIds();
  let at = ids.findIndex((id) => (rankOf.get(id) ?? "") > cut.rank);
  if (at < 0) at = ids.length;
  editor.insertScene(at, "", { id: cut.id, content: cut.content });
  await markEditorStep(editor, "Scène réintégrée");
  await session.flush();
}

export async function purgeScene(id: string): Promise<void> {
  await write("Scène supprimée définitivement", ["scene", "beat_scene"], [db.deleteFrom("beat_scene").where("scene_id", "=", id), db.deleteFrom("scene").where("id", "=", id)]);
}
