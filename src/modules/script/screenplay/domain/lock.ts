/**
 * The locked screenplay [REE-07, DEV-02]: scene numbers that no longer move, the scenes added since numbered 12A, 12B,
 * and the coloured revisions, each marking the lines changed since it began.
 */

/** The colours of the revisions, in the order of the profession. */
export const REVISION_COLORS = ["white", "blue", "pink", "yellow", "green", "goldenrod", "buff", "salmon", "cherry"] as const;
export type RevisionColor = (typeof REVISION_COLORS)[number];

/** The tint of each colour on screen and on paper. */
export const REVISION_TINTS: Record<RevisionColor, string> = {
  white: "#ffffff",
  blue: "#cfe3ff",
  pink: "#ffd6e5",
  yellow: "#fff3b0",
  green: "#d4f2d2",
  goldenrod: "#f3d98b",
  buff: "#f2e3c6",
  salmon: "#ffcbb8",
  cherry: "#f7a8b4",
};

export interface Revision {
  id: string;
  color: RevisionColor;
  startedAt: string;
  /** The text of each scene, element by element, when the revision began: what its marks compare to. */
  baseline: Record<string, string[]>;
}

export interface ScriptLock {
  lockedAt: string;
  /** The number of each scene when the script was locked, and of the scenes numbered since. */
  numbers: Record<string, string>;
  revisions: Revision[];
}

export function readLock(raw: unknown): ScriptLock | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<ScriptLock>;
  if (typeof o.lockedAt !== "string" || !o.numbers || typeof o.numbers !== "object") return null;
  return { lockedAt: o.lockedAt, numbers: o.numbers, revisions: Array.isArray(o.revisions) ? o.revisions : [] };
}

/** A, B… Z, AA, AB: the letters of the scenes added after a locked one. */
export function letters(n: number): string {
  let s = "";
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

/**
 * The label of each scene: its place in the list, or once locked its locked number; a scene added after 12 is 12A,
 * the next 12B, and before the first scene A1, B1.
 */
export function sceneLabels(ids: string[], locked: Record<string, string> | null): string[] {
  if (!locked) return ids.map((_id, i) => String(i + 1));
  const taken = new Set(Object.values(locked));
  const firstLocked = ids.map((id) => locked[id]).find(Boolean) ?? "1";
  let base: string | null = null;
  let n = 0;
  return ids.map((id) => {
    const own = locked[id];
    if (own) {
      base = own;
      n = 0;
      return own;
    }
    let label: string;
    do {
      n++;
      label = base === null ? `${letters(n)}${firstLocked}` : `${base}${letters(n)}`;
    } while (taken.has(label));
    taken.add(label);
    return label;
  });
}

/**
 * The elements changed since a revision began, scene by scene: an element whose text the scene did not hold at the
 * start (new or rewritten); a new scene is changed through and through.
 */
export function revisedElements(scenes: { id: string; elements: string[] }[], baseline: Record<string, string[]>): Map<string, boolean[]> {
  const out = new Map<string, boolean[]>();
  for (const s of scenes) {
    const before = baseline[s.id];
    if (!before) {
      out.set(s.id, s.elements.map(() => true));
      continue;
    }
    // Each line of the start used once, so a line written twice is marked the second time.
    const left = new Map<string, number>();
    for (const b of before) left.set(b, (left.get(b) ?? 0) + 1);
    out.set(
      s.id,
      s.elements.map((e) => {
        const n = left.get(e) ?? 0;
        if (n > 0) {
          left.set(e, n - 1);
          return false;
        }
        return true;
      }),
    );
  }
  return out;
}
