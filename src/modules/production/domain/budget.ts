/** The budget of the film: a grid of chapters, posts and lines, worked out to the cent [BUD-01 to BUD-09]. */

import type { BudgetKind, BudgetLevel, FundingStatus } from "../../../core/db/schema";

export type Unit = "day" | "week" | "flat" | "hour" | "month" | "unit";
export const UNITS: Unit[] = ["day", "week", "flat", "hour", "month", "unit"];

/** A line that follows the rest of the film: the quantity, and sometimes the rate, are read from it [BUD-03]. */
export type LineLink =
  | { kind: "crew"; id: string }
  | { kind: "element"; id: string }
  | { kind: "location"; id: string }
  | { kind: "shootDays" };

export interface LineData {
  code?: string;
  quantity: number;
  unit: Unit;
  people: number;
  rate: number;
  /** Empty: the currency of the budget. */
  currency: string;
  /** The id of a social regime of the budget; empty: none. */
  social: string;
  /** VAT, in percent. */
  vat: number;
  notes: string;
  link: LineLink | null;
}

export const EMPTY_LINE: LineData = { quantity: 1, unit: "flat", people: 1, rate: 0, currency: "", social: "", vat: 0, notes: "", link: null };

export function lineData(raw: Partial<LineData> | null | undefined): LineData {
  return { ...EMPTY_LINE, ...raw };
}

export interface SocialRegime {
  id: string;
  name: string;
  /** Employer's contributions, in percent of the gross. */
  rate: number;
}

export interface Exchange {
  currency: string;
  /** What one unit of this currency is worth in the currency of the budget, typed by hand [BUD-09]. */
  rate: number;
}

export interface BudgetSettings {
  currency: string;
  exchange: Exchange[];
  regimes: SocialRegime[];
  /** All in percent of the lines without tax [BUD-04]. */
  contingency: number;
  overheads: number;
  insurance: number;
  bond: number;
}

/** Common orders of magnitude, to be corrected: the rates change with the regime and the year. */
export const DEFAULT_REGIMES: SocialRegime[] = [
  { id: "techniciens", name: "Techniciens intermittents", rate: 60 },
  { id: "artistes", name: "Artistes interprètes", rate: 55 },
  { id: "permanents", name: "Salariés permanents", rate: 45 },
];

export function budgetSettings(raw: Partial<BudgetSettings> | null | undefined): BudgetSettings {
  return { currency: "EUR", exchange: [], regimes: DEFAULT_REGIMES, contingency: 10, overheads: 7, insurance: 0, bond: 0, ...raw };
}

export interface GridLine {
  id: string;
  parentId: string | null;
  level: BudgetLevel;
  origin: string;
  rank: string;
  label: string;
  data: LineData;
}

/** What the rest of the film says about the linked lines. */
export interface BudgetFacts {
  shootDays: number;
  /**
   * A post of the crew: its days of presence on the schedule, and the rate written on its contract.
   * A rate by the week says how many days the schedule works in a week.
   */
  crew: Map<string, { days: number; rate: number | null; perWeek?: number }>;
  /** A breakdown element: the shooting days it is needed on. */
  element: Map<string, number>;
  /** A real set: the shooting days there, and its rental per day. */
  location: Map<string, { days: number; rental: number | null }>;
}

export const NO_FACTS: BudgetFacts = { shootDays: 0, crew: new Map(), element: new Map(), location: new Map() };

/** « 250 », « 250 € / jour », « 1 250,50 »: the first amount of a rate written by hand. */
export function parseRate(text: string): number | null {
  const m = text.replace(/ /g, " ").match(/\d[\d ]*(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/ /g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * The rate of a contract and what it pays for: a day unless it says a week. Paid by the month, the hour or the meal, it
 * cannot be multiplied by days of presence: null, and the line keeps the rate typed on it.
 */
export function parsePay(text: string): { rate: number; per: "day" | "week" } | null {
  const rate = parseRate(text);
  if (rate === null) return null;
  const words = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (/\b(sem|semaines?|semanas?|weeks?|wk|hebdo\w*)\b/.test(words)) return { rate, per: "week" };
  if (/\b(mois|months?|mes(es)?|heures?|hours?|horas?|h|repas|meals?|comidas?|forfait|flat|unite?s?|units?)\b/.test(words)) return null;
  return { rate, per: "day" };
}

export const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function exchangeRate(currency: string, s: Pick<BudgetSettings, "currency" | "exchange">): number {
  if (!currency || currency === s.currency) return 1;
  const r = s.exchange.find((e) => e.currency === currency)?.rate;
  return r && r > 0 ? r : 1;
}

/** The line once what it is linked to has been read: its quantity, and its rate when the other side has one. */
export function resolved(d: LineData, facts: BudgetFacts): LineData {
  const link = d.link;
  if (!link) return d;
  if (link.kind === "shootDays") return { ...d, quantity: facts.shootDays, unit: "day" };
  if (link.kind === "element") return { ...d, quantity: facts.element.get(link.id) ?? 0, unit: "day" };
  if (link.kind === "crew") {
    const c = facts.crew.get(link.id);
    if (!c) return d;
    if (c.perWeek && c.rate !== null) return { ...d, quantity: cents(c.days / c.perWeek), unit: "week", rate: c.rate };
    return { ...d, quantity: c.days, unit: "day", rate: c.rate ?? d.rate };
  }
  const l = facts.location.get(link.id);
  return l ? { ...d, quantity: l.days, unit: "day", rate: l.rental ?? d.rate } : d;
}

export interface LineCost {
  /** Without tax nor contributions, in the currency of the budget. */
  gross: number;
  social: number;
  vat: number;
}

export const NO_COST: LineCost = { gross: 0, social: 0, vat: 0 };

export function lineCost(raw: LineData, s: BudgetSettings, facts: BudgetFacts = NO_FACTS): LineCost {
  const d = resolved(raw, facts);
  const gross = cents(d.quantity * d.people * d.rate * exchangeRate(d.currency, s));
  const rate = s.regimes.find((r) => r.id === d.social)?.rate ?? 0;
  return { gross, social: cents((gross * rate) / 100), vat: cents((gross * d.vat) / 100) };
}

const plus = (a: LineCost, b: LineCost): LineCost => ({ gross: cents(a.gross + b.gross), social: cents(a.social + b.social), vat: cents(a.vat + b.vat) });

/** The cost of every row of the grid: a line its own, a post or a chapter the sum of what it holds. */
export function rollUp(lines: GridLine[], s: BudgetSettings, facts: BudgetFacts = NO_FACTS): Map<string, LineCost> {
  const out = new Map<string, LineCost>();
  const kids = new Map<string, GridLine[]>();
  for (const l of lines) if (l.parentId) kids.set(l.parentId, [...(kids.get(l.parentId) ?? []), l]);
  const cost = (l: GridLine): LineCost => {
    const c = l.level === "line" ? lineCost(l.data, s, facts) : (kids.get(l.id) ?? []).reduce((sum, k) => plus(sum, cost(k)), NO_COST);
    out.set(l.id, c);
    return c;
  };
  for (const l of lines) if (!l.parentId) cost(l);
  return out;
}

export interface Topsheet {
  chapters: { id: string; origin: string; code: string; label: string; cost: LineCost }[];
  lines: number;
  social: number;
  overheads: number;
  insurance: number;
  bond: number;
  contingency: number;
  /** All of the above. */
  net: number;
  vat: number;
  total: number;
}

/** The summary of a version: chapters, then what is reckoned on top of them [BUD-04, BUD-08]. */
export function topsheet(lines: GridLine[], s: BudgetSettings, facts: BudgetFacts = NO_FACTS): Topsheet {
  const costs = rollUp(lines, s, facts);
  const chapters = lines
    .filter((l) => l.level === "chapter")
    .map((l) => ({ id: l.id, origin: l.origin, code: l.data.code ?? "", label: l.label, cost: costs.get(l.id) ?? NO_COST }));
  const sum = chapters.reduce((a, c) => plus(a, c.cost), NO_COST);
  const part = (pct: number) => cents((sum.gross * pct) / 100);
  const overheads = part(s.overheads);
  const insurance = part(s.insurance);
  const bond = part(s.bond);
  const contingency = part(s.contingency);
  const net = cents(sum.gross + sum.social + overheads + insurance + bond + contingency);
  return { chapters, lines: sum.gross, social: sum.social, overheads, insurance, bond, contingency, net, vat: sum.vat, total: cents(net + sum.vat) };
}

/** Two versions, chapter by chapter, matched by their origin [BUD-05]. */
export function compareChapters(a: Topsheet, b: Topsheet): { origin: string; code: string; label: string; a: number; b: number; delta: number }[] {
  const seen = new Set<string>();
  const out: { origin: string; code: string; label: string; a: number; b: number; delta: number }[] = [];
  for (const c of [...a.chapters, ...b.chapters]) {
    if (seen.has(c.origin)) continue;
    seen.add(c.origin);
    const inA = a.chapters.find((x) => x.origin === c.origin)?.cost.gross ?? 0;
    const inB = b.chapters.find((x) => x.origin === c.origin)?.cost.gross ?? 0;
    out.push({ origin: c.origin, code: c.code, label: c.label, a: inA, b: inB, delta: cents(inB - inA) });
  }
  return out;
}

export interface ExpenseRef {
  origin: string | null;
  amount: number;
  currency: string;
}

/** Spent per line, then per post and chapter, in the currency of the budget [BUD-06]. */
export function spentBy(lines: GridLine[], expenses: ExpenseRef[], s: BudgetSettings): Map<string, number> {
  const byOrigin = new Map<string, number>();
  for (const e of expenses) if (e.origin) byOrigin.set(e.origin, cents((byOrigin.get(e.origin) ?? 0) + e.amount * exchangeRate(e.currency, s)));
  const out = new Map<string, number>();
  const kids = new Map<string, GridLine[]>();
  for (const l of lines) if (l.parentId) kids.set(l.parentId, [...(kids.get(l.parentId) ?? []), l]);
  const walk = (l: GridLine): number => {
    const own = byOrigin.get(l.origin) ?? 0;
    const n = cents(own + (kids.get(l.id) ?? []).reduce((sum, k) => sum + walk(k), 0));
    out.set(l.id, n);
    return n;
  };
  for (const l of lines) if (!l.parentId) walk(l);
  return out;
}

/** The lines where more was spent than planned, the largest overrun first [BUD-06]. */
export function overruns(lines: GridLine[], costs: Map<string, LineCost>, spent: Map<string, number>): { id: string; label: string; over: number }[] {
  return lines
    .filter((l) => l.level === "line")
    .map((l) => ({ id: l.id, label: l.label, over: cents((spent.get(l.id) ?? 0) - (costs.get(l.id)?.gross ?? 0)) }))
    .filter((x) => x.over > 0)
    .sort((a, b) => b.over - a.over);
}

export interface FundingRef {
  amount: number;
  currency: string;
  status: FundingStatus;
}

/** What the plan holds, by how sure it is [BUD-07]. */
export function fundingTotals(list: FundingRef[], s: BudgetSettings): { asked: number; granted: number; paid: number; total: number } {
  const t = { asked: 0, granted: 0, paid: 0, total: 0 };
  for (const f of list) {
    const n = f.amount * exchangeRate(f.currency, s);
    t[f.status] = cents(t[f.status] + n);
    t.total = cents(t.total + n);
  }
  return t;
}

export const FUNDING_KINDS = ["own", "coproducer", "presale", "cnc", "region", "sofica", "crowdfunding", "investor", "credit", "other"];
export const FUNDING_STATUSES: FundingStatus[] = ["asked", "granted", "paid"];
export const BUDGET_KINDS: BudgetKind[] = ["estimate", "forecast", "actual"];

/** A model of grid: chapters, each with its posts [BUD-01]. */
export interface GridModel {
  id: string;
  chapters: { code: string; label: string; posts: string[] }[];
}

/** The order of the chapters of the French standard budget, without the social charges, reckoned from each line. */
export const CNC_MODEL: GridModel = {
  id: "cnc",
  chapters: [
    { code: "1", label: "Droits artistiques", posts: ["Droits d'auteur", "Droits musicaux", "Archives et images"] },
    { code: "2", label: "Personnel", posts: ["Production", "Mise en scène", "Image", "Son", "Décoration", "Costumes", "Maquillage et coiffure", "Montage"] },
    { code: "3", label: "Interprétation", posts: ["Rôles principaux", "Seconds rôles", "Petits rôles", "Figuration", "Cascades"] },
    { code: "5", label: "Décors et costumes", posts: ["Location de décors", "Construction", "Accessoires", "Costumes"] },
    { code: "6", label: "Transports, défraiements, régie", posts: ["Transports", "Hébergement", "Repas et cantine", "Régie"] },
    { code: "7", label: "Moyens techniques", posts: ["Caméra", "Machinerie et lumière", "Son", "Effets spéciaux"] },
    { code: "8", label: "Post-production", posts: ["Laboratoire et étalonnage", "Montage son et mixage", "Effets visuels", "Musique"] },
    { code: "9", label: "Assurances et divers", posts: ["Assurances", "Frais de bureau", "Autorisations"] },
  ],
};

/** The international grid, above the line and below the line. */
export const ATL_MODEL: GridModel = {
  id: "atl",
  chapters: [
    { code: "A", label: "Above the line", posts: ["Story and rights", "Producers", "Director", "Cast"] },
    { code: "B", label: "Below the line: production", posts: ["Production staff", "Camera", "Grip and electric", "Sound", "Art department", "Wardrobe", "Hair and make-up", "Locations", "Transport", "Catering"] },
    { code: "C", label: "Below the line: post-production", posts: ["Editing", "Sound post", "Visual effects", "Music", "Colour grading"] },
    { code: "D", label: "Other costs", posts: ["Insurance", "Legal and accounting", "Publicity", "Permits"] },
  ],
};

export const EMPTY_MODEL: GridModel = { id: "empty", chapters: [] };

export const GRID_MODELS = [CNC_MODEL, ATL_MODEL, EMPTY_MODEL];
