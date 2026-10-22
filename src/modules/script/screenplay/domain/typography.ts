/** French typography: a no-break space before ? ! ; : and inside « », as word processors do. */
export const NBSP = " ";

const BEFORE_DOUBLE = new Set(["?", "!", ";", ":"]);

export interface Correction {
  /** Characters to remove before the cursor. */
  remove: number;
  insert: string;
}

/** What to insert when `typed` is typed after `before`; null when the character goes in as typed. */
export function frenchSpacing(before: string, typed: string): Correction | null {
  const prev = before.at(-1);
  if (prev === undefined) return null;
  if (BEFORE_DOUBLE.has(typed) || typed === "»") {
    if (prev === " ") return { remove: 1, insert: NBSP + typed };
    if (prev === NBSP || prev === " " || BEFORE_DOUBLE.has(prev) || prev === "(" || prev === "«") return null;
    if (typed === ":" && /\d/.test(prev)) return null;
    if (/[\p{L}\p{N}…».)"']/u.test(prev)) return { remove: 0, insert: NBSP + typed };
    return null;
  }
  if (prev === "«") {
    if (typed === " ") return { remove: 0, insert: NBSP };
    if (typed !== NBSP) return { remove: 0, insert: NBSP + typed };
  }
  return null;
}

/** The same rules on a whole text, for imports: only existing ordinary spaces are replaced. */
export function applyFrenchSpacing(text: string): string {
  return text.replace(/ ([?!;:»])/g, `${NBSP}$1`).replace(/« /g, `«${NBSP}`);
}
