import type { Compilable } from "kysely";
import { db, nowIso, query, write } from "../../../core/db/client";
import { parseJson, useLive } from "../../../core/db/live";
import type { BudgetKind, BudgetLevel, FundingStatus, TableName } from "../../../core/db/schema";
import { uuidv7 } from "../../../core/ids";
import { rankBetween, ranksBetween } from "../../../core/ordering";
import { readSetting, writeSetting } from "../../script/screenplay/application/settings";
import { budgetSettings, EMPTY_LINE, lineData, type BudgetSettings, type GridLine, type GridModel, type LineData } from "../domain/budget";

export const BUDGET_TABLES: TableName[] = ["budget", "budget_line", "budget_expense", "funding_source"];

export interface Budget {
  id: string;
  name: string;
  kind: BudgetKind;
  rank: string;
  settings: BudgetSettings;
}

export interface BudgetRow extends GridLine {
  budgetId: string;
}

export interface Expense {
  id: string;
  origin: string | null;
  date: string | null;
  supplier: string;
  label: string;
  amount: number;
  currency: string;
  receipt: string | null;
  notes: string;
}

export interface Funding {
  id: string;
  name: string;
  kind: string;
  amount: number;
  currency: string;
  status: FundingStatus;
  notes: string;
  rank: string;
}

export interface Budgets {
  budgets: Budget[];
  lines: BudgetRow[];
  expenses: Expense[];
  funding: Funding[];
  currentId: string | null;
}

const CURRENT = "budget_current";

export async function loadBudgets(): Promise<Budgets> {
  const [budgets, lines, expenses, funding, current] = await Promise.all([
    query(db.selectFrom("budget").selectAll().orderBy("rank")),
    query(db.selectFrom("budget_line").selectAll().orderBy("rank")),
    query(db.selectFrom("budget_expense").selectAll().orderBy("spent_on", "desc").orderBy("created_at", "desc")),
    query(db.selectFrom("funding_source").selectAll().orderBy("rank")),
    readSetting(CURRENT),
  ]);
  return {
    budgets: budgets.map((r) => ({ id: r.id, name: r.name, kind: r.kind, rank: r.rank, settings: budgetSettings(parseJson(r.settings, {})) })),
    lines: lines.map((r) => ({ id: r.id, budgetId: r.budget_id, parentId: r.parent_id, level: r.level, origin: r.origin, rank: r.rank, label: r.label, data: lineData(parseJson(r.data, {})) })),
    expenses: expenses.map((r) => ({ id: r.id, origin: r.origin, date: r.spent_on, supplier: r.supplier, label: r.label, amount: r.amount, currency: r.currency, receipt: r.receipt, notes: r.notes })),
    funding: funding.map((r) => ({ id: r.id, name: r.name, kind: r.kind, amount: r.amount, currency: r.currency, status: r.status, notes: r.notes, rank: r.rank })),
    currentId: budgets.some((b) => b.id === current) ? current : (budgets[0]?.id ?? null),
  };
}

export function useBudgets(): Budgets | undefined {
  return useLive(loadBudgets, [...BUDGET_TABLES, "project_setting"]);
}

export const chooseBudget = (id: string) => writeSetting(CURRENT, id);

const insertLine = (id: string, budgetId: string, parentId: string | null, level: BudgetLevel, origin: string, rank: string, label: string, data: Partial<LineData>) => {
  const now = nowIso();
  return db.insertInto("budget_line").values({ id, budget_id: budgetId, parent_id: parentId, level, origin, rank, label, data: JSON.stringify(data), created_at: now, updated_at: now });
};

/** A new version from a model of grid: its chapters and posts, no line yet [BUD-01]. */
export async function createBudget(b: Budgets, name: string, kind: BudgetKind, model: GridModel, settings?: Partial<BudgetSettings>): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  const queries: Compilable[] = [
    db.insertInto("budget").values({ id, name, kind, rank: rankBetween(b.budgets[b.budgets.length - 1]?.rank ?? null, null), settings: JSON.stringify(budgetSettings(settings)), created_at: now, updated_at: now }),
    db
      .insertInto("project_setting")
      .values({ key: CURRENT, value: id, updated_at: now })
      .onConflict((oc) => oc.column("key").doUpdateSet({ value: id, updated_at: now })),
  ];
  const chapterRanks = ranksBetween(null, null, model.chapters.length);
  model.chapters.forEach((c, i) => {
    const chapter = uuidv7();
    queries.push(insertLine(chapter, id, null, "chapter", chapter, chapterRanks[i], c.label, { code: c.code }));
    const postRanks = ranksBetween(null, null, c.posts.length);
    c.posts.forEach((label, j) => {
      const post = uuidv7();
      queries.push(insertLine(post, id, chapter, "post", post, postRanks[j], label, {}));
    });
  });
  await write("Nouveau budget", [...BUDGET_TABLES, "project_setting"], queries);
  return id;
}

/** Another version from this one: same lines, so that they compare and keep their expenses [BUD-05]. */
export async function duplicateBudget(b: Budgets, from: Budget, name: string, kind: BudgetKind): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  const ids = new Map(b.lines.filter((l) => l.budgetId === from.id).map((l) => [l.id, uuidv7()]));
  // Parents before their children, for the foreign key.
  const order: BudgetLevel[] = ["chapter", "post", "line"];
  const lines = b.lines.filter((l) => l.budgetId === from.id).sort((x, y) => order.indexOf(x.level) - order.indexOf(y.level));
  await write("Budget dupliqué", [...BUDGET_TABLES, "project_setting"], [
    db.insertInto("budget").values({ id, name, kind, rank: rankBetween(b.budgets[b.budgets.length - 1]?.rank ?? null, null), settings: JSON.stringify(from.settings), created_at: now, updated_at: now }),
    ...lines.map((l) => insertLine(ids.get(l.id)!, id, l.parentId ? ids.get(l.parentId)! : null, l.level, l.origin, l.rank, l.label, l.data)),
    db
      .insertInto("project_setting")
      .values({ key: CURRENT, value: id, updated_at: now })
      .onConflict((oc) => oc.column("key").doUpdateSet({ value: id, updated_at: now })),
  ]);
  return id;
}

export async function updateBudget(id: string, patch: { name?: string; kind?: BudgetKind; settings?: BudgetSettings }): Promise<void> {
  const set = { ...(patch.name !== undefined && { name: patch.name }), ...(patch.kind && { kind: patch.kind }), ...(patch.settings && { settings: JSON.stringify(patch.settings) }), updated_at: nowIso() };
  await write("Budget", ["budget"], [db.updateTable("budget").set(set).where("id", "=", id)]);
}

export async function deleteBudget(id: string): Promise<void> {
  await write("Budget supprimé", BUDGET_TABLES, [db.deleteFrom("budget").where("id", "=", id)]);
}

/** A row at the end of its parent; a line starts from the row of the same post above it. */
export async function addRow(b: Budgets, budgetId: string, parentId: string | null, level: BudgetLevel, label = ""): Promise<string> {
  const siblings = b.lines.filter((l) => l.budgetId === budgetId && l.parentId === parentId);
  const last = siblings[siblings.length - 1];
  const id = uuidv7();
  const data: Partial<LineData> = level === "line" ? { ...EMPTY_LINE, unit: last?.data.unit ?? "flat", social: last?.data.social ?? "", vat: last?.data.vat ?? 0 } : {};
  await write("Ligne du budget", ["budget_line"], [insertLine(id, budgetId, parentId, level, id, rankBetween(last?.rank ?? null, null), label, data)]);
  return id;
}

export async function updateRow(id: string, patch: { label?: string; data?: LineData }): Promise<void> {
  const set = { ...(patch.label !== undefined && { label: patch.label }), ...(patch.data && { data: JSON.stringify(patch.data) }), updated_at: nowIso() };
  await write("Ligne du budget", ["budget_line"], [db.updateTable("budget_line").set(set).where("id", "=", id)]);
}

export async function deleteRow(id: string): Promise<void> {
  await write("Ligne supprimée", ["budget_line"], [db.deleteFrom("budget_line").where("id", "=", id)]);
}

export async function addExpense(origin: string | null, currency: string): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Dépense", ["budget_expense"], [db.insertInto("budget_expense").values({ id, origin, spent_on: now.slice(0, 10), currency, receipt: null, created_at: now, updated_at: now })]);
  return id;
}

export async function updateExpense(id: string, patch: Partial<Omit<Expense, "id">>): Promise<void> {
  const set = {
    ...(patch.origin !== undefined && { origin: patch.origin }),
    ...(patch.date !== undefined && { spent_on: patch.date }),
    ...(patch.supplier !== undefined && { supplier: patch.supplier }),
    ...(patch.label !== undefined && { label: patch.label }),
    ...(patch.amount !== undefined && { amount: patch.amount }),
    ...(patch.currency !== undefined && { currency: patch.currency }),
    ...(patch.receipt !== undefined && { receipt: patch.receipt }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    updated_at: nowIso(),
  };
  await write("Dépense", ["budget_expense"], [db.updateTable("budget_expense").set(set).where("id", "=", id)]);
}

export async function deleteExpense(id: string): Promise<void> {
  await write("Dépense supprimée", ["budget_expense"], [db.deleteFrom("budget_expense").where("id", "=", id)]);
}

export async function addFunding(b: Budgets, currency: string): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Financement", ["funding_source"], [db.insertInto("funding_source").values({ id, currency, rank: rankBetween(b.funding[b.funding.length - 1]?.rank ?? null, null), created_at: now, updated_at: now })]);
  return id;
}

export async function updateFunding(id: string, patch: Partial<Omit<Funding, "id" | "rank">>): Promise<void> {
  await write("Financement", ["funding_source"], [db.updateTable("funding_source").set({ ...patch, updated_at: nowIso() }).where("id", "=", id)]);
}

export async function deleteFunding(id: string): Promise<void> {
  await write("Financement supprimé", ["funding_source"], [db.deleteFrom("funding_source").where("id", "=", id)]);
}
