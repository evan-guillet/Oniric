export interface HeadingParts {
  intExt: string | null;
  location: string | null;
  time: string | null;
}

const PREFIX = /^(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|INT|EXT|EST)(?:\.|\s|$)\s*/i;
const DASH = /\s+[-–—]+\s+/;

const TIMES = new Set(
  [
    "JOUR", "NUIT", "AUBE", "AURORE", "MATIN", "MIDI", "APRÈS-MIDI", "SOIR", "SOIRÉE", "CRÉPUSCULE", "FIN DE JOURNÉE",
    "LEVER DU JOUR", "LEVER DU SOLEIL", "COUCHER DU SOLEIL", "PETIT MATIN", "PLUS TARD", "UN PEU PLUS TARD",
    "QUELQUES INSTANTS PLUS TARD", "INSTANTS PLUS TARD", "CONTINU", "CONTINUITÉ", "SUITE", "MÊME MOMENT", "AU MÊME MOMENT",
    "DAY", "NIGHT", "DAWN", "DUSK", "MORNING", "AFTERNOON", "EVENING", "SUNRISE", "SUNSET", "LATER", "MOMENTS LATER",
    "CONTINUOUS", "SAME TIME",
    "DÍA", "NOCHE", "MAÑANA", "TARDE", "ATARDECER", "AMANECER", "ANOCHECER", "MÁS TARDE", "CONTINUA", "CONTINUACIÓN",
  ],
);

/** Whether the last part of a heading says when rather than where: « NUIT », « PLUS TARD », « DUSK »… */
export function isTimeOfDay(part: string): boolean {
  return TIMES.has(part.replace(/[()]/g, "").replace(/\s+/g, " ").trim().toLocaleUpperCase("fr"));
}

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
