/**
 * Fractional ranks: strings that sort like their position, so that moving one item rewrites only that item
 * (architecture, 6.3). Digits are in ASCII order, which is also SQLite's default collation.
 */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? DIGITS[0]) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = a ? DIGITS.indexOf(a[0]) : 0;
  const db = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)];
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[da] + midpoint(a.slice(1), null);
}

function valid(rank: string): boolean {
  return rank.length > 0 && !rank.endsWith(DIGITS[0]) && [...rank].every((c) => DIGITS.includes(c));
}

/** A rank strictly between `before` and `after`; `null` means the start or the end of the list. */
export function rankBetween(before: string | null, after: string | null): string {
  if (before !== null && !valid(before)) throw new Error(`rang invalide : ${before}`);
  if (after !== null && !valid(after)) throw new Error(`rang invalide : ${after}`);
  if (before !== null && after !== null && before >= after) throw new Error(`rangs dans le désordre : ${before} ≥ ${after}`);
  return midpoint(before ?? "", after);
}

/** `count` increasing ranks between two bounds, kept short by splitting the interval in halves. */
export function ranksBetween(before: string | null, after: string | null, count: number): string[] {
  if (count <= 0) return [];
  const mid = rankBetween(before, after);
  const left = Math.floor((count - 1) / 2);
  return [...ranksBetween(before, mid, left), mid, ...ranksBetween(mid, after, count - 1 - left)];
}
