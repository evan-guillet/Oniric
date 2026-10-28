/** The nine steps of the writing workshop (specification, 5.1). Steps 1 to 4 belong to version 1 « Écrire ». */

import { t } from "../../../../core/i18n";

export type StepStatus = "empty" | "started" | "done";

export interface Step {
  n: number;
  title: string;
  intro: string;
  /** Available in this version. */
  ready: boolean;
}

export const STEPS: Step[] = ([
  { n: 1, title: "Préparation", intro: "L'idée de départ, la prémisse, le thème, le genre et le ton : ce que sera le film avant d'en écrire une ligne.", ready: true },
  { n: 2, title: "Personnages", intro: "Qui veut quoi, qui s'y oppose, et comment chacun change au fil du récit.", ready: true },
  { n: 3, title: "Structure", intro: "Les grands mouvements de l'histoire et ses points clés, reliés aux scènes.", ready: true },
  { n: 4, title: "Documents préparatoires", intro: "Synopsis, séquencier, traitement et continuité dialoguée.", ready: true },
  { n: 5, title: "Écriture du scénario", intro: "Le scénario lui-même, page après page (environ une page par minute).", ready: true },
  { n: 6, title: "Réécriture", intro: "Figer une version, comparer, réécrire par passes. Les versions figées et la comparaison sont déjà dans la vue Versions.", ready: false },
  { n: 7, title: "Retours et polissage", intro: "Les avis des lecteurs et les vérifications.", ready: false },
  { n: 8, title: "Protection et diffusion", intro: "Dépôts, logline, note d'intention, dossier de présentation.", ready: false },
  { n: 9, title: "Développement", intro: "Demandes de réécriture et passage en préproduction.", ready: false },
] satisfies Step[]).map((step) => ({
  ...step,
  get title() {
    return t(`workshop.steps.${step.n}.title`);
  },
  get intro() {
    return t(`workshop.steps.${step.n}.intro`);
  },
}));

export const GENRES = [
  "Drame",
  "Comédie",
  "Thriller",
  "Horreur",
  "Science-fiction",
  "Fantastique",
  "Romance",
  "Policier",
  "Guerre",
  "Western",
  "Animation",
  "Documentaire",
  "Aventure",
  "Comédie musicale",
];

/**
 * The lists below hold what the fields store, in French; each is shown in the interface's language. A value typed or
 * kept from elsewhere shows as it is.
 */
export const choiceLabel = (list: "genres" | "functions" | "oppositions" | "relations", value: string) =>
  t(`workshop.${list}.${value}`, { defaultValue: value });

/** A short reminder of what the audience expects from each genre, in the interface's language; the author edits it freely. */
export function genreCodes(genre: string): string[] {
  const codes = t(`workshop.genreCodes.${genre}`, { returnObjects: true, defaultValue: [] }) as unknown;
  return Array.isArray(codes) ? (codes as string[]) : [];
}

export const TONES = (["dark", "real", "pace"] as const).map((key) => ({
  key,
  get left() {
    return t(`workshop.tones.${key}.left`);
  },
  get right() {
    return t(`workshop.tones.${key}.right`);
  },
}));

export const DRAMATIC_FUNCTIONS = ["Mentor", "Allié", "Confident", "Faire-valoir", "Gardien du seuil", "Messager", "Ombre", "Amoureux", "Rival", "Victime", "Autre"];

export const OPPOSITION_KINDS = ["Personne", "Groupe", "Nature", "Société", "Soi-même"];

export const RELATION_KINDS = ["Famille", "Amour", "Amitié", "Rivalité", "Hiérarchie", "Alliance", "Haine", "Autre"];
