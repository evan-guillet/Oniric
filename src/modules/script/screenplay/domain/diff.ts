/** Differences between two versions of the screenplay: scene by scene, then word by word [REE-02]. */

export type Part = { kind: "same" | "added" | "removed"; text: string };

function tokens(s: string): string[] {
  return s.match(/\s+|[\p{L}\p{N}'’-]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

function merge(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.kind === p.kind) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

/** Word-level difference; long texts fall back to line level to stay fast. */
export function diffWords(a: string, b: string): Part[] {
  if (a === b) return a ? [{ kind: "same", text: a }] : [];
  let x = tokens(a);
  let y = tokens(b);
  if (x.length * y.length > 4_000_000) {
    x = a.split(/(?<=\n)/);
    y = b.split(/(?<=\n)/);
  }
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const xs = x.slice(start, endX);
  const ys = y.slice(start, endY);
  const n = xs.length;
  const m = ys.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = xs[i] === ys[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const parts: Part[] = [{ kind: "same", text: x.slice(0, start).join("") }];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (xs[i] === ys[j]) {
      parts.push({ kind: "same", text: xs[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) parts.push({ kind: "removed", text: xs[i++] });
    else parts.push({ kind: "added", text: ys[j++] });
  }
  while (i < n) parts.push({ kind: "removed", text: xs[i++] });
  while (j < m) parts.push({ kind: "added", text: ys[j++] });
  parts.push({ kind: "same", text: x.slice(endX).join("") });
  return merge(parts.filter((p) => p.text));
}

export interface VersionScene {
  id: string;
  heading: string;
  text: string;
}

export interface SceneDiff {
  kind: "same" | "changed" | "added" | "removed" | "moved";
  left: VersionScene | null;
  right: VersionScene | null;
  parts: Part[];
}

/** Scenes are matched by their identifier, which survives edits; the order is that of the right-hand version. */
export function diffScenes(left: VersionScene[], right: VersionScene[]): SceneDiff[] {
  const leftById = new Map(left.map((s, i) => [s.id, { s, i }]));
  const rightIds = new Set(right.map((s) => s.id));
  const out: SceneDiff[] = [];
  let lastLeft = -1;
  const removedBefore = (limit: number) => {
    for (let k = lastLeft + 1; k < limit; k++) {
      const s = left[k];
      if (!rightIds.has(s.id)) out.push({ kind: "removed", left: s, right: null, parts: [{ kind: "removed", text: s.text }] });
    }
  };
  for (const r of right) {
    const l = leftById.get(r.id);
    if (!l) {
      out.push({ kind: "added", left: null, right: r, parts: [{ kind: "added", text: r.text }] });
      continue;
    }
    removedBefore(l.i);
    const moved = l.i < lastLeft;
    if (l.i > lastLeft) lastLeft = l.i;
    const same = l.s.text === r.text;
    out.push({ kind: same ? (moved ? "moved" : "same") : "changed", left: l.s, right: r, parts: same ? [{ kind: "same", text: r.text }] : diffWords(l.s.text, r.text) });
  }
  removedBefore(left.length);
  return out;
}

export interface LineSide {
  /** Line number, from 1, in its version of the scene. */
  n: number;
  parts: Part[];
}

export interface DiffLine {
  kind: "same" | "changed" | "added" | "removed";
  left: LineSide | null;
  right: LineSide | null;
}

/** Line-by-line comparison for the side-by-side view: a removed line facing an added one is a changed line, compared word by word. */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a ? a.split("\n") : [];
  const y = b ? b.split("\n") : [];
  const n = x.length;
  const m = y.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffLine[] = [];
  const removed: number[] = [];
  const added: number[] = [];
  const flush = () => {
    for (let t = 0; t < Math.max(removed.length, added.length); t++) {
      const l = removed[t];
      const r = added[t];
      if (l !== undefined && r !== undefined) {
        const parts = diffWords(x[l], y[r]);
        out.push({ kind: "changed", left: { n: l + 1, parts: parts.filter((p) => p.kind !== "added") }, right: { n: r + 1, parts: parts.filter((p) => p.kind !== "removed") } });
      } else if (l !== undefined) out.push({ kind: "removed", left: { n: l + 1, parts: [{ kind: "removed", text: x[l] }] }, right: null });
      else out.push({ kind: "added", left: null, right: { n: r + 1, parts: [{ kind: "added", text: y[r] }] } });
    }
    removed.length = 0;
    added.length = 0;
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      flush();
      out.push({ kind: "same", left: { n: i + 1, parts: [{ kind: "same", text: x[i] }] }, right: { n: j + 1, parts: [{ kind: "same", text: y[j] }] } });
      i++;
      j++;
    } else if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) removed.push(i++);
    else added.push(j++);
  }
  flush();
  return out;
}

/** Lines added and removed, counted as in a code review: a changed line counts once on each side. */
export function lineStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === "same") continue;
    if (l.left) removed++;
    if (l.right) added++;
  }
  return { added, removed };
}

export type Hunk = { kind: "lines"; lines: DiffLine[] } | { kind: "fold"; lines: DiffLine[] };

/** Keeps `context` identical lines around each change and folds the longer identical runs. */
export function foldLines(lines: DiffLine[], context = 3): Hunk[] {
  const keep = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out: Hunk[] = [];
  let i = 0;
  while (i < lines.length) {
    let j = i;
    while (j < lines.length && keep[j] === keep[i]) j++;
    const run = lines.slice(i, j);
    // A fold that hides a single line saves nothing.
    out.push({ kind: keep[i] || run.length < 2 ? "lines" : "fold", lines: run });
    i = j;
  }
  return out;
}
