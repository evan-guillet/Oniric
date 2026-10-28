import type { ElementType } from "../../screenplay/domain/formats";
import { parseHeading } from "../../screenplay/domain/heading";
import { t } from "../../../../core/i18n";

/** How the words of the screenplay are split in the charts. */
export type WordGroup = "action" | "dialogue" | "other";

export const WORD_GROUPS: { id: WordGroup; readonly label: string }[] = (["action", "dialogue", "other"] as const).map((id) => ({
  id,
  get label() {
    return t(`stats.groups.${id}`);
  },
}));

export type WordCounts = Record<WordGroup, number>;

export const noWords = (): WordCounts => ({ action: 0, dialogue: 0, other: 0 });

export function groupOf(type: ElementType): WordGroup {
  if (type === "action") return "action";
  if (type === "dialogue" || type === "parenthetical") return "dialogue";
  return "other";
}

/** « l'homme-orchestre arrive » → 3: letters or digits, with their inner apostrophes and hyphens. */
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function wordCounts(blocks: { type: ElementType; text: string }[]): WordCounts {
  const counts = noWords();
  for (const b of blocks) counts[groupOf(b.type)] += countWords(b.text);
  return counts;
}

export const totalWords = (c: WordCounts) => c.action + c.dialogue + c.other;

export interface StatScene {
  id: string;
  index: number;
  heading: string;
  eighths: number;
  blocks: { type: ElementType; text: string }[];
}

export interface CharacterStat {
  name: string;
  /** Number of cues: each time the character speaks. */
  lines: number;
  words: number;
  /** Ids of the scenes where the character speaks, in order. */
  scenes: string[];
}

/** Who speaks, how often and how much; the words of a cue go to it until the next element that is not dialogue. */
export function characterStats(scenes: StatScene[], nameOf: (cue: string) => string): CharacterStat[] {
  const byName = new Map<string, CharacterStat>();
  for (const s of scenes) {
    let speaker: CharacterStat | null = null;
    for (const b of s.blocks) {
      if (b.type === "character") {
        const name = nameOf(b.text);
        if (!name) {
          speaker = null;
          continue;
        }
        speaker = byName.get(name) ?? { name, lines: 0, words: 0, scenes: [] };
        byName.set(name, speaker);
        speaker.lines++;
        if (speaker.scenes.at(-1) !== s.id) speaker.scenes.push(s.id);
      } else if (b.type === "dialogue" || b.type === "parenthetical") {
        if (speaker && b.type === "dialogue") speaker.words += countWords(b.text);
      } else speaker = null;
    }
  }
  return [...byName.values()].sort((a, b) => b.words - a.words || b.lines - a.lines);
}

export interface PlaceStat {
  name: string;
  eighths: number;
  scenes: string[];
}

/** The places of the headings, the longest first. */
export function placeStats(scenes: StatScene[]): PlaceStat[] {
  const byName = new Map<string, PlaceStat>();
  for (const s of scenes) {
    const name = parseHeading(s.heading).location;
    if (!name) continue;
    const p = byName.get(name) ?? { name, eighths: 0, scenes: [] };
    byName.set(name, p);
    p.eighths += s.eighths;
    p.scenes.push(s.id);
  }
  return [...byName.values()].sort((a, b) => b.eighths - a.eighths || b.scenes.length - a.scenes.length);
}

export interface Share {
  label: string;
  scenes: number;
  eighths: number;
}

/** INT, EXT… or JOUR, NUIT…: how the scenes split along one part of their headings. */
export function headingShares(scenes: StatScene[], part: "intExt" | "time"): Share[] {
  const byLabel = new Map<string, Share>();
  for (const s of scenes) {
    const label = parseHeading(s.heading)[part] ?? t("stats.unspecified");
    const sh = byLabel.get(label) ?? { label, scenes: 0, eighths: 0 };
    byLabel.set(label, sh);
    sh.scenes++;
    sh.eighths += s.eighths;
  }
  return [...byLabel.values()].sort((a, b) => b.eighths - a.eighths || b.scenes - a.scenes);
}

/** One day of the writing journal, kept in the project. */
export interface JournalDay {
  /** Words written that day, by kind of element. */
  added: WordCounts;
  removed: number;
  /** Minutes spent writing, counted from the changes of the text. */
  minutes: number;
}

export type Journal = Record<string, JournalDay>;

/** Local date as the journal keys it: 2026-10-25. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The `count` days that end `offset` periods before today, oldest first. */
export function periodDays(today: Date, count: number, offset: number): Date[] {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset * count);
  return Array.from({ length: count }, (_, i) => new Date(end.getFullYear(), end.getMonth(), end.getDate() - (count - 1 - i)));
}

/** Each value as a share of their total, in percent with one decimal. */
export function percents(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  return values.map((v) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0));
}
