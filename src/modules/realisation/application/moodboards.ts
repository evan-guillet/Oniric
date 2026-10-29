import { db, nowIso, query, write } from "../../../core/db/client";
import { parseJson } from "../../../core/db/live";
import type { MoodboardItemKind } from "../../../core/db/schema";
import { uuidv7 } from "../../../core/ids";
import { rankBetween } from "../../../core/ordering";
import { lastRank } from "../../script/views/application/story";

/** The kinds of board [MOO-01]; their names are in the catalog (moodboard.kinds.<id>). */
export const BOARD_KINDS = ["general", "character", "location", "sequence", "light", "costume", "color", "other"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

export const BOARD_TABLES = ["moodboard", "moodboard_item", "moodboard_link"] as const;

export interface Board {
  id: string;
  rank: string;
  name: string;
  kind: BoardKind;
  /** Scenes and bible entries the board is shown on [MOO-05]. */
  links: string[];
  items: number;
  /** The first images, for the board's card. */
  cover: string[];
}

export interface BoardItem {
  id: string;
  boardId: string;
  kind: MoodboardItemKind;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  path?: string;
  color?: string;
  text?: string;
}

export type ItemData = Pick<BoardItem, "path" | "color" | "text">;
export type NewItem = Omit<BoardItem, "id" | "boardId" | "z"> & { z?: number };

const isKind = (k: string): k is BoardKind => (BOARD_KINDS as readonly string[]).includes(k);

function dataOf(item: Partial<ItemData>): string {
  const d: ItemData = {};
  if (item.path !== undefined) d.path = item.path;
  if (item.color !== undefined) d.color = item.color;
  if (item.text !== undefined) d.text = item.text;
  return JSON.stringify(d);
}

export async function loadBoards(): Promise<Board[]> {
  const [boards, links, items] = await Promise.all([
    query(db.selectFrom("moodboard").selectAll().orderBy("rank")),
    query(db.selectFrom("moodboard_link").selectAll()),
    query(db.selectFrom("moodboard_item").select(["board_id", "kind", "data", "z"]).orderBy("z")),
  ]);
  const linksOf = new Map<string, string[]>();
  for (const l of links) linksOf.set(l.board_id, [...(linksOf.get(l.board_id) ?? []), l.target_id]);
  const count = new Map<string, number>();
  const cover = new Map<string, string[]>();
  for (const i of items) {
    count.set(i.board_id, (count.get(i.board_id) ?? 0) + 1);
    const path = i.kind === "image" ? parseJson<ItemData>(i.data, {}).path : undefined;
    if (path) cover.set(i.board_id, [...(cover.get(i.board_id) ?? []), path].slice(-4));
  }
  return boards.map((b) => ({
    id: b.id,
    rank: b.rank,
    name: b.name,
    kind: isKind(b.kind) ? b.kind : "other",
    links: linksOf.get(b.id) ?? [],
    items: count.get(b.id) ?? 0,
    cover: cover.get(b.id) ?? [],
  }));
}

export async function loadItems(boardId: string): Promise<BoardItem[]> {
  const rows = await query(db.selectFrom("moodboard_item").selectAll().where("board_id", "=", boardId).orderBy("z"));
  return rows.map((r) => ({
    id: r.id,
    boardId: r.board_id,
    kind: r.kind,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    z: r.z,
    ...parseJson<ItemData>(r.data, {}),
  }));
}

export async function addBoard(boards: Board[], name: string, kind: BoardKind): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Nouveau moodboard", ["moodboard"], [
    db.insertInto("moodboard").values({ id, rank: rankBetween(lastRank(boards), null), name, kind, created_at: now, updated_at: now }),
  ]);
  return id;
}

export async function updateBoard(id: string, patch: { name?: string; kind?: BoardKind }): Promise<void> {
  await write("Moodboard", ["moodboard"], [db.updateTable("moodboard").set({ ...patch, updated_at: nowIso() }).where("id", "=", id)]);
}

export async function deleteBoard(id: string): Promise<void> {
  await write("Moodboard supprimé", ["moodboard", "moodboard_item", "moodboard_link"], [db.deleteFrom("moodboard").where("id", "=", id)]);
}

export async function setBoardLinks(boardId: string, targets: string[]): Promise<void> {
  await write("Moodboard rattaché", ["moodboard_link"], [
    db.deleteFrom("moodboard_link").where("board_id", "=", boardId),
    ...[...new Set(targets)].map((target_id) => db.insertInto("moodboard_link").values({ board_id: boardId, target_id })),
  ]);
}

/** Adds items over the others, in one step that Ctrl+Z undoes; returns their ids. */
export async function addItems(boardId: string, top: number, items: NewItem[], label = "Ajout au moodboard"): Promise<string[]> {
  if (items.length === 0) return [];
  const now = nowIso();
  const ids: string[] = [];
  const queries = items.map((item, i) => {
    const id = uuidv7();
    ids.push(id);
    return db.insertInto("moodboard_item").values({
      id,
      board_id: boardId,
      kind: item.kind,
      x: Math.round(item.x),
      y: Math.round(item.y),
      w: Math.round(item.w),
      h: Math.round(item.h),
      z: item.z ?? top + 1 + i,
      data: dataOf(item),
      created_at: now,
      updated_at: now,
    });
  });
  await write(label, ["moodboard_item"], queries);
  return ids;
}

/** Moves or resizes items, or changes what they hold, in one step. */
export async function updateItems(patches: { id: string; x?: number; y?: number; w?: number; h?: number; z?: number; data?: ItemData }[], label = "Moodboard"): Promise<void> {
  if (patches.length === 0) return;
  const now = nowIso();
  await write(
    label,
    ["moodboard_item"],
    patches.map(({ id, data, ...geometry }) => {
      const set: Record<string, unknown> = { updated_at: now };
      for (const [k, v] of Object.entries(geometry)) if (v !== undefined) set[k] = k === "z" ? v : Math.round(v as number);
      if (data) set.data = dataOf(data);
      return db.updateTable("moodboard_item").set(set).where("id", "=", id);
    }),
  );
}

export async function deleteItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await write(ids.length > 1 ? "Éléments retirés du moodboard" : "Élément retiré du moodboard", ["moodboard_item"], [
    db.deleteFrom("moodboard_item").where("id", "in", ids),
  ]);
}

/** The boards shown on a scene or an entry [MOO-05]. */
export async function boardsFor(targetId: string): Promise<{ id: string; name: string; cover: string[] }[]> {
  const links = await query(db.selectFrom("moodboard_link").select("board_id").where("target_id", "=", targetId));
  if (links.length === 0) return [];
  const ids = new Set(links.map((l) => l.board_id));
  return (await loadBoards()).filter((b) => ids.has(b.id)).map((b) => ({ id: b.id, name: b.name, cover: b.cover }));
}

/** Every image of every board, to reuse one in the storyboard [STB-02]. */
export async function boardImages(): Promise<{ path: string; board: string }[]> {
  const rows = await query(
    db
      .selectFrom("moodboard_item")
      .innerJoin("moodboard", "moodboard.id", "moodboard_item.board_id")
      .select(["moodboard_item.data", "moodboard.name", "moodboard.rank"])
      .where("moodboard_item.kind", "=", "image")
      .orderBy("moodboard.rank")
      .orderBy("moodboard_item.z"),
  );
  const seen = new Set<string>();
  const out: { path: string; board: string }[] = [];
  for (const r of rows) {
    const path = parseJson<ItemData>(r.data, {}).path;
    if (path && !seen.has(path)) {
      seen.add(path);
      out.push({ path, board: r.name });
    }
  }
  return out;
}
