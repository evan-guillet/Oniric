/** Story structure models and their key points [STR-01, STR-02]. Positions are fractions of the film. */

import { t } from "../../../../core/i18n";

export interface ModelBeat {
  key: string;
  title: string;
  help: string;
  /** Expected place in the film, from 0 to 1. */
  at: number;
}

export interface ModelPart {
  title: string;
  /** Share of the film, from 0 to 1. */
  share: number;
}

export interface StructureModel {
  id: string;
  name: string;
  /** A film by default; an episode of a series for « tv ». */
  kind?: "film" | "tv";
  parts: ModelPart[];
  beats: ModelBeat[];
}

const b = (key: string, title: string, at: number, help: string): ModelBeat => ({ key, title, at, help });

/** A model, its names read in the interface's language; ids, keys and positions stay. */
function localized(m: StructureModel): StructureModel {
  const k = `workshop.models.${m.id}`;
  return {
    ...m,
    get name() {
      return t(`${k}.name`);
    },
    parts: m.parts.map((p, i) => ({
      ...p,
      get title() {
        return t(`${k}.parts.${i}`);
      },
    })),
    beats: m.beats.map((x) => ({
      ...x,
      get title() {
        return t(`${k}.beats.${x.key}.title`);
      },
      get help() {
        return t(`${k}.beats.${x.key}.help`);
      },
    })),
  };
}

export const MODELS: StructureModel[] = ([
  {
    id: "three-acts",
    name: "Trois actes",
    parts: [
      { title: "Acte I", share: 0.25 },
      { title: "Acte II", share: 0.5 },
      { title: "Acte III", share: 0.25 },
    ],
    beats: [
      b("setup", "Exposition", 0.03, "Le monde ordinaire du personnage, ce qui lui manque."),
      b("inciting", "Incident déclencheur", 0.1, "L'événement qui bouleverse l'équilibre et lance l'histoire."),
      b("plot1", "Premier point de bascule", 0.25, "Le personnage s'engage : il n'y a plus de retour possible. Fin de l'acte I."),
      b("midpoint", "Point médian", 0.5, "Une révélation ou un retournement qui change la nature de la quête."),
      b("low", "Moment le plus bas", 0.75, "Tout semble perdu. Fin de l'acte II."),
      b("climax", "Climax", 0.9, "L'affrontement décisif."),
      b("resolution", "Dénouement", 0.98, "Le nouvel équilibre."),
    ],
  },
  {
    id: "heros-journey",
    name: "Le voyage du héros",
    parts: [
      { title: "Départ", share: 0.25 },
      { title: "Initiation", share: 0.5 },
      { title: "Retour", share: 0.25 },
    ],
    beats: [
      b("ordinary", "Le monde ordinaire", 0.02, "Le héros dans son quotidien."),
      b("call", "L'appel de l'aventure", 0.08, "Un problème, un défi, une invitation."),
      b("refusal", "Le refus de l'appel", 0.12, "La peur, l'hésitation."),
      b("mentor", "La rencontre avec le mentor", 0.17, "Conseil, objet, entraînement."),
      b("threshold", "Le passage du seuil", 0.25, "Le héros entre dans le monde extraordinaire."),
      b("tests", "Épreuves, alliés, ennemis", 0.35, "Le héros apprend les règles du nouveau monde."),
      b("approach", "L'approche de la caverne", 0.45, "La préparation de l'épreuve majeure."),
      b("ordeal", "L'épreuve suprême", 0.55, "Une mort et une renaissance symboliques."),
      b("reward", "La récompense", 0.65, "Le héros s'empare de ce qu'il cherchait."),
      b("road-back", "Le chemin du retour", 0.75, "Les conséquences le rattrapent."),
      b("resurrection", "La résurrection", 0.9, "L'ultime épreuve, le héros transformé."),
      b("elixir", "Le retour avec l'élixir", 0.98, "Il rapporte quelque chose à son monde."),
    ],
  },
  {
    id: "save-the-cat",
    name: "Les 15 beats de Blake Snyder",
    parts: [
      { title: "Acte I", share: 0.2 },
      { title: "Acte II A", share: 0.3 },
      { title: "Acte II B", share: 0.3 },
      { title: "Acte III", share: 0.2 },
    ],
    beats: [
      b("opening", "Image d'ouverture", 0.0, "Une image du monde et du héros avant l'histoire."),
      b("theme", "Thème énoncé", 0.05, "Quelqu'un dit au héros ce qu'il doit apprendre."),
      b("setup", "Mise en place", 0.05, "Le héros, son monde, ce qu'il doit changer."),
      b("catalyst", "Catalyseur", 0.1, "L'événement qui change tout."),
      b("debate", "Débat", 0.15, "Le héros hésite."),
      b("break2", "Entrée dans l'acte II", 0.2, "Le héros choisit d'agir."),
      b("bstory", "Histoire B", 0.22, "Souvent une histoire d'amour, qui porte le thème."),
      b("fun", "Promesse du concept", 0.3, "Ce que l'affiche promettait."),
      b("midpoint", "Point médian", 0.5, "Fausse victoire ou fausse défaite ; les enjeux montent."),
      b("badguys", "Les méchants se rapprochent", 0.6, "Pression extérieure et doutes intérieurs."),
      b("lost", "Tout est perdu", 0.75, "Le plus bas, souvent une mort."),
      b("dark", "La nuit noire de l'âme", 0.77, "Le héros touche le fond."),
      b("break3", "Entrée dans l'acte III", 0.8, "La solution, née des histoires A et B."),
      b("finale", "Final", 0.9, "Le héros applique ce qu'il a appris."),
      b("final-image", "Image finale", 1.0, "Le contraire de l'image d'ouverture."),
    ],
  },
  {
    id: "eight-sequences",
    name: "Les 8 séquences",
    parts: Array.from({ length: 8 }, (_, i) => ({ title: `Séquence ${String.fromCharCode(65 + i)}`, share: 0.125 })),
    beats: [
      b("a", "A — Exposition", 0.0, "Le monde, le héros, jusqu'à l'incident déclencheur."),
      b("b", "B — Prédicament", 0.125, "Le héros face au problème ; fin de l'acte I."),
      b("c", "C — Premiers obstacles", 0.25, "Premières tentatives, les solutions faciles échouent."),
      b("d", "D — Vers le point médian", 0.375, "La tension monte jusqu'au retournement central."),
      b("e", "E — Nouvelles complications", 0.5, "Les conséquences du point médian."),
      b("f", "F — Le pire", 0.625, "Tout s'effondre ; fin de l'acte II."),
      b("g", "G — Nouvelle tension", 0.75, "Le dernier combat se prépare."),
      b("h", "H — Résolution", 0.875, "Le climax et le dénouement."),
    ],
  },
  {
    id: "four-acts",
    name: "Quatre actes",
    parts: [
      { title: "Acte I", share: 0.25 },
      { title: "Acte II", share: 0.25 },
      { title: "Acte III", share: 0.25 },
      { title: "Acte IV", share: 0.25 },
    ],
    beats: [
      b("setup", "Exposition", 0.03, "Le monde du personnage et ce qui lui manque."),
      b("inciting", "Incident déclencheur", 0.1, "L'événement qui lance l'histoire."),
      b("turn1", "Premier tournant", 0.25, "Le personnage s'engage. Fin de l'acte I."),
      b("midpoint", "Point médian", 0.5, "Le retournement qui change la quête. Fin de l'acte II."),
      b("turn2", "Second tournant", 0.75, "La crise : tout semble perdu. Fin de l'acte III."),
      b("climax", "Climax", 0.9, "L'affrontement décisif."),
      b("resolution", "Dénouement", 0.98, "Le nouvel équilibre."),
    ],
  },
  {
    id: "freytag",
    name: "La pyramide de Freytag (cinq actes)",
    parts: [
      { title: "Exposition", share: 0.15 },
      { title: "Action montante", share: 0.25 },
      { title: "Climax", share: 0.2 },
      { title: "Action descendante", share: 0.25 },
      { title: "Dénouement", share: 0.15 },
    ],
    beats: [
      b("exposition", "Exposition", 0.02, "Les personnages, le lieu, la situation de départ."),
      b("exciting", "Élément perturbateur", 0.15, "Le conflit s'installe et la tension commence à monter."),
      b("rising", "Complications", 0.3, "Les obstacles s'enchaînent, les enjeux grandissent."),
      b("climax", "Climax", 0.5, "Le sommet de la pyramide : le moment où tout bascule."),
      b("tragic", "Retournement", 0.6, "Les conséquences du climax se retournent contre le héros."),
      b("suspense", "Dernier suspense", 0.8, "Un ultime espoir, ou une ultime menace, avant la fin."),
      b("catastrophe", "Dénouement", 0.95, "La catastrophe ou la résolution : le conflit est tranché."),
    ],
  },
  {
    id: "story-circle",
    name: "Le cercle de Dan Harmon",
    parts: [
      { title: "Le monde connu", share: 0.25 },
      { title: "La descente", share: 0.25 },
      { title: "La remontée", share: 0.25 },
      { title: "Le retour", share: 0.25 },
    ],
    beats: [
      b("you", "1. Un personnage", 0.0, "Dans sa zone de confort."),
      b("need", "2. Un besoin", 0.125, "Il veut quelque chose."),
      b("go", "3. Il part", 0.25, "Il entre dans une situation inconnue."),
      b("search", "4. Il cherche", 0.375, "Il s'adapte, apprend les règles."),
      b("find", "5. Il trouve", 0.5, "Il obtient ce qu'il voulait."),
      b("take", "6. Il paie", 0.625, "Il en paie le prix fort."),
      b("return", "7. Il revient", 0.75, "Il rentre dans son monde."),
      b("change", "8. Il a changé", 0.875, "Ce qu'il a vécu l'a transformé."),
    ],
  },
  {
    id: "hauge",
    name: "Les six étapes de Michael Hauge",
    parts: [
      { title: "La mise en place", share: 0.1 },
      { title: "La nouvelle situation", share: 0.15 },
      { title: "Les progrès", share: 0.25 },
      { title: "Complications et enjeux", share: 0.25 },
      { title: "L'ultime effort", share: 0.15 },
      { title: "Les suites", share: 0.1 },
    ],
    beats: [
      b("opportunity", "L'occasion", 0.1, "Ce qui fait entrer le héros dans une nouvelle situation."),
      b("change", "Le changement de plan", 0.25, "Le désir devient un but visible et précis."),
      b("no-return", "Le point de non-retour", 0.5, "Le héros s'engage totalement, il ne peut plus reculer."),
      b("setback", "Le revers majeur", 0.75, "Tout semble perdu."),
      b("climax", "Le climax", 0.9, "L'affrontement final avec le plus grand obstacle."),
      b("aftermath", "Les suites", 0.98, "La nouvelle vie du héros, transformé."),
    ],
  },
  {
    id: "drama-hour",
    name: "Série d'une heure : teaser et cinq actes",
    kind: "tv",
    parts: [
      { title: "Teaser", share: 0.06 },
      ...Array.from({ length: 5 }, (_, i) => ({ title: `Acte ${["I", "II", "III", "IV", "V"][i]}`, share: 0.188 })),
    ],
    beats: [
      b("teaser", "Teaser", 0.0, "Une accroche avant le générique : le problème de l'épisode."),
      b("act1", "Fin de l'acte I", 0.25, "L'intrigue de l'épisode est lancée, avant la première coupure."),
      b("act2", "Fin de l'acte II", 0.44, "Une complication qui donne envie de rester après la pub."),
      b("act3", "Fin de l'acte III", 0.62, "Le grand retournement de l'épisode."),
      b("act4", "Fin de l'acte IV", 0.81, "Le pire : tout semble perdu."),
      b("act5", "Résolution", 0.97, "L'intrigue se dénoue, une porte s'ouvre vers l'épisode suivant."),
    ],
  },
  {
    id: "sitcom",
    name: "Sitcom : cold open, deux actes et tag",
    kind: "tv",
    parts: [
      { title: "Cold open", share: 0.1 },
      { title: "Acte I", share: 0.42 },
      { title: "Acte II", share: 0.42 },
      { title: "Tag", share: 0.06 },
    ],
    beats: [
      b("cold-open", "Cold open", 0.0, "Une scène drôle avant le générique, parfois sans lien avec l'intrigue."),
      b("problem", "Le problème", 0.14, "Ce que le héros veut ou doit régler dans l'épisode."),
      b("act-break", "La fin de l'acte I", 0.5, "La situation empire : le plan du héros se retourne contre lui."),
      b("resolution", "La résolution", 0.88, "Tout rentre dans l'ordre, ou presque."),
      b("tag", "Tag", 0.96, "Une dernière blague après l'intrigue, souvent pendant le générique."),
    ],
  },
  { id: "free", name: "Structure libre", parts: [], beats: [] },
] satisfies StructureModel[]).map(localized);

export function modelById(id: string | null | undefined): StructureModel {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export interface PartGap {
  title: string;
  expected: number;
  actual: number | null;
  /** More than ten points away from the model. */
  off: boolean;
}

/**
 * Real share of each part against the model [STR-03]: the acts of the board, in order, stand for the model's parts.
 * `actShares` are the shares of the film of each act of the board.
 */
export function partGaps(model: StructureModel, actShares: number[]): PartGap[] {
  return model.parts.map((p, i) => {
    const actual = i < actShares.length ? actShares[i] : null;
    return { title: p.title, expected: p.share, actual, off: actual !== null && Math.abs(actual - p.share) > 0.1 };
  });
}
