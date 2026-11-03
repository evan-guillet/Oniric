import { db, nowIso, query, write } from "../../../../core/db/client";
import { parseJson, useLive } from "../../../../core/db/live";
import type { WorkshopItemKind } from "../../../../core/db/schema";
import { uuidv7 } from "../../../../core/ids";
import { rankBetween } from "../../../../core/ordering";

/** An entry of the lists of steps 6 to 9: a pass, a reader, a remark, a deposit, a submission, a request. */
export interface Item<T = Record<string, unknown>> {
  id: string;
  kind: WorkshopItemKind;
  parentId: string | null;
  rank: string;
  data: T;
  createdAt: string;
}

async function loadItems(): Promise<Item[]> {
  const rows = await query(db.selectFrom("workshop_item").selectAll().orderBy("rank"));
  return rows.map((r) => ({ id: r.id, kind: r.kind, parentId: r.parent_id, rank: r.rank, data: parseJson(r.data, {}), createdAt: r.created_at }));
}

export function useItems(): Item[] | undefined {
  return useLive(loadItems, ["workshop_item"]);
}

/** The entries of one kind, as the type of their data. */
export function itemsOf<T>(items: Item[] | undefined, kind: WorkshopItemKind, parentId?: string): Item<T>[] {
  return (items ?? []).filter((i) => i.kind === kind && (parentId === undefined || i.parentId === parentId)) as Item<T>[];
}

const LABELS: Record<WorkshopItemKind, string> = {
  pass: "Passe de réécriture",
  reader: "Lecteur",
  remark: "Remarque de lecteur",
  deposit: "Dépôt",
  submission: "Soumission",
  request: "Demande de réécriture",
};

/** Adds entries at the end of their list, in one step to undo. */
export async function addItems<T>(kind: WorkshopItemKind, siblings: Item<T>[], list: T[], parentId: string | null = null): Promise<string[]> {
  const now = nowIso();
  let last = siblings.reduce<string | null>((m, s) => (m === null || s.rank > m ? s.rank : m), null);
  const ids: string[] = [];
  const queries = list.map((data) => {
    const id = uuidv7();
    ids.push(id);
    last = rankBetween(last, null);
    return db.insertInto("workshop_item").values({ id, kind, parent_id: parentId, rank: last, data: JSON.stringify(data), created_at: now, updated_at: now });
  });
  await write(LABELS[kind], ["workshop_item"], queries);
  return ids;
}

export async function updateItem<T>(item: Item<T>, patch: Partial<T>): Promise<void> {
  await write(LABELS[item.kind], ["workshop_item"], [
    db
      .updateTable("workshop_item")
      .set({ data: JSON.stringify({ ...item.data, ...patch }), updated_at: nowIso() })
      .where("id", "=", item.id),
  ]);
}

export async function deleteItem(item: Item<unknown>): Promise<void> {
  await write(`${LABELS[item.kind]} supprimé`, ["workshop_item"], [db.deleteFrom("workshop_item").where("id", "=", item.id)]);
}
