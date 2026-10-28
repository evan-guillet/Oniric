/** Types of bible entries and their fields (specification, 5.2). A type is data, so users can create their own. */

import { getLanguage, t, type Language } from "../../../../core/i18n";

export type FieldKind = "text" | "longtext" | "number" | "date" | "list" | "image" | "link" | "links";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  /** Choices of a `list` field. */
  options?: string[];
  /** Entry type a `link` or `links` field points to; any type when absent. */
  target?: string;
  help?: string;
}

export interface EntryType {
  id: string;
  name: string;
  plural: string;
  /** Key of its icon in the app's set (ui/typeIcons). */
  icon?: string;
  builtin: boolean;
  fields: FieldDef[];
}

const f = (key: string, label: string, kind: FieldKind = "longtext", extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind, ...extra });

/**
 * A built-in type, its names read in the interface's language. Its keys and its list choices stay as they are: they
 * are what the entries store.
 */
function localized(type: EntryType): EntryType {
  const k = `bible.types.${type.id}`;
  return {
    ...type,
    get name() {
      return t(`${k}.name`);
    },
    get plural() {
      return t(`${k}.plural`);
    },
    fields: type.fields.map((fd) => ({
      ...fd,
      get label() {
        return t(`${k}.fields.${fd.key}.label`);
      },
      get help() {
        return fd.help && t(`${k}.fields.${fd.key}.help`);
      },
    })),
  };
}

/** A list choice as shown: the built-in ones in the interface's language, the user's own as typed. */
export const optionLabel = (value: string) => t(`bible.options.${value}`, { defaultValue: value });

export const BUILTIN_TYPES: EntryType[] = ([
  {
    id: "character",
    icon: "user",
    name: "Personnage",
    plural: "Personnages",
    builtin: true,
    fields: [
      f("nicknames", "Surnoms", "text"),
      f("age", "Âge", "text"),
      f("birth", "Date de naissance", "date", { help: "Dans le calendrier du monde du film : « 1944 », « an 312 de l'ère des Lunes »…" }),
      f("appearance", "Apparence"),
      f("physique", "Physique"),
      f("costume", "Costume type"),
      f("backstory", "Passé"),
      f("motivations", "Motivations"),
      f("desire", "Désir", "longtext", { help: "Ce que le personnage veut, consciemment." }),
      f("need", "Besoin", "longtext", { help: "Ce dont il a réellement besoin, souvent sans le savoir." }),
      f("flaw", "Faille"),
      f("arc_start", "Arc : état initial"),
      f("arc_end", "Arc : état final"),
      f("speech", "Façon de parler", "longtext", { help: "Tics, registre, accent, exemples de répliques." }),
      f("actor", "Comédien associé", "text"),
    ],
  },
  {
    id: "location",
    icon: "map-pin",
    name: "Lieu",
    plural: "Lieux",
    builtin: true,
    fields: [
      f("kind", "Type", "list", { options: ["Pays", "Région", "Ville", "Quartier", "Bâtiment", "Pièce", "Extérieur", "Planète", "Autre"] }),
      f("parent", "Lieu parent", "link", { target: "location", help: "Pays > ville > maison > cuisine." }),
      f("description", "Description"),
      f("mood", "Ambiance"),
      f("era", "Époque", "text"),
      f("map", "Carte ou plan", "image"),
      f("real_set", "Décor réel associé", "text"),
    ],
  },
  {
    id: "object",
    icon: "package",
    name: "Objet",
    plural: "Objets",
    builtin: true,
    fields: [
      f("description", "Description"),
      f("owner", "Propriétaire", "link", { target: "character" }),
      f("importance", "Importance dramatique"),
      f("history", "Histoire de l'objet"),
    ],
  },
  {
    id: "vehicle",
    icon: "car",
    name: "Véhicule",
    plural: "Véhicules",
    builtin: true,
    fields: [
      f("kind", "Type", "text"),
      f("model", "Modèle", "text"),
      f("era", "Époque", "text"),
      f("condition", "État", "text"),
      f("owner", "Propriétaire", "link", { target: "character" }),
      f("features", "Caractéristiques"),
    ],
  },
  {
    id: "faction",
    icon: "flag",
    name: "Faction",
    plural: "Factions",
    builtin: true,
    fields: [
      f("members", "Membres", "links", { target: "character" }),
      f("hierarchy", "Hiérarchie"),
      f("ideology", "Idéologie"),
      f("allies", "Alliés", "links", { target: "faction" }),
      f("enemies", "Ennemis", "links", { target: "faction" }),
    ],
  },
  {
    id: "event",
    icon: "calendar",
    name: "Événement",
    plural: "Événements",
    builtin: true,
    fields: [
      f("date", "Date", "date", { help: "Dans le calendrier du monde du film." }),
      f("place", "Lieu", "link", { target: "location" }),
      f("people", "Personnages impliqués", "links", { target: "character" }),
      f("consequences", "Conséquences"),
    ],
  },
  {
    id: "culture",
    icon: "landmark",
    name: "Culture",
    plural: "Cultures",
    builtin: true,
    fields: [f("customs", "Coutumes"), f("language", "Langue"), f("religion", "Religion"), f("appearance", "Apparence"), f("history", "Histoire")],
  },
  {
    id: "concept",
    icon: "lightbulb",
    name: "Concept",
    plural: "Concepts",
    builtin: true,
    fields: [
      f("kind", "Nature", "list", { options: ["Magie", "Technologie", "Loi physique", "Règle sociale", "Glossaire", "Autre"] }),
      f("description", "Description"),
    ],
  },
  {
    id: "creature",
    icon: "paw",
    name: "Créature",
    plural: "Créatures",
    builtin: true,
    fields: [f("description", "Description"), f("behavior", "Comportement"), f("shooting_needs", "Besoins de tournage")],
  },
] satisfies EntryType[]).map(localized);

export const FIELD_KINDS: { kind: FieldKind; readonly label: string }[] = (
  ["text", "longtext", "number", "date", "list", "image", "link", "links"] as const
).map((kind) => ({
  kind,
  get label() {
    return t(`bible.fieldKinds.${kind}`);
  },
}));

export const STATUSES = (["idea", "validated", "abandoned"] as const).map((id) => ({
  id,
  get label() {
    return t(`bible.statuses.${id}`);
  },
}));

/** The card shows the summary's first sentence: cut by the two-line clamp after a full stop, it ended in « .… ». */
export function firstSentence(text: string): string {
  return text.match(/^[\s\S]*?[.!?…](?=\s|$)/)?.[0] ?? text;
}

/** Words that end the part of a type's name that takes the plural: « Arme à feu » → « Armes à feu ». */
const PLURAL_STOP: Record<Language, Set<string>> = {
  fr: new Set(["de", "du", "des", "d", "à", "au", "aux", "en", "pour", "sans", "sur", "avec", "et", "ou"]),
  en: new Set(["of", "for", "with", "without", "and", "or", "to", "in", "on", "from"]),
  es: new Set(["de", "del", "a", "al", "en", "para", "sin", "sobre", "con", "y", "o"]),
};
/** Plurals that don't follow the endings. */
const PLURAL_EXCEPTIONS: Record<string, string> = { bal: "bals", carnaval: "carnavals", festival: "festivals", récital: "récitals", pneu: "pneus", bleu: "bleus", œil: "yeux", ciel: "cieux" };

/** English plural of one word: -s, -x, -z, -ch, -sh → +es; consonant + y → -ies; the rest +s. */
function pluralWordEn(w: string): string {
  const up = w === w.toUpperCase();
  if (/(s|x|z|ch|sh)$/i.test(w)) return w + (up ? "ES" : "es");
  if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + (up ? "IES" : "ies");
  return w + (up ? "S" : "s");
}

/** Spanish plural of one word: a vowel takes -s, -z becomes -ces, another consonant takes -es (accents aside). */
function pluralWordEs(w: string): string {
  const up = w === w.toUpperCase();
  if (/[aeiouáéó]$/i.test(w)) return w + (up ? "S" : "s");
  if (/z$/i.test(w)) return w.slice(0, -1) + (up ? "CES" : "ces");
  if (/s$/i.test(w) && w.length > 3) return w;
  return w + (up ? "ES" : "es");
}

/** French plural of one word: -s, -x, -z stay; -al → -aux; -au, -eau, -eu → +x; -ail stays regular; the rest +s. Keeps the case. */
function pluralWord(w: string): string {
  const lower = w.toLocaleLowerCase("fr");
  const exception = PLURAL_EXCEPTIONS[lower];
  if (exception) return w[0] + exception.slice(1);
  if (/[sxz]$/i.test(w)) return w;
  if (/al$/i.test(w)) return w.slice(0, -2) + (w === w.toUpperCase() ? "AUX" : "aux");
  if (/(au|eu)$/i.test(w)) return w + (w === w.toUpperCase() ? "X" : "x");
  return w + (w === w.toUpperCase() ? "S" : "s");
}

/**
 * Plural of a custom type's name, for its section and the filter, in the interface's language: « Planète » →
 * « Planètes », « Vaisseau spatial » → « Vaisseaux spatiaux ». French and Spanish put every word before the first
 * stop word in the plural; English only the last of them, « Space ship » → « Space ships ».
 */
export function pluralize(name: string, language: Language = getLanguage()): string {
  const words = name.trim().split(/(\s+|['’])/);
  const stop = words.findIndex((w) => PLURAL_STOP[language].has(w.toLocaleLowerCase(language)));
  const end = stop === -1 ? words.length : stop;
  const last = words.slice(0, end).findLastIndex((w) => /\p{L}/u.test(w));
  const one = language === "en" ? pluralWordEn : language === "es" ? pluralWordEs : pluralWord;
  return words.map((w, i) => (i >= end || !/\p{L}/u.test(w) || (language === "en" && i !== last) ? w : one(w))).join("");
}

/** Lowercase, without accents, one apostrophe: « Hélène » and « helene », « d’Oren » and « d'Oren » match. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘ʼ]/g, "'")
    .toLocaleLowerCase("fr")
    .trim();
}

/** A field key built from its label, unique among `taken`. */
export function fieldKey(label: string, taken: string[]): string {
  const base =
    fold(label)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "champ";
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
}
