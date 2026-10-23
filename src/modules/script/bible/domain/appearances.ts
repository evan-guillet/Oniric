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

/** Why a detected name starts unchecked: it may already have an entry, it is part of a place, or it is a role, not a person. */
export type Doubt = { kind: "duplicate"; of: EntryRef } | { kind: "sublocation"; of: string } | { kind: "generic" };

export interface Candidate {
  key: string;
  type: "character" | "location";
  name: string;
  doubt: Doubt | null;
}

/** Cues that name a role rather than a character: « HOMME », « GARDE 2 », « LA SERVEUSE ». */
const ROLES = new Set(
  (
    "homme femme garcon fille enfant enfants bebe vieil vieux vieille jeune ado adolescent adolescente " +
    "policier policiere flic agent gendarme garde gardien gardienne soldat soldats officier sergent " +
    "serveur serveuse barman client cliente vendeur vendeuse caissier caissiere chauffeur livreur " +
    "medecin docteur infirmier infirmiere passant passante voisin voisine inconnu inconnue " +
    "voix tous toutes foule groupe journaliste presentateur presentatrice narrateur narratrice " +
    "pretre secretaire standardiste mecanicien pilote technicien petit petite employe employee ouvrier ouvriere marin pirate villageois villageoise"
  ).split(" "),
);
const ARTICLE = /^(l['’]\s*|(le|la|les|un|une|des)\s+)/;

export function isGenericRole(cue: string): boolean {
  const f = fold(cue);
  if (/\d|#/.test(f)) return true;
  const first = f.replace(ARTICLE, "").split(/[^\p{L}]+/u)[0];
  return ROLES.has(first);
}

const words = (name: string) => fold(name).replace(ARTICLE, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w && !PARTICLES.has(w));

/** At most one letter added, removed or changed: « NYRAH » for « Nyra ». */
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1);
}

/** The entry this name probably already is: every word of one name is in the other, or one letter apart. */
export function probableDuplicate(name: string, entries: EntryRef[]): EntryRef | null {
  const w = words(name);
  if (w.length === 0) return null;
  for (const e of entries) {
    for (const n of [e.name, ...e.aliases]) {
      const v = words(n);
      if (v.length === 0) continue;
      const [small, big] = w.length <= v.length ? [w, v] : [v, w];
      if (small.every((x) => big.includes(x)) || nearlyEqual(w.join(" "), v.join(" "))) return e;
    }
  }
  return null;
}

/** The detected names, each with the doubt that keeps it unchecked [BIB-03]. */
export function triage(found: { characters: string[]; locations: string[] }, entries: EntryRef[]): Candidate[] {
  const ofType = (type: string) => entries.filter((e) => e.type === type);
  const characters = ofType("character");
  const locations = ofType("location");
  return [
    ...found.characters.map((raw): Candidate => {
      const dup = probableDuplicate(raw, characters);
      return {
        key: `c:${raw}`,
        type: "character",
        name: prettyName(raw),
        doubt: dup ? { kind: "duplicate", of: dup } : isGenericRole(raw) ? { kind: "generic" } : null,
      };
    }),
    ...found.locations.map((raw): Candidate => {
      // « MAISON – CUISINE »: the kitchen of the house, which the house's entry covers.
      const parts = raw.split(/\s+[-–—]+\s+/);
      const dup = parts.length === 1 ? probableDuplicate(raw, locations) : null;
      return {
        key: `l:${raw}`,
        type: "location",
        name: prettyName(raw),
        doubt: parts.length > 1 ? { kind: "sublocation", of: prettyName(parts[0]) } : dup ? { kind: "duplicate", of: dup } : null,
      };
    }),
  ];
}
