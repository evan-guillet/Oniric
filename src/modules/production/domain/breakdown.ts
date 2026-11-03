/** The breakdown of the scenes: categories, what the text suggests, and the reports [DEP-01 to DEP-07]. */

import { t } from "../../../core/i18n";
import { appearances, headingPlace, prettyName, type EntryRef, type SceneText } from "../../script/bible/domain/appearances";
import { fold } from "../../script/bible/domain/types";

export interface Category {
  id: string;
  /** A name given in the project; empty, the standard one in the language of the interface. */
  name: string;
  color: string;
  hidden?: boolean;
}

/** The standard categories with the colours the profession uses for them [DEP-02]. */
export const STANDARD_CATEGORIES: Category[] = [
  { id: "cast", name: "", color: "#e5484d" },
  { id: "bits", name: "", color: "#f0a020" },
  { id: "extras", name: "", color: "#22a35a" },
  { id: "stunts", name: "", color: "#ef7d32" },
  { id: "vehicles", name: "", color: "#e2589c" },
  { id: "props", name: "", color: "#8e5bd8" },
  { id: "handprops", name: "", color: "#b07ae8" },
  { id: "set", name: "", color: "#a77b4f" },
  { id: "wardrobe", name: "", color: "#3a8fd6" },
  { id: "makeup", name: "", color: "#e07fbf" },
  { id: "sfx", name: "", color: "#2f6bd8" },
  { id: "vfx", name: "", color: "#16a3b8" },
  { id: "animals", name: "", color: "#c9a227" },
  { id: "wrangler", name: "", color: "#9c8a35" },
  { id: "music", name: "", color: "#7b5b3a" },
  { id: "sound", name: "", color: "#6a7a8c" },
  { id: "equipment", name: "", color: "#52606d" },
  { id: "security", name: "", color: "#c23a3a" },
  { id: "notes", name: "", color: "#8f939c" },
];

export const categoryName = (c: Category) => c.name || t(`breakdown.categories.${c.id}`, { defaultValue: c.id });

/** The categories of a project: the standard ones as it changed them, then its own. */
export function categories(saved: Category[] | null): Category[] {
  if (!saved?.length) return STANDARD_CATEGORIES;
  const byId = new Map(saved.map((c) => [c.id, c]));
  const standard = STANDARD_CATEGORIES.map((c) => ({ ...c, ...byId.get(c.id) }));
  const own = saved.filter((c) => !STANDARD_CATEGORIES.some((s) => s.id === c.id));
  return [...standard, ...own];
}

/** The category a bible entry goes in when the text names it [DEP-05]. */
const BY_TYPE: Record<string, string> = {
  character: "cast",
  location: "set",
  object: "props",
  vehicle: "vehicles",
  creature: "animals",
};

export interface Element {
  id: string;
  category: string;
  name: string;
  entryId: string | null;
  notes: string;
}

export interface Suggestion {
  /** The same for the same suggestion from one reading to the next, to remember it was turned down. */
  key: string;
  category: string;
  name: string;
  entryId: string | null;
}

/**
 * What the text of a scene suggests [DEP-04]: its characters by their cues, its set by its heading, and the bible
 * entries it names; less what the scene already has and what was turned down.
 */
export function suggest(scene: SceneText, entries: EntryRef[], have: Element[], rejected: string[]): Suggestion[] {
  const out = new Map<string, Suggestion>();
  const add = (category: string, name: string, entryId: string | null) => {
    const key = `${category}:${fold(name)}`;
    if (!out.has(key)) out.set(key, { key, category, name, entryId });
  };
  const characterEntries = entries.filter((e) => e.type === "character");
  for (const cue of scene.characters) {
    const entry = characterEntries.find((e) => [e.name, ...e.aliases].some((n) => fold(n) === fold(cue)));
    add("cast", entry?.name ?? prettyName(cue), entry?.id ?? null);
  }
  const place = headingPlace(scene.heading);
  if (place) {
    const entry = entries.find((e) => e.type === "location" && [e.name, ...e.aliases].some((n) => fold(n) === place));
    add("set", entry?.name ?? prettyName(place.toLocaleUpperCase("fr")), entry?.id ?? null);
  }
  for (const e of entries) {
    const category = BY_TYPE[e.type];
    if (!category || e.type === "character" || e.type === "location") continue;
    if (appearances(e, [scene]).length) add(category, e.name, e.id);
  }
  // Characters of the bible named in the action, though they have no cue here; the set is the heading's alone.
  for (const e of characterEntries) if (appearances(e, [scene]).length) add("cast", e.name, e.id);
  const taken = new Set(have.map((h) => `${h.category}:${fold(h.name)}`));
  const takenEntries = new Set(have.flatMap((h) => (h.entryId ? [h.entryId] : [])));
  const skip = new Set(rejected);
  return [...out.values()].filter((s) => !taken.has(s.key) && !skip.has(s.key) && !(s.entryId && takenEntries.has(s.entryId)));
}

/** An element of the project with the same name in the same category, so that one prop is one element. */
export function findElement(elements: Element[], category: string, name: string): Element | undefined {
  const n = fold(name);
  return elements.find((e) => e.category === category && fold(e.name) === n);
}

/** Every place an element's name or one of its words appears in a text, for the highlights of the marked text [DEP-03]. */
export function ranges(text: string, names: { name: string; category: string }[]): { from: number; to: number; category: string }[] {
  const lower = text.toLocaleLowerCase("fr");
  const out: { from: number; to: number; category: string }[] = [];
  // The longest names first, so that « LAMPE TORCHE » wins over « LAMPE ».
  for (const { name, category } of [...names].sort((a, b) => b.name.length - a.name.length)) {
    const n = name.trim().toLocaleLowerCase("fr");
    if (n.length < 2) continue;
    let at = lower.indexOf(n);
    while (at >= 0) {
      const end = at + n.length;
      const before = at === 0 ? "" : lower[at - 1];
      const after = lower[end] ?? "";
      const whole = !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
      if (whole && !out.some((r) => at < r.to && end > r.from)) out.push({ from: at, to: end, category });
      at = lower.indexOf(n, end);
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

/** What a report lists, each line with the scenes it concerns [DEP-06]. */
export interface ReportGroup {
  title: string;
  color?: string;
  lines: { name: string; scenes: string[] }[];
}

export function byCategory(cats: Category[], elements: Element[], scenesOf: (elementId: string) => string[]): ReportGroup[] {
  return cats
    .filter((c) => !c.hidden)
    .map((c) => ({
      title: categoryName(c),
      color: c.color,
      lines: elements
        .filter((e) => e.category === c.id)
        .map((e) => ({ name: e.name, scenes: scenesOf(e.id) }))
        .filter((l) => l.scenes.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.lines.length > 0);
}

/** The scenes grouped by a key each scene has one or several of: its set, its characters. */
export function scenesBy(scenes: { id: string; keys: string[] }[]): { name: string; scenes: string[] }[] {
  const m = new Map<string, string[]>();
  for (const s of scenes) for (const k of s.keys) if (k) m.set(k, [...(m.get(k) ?? []), s.id]);
  return [...m.entries()].map(([name, ids]) => ({ name, scenes: ids })).sort((a, b) => a.name.localeCompare(b.name));
}
