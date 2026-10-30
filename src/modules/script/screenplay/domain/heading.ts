export interface HeadingParts {
  intExt: string | null;
  location: string | null;
  time: string | null;
}

const PREFIX = /^(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|INT|EXT|EST)(?:\.|\s|$)\s*/i;
const DASH = /\s+[-–—]+\s+/;

/** "INT. CUISINE DE MARIE – NUIT" → INT, CUISINE DE MARIE, NUIT: copied into columns for filters and production. */
export function parseHeading(text: string): HeadingParts {
  const t = text.replace(/\s+/g, " ").trim().toLocaleUpperCase("fr");
  if (!t) return { intExt: null, location: null, time: null };
  const m = PREFIX.exec(t);
  let intExt: string | null = null;
  let rest = t;
  if (m) {
    const p = m[1].replace(/[.\s]/g, "");
    intExt = p === "I/E" ? "INT/EXT" : p;
    rest = t.slice(m[0].length);
  }
  const parts = rest.split(DASH);
  const time = parts.length > 1 ? parts.pop()!.trim() || null : null;
  const location = parts.join(" – ").trim() || null;
  return { intExt, location, time };
}
