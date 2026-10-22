/** Types of bible entries and their fields (specification, 5.2). A type is data, so users can create their own. */

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
  builtin: boolean;
  fields: FieldDef[];
}

const f = (key: string, label: string, kind: FieldKind = "longtext", extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind, ...extra });

export const BUILTIN_TYPES: EntryType[] = [
  {
    id: "character",
    name: "Personnage",
    plural: "Personnages",
    builtin: true,
    fields: [
      f("nicknames", "Surnoms", "text"),
      f("age", "Âge", "text"),
      f("birth", "Date de naissance", "date", { help: "Dans le calendrier du monde du film : « 1944 », « an 312 de l'ère des Lunes »…" }),
      f("appearance", "Apparence"),
      f("physique", "Physique"),
      f("costume", "Costume type"),
      f("backstory", "Passé"),
      f("motivations", "Motivations"),
      f("desire", "Désir", "longtext", { help: "Ce que le personnage veut, consciemment." }),
      f("need", "Besoin", "longtext", { help: "Ce dont il a réellement besoin, souvent sans le savoir." }),
      f("flaw", "Faille"),
      f("arc_start", "Arc : état initial"),
      f("arc_end", "Arc : état final"),
      f("speech", "Façon de parler", "longtext", { help: "Tics, registre, accent, exemples de répliques." }),
      f("actor", "Comédien associé", "text"),
    ],
  },
  {
    id: "location",
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
    name: "Objet",
    plural: "Objets et accessoires",
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
    name: "Faction",
    plural: "Factions et organisations",
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
    name: "Événement",
    plural: "Événements historiques",
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
    name: "Culture",
    plural: "Cultures, peuples, espèces",
    builtin: true,
    fields: [f("customs", "Coutumes"), f("language", "Langue"), f("religion", "Religion"), f("appearance", "Apparence"), f("history", "Histoire")],
  },
  {
    id: "concept",
    name: "Concept",
    plural: "Concepts et règles du monde",
    builtin: true,
    fields: [
      f("kind", "Nature", "list", { options: ["Magie", "Technologie", "Loi physique", "Règle sociale", "Glossaire", "Autre"] }),
      f("description", "Description"),
    ],
  },
  {
    id: "creature",
    name: "Créature",
    plural: "Animaux et créatures",
    builtin: true,
    fields: [f("description", "Description"), f("behavior", "Comportement"), f("shooting_needs", "Besoins de tournage")],
  },
];

export const FIELD_KINDS: { kind: FieldKind; label: string }[] = [
  { kind: "text", label: "Texte court" },
  { kind: "longtext", label: "Texte long" },
  { kind: "number", label: "Nombre" },
  { kind: "date", label: "Date" },
  { kind: "list", label: "Liste de choix" },
  { kind: "image", label: "Image" },
  { kind: "link", label: "Lien vers une fiche" },
  { kind: "links", label: "Liens vers plusieurs fiches" },
];

export const STATUSES = [
  { id: "idea", label: "Idée" },
  { id: "validated", label: "Validé" },
  { id: "abandoned", label: "Abandonné" },
] as const;

/** Lowercase, without accents: « Hélène » and « helene » match. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
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
