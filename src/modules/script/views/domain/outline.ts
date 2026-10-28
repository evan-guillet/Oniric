import { t } from "../../../../core/i18n";
/**
 * Acts, sequences and scenes of the story [VUE-03]. The order of the screenplay is the only order of the scenes:
 * a scene without a sequence belongs to the sequence of the scene before it, so that a scene typed in the editor
 * joins the sequence it was typed in.
 */

export interface OutlineAct {
  id: string;
  rank: string;
  title: string;
}

export interface OutlineSequence {
  id: string;
  actId: string | null;
  rank: string;
  title: string;
}

export interface OutlineScene {
  id: string;
  sequenceId: string | null;
}

export interface SequenceGroup {
  sequence: OutlineSequence | null;
  scenes: string[];
}

export interface ActGroup {
  act: OutlineAct | null;
  sequences: SequenceGroup[];
}

const byRank = <T extends { rank: string }>(a: T, b: T) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

/** The sequence each scene belongs to, inheritance included; null before the first sequence. */
export function memberships(scenes: OutlineScene[], sequences: OutlineSequence[]): Map<string, string | null> {
  const known = new Set(sequences.map((s) => s.id));
  const out = new Map<string, string | null>();
  let current: string | null = null;
  for (const s of scenes) {
    if (s.sequenceId && known.has(s.sequenceId)) current = s.sequenceId;
    out.set(s.id, current);
  }
  return out;
}

/** Columns of the board: an optional « without act » column first, then the acts by rank. */
export function outline(scenes: OutlineScene[], sequences: OutlineSequence[], acts: OutlineAct[]): ActGroup[] {
  const member = memberships(scenes, sequences);
  const bySequence = new Map<string | null, string[]>();
  for (const s of scenes) {
    const k = member.get(s.id) ?? null;
    bySequence.set(k, [...(bySequence.get(k) ?? []), s.id]);
  }
  const actIds = new Set(acts.map((a) => a.id));
  const groups: ActGroup[] = [];
  const loose = sequences.filter((s) => !s.actId || !actIds.has(s.actId)).sort(byRank);
  const unplaced = bySequence.get(null) ?? [];
  if (unplaced.length > 0 || loose.length > 0 || acts.length === 0) {
    groups.push({
      act: null,
      sequences: [
        ...(unplaced.length > 0 || loose.length === 0 ? [{ sequence: null, scenes: unplaced }] : []),
        ...loose.map((sequence) => ({ sequence, scenes: bySequence.get(sequence.id) ?? [] })),
      ],
    });
  }
  for (const act of [...acts].sort(byRank)) {
    groups.push({
      act,
      sequences: sequences
        .filter((s) => s.actId === act.id)
        .sort(byRank)
        .map((sequence) => ({ sequence, scenes: bySequence.get(sequence.id) ?? [] })),
    });
  }
  return groups;
}

/** The order of the screenplay that the board shows. */
export function flatten(groups: ActGroup[]): string[] {
  return groups.flatMap((g) => g.sequences.flatMap((s) => s.scenes));
}

/**
 * Explicit memberships to write so that what the board shows no longer depends on inheritance: done before a move,
 * so that the scenes that followed a moved scene stay where they are.
 */
export function materialize(scenes: OutlineScene[], sequences: OutlineSequence[]): { id: string; sequenceId: string | null }[] {
  const member = memberships(scenes, sequences);
  return scenes.filter((s) => (s.sequenceId ?? null) !== (member.get(s.id) ?? null)).map((s) => ({ id: s.id, sequenceId: member.get(s.id) ?? null }));
}

/** `order` with `id` moved to `target` sequence, before `beforeId` (or at the end of the sequence). */
export function moveScene(groups: ActGroup[], id: string, target: string | null, beforeId: string | null): ActGroup[] {
  const next = groups.map((g) => ({ ...g, sequences: g.sequences.map((s) => ({ ...s, scenes: s.scenes.filter((x) => x !== id) })) }));
  for (const g of next) {
    for (const s of g.sequences) {
      if ((s.sequence?.id ?? null) !== target) continue;
      const at = beforeId ? s.scenes.indexOf(beforeId) : -1;
      if (at >= 0) s.scenes.splice(at, 0, id);
      else s.scenes.push(id);
      return next;
    }
  }
  return groups;
}

const ROMAN: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

/** 1 → I, 4 → IV, 14 → XIV. */
export function roman(n: number): string {
  let out = "";
  for (const [v, s] of ROMAN) for (; n >= v; n -= v) out += s;
  return out;
}

/** 1 → A, 26 → Z, 27 → AA. */
export function letters(n: number): string {
  let out = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}

// A number typed by hand at the head of a title (« Acte I : », « Act. II – », « Acto III », « II. », « Séquence B – »,
// « Secuencia C », « C. »), in any of the interface's languages, gives way to the automatic one.
const ACT_NUMBER = /^\s*(?:(?:[Aa]ct(?:e|o|\.)?)\s*(?:[IVXLCDM]+|\d+)\b\s*[.:–—-]?\s*|(?:[IVXLCDM]+|\d+)\s*[.:)]\s+)/;
const SEQ_NUMBER = /^\s*(?:(?:[Ss][ée]quence|[Ss]ecuencia|[Ss][ée]q\.|[Ss]ec\.)\s*(?:[A-Z]{1,2}|\d+)\b\s*[.:–—-]?\s*|[A-Z]{1,2}\s*[.:)]\s+)/;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The label of scene `n` (counted from 1): « Scè. 12 ». */
export const sceneLabel = (n: number) => t("versions.sceneShort", { n });

/** An act or sequence's automatic number (« Act. I », « Séq. A ») and its title without any number typed by hand. */
export type Numbered = { num: string; title: string };

/**
 * Numbers by position: acts in Roman numerals (« Act. I »), sequences in letters running through the whole story
 * (« Séq. A »). An untitled act or sequence has an empty title.
 */
export function numberedParts(groups: ActGroup[]): Map<string, Numbered> {
  const out = new Map<string, Numbered>();
  let act = 0;
  let seq = 0;
  for (const g of groups) {
    if (g.act) out.set(g.act.id, { num: t("outline.act", { n: roman(++act) }), title: capitalize(g.act.title.replace(ACT_NUMBER, "").trim()) });
    for (const s of g.sequences) if (s.sequence) out.set(s.sequence.id, { num: t("outline.seq", { n: letters(++seq) }), title: capitalize(s.sequence.title.replace(SEQ_NUMBER, "").trim()) });
  }
  return out;
}

/** The same as plain text, number then title: « Act. I Le départ ». */
export function numberedTitles(groups: ActGroup[]): Map<string, string> {
  return new Map([...numberedParts(groups)].map(([id, n]) => [id, n.title ? `${n.num} ${n.title}` : n.num]));
}
