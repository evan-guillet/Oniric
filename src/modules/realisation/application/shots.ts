import { db, nowIso, query, write } from "../../../core/db/client";
import { parseJson, useLive } from "../../../core/db/live";
import { uuidv7 } from "../../../core/ids";
import { rankBetween } from "../../../core/ordering";
import { readSetting, writeSetting } from "../../script/screenplay/application/settings";
import type { ShotNumbering } from "../domain/shots";

export const SHOT_TABLES = ["shot"] as const;

export interface Shot {
  id: string;
  sceneId: string;
  rank: string;
  shootOrder: number | null;
  size: string | null;
  angle: string | null;
  movement: string | null;
  support: string | null;
  sound: string | null;
  lens: string;
  camera: string;
  frameRate: string;
  characters: string[];
  action: string;
  dialogue: string;
  duration: number | null;
  setup: number | null;
  lighting: string;
  effects: string;
  notes: string;
  covers: string[];
  frameImage: string | null;
  frameNotes: string;
}

export type ShotPatch = Partial<Omit<Shot, "id" | "sceneId">>;

const COLUMNS: Record<keyof ShotPatch, string> = {
  rank: "rank",
  shootOrder: "shoot_order",
  size: "size",
  angle: "angle",
  movement: "movement",
  support: "support",
  sound: "sound",
  lens: "lens",
  camera: "camera",
  frameRate: "frame_rate",
  characters: "characters",
  action: "action",
  dialogue: "dialogue",
  duration: "duration",
  setup: "setup",
  lighting: "lighting",
  effects: "effects",
  notes: "notes",
  covers: "covers",
  frameImage: "frame_image",
  frameNotes: "frame_notes",
};

/** Every shot of the project, scene by scene in the order of the edit. */
export async function loadShots(): Promise<Shot[]> {
  const rows = await query(db.selectFrom("shot").selectAll().orderBy("scene_id").orderBy("rank"));
  return rows.map((r) => ({
    id: r.id,
    sceneId: r.scene_id,
    rank: r.rank,
    shootOrder: r.shoot_order,
    size: r.size,
    angle: r.angle,
    movement: r.movement,
    support: r.support,
    sound: r.sound,
    lens: r.lens,
    camera: r.camera,
    frameRate: r.frame_rate,
    characters: parseJson(r.characters, []),
    action: r.action,
    dialogue: r.dialogue,
    duration: r.duration,
    setup: r.setup,
    lighting: r.lighting,
    effects: r.effects,
    notes: r.notes,
    covers: parseJson(r.covers, []),
    frameImage: r.frame_image,
    frameNotes: r.frame_notes,
  }));
}

/** The shots of each scene, by scene id. */
export function byScene(shots: Shot[]): Map<string, Shot[]> {
  const m = new Map<string, Shot[]>();
  for (const s of shots) m.set(s.sceneId, [...(m.get(s.sceneId) ?? []), s]);
  return m;
}

export function useShots(): Shot[] | undefined {
  return useLive(loadShots, [...SHOT_TABLES]);
}

/**
 * Adds a shot to a scene, after `after` (or at the end); a new shot takes the size and the support of the one before,
 * as a shot list is written. The scene row must exist: the caller flushes the editor first.
 */
export async function addShot(sceneId: string, siblings: Shot[], after: Shot | null = null, extra: ShotPatch = {}): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  const sorted = [...siblings].sort((a, b) => (a.rank < b.rank ? -1 : 1));
  const at = after ? sorted.findIndex((s) => s.id === after.id) : sorted.length - 1;
  const prev = at >= 0 ? sorted[at] : null;
  const next = at >= 0 ? sorted[at + 1] : sorted[0];
  const rank = rankBetween(prev?.rank ?? null, after ? (next?.rank ?? null) : null);
  await write("Nouveau plan", ["shot"], [
    db.insertInto("shot").values({
      id,
      scene_id: sceneId,
      rank,
      size: prev?.size ?? null,
      support: prev?.support ?? null,
      sound: prev?.sound ?? null,
      camera: prev?.camera ?? "",
      frame_rate: prev?.frameRate ?? "",
      ...toColumns(extra),
      created_at: now,
      updated_at: now,
    }),
  ]);
  return id;
}

function toColumns(patch: ShotPatch): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch) as [keyof ShotPatch, unknown][]) {
    set[COLUMNS[k]] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return set;
}

export async function updateShot(id: string, patch: ShotPatch, label = "Plan"): Promise<void> {
  await write(label, ["shot"], [db.updateTable("shot").set({ ...toColumns(patch), updated_at: nowIso() }).where("id", "=", id)]);
}

/** Gives the shots of a scene the order they are listed in. */
export async function reorderShots(ordered: Shot[]): Promise<void> {
  let prev: string | null = null;
  const now = nowIso();
  const queries = ordered.map((s) => {
    prev = rankBetween(prev, null);
    return db.updateTable("shot").set({ rank: prev, updated_at: now }).where("id", "=", s.id);
  });
  await write("Plans réordonnés", ["shot"], queries);
}

/** Sets the shooting order of a scene's shots: `ordered` in the order they will be shot [DEC-06]. */
export async function setShootOrder(ordered: Shot[]): Promise<void> {
  const now = nowIso();
  await write(
    "Ordre de tournage",
    ["shot"],
    ordered.map((s, i) => db.updateTable("shot").set({ shoot_order: i + 1, updated_at: now }).where("id", "=", s.id)),
  );
}

export async function deleteShot(id: string): Promise<void> {
  await write("Plan supprimé", ["shot"], [db.deleteFrom("shot").where("id", "=", id)]);
}

export async function duplicateShot(shot: Shot, siblings: Shot[]): Promise<string> {
  const { id: _id, sceneId, rank: _rank, ...rest } = shot;
  return addShot(sceneId, siblings, shot, { ...rest, shootOrder: null });
}

const NUMBERING = "shot_numbering";

export async function readNumbering(): Promise<ShotNumbering> {
  return (await readSetting(NUMBERING)) === "letter" ? "letter" : "dash";
}

export function writeNumbering(v: ShotNumbering): Promise<number> {
  return writeSetting(NUMBERING, v);
}

export function useNumbering(): ShotNumbering {
  return useLive(readNumbering, ["project_setting"]) ?? "dash";
}

/** The frame of the storyboard [STB-02]: the ratio of its image, kept in the project. */
export const FRAME_RATIOS = ["1.85", "2.39", "16:9", "4:3", "9:16"] as const;
export type FrameRatio = (typeof FRAME_RATIOS)[number];

export function ratioValue(r: FrameRatio): number {
  if (r.includes(":")) {
    const [w, h] = r.split(":").map(Number);
    return w / h;
  }
  return Number(r);
}

const RATIO = "storyboard_ratio";

export async function readRatio(): Promise<FrameRatio> {
  const v = await readSetting(RATIO);
  return (FRAME_RATIOS as readonly string[]).includes(v ?? "") ? (v as FrameRatio) : "16:9";
}

export function writeRatio(v: FrameRatio): Promise<number> {
  return writeSetting(RATIO, v);
}

export function useRatio(): FrameRatio {
  return useLive(readRatio, ["project_setting"]) ?? "16:9";
}
