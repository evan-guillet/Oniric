/** Story structure models and their key points [STR-01, STR-02]. Positions are fractions of the film. */

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
  parts: ModelPart[];
  beats: ModelBeat[];
}

const b = (key: string, title: string, at: number, help: string): ModelBeat => ({ key, title, at, help });

export const MODELS: StructureModel[] = [
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
  { id: "free", name: "Structure libre", parts: [], beats: [] },
];

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
