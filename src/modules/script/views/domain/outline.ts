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
