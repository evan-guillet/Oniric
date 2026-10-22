---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/styles.css"]
---

# Surface : l'application entière (shell projet, accueil, toutes les vues)

Mode : Operate. Tâche : écrire et organiser un film pendant de longues sessions. Refonte visuelle seulement, aucune fonction ajoutée ni retirée.

## Direction contract

THESIS: Un atelier d'écriture qui se lit comme un outil produit moderne (Jira Product Discovery, Linear) : calme, dense, net. Refuse l'interface « formulaire Windows » actuelle, faite de selects gris, de cadres violets et de bordures colorées épaisses.

OWN-WORLD: Fond gris très clair (#f4f4f5), surfaces blanches à bordure 1px (#e7e7ea) et rayon 8 à 12px, sidebar gris pâle inscrite dans son propre cadre arrondi. Texte 13px, Inter, encre #1f2128, gris secondaire #6b6f7a. Accent bleu #3d63f5 pour l'action principale, la sélection et le focus seulement. Pastilles d'état arrondies avec point coloré (bleu, ambre, rouge, vert, gris). Chips de barre d'outils 1px. Icônes Lucide, trait de 1,75. Sombre : gris neutres #17171a / #1f1f23, même logique.

STORY: L'auteur ouvre son projet, sait où il est (fil d'Ariane, titre et compteur), passe d'une vue à l'autre par la colonne iconée, et ne voit jamais l'interface lutter contre le texte.

FIRST VIEWPORT: Colonne gauche de 232px (bloc projet en haut, navigation iconée par parties, Réglages et Fermer en bas). À droite, la vue : fil d'Ariane « Projet › Vue » en 13px gris, titre 17px avec compteur gris, puis barre de chips (affichage, filtres), puis le contenu sur fond blanc. Dans Scénario : la feuille sur un bureau gris clair, liste des scènes à gauche, action principale « Exporter en PDF » en bleu à droite de la barre.

FORM: Direction imposée par l'utilisateur, tirage levé : « Il faudrait améliorer grandement l'interface comme sur les images que je te fournis » (4 images : Jira Product Discovery en kanban et en tableau, sélection multiple, palette de commandes). Canon de la catégorie joué franchement, sans clé de tirage (seed : aucune, direction fixée par la demande).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
