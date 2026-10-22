---
name: Oniric
description: Atelier d'écriture de film, local et calme, qui se lit comme un outil produit moderne.
colors:
  canvas: "#f3f3f5"
  panel: "#ffffff"
  panel-2: "#f6f6f8"
  sunken: "#f9f9fb"
  nav-on: "#e7e7eb"
  desk: "#ebecef"
  ink: "#1f2128"
  ink-2: "#3b3e47"
  muted: "#676b76"
  hint: "#8f939c"
  line: "#e6e7ea"
  line-strong: "#d5d7dc"
  accent: "#3b5fe8"
  accent-hover: "#2f50d4"
  accent-ink: "#ffffff"
  accent-soft: "#eef2ff"
  accent-line: "#c8d3fb"
  ok: "#1d7a43"
  ok-dot: "#22a35a"
  ok-soft: "#edf8f1"
  ok-line: "#bfe3cc"
  warning: "#9a5b00"
  warning-dot: "#f0a020"
  warning-soft: "#fff6e5"
  warning-line: "#f3d9a6"
  danger: "#b42323"
  danger-dot: "#e5484d"
  danger-soft: "#fdf0f0"
  danger-line: "#f4c7c7"
  gray-dot: "#a3a6ae"
  plot: "#6941c6"
  plot-soft: "#f4f0fe"
  plot-line: "#ddd2fb"
  paper: "#ffffff"
  paper-ink: "#111111"
typography:
  display:
    fontFamily: "Inter Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "24px"
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"cv11\", \"ss03\""
  body-small:
    fontFamily: "Inter Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  caption:
    fontFamily: "Inter Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
  slug:
    fontFamily: "Inter Variable, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    letterSpacing: "0.01em"
  screenplay:
    fontFamily: "Courier Prime, monospace"
    fontSize: "12pt"
    fontWeight: 400
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  pill: "999px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "30px"
  button-hover:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "30px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-ink}"
  button-on:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "30px"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 11px"
    height: "26px"
  chip-on:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  badge:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "20px"
  badge-ok:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  count:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.muted}"
    rounded: "5px"
    padding: "0 6px"
    height: "18px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "30px"
  nav-link-on:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
  dialog:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "20px 22px 16px"
    width: "440px"
---

# Design System: Oniric

## Overview

**Creative North Star: "L'établi silencieux"**

Oniric est un atelier d'écriture qui se lit comme un outil produit moderne : calme, dense, net. Tout l'écran est construit en couches grises très proches les unes des autres, inscrites dans des cadres arrondis à bordure d'un pixel, pour que le seul élément à fort contraste soit le texte de l'auteur, et en particulier la feuille de scénario blanche posée sur son bureau gris.

La densité est celle d'un outil de travail utilisé pendant des heures : texte courant à 13px, contrôles de 30px de haut, barres d'outils de 46px. La couleur ne décore jamais ; un seul bleu porte l'action principale, la sélection et le focus, et une petite famille de pastilles à point coloré porte les états. Les icônes sont des traits fins (Lucide, trait 1,75) en gris secondaire, qui ne prennent l'encre qu'à l'état actif.

Le monde refuse explicitement l'interface « formulaire Windows » qu'il remplace : selects gris en relief, cadres violets, bordures colorées épaisses. Le clair et le sombre suivent Windows et partagent exactement la même logique de couches ; seule la feuille reste blanche dans les deux.

**Key Characteristics:**
- Fond gris très clair, surfaces blanches cerclées de 1px, rayons de 6 à 12px.
- Une colonne de navigation iconée dans son propre cadre arrondi, séparée du panneau de vue.
- En-tête de vue : fil d'Ariane gris, titre 17px, compteur gris en pastille.
- Un seul accent bleu, réservé à l'action, à la sélection et au focus.
- Pastilles d'état arrondies avec point coloré (vert, ambre, rouge, gris).
- Ombres douces et basses ; la profondeur vient surtout des bordures et des tons.
- La page de scénario garde ses métriques d'impression, à l'écran comme sur papier.

## Colors

Une palette de gris neutres à peine bleutés, un bleu d'action unique, et quatre couleurs d'état utilisées en triplets doux (texte, point, fond, bordure).

### Primary
- **Bleu atelier** (`accent`) : bouton principal (« Exporter en PDF », « Nouveau projet »), scène sélectionnée, chips et boutons actifs, liens, anneau de focus, couleur des cases et curseurs. Survol en `accent-hover`. Ses variantes `accent-soft` (fond de sélection, halo de focus, `::selection`) et `accent-line` (bordure d'un élément actif) l'accompagnent toujours ; le bleu plein n'apparaît que sur l'action principale et le texte actif.

### Tertiary
- **Violet intrigue** (`plot`, `plot-soft`, `plot-line`) : uniquement les pastilles des temps forts de la structure (« Premier point de bascule », « Climax »). Jamais en cadre ni en bordure de panneau.

### Neutral
- **Gris établi** (`canvas`) : fond de l'application derrière les deux cadres.
- **Blanc panneau** (`panel`) : panneau de vue, barres d'outils, cartes, champs, boutons secondaires.
- **Gris voile** (`panel-2`) : survol des boutons, fond des compteurs et pastilles neutres.
- **Gris retrait** (`sunken`) : fond de la colonne de navigation, du tableau et des encarts d'aide ; survol des lignes de liste.
- **Gris navigation active** (`nav-on`) : état pressé d'un bouton.
- **Bureau** (`desk`) : le plan sur lequel la feuille de scénario est posée, et les intervalles entre pages.
- **Encre** (`ink`) : titres et texte principal. **Encre douce** (`ink-2`) : texte de boutons, résumés, libellés de champs.
- **Gris secondaire** (`muted`) : fil d'Ariane, métadonnées, icônes au repos, libellés de barre d'outils. **Gris indice** (`hint`) : texte d'aide dans les éléments vides de la feuille.
- **Trait** (`line`) : toutes les bordures de surfaces et séparateurs. **Trait appuyé** (`line-strong`) : bordures des contrôles (boutons, champs, chips), chevrons du fil d'Ariane, poignée de défilement.
- **Papier** (`paper`, `paper-ink`) : la feuille de scénario, blanche à encre presque noire quel que soit le thème.

### États
- **Validé** (`ok`, `ok-dot`, `ok-soft`, `ok-line`) : statut « Validée », état « Enregistré ».
- **En cours** (`warning`, …) : statut « Premier jet », avertissement d'enregistrement, carte mise en évidence.
- **À reprendre** (`danger`, …) : statut « À réécrire », erreurs, bouton destructif.
- **À faire** (`gray-dot`) : point gris du statut « À écrire », enregistrement en cours.

Le thème sombre (`prefers-color-scheme: dark`) redéfinit chaque jeton sur des gris neutres (`#17171a` pour le fond, `#1f1f23` pour les panneaux) avec un bleu éclairci (`#6d8cff`) ; les valeurs sombres sont listées dans `.impeccable/design.json`.

### Named Rules
**La règle du bleu unique.** Le bleu plein ne sert qu'à trois choses : l'action principale de la vue, la sélection, le focus. Une vue n'a qu'un seul bouton principal.

**La règle du triplet d'état.** Un état s'exprime par un point plein (`*-dot`) sur un fond doux (`*-soft`) cerclé d'un trait doux (`*-line`), texte en couleur foncée (`ok`, `warning`, `danger`). Jamais d'aplat saturé ni de bordure colorée épaisse.

**La règle de la feuille blanche.** La page de scénario reste `paper` sur `desk` dans les deux thèmes ; aucune couleur d'interface n'entre sur la feuille, sauf les liens vers la Bible en bleu.

## Typography

**Police d'interface :** Inter Variable (avec Segoe UI Variable Text, Segoe UI, system-ui)
**Police de la feuille :** Courier Prime 12pt (avec monospace)

**Character :** Inter, serré et légèrement négatif sur les titres, porte une interface dense et précise ; Courier Prime porte le texte du film, la continuité et les comparaisons de versions, pour que le scénario garde partout la voix de la page imprimée. Les variantes `cv11` et `ss03` d'Inter sont actives sur toute l'interface.

### Hierarchy
- **Display** (600, 24px, -0.02em) : le nom de l'application sur l'accueil.
- **Headline** (600, 17px, 24px, -0.015em) : titre de vue dans l'en-tête, titre d'un état vide.
- **Title** (600, 14 à 15px) : titres de panneaux et `h3` (14px), titres de dialogues (15px).
- **Body** (400, 13px, 1.45) : tout le texte courant de l'interface.
- **Body small** (400, 12.5px) : fil d'Ariane, résumés de cartes, libellés de champs (en 500).
- **Label** (500, 12px) : chips, boutons de barre d'outils, libellés de barre d'outils.
- **Caption** (500, 11 à 11.5px) : intitulés de parties de la navigation, barre d'état, pastilles, compteurs.
- **Slug** (600, 11.5px, 0.01em, majuscules) : les en-têtes de scène hors de la feuille (liste des scènes, cartes du tableau, comparaisons de versions), parce qu'un en-tête de scène s'écrit en majuscules.
- **Screenplay** (Courier Prime 400, 12pt, interlignage du format) : la feuille de scénario, réglée par le format (français ou américain).

Les nombres (numéros de scène, durées, compteurs, barre d'état) utilisent `font-variant-numeric: tabular-nums`.

### Named Rules
**La règle des métriques d'impression.** La feuille de scénario suit la pagination de l'impression : police, taille, interlignage et marges viennent du format et ne sont jamais ajustés pour l'écran.

**La règle des majuscules de scène.** Les majuscules sont réservées aux en-têtes de scène, qui sont des majuscules dans le scénario lui-même. Aucun autre libellé n'est mis en capitales.

## Layout

L'application est une grille à deux cadres sur le fond `canvas` : à gauche la colonne de navigation (240px), à droite le panneau de vue ; les deux flottent à 8px des bords et l'un de l'autre. Le panneau empile, de haut en bas : l'en-tête de vue (fil d'Ariane, titre et compteur, padding 12px 20px), une barre d'outils de chips et de sélecteurs (46px minimum, padding 8px 16px, écart 8px), le contenu, puis une barre d'état de 28px.

Les vues à liste latérale gardent une colonne fixe à gauche : 248px pour la liste des scènes du Scénario (plus 300px de notes à droite si ouvertes), 264px pour la Bible. Le contenu principal respire avec un padding de 24px 32px 48px. Le Tableau a trois niveaux. Sur toute l'histoire, il aligne les actes en colonnes de 328px avec 14px d'écart, et chaque acte empile ses séquences et leurs scènes à la verticale ; un chevron à droite de l'en-tête plie l'acte ou la séquence sur place. Un clic sur le titre d'un acte n'affiche que lui, avec ses séquences côte à côte en colonnes de 300px (220px pliées) et leurs scènes à la verticale. Un clic sur le titre d'une séquence n'affiche qu'elle, ses scènes réparties en grille (280px minimum, 1280px au plus). Le fil d'Ariane suit ce niveau (Tableau › Acte › Séquence) : le titre de la vue devient l'acte ou la séquence, les niveaux au-dessus deviennent des liens, et Échap remonte d'un niveau. Un clic sur une scène ouvre sa carte ; seule la poignée (`GripVertical`), qui occupe toute la marge gauche de la carte (22px), lance un glisser. Les ajouts d'acte et de séquence sont des bandes en pointillés `line-strong` sans libellé, portant un « + » : 80px de large sur toute la hauteur pour l'acte, 40px de large (36px de haut quand les séquences sont empilées) pour la séquence. La feuille de scénario est centrée sur le bureau avec 32px de marge. L'accueil est une colonne centrée de 760px.

Le rythme repose sur 4, 6, 8, 16, 24 et 32px ; les écarts internes des listes sont de 1px. Sous 1180px, la navigation se réduit à une colonne d'icônes de 64px (titres de parties remplacés par un trait, libellés masqués mais lus par les lecteurs d'écran), la liste des scènes passe à 196px et le bureau à 20px 16px.

## Elevation & Depth

Hybride, à dominante tonale. La profondeur vient d'abord de la superposition de gris proches (`canvas` sous `sunken` sous `panel`) et des bordures `line` ; les ombres restent basses, diffuses et teintées d'encre, jamais décalées. Elles se renforcent au survol (cartes) et pour ce qui flotte au-dessus du travail (dialogues, notifications, panneau de carte).

### Shadow Vocabulary
- **Pose** (`--shadow-sm`) : boutons, panneau de vue, cartes au repos, élément de navigation actif (avec un anneau `line`).
- **Soulèvement** (`--shadow-md`) : carte survolée, logo de l'accueil.
- **Flottant** (`--shadow-lg`) : dialogues, notifications, panneau latéral de carte.
- **Feuille** (`--sheet-shadow`) : la page de scénario sur le bureau.
- **Halo** (`box-shadow: 0 0 0 3px`) : focus des champs et carte sélectionnée en `accent-soft`, carte mise en évidence en `warning-soft`.

### Named Rules
**La règle du trait avant l'ombre.** Une surface se sépare d'abord par sa bordure de 1px et son ton ; l'ombre ne fait que confirmer. Jamais d'ombre dure décalée.

## Shapes

Coins doucement arrondis, toujours plus ronds à mesure que l'objet est grand : 4px pour les touches clavier et étiquettes de version, 6px (`--radius`) pour les contrôles (boutons, champs, éléments de navigation), 8px pour les cartes, séquences et encarts, 10px (`--radius-lg`) pour les cadres de structure (navigation, panneau de vue, panneaux, listes, notifications), 12px pour les dialogues et le logo. Tout ce qui est une étiquette (chips, pastilles d'état, pastilles d'acte) est en pilule (999px). Les points d'état sont des cercles de 6 à 8px. Bordures toujours à 1px ; seule la touche clavier porte un bas de 2px. Les groupes de boutons se collent bord à bord et n'arrondissent que leurs extrémités.

## Components

### Buttons
Précis et discrets : la plupart des boutons sont blancs, seul le principal est bleu.
- **Shape :** coins de 6px, hauteur 30px (26px en petit, 36px en grand, 22px en minuscule), icône de 15px en `muted`.
- **Secondaire (par défaut) :** fond `panel`, bordure `line-strong`, texte `ink-2` en 500, ombre `--shadow-sm`.
- **Principal :** fond et bordure `accent`, texte `accent-ink`, icône en couleur du texte, ombre bleutée légère.
- **Hover / Focus :** survol en `panel-2` et texte `ink` (principal : `accent-hover`), pression en `nav-on`, transitions de 120ms `ease-out` ; focus par contour de 2px `focus` décalé de 1px.
- **Actif (`.on`) :** fond `accent-soft`, bordure `accent-line`, texte et icône `accent`.
- **Fantôme :** sans bordure ni ombre, survol en `hover`. **Destructif :** texte `danger`, bordure `danger-line`, survol `danger-soft`.

### Chips
- **Style :** pilules de 26px, bordure 1px `line-strong`, fond `panel`, texte 12px 500 `ink-2`.
- **State :** survol `panel-2` ; sélectionnée en `accent-soft` / `accent-line` / `accent`.

### Pastilles d'état et compteur
- **Pastille :** pilule de 20px, 11.5px 500, fond `panel-2`, bordure `line` ; les statuts ajoutent un point de 6px et le triplet de leur état.
- **Compteur :** à droite du titre de vue, 18px de haut, coins de 5px, fond `panel-2`, bordure `line`, 11px 500 `muted`, chiffres tabulaires.

### Cards / Containers
- **Corner Style :** 8px pour les cartes de scène, 10px pour les panneaux et listes.
- **Background :** `panel` sur `sunken` (Tableau) ou sur `canvas`.
- **Shadow Strategy :** `--shadow-sm` au repos, `--shadow-md` et bordure `line-strong` au survol ; sélection par bordure `accent` et halo de 3px.
- **Border :** 1px `line` ; pied de carte séparé par un trait `line`.
- **Internal Padding :** 10px 12px pour une carte, 18px 20px pour un panneau.

### Inputs / Fields
- **Style :** 30px, bordure 1px `line-strong`, fond `panel`, coins de 6px ; selects sans relief natif avec chevron Lucide gris, recherche avec loupe à gauche.
- **Focus :** bordure `accent` et halo de 3px `accent-soft`, sans contour natif ; survol en bordure `muted`.
- **Error :** encart `danger-soft` cerclé de `danger-line`, texte `danger`.

### Navigation
- **Style :** colonne `sunken` dans son cadre arrondi de 10px ; bloc projet en haut (logo, titre 13.5px 600), parties titrées en caption `muted`, Réglages et Fermer en bas.
- **Éléments :** 30px, icône Lucide 16px `muted`, texte `ink-2`, survol `hover`.
- **Actif :** fond `panel`, anneau `line` et `--shadow-sm`, texte et icône `ink` en 500 : l'élément actif ressemble à une petite surface posée dans la colonne.
- **À venir :** texte `muted` et étiquette de version (2.0, 3.0) cerclée de 4px.

### En-tête de vue
Fil d'Ariane « Projet › Partie » en 12.5px `muted`, chevrons Lucide 14px en `line-strong` ; dessous, titre de vue en headline suivi du compteur. Séparé de la barre d'outils par un trait `line`.

### Barre d'état
28px sous le contenu, 11.5px `muted` chiffres tabulaires ; l'état d'enregistrement s'annonce par un point de 7px entouré d'un halo de 3px dans les couleurs de son état.

### Feuille de scénario
La page `paper` sur le `desk`, avec `--sheet-shadow` et un intervalle de 28px en `desk` entre les pages ; curseur et sélection en bleu atelier. Courier Prime aux métriques du format.

## Do's and Don'ts

### Do:
- **Do** séparer chaque surface par une bordure de 1px `line` et un ton avant toute ombre.
- **Do** réserver le bleu `accent` à l'action principale, à la sélection et au focus ; une seule action principale par vue.
- **Do** exprimer un état par le triplet point / fond doux / trait doux de sa couleur.
- **Do** utiliser des icônes Lucide au trait de 1,75, en `muted` au repos et en `ink` ou `accent` à l'état actif.
- **Do** garder le texte courant à 13px et les contrôles à 30px de haut.
- **Do** passer toute couleur par les jetons CSS pour que le thème sombre suive automatiquement.
- **Do** garder les en-têtes de scène en majuscules (11.5px 600) partout où ils apparaissent hors de la feuille.

### Don't:
- **Don't** revenir aux selects gris en relief, aux cadres violets ou aux bordures colorées épaisses de l'ancienne interface.
- **Don't** modifier la police, la taille, l'interlignage ou les marges de la feuille de scénario pour l'écran.
- **Don't** colorer la feuille selon le thème : elle reste blanche à encre noire.
- **Don't** utiliser le violet `plot` ailleurs que sur les pastilles de temps forts.
- **Don't** mettre en capitales un libellé qui n'est pas un en-tête de scène.
- **Don't** utiliser d'ombre dure décalée ni de dégradé décoratif.
