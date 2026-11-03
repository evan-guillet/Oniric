/** What helps to read the screenplay again [REE-05] and the checks of its form before it goes out [RET-05]. */

import { fold } from "../../bible/domain/types";
import { characterName } from "../../screenplay/ui/editor/schema";
import { parseHeading } from "../../screenplay/domain/heading";

export interface ReviewScene {
  id: string;
  number: string;
  heading: string;
  eighths: number;
  /** Cues, without extensions. */
  characters: string[];
  blocks: { type: string; text: string }[];
}

/** The scenes longer than `limit` eighths, the longest first. */
export function longScenes(scenes: ReviewScene[], limit = 24): ReviewScene[] {
  return scenes.filter((s) => s.eighths > limit).sort((a, b) => b.eighths - a.eighths);
}

/** The words each character speaks, and their share of all the dialogue. */
export function speech(scenes: ReviewScene[]): { name: string; words: number; share: number }[] {
  const words = new Map<string, number>();
  for (const s of scenes) {
    let speaker: string | null = null;
    for (const b of s.blocks) {
      if (b.type === "character") speaker = characterName(b.text);
      else if (b.type === "dialogue" && speaker) words.set(speaker, (words.get(speaker) ?? 0) + (b.text.match(/[\p{L}\p{N}'’-]+/gu)?.length ?? 0));
      else if (b.type !== "parenthetical") speaker = null;
    }
  }
  const total = [...words.values()].reduce((n, w) => n + w, 0) || 1;
  return [...words.entries()].map(([name, w]) => ({ name, words: w, share: w / total })).sort((a, b) => b.words - a.words);
}

/** The characters in the most scenes: the main ones, unless the author names them. */
export function mainCharacters(scenes: ReviewScene[], n = 2): string[] {
  const count = new Map<string, number>();
  for (const s of scenes) for (const c of s.characters) count.set(c, (count.get(c) ?? 0) + 1);
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([c]) => c);
}

/** The scenes none of the main characters is in. */
export function scenesWithout(scenes: ReviewScene[], mains: string[]): ReviewScene[] {
  return scenes.filter((s) => s.blocks.some((b) => b.type !== "scene_heading" && b.text.trim()) && !s.characters.some((c) => mains.includes(c)));
}

/**
 * The longest stretch of the film each character is away from, when it is long: at least `minPages` pages and a
 * quarter of the film, for the characters in `minScenes` scenes or more.
 */
export function longAbsences(scenes: ReviewScene[], minScenes = 3, minPages = 10): { name: string; after: string; back: string; eighths: number }[] {
  const total = scenes.reduce((n, s) => n + s.eighths, 0);
  const names = new Set(scenes.flatMap((s) => s.characters));
  const out: { name: string; after: string; back: string; eighths: number }[] = [];
  for (const name of names) {
    const at = scenes.flatMap((s, i) => (s.characters.includes(name) ? [i] : []));
    if (at.length < minScenes) continue;
    let best = { eighths: 0, after: "", back: "" };
    for (let k = 1; k < at.length; k++) {
      const gap = scenes.slice(at[k - 1] + 1, at[k]).reduce((n, s) => n + s.eighths, 0);
      if (gap > best.eighths) best = { eighths: gap, after: scenes[at[k - 1]].number, back: scenes[at[k]].number };
    }
    if (best.eighths >= minPages * 8 && best.eighths >= total / 4) out.push({ name, ...best });
  }
  return out.sort((a, b) => b.eighths - a.eighths);
}

export type Issue =
  | { kind: "noHeading"; sceneId: string }
  | { kind: "badHeading"; sceneId: string; heading: string; missing: "side" | "time" }
  | { kind: "empty"; sceneId: string }
  | { kind: "spelling"; sceneId: string; names: string[] };

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const row = Array.from({ length: b.length + 1 }, (_x, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}

/**
 * The faults of form [RET-05]: a scene with no heading or a heading without INT/EXT or moment, a scene without text,
 * and a character's name written two ways (« LUKE » and « LUKE SKYWALKER » are two names, « JOHANA » and « JOHANNA » one).
 */
export function formIssues(scenes: ReviewScene[]): Issue[] {
  const out: Issue[] = [];
  for (const s of scenes) {
    if (!s.heading.trim()) out.push({ kind: "noHeading", sceneId: s.id });
    else {
      const h = parseHeading(s.heading);
      if (!h.intExt) out.push({ kind: "badHeading", sceneId: s.id, heading: s.heading, missing: "side" });
      else if (!h.time) out.push({ kind: "badHeading", sceneId: s.id, heading: s.heading, missing: "time" });
    }
    if (!s.blocks.some((b) => b.type !== "scene_heading" && b.text.trim())) out.push({ kind: "empty", sceneId: s.id });
  }
  const first = new Map<string, string>();
  for (const s of scenes) for (const c of s.characters) if (!first.has(c)) first.set(c, s.id);
  const names = [...first.keys()];
  const key = (n: string) => fold(n).replace(/[^\p{L}\p{N}]/gu, "");
  const seen = new Set<string>();
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = key(names[i]);
      const b = key(names[j]);
      if (a.length < 4 || b.length < 4 || seen.has(names[j])) continue;
      if (a === b || distance(a, b) === 1) {
        seen.add(names[j]);
        out.push({ kind: "spelling", sceneId: first.get(names[j])!, names: [names[i], names[j]] });
      }
    }
  }
  return out;
}
