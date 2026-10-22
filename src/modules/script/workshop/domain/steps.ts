/** The nine steps of the writing workshop (specification, 5.1). Steps 1 to 4 belong to version 1 « Écrire ». */

export type StepStatus = "empty" | "started" | "done";

export interface Step {
  n: number;
  title: string;
  intro: string;
  /** Available in this version. */
  ready: boolean;
}

export const STEPS: Step[] = [
  { n: 1, title: "Préparation", intro: "L'idée de départ, la prémisse, le thème, le genre et le ton : ce que sera le film avant d'en écrire une ligne.", ready: true },
  { n: 2, title: "Personnages", intro: "Qui veut quoi, qui s'y oppose, et comment chacun change au fil du récit.", ready: true },
  { n: 3, title: "Structure", intro: "Les grands mouvements de l'histoire et ses points clés, reliés aux scènes.", ready: true },
  { n: 4, title: "Documents préparatoires", intro: "Synopsis, séquencier, traitement et continuité dialoguée.", ready: true },
  { n: 5, title: "Écriture du scénario", intro: "Le scénario lui-même, page après page (environ une page par minute).", ready: true },
  { n: 6, title: "Réécriture", intro: "Figer une version, comparer, réécrire par passes. Les versions figées et la comparaison sont déjà dans la vue Versions.", ready: false },
  { n: 7, title: "Retours et polissage", intro: "Les avis des lecteurs et les vérifications.", ready: false },
  { n: 8, title: "Protection et diffusion", intro: "Dépôts, logline, note d'intention, dossier de présentation.", ready: false },
  { n: 9, title: "Développement", intro: "Demandes de réécriture et passage en préproduction.", ready: false },
];

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

/** A short reminder of what the audience expects from each genre; the author edits it freely. */
export const GENRE_CODES: Record<string, string[]> = {
  Drame: ["Un conflit intime qui touche le spectateur", "Des personnages qui changent profondément", "Des choix moraux sans réponse facile"],
  Comédie: ["Un personnage qui veut quelque chose avec excès", "L'escalade des situations", "Un rythme rapide, des chutes", "Une fin qui réconcilie"],
  Thriller: ["Une menace claire et croissante", "Un compte à rebours", "Des retournements", "Le spectateur en sait parfois plus que le héros"],
  Horreur: ["Une peur qui s'installe avant de frapper", "Un lieu dont on ne peut pas partir", "Des règles du monstre, puis leur transgression"],
  "Science-fiction": ["Une hypothèse sur le monde, et ses conséquences", "Des règles cohérentes", "Un enjeu humain derrière la technique"],
  Fantastique: ["Un monde ou un élément surnaturel aux règles précises", "Un prix à payer pour la magie", "L'émerveillement ou l'inquiétude"],
  Romance: ["La rencontre", "Ce qui les sépare", "Le moment où tout semble perdu", "Le choix l'un de l'autre"],
  Policier: ["Un crime au départ", "L'enquête et ses fausses pistes", "Les indices donnés au spectateur", "La révélation"],
  Guerre: ["Le groupe face à la mort", "Le prix humain de chaque victoire", "La fraternité et la perte"],
  Western: ["La frontière, la loi qui manque", "Le duel", "Un héros solitaire face à une communauté"],
  Animation: ["Un univers visuel fort", "Des personnages lisibles en silhouette", "Le rythme du gag ou de l'émotion"],
  Documentaire: ["Un point de vue d'auteur", "Une question qui guide le film", "Des personnes réelles et leur accord"],
  Aventure: ["Un voyage, un but lointain", "Des épreuves de plus en plus dures", "Le retour transformé"],
  "Comédie musicale": ["Les chansons font avancer l'histoire", "On chante quand on ne peut plus parler", "Un grand numéro final"],
};

export const TONES = [
  { key: "dark", left: "Sombre", right: "Lumineux" },
  { key: "real", left: "Réaliste", right: "Stylisé" },
  { key: "pace", left: "Lent", right: "Nerveux" },
];

export const DRAMATIC_FUNCTIONS = ["Mentor", "Allié", "Confident", "Faire-valoir", "Gardien du seuil", "Messager", "Ombre", "Amoureux", "Rival", "Victime", "Autre"];

export const OPPOSITION_KINDS = ["Personne", "Groupe", "Nature", "Société", "Soi-même"];

export const RELATION_KINDS = ["Famille", "Amour", "Amitié", "Rivalité", "Hiérarchie", "Alliance", "Haine", "Autre"];
