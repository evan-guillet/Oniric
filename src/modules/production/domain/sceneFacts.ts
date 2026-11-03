/** What a scene's heading tells the production: inside or out, the moment of the day, the set [DEP-01, PDT-01]. */

import { parseHeading } from "../../script/screenplay/domain/heading";

export type Side = "int" | "ext" | "intext";
export type Moment = "day" | "night" | "dawn" | "dusk";

export interface SceneFacts {
  side: Side | null;
  moment: Moment | null;
  /** The set, as the heading writes it: « CUISINE DE MARIE ». */
  place: string;
  /** What the heading says after the set when it is not a moment: « TRANCHÉE DE L'ÉTOILE DE LA MORT ». */
  detail?: string;
}

const MOMENTS: [RegExp, Moment][] = [
  [/\b(NUIT|NIGHT|NOCHE|NACHT|MINUIT|MIDNIGHT)\b/, "night"],
  [/\b(AUBE|AURORE|DAWN|AMANECER|MADRUGADA|LEVER DU JOUR|SUNRISE|PETIT MATIN)\b/, "dawn"],
  [/\b(CRÉPUSCULE|CREPUSCULE|DUSK|SOIR|SOIRÉE|SOIREE|EVENING|ATARDECER|ANOCHECER|TARDE|COUCHER DU SOLEIL|SUNSET|ABEND)\b/, "dusk"],
  [/\b(JOUR|DAY|DÍA|DIA|MATIN|MATINÉE|MATINEE|MORNING|MAÑANA|MANANA|MIDI|NOON|APRÈS-MIDI|APRES-MIDI|AFTERNOON|TAG|MORGEN)\b/, "day"],
];

/** « SUITE », « CONTINUOUS »: the moment of the scene before. */
const CONTINUED = /\b(SUITE|CONTINU|CONTINUOUS|CONTINUA|CONTINUACIÓN|MÊME MOMENT|MEME MOMENT|SAME TIME|PLUS TARD|LATER|MÁS TARDE|MAS TARDE|MOMENTS LATER|INSTANTS PLUS TARD)\b/;

function sideOf(intExt: string | null): Side | null {
  if (!intExt) return null;
  if (intExt.includes("/")) return "intext";
  return intExt.startsWith("EXT") ? "ext" : intExt === "EST" ? "ext" : "int";
}

function momentOf(time: string | null): Moment | "same" | null {
  if (!time) return null;
  for (const [re, m] of MOMENTS) if (re.test(time)) return m;
  return CONTINUED.test(time) ? "same" : null;
}

/** The facts of each scene, a scene « SUITE » taking the moment of the one before. */
export function sceneFacts(headings: string[]): SceneFacts[] {
  let last: Moment | null = null;
  return headings.map((h) => {
    const p = parseHeading(h);
    const m = momentOf(p.time);
    const moment = m === "same" ? last : m;
    if (moment) last = moment;
    return { side: sideOf(p.intExt), moment, place: p.location ?? "", detail: m ? undefined : (p.time ?? undefined) };
  });
}

/**
 * The colour of a strip, as boards have them: day inside white, day outside yellow, night inside blue, night outside
 * green, dawn and dusk orange and pink [PDT-01].
 */
export function stripTone(f: SceneFacts): "int-day" | "ext-day" | "int-night" | "ext-night" | "dawn" | "dusk" | "none" {
  if (f.moment === "dawn") return "dawn";
  if (f.moment === "dusk") return "dusk";
  if (!f.side && !f.moment) return "none";
  const out = f.side === "ext" || f.side === "intext";
  return f.moment === "night" ? (out ? "ext-night" : "int-night") : out ? "ext-day" : "int-day";
}
