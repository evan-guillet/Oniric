import type { Compilable } from "kysely";
import { db, nowIso, query, write } from "../../../../core/db/client";
import { parseJson } from "../../../../core/db/live";
import type { SceneStatus, TableName } from "../../../../core/db/schema";
import { uuidv7 } from "../../../../core/ids";
import { rankBetween } from "../../../../core/ordering";
import type { ScriptSession } from "../../screenplay/application/scriptSession";
import { flatten, outline, type ActGroup, type OutlineAct, type OutlineSequence } from "../domain/outline";
import { t } from "../../../../core/i18n";

export interface Act extends OutlineAct {
  color: string | null;
}

export interface Sequence extends OutlineSequence {
  summary: string;
}

export interface SceneMeta {
  id: string;
  sequenceId: string | null;
  summary: string;
  status: SceneStatus | null;
  color: string | null;
  tags: string[];
  plotlines: string[];
  storyTime: string | null;
}

export interface Beat {
  id: string;
  model: string;
  key: string;
  rank: string;
  title: string;
  notes: string;
  scenes: string[];
}

export interface Story {
  acts: Act[];
  sequences: Sequence[];
  meta: Map<string, SceneMeta>;
  beats: Beat[];
}

export const STORY_TABLES = ["act", "sequence", "scene", "structure_beat", "beat_scene"] as const;

export const SCENE_STATUSES: { id: SceneStatus; readonly label: string }[] = (["todo", "draft", "rewrite", "done"] as const).map((id) => ({
  id,
  get label() {
    return t(`story.status.${id}`);
  },
}));

export const CARD_COLORS = ["#e05d5d", "#e8933c", "#e3c13b", "#5fb36b", "#4aa3c7", "#5b6fd6", "#9b62c9", "#8a8a8a"];

export async function loadStory(): Promise<Story> {
  const [acts, sequences, scenes, beats, links] = await Promise.all([
    query(db.selectFrom("act").selectAll().orderBy("rank")),
    query(db.selectFrom("sequence").selectAll().orderBy("rank")),
    query(
      db
        .selectFrom("scene")
        .select(["id", "sequence_id", "summary", "status", "color", "tags", "plotlines", "story_time"])
        .where("deleted_at", "is", null),
    ),
    query(db.selectFrom("structure_beat").selectAll().orderBy("rank")),
    query(db.selectFrom("beat_scene").selectAll()),
  ]);
  const meta = new Map<string, SceneMeta>();
  for (const s of scenes) {
    meta.set(s.id, {
      id: s.id,
      sequenceId: s.sequence_id,
      summary: s.summary,
      status: s.status,
      color: s.color,
      tags: parseJson(s.tags, []),
      plotlines: parseJson(s.plotlines, []),
      storyTime: s.story_time,
    });
  }
  return {
    acts: acts.map((a) => ({ id: a.id, rank: a.rank, title: a.title, color: a.color })),
    sequences: sequences.map((s) => ({ id: s.id, actId: s.act_id, rank: s.rank, title: s.title, summary: s.summary })),
    meta,
    beats: beats.map((b) => ({
      id: b.id,
      model: b.model,
      key: b.key,
      rank: b.rank,
      title: b.title,
      notes: b.notes,
      scenes: links.filter((l) => l.beat_id === b.id).map((l) => l.scene_id),
    })),
  };
}

/** The board of the screenplay as it is now in the editor. */
export function storyOutline(story: Story, sceneIds: string[]): ActGroup[] {
  return outline(
    sceneIds.map((id) => ({ id, sequenceId: story.meta.get(id)?.sequenceId ?? null })),
    story.sequences,
    story.acts,
  );
}

export function lastRank(items: { rank: string }[]): string | null {
  return items.reduce<string | null>((m, x) => (m === null || x.rank > m ? x.rank : m), null);
}

/** The rank that puts a new item just before `beforeId` among `items`, or after the last one. */
function rankBefore(items: { id: string; rank: string }[], beforeId: string | null): string {
  const sorted = [...items].sort((a, b) => (a.rank < b.rank ? -1 : 1));
  const at = beforeId ? sorted.findIndex((x) => x.id === beforeId) : -1;
  if (at < 0) return rankBetween(lastRank(sorted), null);
  return rankBetween(at > 0 ? sorted[at - 1].rank : null, sorted[at].rank);
}

export async function addAct(story: Story, title: string, beforeId: string | null = null): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Nouvel acte", ["act"], [db.insertInto("act").values({ id, rank: rankBefore(story.acts, beforeId), title, created_at: now, updated_at: now })]);
  return id;
}

export async function addActs(story: Story, titles: string[]): Promise<string[]> {
  const now = nowIso();
  let prev = lastRank(story.acts);
  const ids: string[] = [];
  const queries = titles.map((title) => {
    const id = uuidv7();
    ids.push(id);
    prev = rankBetween(prev, null);
    return db.insertInto("act").values({ id, rank: prev, title, created_at: now, updated_at: now });
  });
  await write("Actes du modèle de structure", ["act"], queries);
  return ids;
}

export async function updateAct(id: string, patch: { title?: string; color?: string | null; rank?: string }): Promise<void> {
  await write("Acte", ["act"], [db.updateTable("act").set({ ...patch, updated_at: nowIso() }).where("id", "=", id)]);
}

export async function deleteAct(id: string): Promise<void> {
  await write("Acte supprimé", ["act", "sequence"], [db.deleteFrom("act").where("id", "=", id)]);
}

export async function addSequence(story: Story, actId: string | null, title: string, summary = "", beforeId: string | null = null): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  const siblings = story.sequences.filter((s) => s.actId === actId);
  const rank = beforeId ? rankBefore(siblings, beforeId) : rankBetween(lastRank(siblings.length ? siblings : story.sequences), null);
  await write("Nouvelle séquence", ["sequence"], [
    db.insertInto("sequence").values({ id, act_id: actId, rank, title, summary, created_at: now, updated_at: now }),
  ]);
  return id;
}

export async function updateSequence(id: string, patch: { title?: string; summary?: string; act_id?: string | null; rank?: string }): Promise<void> {
  await write("Séquence", ["sequence"], [db.updateTable("sequence").set({ ...patch, updated_at: nowIso() }).where("id", "=", id)]);
}

/** Writes that go with an arrangement of the board, in the same batch. */
export const sequencePlace = (id: string, actId: string | null, rank: string): Compilable =>
  db.updateTable("sequence").set({ act_id: actId, rank, updated_at: nowIso() }).where("id", "=", id);

export const actPlace = (id: string, rank: string): Compilable => db.updateTable("act").set({ rank, updated_at: nowIso() }).where("id", "=", id);

export async function deleteSequence(id: string): Promise<void> {
  await write("Séquence supprimée", ["sequence", "scene"], [db.deleteFrom("sequence").where("id", "=", id)]);
}

export async function updateSceneMeta(id: string, patch: Partial<Omit<SceneMeta, "id">>): Promise<void> {
  const set: Record<string, unknown> = { updated_at: nowIso() };
  if ("summary" in patch) set.summary = patch.summary;
  if ("status" in patch) set.status = patch.status;
  if ("color" in patch) set.color = patch.color;
  if ("tags" in patch) set.tags = JSON.stringify(patch.tags);
  if ("plotlines" in patch) set.plotlines = JSON.stringify(patch.plotlines);
  if ("storyTime" in patch) set.story_time = patch.storyTime;
  if ("sequenceId" in patch) set.sequence_id = patch.sequenceId;
  await write("Carte de scène", ["scene"], [db.updateTable("scene").set(set).where("id", "=", id)]);
}

/**
 * Applies a new arrangement of the board: every scene gets the sequence it is shown in (so that the scenes after a
 * moved one stay where they are), then the editor puts the scenes in the new order, in one step that Ctrl+Z can undo.
 * Returns the previous order, to undo the move.
 */
export async function arrange(session: ScriptSession, story: Story, groups: ActGroup[], extra: Compilable[] = [], tables: TableName[] = []): Promise<string[] | null> {
  const editor = session.editor;
  if (!editor) return null;
  await session.flush();
  const before = editor.sceneIds();
  const now = nowIso();
  const writes: Compilable[] = [];
  for (const g of groups) {
    for (const s of g.sequences) {
      const target = s.sequence?.id ?? null;
      for (const id of s.scenes) {
        if ((story.meta.get(id)?.sequenceId ?? null) !== target) {
          writes.push(db.updateTable("scene").set({ sequence_id: target, updated_at: now }).where("id", "=", id));
        }
      }
    }
  }
  if (writes.length + extra.length > 0) await write("Réorganisation du tableau", ["scene", ...tables], [...writes, ...extra]);
  editor.moveScenes(flatten(groups));
  return before;
}

export async function setBeatScenes(beatId: string, sceneIds: string[]): Promise<void> {
  await write("Point de structure", ["beat_scene"], [
    db.deleteFrom("beat_scene").where("beat_id", "=", beatId),
    ...sceneIds.map((scene_id) => db.insertInto("beat_scene").values({ beat_id: beatId, scene_id })),
  ]);
}

/** The beat of `model` and `key`, created on first use. */
export async function ensureBeat(story: Story, model: string, key: string, title: string, rank?: string): Promise<string> {
  const known = story.beats.find((b) => b.model === model && b.key === key);
  if (known) return known.id;
  const id = uuidv7();
  const now = nowIso();
  const siblings = story.beats.filter((b) => b.model === model);
  await write("Point de structure", ["structure_beat"], [
    db
      .insertInto("structure_beat")
      .values({ id, model, key, rank: rank ?? rankBetween(lastRank(siblings), null), title, created_at: now, updated_at: now })
      .onConflict((oc) => oc.columns(["model", "key"]).doNothing()),
  ]);
  const rows = await query(db.selectFrom("structure_beat").select("id").where("model", "=", model).where("key", "=", key));
  return rows[0]?.id ?? id;
}

export async function updateBeat(id: string, patch: { notes?: string; title?: string }): Promise<void> {
  await write("Point de structure", ["structure_beat"], [db.updateTable("structure_beat").set({ ...patch, updated_at: nowIso() }).where("id", "=", id)]);
}

export async function deleteBeat(id: string): Promise<void> {
  await write("Point de structure supprimé", ["structure_beat", "beat_scene"], [db.deleteFrom("structure_beat").where("id", "=", id)]);
}
