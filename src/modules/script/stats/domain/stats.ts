import type { ElementType } from "../../screenplay/domain/formats";

/** How the words of the screenplay are split. */
export type WordGroup = "action" | "dialogue" | "other";

export const WORD_GROUPS: readonly WordGroup[] = ["action", "dialogue", "other"];

export type WordCounts = Record<WordGroup, number>;

export const noWords = (): WordCounts => ({ action: 0, dialogue: 0, other: 0 });

function groupOf(type: ElementType): WordGroup {
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
