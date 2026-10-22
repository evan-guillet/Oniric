import { fold } from "./types";

export interface EntryRef {
  id: string;
  type: string;
  name: string;
  aliases: string[];
}

export interface SceneText {
  id: string;
  heading: string;
  /** Character cues, without extensions. */
  characters: string[];
  text: string;
  /** Ids of the bible entries linked from the scene. */
  links: string[];
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** « Marie » as a whole word, ignoring case and accents. */
function mentions(text: string, name: string): boolean {
  const n = fold(name);
  if (n.length < 2) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(n)}($|[^\\p{L}\\p{N}])`, "u").test(fold(text));
}

/** Location part of a heading: « INT. CUISINE DE MARIE – NUIT » → « cuisine de marie ». */
export function headingPlace(heading: string): string {
  return fold(
    heading
      .replace(/^(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|INT|EXT|EST)(\.|\s|$)\s*/i, "")
      .split(/\s+[-–—]+\s+/)
      .slice(0, -1)
      .join(" – ") || heading.replace(/^(INT|EXT|EST|I\/E)\.?\s*/i, ""),
  );
}

/**
 * Scenes where an entry appears, computed from the text [5.2]: a character by its cues or its name in the action,
 * a location by the headings, any entry by a wiki link or by its name.
 */
export function appearances(entry: EntryRef, scenes: SceneText[]): string[] {
  const names = [entry.name, ...entry.aliases].filter((n) => n.trim().length > 0);
  const upper = names.map((n) => n.toLocaleUpperCase("fr").trim());
  return scenes
    .filter((s) => {
      if (s.links.includes(entry.id)) return true;
      if (entry.type === "character" && s.characters.some((c) => upper.includes(c))) return true;
      if (entry.type === "location") {
        const place = headingPlace(s.heading);
        if (names.some((n) => place === fold(n) || mentions(place, n))) return true;
      }
      return names.some((n) => mentions(s.text, n));
    })
    .map((s) => s.id);
}

/** Characters and locations of the screenplay that have no entry yet [BIB-03]. */
export function detect(scenes: SceneText[], entries: EntryRef[]): { characters: string[]; locations: string[] } {
  const known = (type: string) =>
    new Set(entries.filter((e) => e.type === type).flatMap((e) => [e.name, ...e.aliases].map((n) => fold(n))));
  const characters = known("character");
  const locations = known("location");
  const newCharacters = new Map<string, string>();
  const newLocations = new Map<string, string>();
  for (const s of scenes) {
    for (const c of s.characters) if (!characters.has(fold(c)) && !newCharacters.has(fold(c))) newCharacters.set(fold(c), c);
    const place = s.heading
      .replace(/^(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|INT|EXT|EST)(\.|\s|$)\s*/i, "")
      .split(/\s+[-–—]+\s+/);
    if (place.length > 1) place.pop();
    const name = place.join(" – ").trim().toLocaleUpperCase("fr");
    if (name && !locations.has(fold(name)) && !newLocations.has(fold(name))) newLocations.set(fold(name), name);
  }
  return { characters: [...newCharacters.values()], locations: [...newLocations.values()] };
}

const PARTICLES = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "et", "à", "au", "aux", "en", "sur", "sous"]);

/** « JEAN-PIERRE » → « Jean-Pierre », « CUISINE DE MARIE » → « Cuisine de Marie ». */
export function prettyName(upper: string): string {
  let first = true;
  return upper.toLocaleLowerCase("fr").replace(/\p{L}+/gu, (w) => {
    const keep = !first && PARTICLES.has(w);
    first = false;
    return keep ? w : w.charAt(0).toLocaleUpperCase("fr") + w.slice(1);
  });
}
