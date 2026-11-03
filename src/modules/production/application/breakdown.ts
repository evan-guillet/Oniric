import { db, nowIso, query, write } from "../../../core/db/client";
import { parseJson, useLive } from "../../../core/db/live";
import type { TableName } from "../../../core/db/schema";
import { uuidv7 } from "../../../core/ids";
import { readSetting, writeSetting } from "../../script/screenplay/application/settings";
import { categories, findElement, type Category, type Element, type Suggestion } from "../domain/breakdown";

export const BREAKDOWN_TABLES: TableName[] = ["breakdown_element", "breakdown_item", "breakdown_scene"];

export interface Item {
  sceneId: string;
  elementId: string;
  quantity: number | null;
}

export interface SceneCheck {
  checkedText: string | null;
  rejected: string[];
}

export interface Breakdown {
  elements: Element[];
  items: Item[];
  checks: Map<string, SceneCheck>;
}

export async function loadBreakdown(): Promise<Breakdown> {
  const [elements, items, checks] = await Promise.all([
    query(db.selectFrom("breakdown_element").selectAll().orderBy("name")),
    query(db.selectFrom("breakdown_item").selectAll()),
    query(db.selectFrom("breakdown_scene").selectAll()),
  ]);
  return {
    elements: elements.map((r) => ({ id: r.id, category: r.category, name: r.name, entryId: r.entry_id, notes: r.notes })),
    items: items.map((r) => ({ sceneId: r.scene_id, elementId: r.element_id, quantity: r.quantity })),
    checks: new Map(checks.map((r) => [r.scene_id, { checkedText: r.checked_text, rejected: parseJson<string[]>(r.rejected, []) }])),
  };
}

export function useBreakdown(): Breakdown | undefined {
  return useLive(loadBreakdown, BREAKDOWN_TABLES);
}

/** The elements of each scene, by scene id. */
export function elementsByScene(b: Breakdown): Map<string, Element[]> {
  const byId = new Map(b.elements.map((e) => [e.id, e]));
  const m = new Map<string, Element[]>();
  for (const i of b.items) {
    const e = byId.get(i.elementId);
    if (e) m.set(i.sceneId, [...(m.get(i.sceneId) ?? []), e]);
  }
  return m;
}

/** The scenes of each element, by element id. */
export function scenesByElement(b: Breakdown): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const i of b.items) m.set(i.elementId, [...(m.get(i.elementId) ?? []), i.sceneId]);
  return m;
}

/**
 * Adds elements to a scene, each one the element of the project with the same name in its category when there is one,
 * so a prop needed in ten scenes is one prop. The scene row must exist: the caller flushes the editor first.
 */
export async function addToScene(
  b: Breakdown,
  sceneId: string,
  wanted: { category: string; name: string; entryId?: string | null }[],
  sceneText: string | null,
  label = "Dépouillement",
): Promise<void> {
  const now = nowIso();
  const queries = [];
  const made: Element[] = [];
  for (const w of wanted) {
    const name = w.name.trim();
    if (!name) continue;
    let e = findElement([...b.elements, ...made], w.category, name);
    if (!e) {
      e = { id: uuidv7(), category: w.category, name, entryId: w.entryId ?? null, notes: "" };
      made.push(e);
      queries.push(db.insertInto("breakdown_element").values({ id: e.id, category: e.category, name: e.name, entry_id: e.entryId, created_at: now, updated_at: now }));
    } else if (!e.entryId && w.entryId) {
      queries.push(db.updateTable("breakdown_element").set({ entry_id: w.entryId, updated_at: now }).where("id", "=", e.id));
    }
    queries.push(db.insertInto("breakdown_item").values({ scene_id: sceneId, element_id: e.id }).onConflict((oc) => oc.columns(["scene_id", "element_id"]).doNothing()));
  }
  // A scene broken down for the first time is checked as it is now.
  if (sceneText !== null && !b.checks.has(sceneId)) {
    queries.push(
      db
        .insertInto("breakdown_scene")
        .values({ scene_id: sceneId, checked_text: sceneText, updated_at: now })
        .onConflict((oc) => oc.column("scene_id").doNothing()),
    );
  }
  await write(label, BREAKDOWN_TABLES, queries);
}

export async function removeFromScene(sceneId: string, elementId: string, orphan: boolean): Promise<void> {
  const queries = [db.deleteFrom("breakdown_item").where("scene_id", "=", sceneId).where("element_id", "=", elementId)];
  // An element no scene needs any more goes with it.
  if (orphan) queries.push(db.deleteFrom("breakdown_element").where("id", "=", elementId));
  await write("Élément retiré", BREAKDOWN_TABLES, queries);
}

export async function setQuantity(sceneId: string, elementId: string, quantity: number | null): Promise<void> {
  await write("Quantité", ["breakdown_item"], [
    db.updateTable("breakdown_item").set({ quantity }).where("scene_id", "=", sceneId).where("element_id", "=", elementId),
  ]);
}

export async function updateElement(id: string, patch: { name?: string; category?: string; notes?: string; entryId?: string | null }): Promise<void> {
  await write("Élément", ["breakdown_element"], [
    db
      .updateTable("breakdown_element")
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.category !== undefined && { category: patch.category }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
        ...(patch.entryId !== undefined && { entry_id: patch.entryId }),
        updated_at: nowIso(),
      })
      .where("id", "=", id),
  ]);
}

export async function deleteElement(id: string): Promise<void> {
  await write("Élément supprimé", BREAKDOWN_TABLES, [db.deleteFrom("breakdown_element").where("id", "=", id)]);
}

/** The suggestions turned down stay so [DEP-04]. */
export async function rejectSuggestions(sceneId: string, check: SceneCheck | undefined, keys: string[]): Promise<void> {
  const rejected = JSON.stringify([...new Set([...(check?.rejected ?? []), ...keys])]);
  const now = nowIso();
  await write("Suggestion écartée", ["breakdown_scene"], [
    db
      .insertInto("breakdown_scene")
      .values({ scene_id: sceneId, checked_text: check?.checkedText ?? null, rejected, updated_at: now })
      .onConflict((oc) => oc.column("scene_id").doUpdateSet({ rejected, updated_at: now })),
  ]);
}

export async function acceptSuggestions(b: Breakdown, sceneId: string, s: Suggestion[], sceneText: string): Promise<void> {
  await addToScene(b, sceneId, s, sceneText, s.length > 1 ? "Suggestions acceptées" : "Suggestion acceptée");
}

/** The scene was read again after its text changed: it is checked as it is now [DEP-07]. */
export async function markChecked(sceneId: string, text: string): Promise<void> {
  const now = nowIso();
  await write("Dépouillement revu", ["breakdown_scene"], [
    db
      .insertInto("breakdown_scene")
      .values({ scene_id: sceneId, checked_text: text, updated_at: now })
      .onConflict((oc) => oc.column("scene_id").doUpdateSet({ checked_text: text, updated_at: now })),
  ]);
}

const CATEGORIES = "breakdown_categories";

export async function readCategories(): Promise<Category[]> {
  return categories(parseJson<Category[] | null>(await readSetting(CATEGORIES), null));
}

export function useCategories(): Category[] | undefined {
  return useLive(readCategories, ["project_setting"]);
}

export function writeCategories(list: Category[]): Promise<number> {
  return writeSetting(CATEGORIES, JSON.stringify(list));
}
