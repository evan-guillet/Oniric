import { ranksBetween } from "../../../../core/ordering";
import type { HeadingParts } from "./heading";

export interface DocScene {
  id: string;
  content: string;
  eighths: number;
  heading: HeadingParts;
}

export interface StoredScene {
  rank: string;
  content: string;
  eighths: number;
}

export interface SceneUpsert extends DocScene {
  rank: string;
  isNew: boolean;
}

export interface SavePlan {
  upserts: SceneUpsert[];
  deletes: string[];
}

/** Indexes of a longest strictly increasing subsequence of `values` (undefined values are skipped). */
function longestIncreasing(values: (string | undefined)[]): Set<number> {
  const tails: number[] = [];
  const parent = new Array<number>(values.length).fill(-1);
  values.forEach((v, i) => {
    if (v === undefined) return;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]]! < v) lo = mid + 1;
      else hi = mid;
    }
    parent[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  });
  const keep = new Set<number>();
  for (let i = tails.at(-1) ?? -1; i >= 0; i = parent[i]) keep.add(i);
  return keep;
}

/**
 * What to write so that the database matches the scenes of the editor: changed scenes only, and new ranks
 * only for the scenes that moved (the others keep theirs, so a move rewrites one row).
 */
export function planSave(scenes: DocScene[], stored: ReadonlyMap<string, StoredScene>): SavePlan {
  const keep = longestIncreasing(scenes.map((s) => stored.get(s.id)?.rank));
  const ranks: string[] = new Array(scenes.length);
  let i = 0;
  while (i < scenes.length) {
    if (keep.has(i)) {
      ranks[i] = stored.get(scenes[i].id)!.rank;
      i++;
      continue;
    }
    let j = i;
    while (j < scenes.length && !keep.has(j)) j++;
    const before = i > 0 ? ranks[i - 1] : null;
    const after = j < scenes.length ? stored.get(scenes[j].id)!.rank : null;
    ranksBetween(before, after, j - i).forEach((r, k) => (ranks[i + k] = r));
    i = j;
  }

  const upserts: SceneUpsert[] = [];
  scenes.forEach((s, k) => {
    const old = stored.get(s.id);
    if (old && old.rank === ranks[k] && old.content === s.content && old.eighths === s.eighths) return;
    upserts.push({ ...s, rank: ranks[k], isNew: !old });
  });
  const present = new Set(scenes.map((s) => s.id));
  const deletes = [...stored.keys()].filter((id) => !present.has(id));
  return { upserts, deletes };
}
