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

**La règle de la feuille blanche.** La page de scénario reste `paper` sur `desk` dans les deux thèmes ; aucune couleur d'interface n'entre sur la feuille, sauf les liens vers la Bible en bleu. Seul l'affichage « Sans feuille », choisi par l'auteur, retire la feuille.

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

Les vues à liste latérale gardent une colonne fixe : 340px à droite pour le panneau du Scénario, 264px pour la Bible. Le panneau du Scénario n'a pas de titre et ne montre qu'une chose à la fois : la liste des scènes, les notes (bouton « Notes ») ou les champs de la page de titre (bouton « Page de titre »). Version et Date suivent le projet tant qu'on ne tape pas dedans : la version en cours, celle que proposera « Figer » dans Versions, et la date du jour dans la langue du scénario. Une pastille « Auto » de 20px, en `accent-soft` quand elle est active, le montre et permet d'y revenir. Les mentions se choisissent dans une liste toute prête (SACD, SGDL, WGA, ©, confidentiel), et « Autre mention… » ouvre un champ libre. Sur la page imprimée, le titre est suivi du sous-titre et des auteurs ; en bas, le contact à gauche et la version, la date et la mention à droite occupent chacun une moitié de la largeur et montent depuis la marge, sans jamais se chevaucher. Ces champs s'enregistrent à mesure qu'on tape, et pendant ce temps le bureau montre la page de titre telle qu'elle s'imprime. Si elle n'est pas imprimée, elle passe à 55 % d'opacité et une ligne `muted` le dit. Ces deux boutons sont des bascules : pressés de nouveau, ils ramènent aux scènes. « Aperçu » (`BookOpen`) montre sur le bureau le script entier tel qu'il s'imprime, page de titre comprise. Les pages sont séparées de 24px, sous une ligne `muted` qui les compte. Un clic sur une scène fait défiler jusqu'à sa page, et Échap ou le bouton ramènent à l'écriture. Tant que le bureau ne montre pas l'écriture, le choix d'affichage est grisé. Les en-têtes de scène et les titres d'acte et de séquence ne sont jamais tronqués : trop longs, ils passent à la ligne. Quand l'histoire a des actes et des séquences, la liste des scènes les reprend dans l'ordre du Tableau : chaque acte et chaque séquence est un dépliant de 30px (chevron 14px `muted` qui tourne d'un quart, numéro automatique « Act. I » / « Séq. A » en `muted`, titre entier, acte en 600 `ink` et séquence en 500, nombre de scènes en `hint` à droite) ; l'en-tête d'acte reste collé en haut de la liste en défilant, et le contenu ouvert descend le long d'un filet `line` en retrait de 11px. Les plis sont retenus par projet sur l'ordinateur ; plié, un acte ou une séquence qui contient la scène du curseur passe en `accent-soft`. Sans acte ni séquence, la liste reste à plat. Le contenu principal respire avec un padding de 24px 32px 48px. Le Tableau a trois niveaux. Sur toute l'histoire, il aligne les actes en colonnes de 360px avec 14px d'écart, et chaque acte empile ses séquences et leurs scènes à la verticale ; rien ne se plie, et le « + » à droite de l'en-tête ajoute une séquence à l'acte ou une scène à la séquence. Un clic sur le titre d'un acte n'affiche que son contenu, sans le cadre ni l'en-tête de l'acte : ses séquences côte à côte en colonnes de 330px et leurs scènes à la verticale. Un clic sur le titre d'une séquence n'affiche que ses scènes, sans cadre ni en-tête, sur une seule rangée de cartes de 330px qui court d'un bord à l'autre du Tableau (16px de marge intérieure au début et à la fin de la rangée) : le curseur ↔ entre les cartes invite à cliquer-glisser, le curseur reste une main sur les cartes pour faire coulisser la rangée avec le pointeur, la molette la fait défiler aussi, et un glisser ne déclenche jamais de clic. La page du Tableau ne défile jamais à la verticale : elle tient dans la hauteur visible, et chaque acte, séquence ou rangée de scènes fait défiler son propre contenu, avec une gouttière de la largeur de la barre de défilement des deux côtés pour que les marges gauche et droite restent égales. Le fil d'Ariane suit ce niveau (Tableau › Acte › Séquence) : le titre de la vue devient l'acte ou la séquence, les niveaux au-dessus deviennent des liens, et Échap remonte d'un niveau. Un clic sur une scène ouvre sa carte ; seule la poignée (`GripVertical`), qui occupe toute la marge gauche de la carte (22px), lance un glisser. Les ajouts d'acte et de séquence sont des bandes en pointillés `line-strong` sans libellé, portant un « + » : 80px de large sur toute la hauteur pour l'acte, 40px de large (36px de haut quand les séquences sont empilées) pour la séquence ; l'ajout de scène est une carte vide en pointillés portant « + Scène ». Les couleurs se lisent par fond teinté, jamais par point dans l'en-tête : l'acte prend sa couleur en fond (16 % sur `panel`, bordure à 40 %), la séquence reste neutre (`sunken`), chaque scène prend la couleur de sa gommette de la même façon. La barre d'outils du Tableau ne porte que l'affichage et le filtre. Les actes, séquences et scènes sont numérotés d'office selon leur place : « Act. » et chiffres romains pour les actes (« Act. I Le départ », titre en 14px semi-gras, sans pastille), « Séq. » et lettres continues sur toute l'histoire pour les séquences (« Séq. A Les ferrailleurs »), « Scè. » et chiffres arabes pour les scènes (« Scè. 12 ») ; le numéro est en `muted` sur sa propre ligne au-dessus du titre, qui reste en `ink` ; les cartes et les en-têtes de séquence ne montrent pas de durée en huitièmes ; un numéro tapé à la main en tête de titre s'efface devant le numéro automatique. Renommer et supprimer passent par un bouton « ⋯ » qui ouvre un petit menu : à côté du « + » dans les en-têtes d'acte et de séquence, en haut à droite d'une carte de scène au survol. Le titre d'un acte ou d'une séquence s'ouvre au clic sans changer de fond au survol. Actes, séquences et cartes partagent la même marge intérieure (10px) et le même écart entre ce qu'ils contiennent (8px) ; la poignée d'une carte (22px) s'aligne sur celle d'un en-tête et son écart (16 + 6px) ; la carte ouverte à droite édite aussi l'en-tête, et « Supprimer la scène » l'envoie dans la corbeille des scènes coupées. L'affichage « Canevas » montre la même histoire en arbre, avec les mêmes en-têtes et les mêmes cartes, sur un fond `canvas` pointillé (points `hint` à 40 %, pas de 22px) : le titre du film en haut à gauche, un tronc vertical vers chaque acte, chaque acte relié par un coude à la rangée de ses séquences (40px d'écart, une flèche de l'une à la suivante), chaque séquence en tête de la colonne de ses scènes (26px d'écart, une flèche vers chacune) ; nœuds et cartes font 300px. Les traits font 1,5px, coudes arrondis à 12px, pointes en chevron de 7px ; le tronc et les coudes vers les actes restent en `hint`, tout ce qui est dans un acte prend sa couleur (70 % mêlée à `hint`), et les ajouts « + » pendent au bout d'un trait en pointillés. Un chevron à gauche du titre plie un acte ou une séquence jusqu'à son en-tête ; plié, le nœud laisse dépasser sous lui le bord d'une feuille (`line-strong`), et les plis sont retenus par projet sur l'ordinateur. « Tout déplier » et « Tout plier » ouvrent la barre d'outils du canevas, séparés du zoom par un filet. Chaque trait entre deux cartes porte un « + » qui insère là un acte, une séquence ou une scène : invisible au repos, il apparaît au survol du trait en pastille ronde de 20px (`panel`, bordure de la couleur du trait), et la carte en dessous ne s'allume pas. Le canevas défile dans les deux sens et se déplace en X comme en Y en tirant n'importe où, cartes comprises, au-delà de 4px (un déplacement n'ouvre jamais de carte), ou au bouton du milieu ; poignées, champs et petits boutons gardent leur geste. La molette défile à la verticale, Maj + molette à l'horizontale ; il zoome de 15 à 160 % avec Ctrl + molette ou les boutons « − », pourcentage (retour à 100 %), « + » et « Tout voir » en bas à droite. Un clic sur un acte ou une séquence ne garde que son arbre, qui commence en haut à gauche, comme dans les colonnes ; l'affichage choisi est retenu sur l'ordinateur. Dans la Bible, un clic sur une carte ouvre la fiche dans une modale de 1000px au-dessus des cartes, fermée par la croix en haut à droite, Échap ou un clic à côté. Sous l'en-tête (image, nom, puis une seule rangée : type et statut à gauche ; à droite « Enregistré », « Supprimer » et un « ⋯ » qui range Dupliquer, Archiver, avec une seconde ligne `muted` qui dit ce que fait l'archivage et où retrouver la fiche, et Historique ; « Enregistré » en `muted` 12px avec un point de 6px, gris pendant « Modifications… », rouge pour « Non enregistré », absent avant la première modification), la fiche tient en deux colonnes : à gauche l'écriture (résumé court, champs de texte long, contenu, notes), à droite un rail de 280px séparé par un filet `line` (scènes où la fiche apparaît, une par ligne en `ink` et tronquée, les six premières puis « Voir les N scènes », « Mentionnée dans », puis autres noms, champs courts, étiquettes, liens et galerie). Notes et Galerie vides ne sont qu'un bouton discret « + Notes » / « + Galerie ». Sous 760px de large, le rail passe sous l'écriture. Dans la fiche, les notifications prennent leur propre bande en bas de la modale (`panel-2`, filet en haut, sans ombre) au lieu de couvrir les champs ; « Dupliquer » en affiche une, avec « Ouvrir ». Le voile derrière une modale est le jeton `--backdrop` : 32 % d'encre en clair, 62 % de noir en sombre. « + Lier… » garde sa largeur propre (26px de haut) après les étiquettes liées. L'accueil de la Bible est une grille de catégories, une carte par type (minmax(260px), rayon 10px, padding 16px) : icône 40px sur `sunken`, pluriel en 15px semi-gras, compte en `muted`, puis les trois premiers noms (les plus présents dans le scénario pour les personnages et les lieux) et « et N autres » sur deux lignes tenues. Une catégorie vide passe en dernier, en pointillés, sans fond, avec « Aucune fiche » ; la toute dernière carte, « Nouveau type », pointillée elle aussi avec son icône et son nom en bleu atelier, ouvre Types de fiches sur un type neuf. Un type personnalisé choisit son icône dans une grille de 41 icônes Lucide (boutons de 34px, `role="radio"`, la choisie en `accent-soft`), rangée par clé dans la colonne `icon` de `bible_type` (migration 0003) ; sans icône, la fiche simple. Cliquer une carte descend dans la catégorie : le fil d'Ariane devient Bible › Personnages, le titre prend le pluriel et le compte, la recherche se limite à la catégorie (« Rechercher dans Personnages… »), et la barre porte « Retour » (bouton `ghost`) à gauche, le tri et « Archivées » (bouton à bascule, seulement s'il y en a) à droite. « Nouvelle fiche », bouton principal, est toujours au bout de l'en-tête, après Détecter et Types de fiches ; dans une catégorie, il en préremplit le type. Une recherche depuis l'accueil montre les fiches trouvées par catégorie, dont le nom mène à la catégorie. Détecter et Types de fiches sont des bascules (`aria-pressed`) : pressées de nouveau, elles ramènent aux catégories. On remonte par « Retour », par « Bible » dans le fil d'Ariane, par Échap, ou par la Bible dans la barre latérale, et le focus revient sur la carte de la catégorie quittée. Le filtre par type a disparu, les catégories le remplacent. Le cadre d'image (128px, rayon 12px) est lui-même le bouton : vide, en pointillés `line-strong` sur `sunken` avec l'icône `ImagePlus` et « Choisir une image », il passe en bleu atelier au survol ; rempli, « Changer » apparaît sur un voile sombre au survol et une croix ronde en haut à droite retire l'image. Les champs image des types de fiches prennent le même cadre. Dans l'Atelier, les jauges de ton sont cinq crans côte à côte entre les deux pôles : le cran du milieu porte un petit trait, les crans entre le milieu et le choix se remplissent à 35 % de bleu atelier, le cran choisi en plein ; les flèches du clavier passent d'un cran à l'autre. La page Versions tient en deux zones : à droite un fil de 300px sur fond `sunken`, séparé par un filet `line` (au-dessus de la comparaison sous 960px), la version actuelle en tête (pastille « En cours ») puis les versions figées de la plus récente à la plus ancienne, chacune avec sa date, ses pages, ses scènes et l'écart de scènes avec la précédente, et en dessous les scènes coupées à réintégrer ; un clic sur une version la prend comme référence (étiquette « Référence », bordure `accent-line` et halo `accent-soft` de 3px) face à la version actuelle (« Comparée »), et ses actions (revenir, copier l'empreinte, retirer) passent par un « ⋯ » en haut à droite de la carte. À gauche, la comparaison : un titre qui dit ce qui a changé, les deux versions choisies et un bouton pour les intervertir, quatre chiffres (scènes, pages, lignes, scènes touchées), des chips pour filtrer par sorte de changement, une recherche, puis chaque scène touchée en deux colonnes côte à côte avec son en-tête collant ; les scènes déplacées restent neutres, le violet de l'intrigue n'y apparaît pas. Sans version figée, la page explique à quoi sert une version avec un petit exemple de comparaison. La page Scénario n'a plus de bouton « Exporter » : l'export passe par le menu du projet, et Ctrl + P imprime le PDF. La feuille de scénario est centrée sur le bureau avec 32px de marge. L'accueil est une colonne centrée de 760px.

Le rythme repose sur 4, 6, 8, 16, 24 et 32px ; les écarts internes des listes sont de 1px. Sous 1180px, la navigation se réduit à une colonne d'icônes de 64px (titres de parties remplacés par un trait, libellés masqués mais lus par les lecteurs d'écran), le panneau du Scénario passe à 280px et le bureau à 20px 16px.

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

Coins doucement arrondis, toujours plus ronds à mesure que l'objet est grand : 4px pour les touches clavier et étiquettes de version, 6px (`--radius`) pour les contrôles (boutons, champs, éléments de navigation), 8px pour les cartes, séquences et encarts, 10px (`--radius-lg`) pour les cadres de structure (navigation, panneau de vue, panneaux, listes, notifications), 12px pour les dialogues et le logo. Tout ce qui est une étiquette (chips, pastilles d'état) est en pilule (999px). Les points d'état sont des cercles de 6 à 8px. Bordures toujours à 1px ; seule la touche clavier porte un bas de 2px. Les groupes de boutons se collent bord à bord et n'arrondissent que leurs extrémités.

## Components

### Buttons
Précis et discrets : la plupart des boutons sont blancs, seul le principal est bleu.
- **Shape :** hauteur `--control-h` (32px) et coins `--control-r` (8px), 0 12px de marge, 13px 500, icône de 16px en `muted` à 7px du libellé ; 28px / 7px en petit, 38px / 9px en grand, 22px / 6px en minuscule. Dans l'en-tête de vue (`header-tools`), boutons, champs, sélecteurs et choix segmentés montent à 34px / 9px, comme sur la Bible.
- **Secondaire (par défaut) :** fond `panel`, bordure `line-strong`, texte `ink-2` en 500, ombre `--shadow-sm`.
- **Principal :** fond et bordure `accent`, texte `accent-ink`, icône en couleur du texte, un liseré clair de 1px en haut (inset) et une ombre bleutée légère.
- **Hover / Focus :** survol en `panel-2`, bordure un peu plus marquée et texte `ink` (principal : `accent-hover`), pression en `nav-on` sans ombre, transitions de 120ms `ease-out` ; focus par contour de 2px `focus` décalé de 2px.
- **Choix segmenté (`Segmented`) :** pour passer d'un affichage à l'autre (Scénario, Tableau), jamais un select. Un rail `--seg-track` cerclé de `line`, 2px de marge ; chaque choix est un bouton pressé (`aria-pressed`) sans bordure, `muted`, survol en `hover` ; le choix en cours devient une petite surface `--seg-on` (anneau `line`, ombre basse), texte `ink` et icône `accent`. Sous 1180px, seules les icônes restent.
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
- **Fiches de la Bible :** Un type porte son nom au singulier (sélecteurs, « Ajouter une fiche : … ») et son pluriel simple (sa carte de catégorie, son titre), sans complément : « Objets », pas « Objets et accessoires » ; le pluriel d'un type personnalisé se déduit du nom, jusqu'à la première préposition (« Armes à feu »). Les textes français prennent une espace insécable dans les guillemets et avant les deux-points. 8px de rayon, 12px 14px de marge. À côté du nom, un carré de 32px (rayon 8px, `sunken`) porte l'icône du type ; une fiche illustrée y met sa propre image, recadrée au carré, à la place de l'icône. La carte ne montre que la première phrase du résumé, pour que la coupe à deux lignes ne finisse jamais en « .… ». Le pied aligne « N scènes » (personnages et lieux) et la pastille de statut, seulement quand il reste quelque chose à faire : « Idée » en ambre (`st-draft`), « Abandonné » en gris ; « Validé », où une fiche finit, ne s'affiche pas. Seul le nom est un bouton, dans un titre (niveau 2 dans une catégorie, 3 sous les sections d'une recherche) ; son `::after` couvre la carte, le résumé et le pied le décrivent (`aria-describedby`). La fiche s'ouvre le focus sur le nom ; la fermer rend le focus à sa carte, ou à « Nouvelle fiche » (dans l'en-tête) quand elle a été supprimée. « Aucune fiche ne correspond » vit dans un `role="status"` toujours présent.
- **Détection de la Bible :** un groupe par sorte de nom (Personnages, Lieux), chacun avec une case « tout cocher » à trois états et le compte coché / trouvé. Les noms douteux (doublon probable, sous-lieu, rôle sans nom) restent décochés, leur nom en `ink-2` et la raison en badge gris à droite ; un doublon propose « Ajouter comme autre nom ». Le bouton « Créer N fiches » est à gauche d'un pied de page collé en bas de la zone qui défile, hors de portée des notifications. La suppression d'une fiche se fait sans confirmation : la notification propose « Annuler ».

### Inputs / Fields
- **Style :** 32px, bordure 1px `line-strong`, fond `panel`, coins de 8px ; selects sans relief natif, avec la même ombre basse que les boutons, le chevron Lucide gris à 10px du bord et le survol en `panel-2` ; recherche avec loupe à gauche.
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
- **Affichages :** un choix segmenté en tête de l'en-tête, séparé de Notes, Page de titre et Aperçu par un filet, retenu sur l'ordinateur ; il ne change ni la pagination, ni les exports, ni l'impression. « Pages » (`Files`) : les feuilles comme à l'impression. « Continu » (`ScrollText`) : une seule feuille, chaque saut de page devenu un trait pointillé `line-strong` d'un bord à l'autre, le numéro de page en `hint` 11px à droite ; « (SUITE) » et « (À SUIVRE) » disparaissent. « Sans feuille » (`Feather`) : ni feuille, ni ombre, ni saut de page ; le texte, en `ink`, est posé à même `panel`, le bloc de texte (et non la page) centré, curseur, sélection et liens en bleu atelier.
- **Barre d'éléments :** au-dessus de la ligne du curseur, huit boutons de 30px, chacun une icône Lucide de 16px en `muted` : `Clapperboard` en-tête de scène, `AlignLeft` action, `UserRound` personnage, `Parentheses` parenthèse, `MessageSquareQuote` dialogue, `ChevronsRight` transition, `Video` plan, `Captions` texte à l'écran. Seul le type en cours porte son libellé, juste après l'icône, puis son chiffre de raccourci dans une petite touche (10.5px, coins de 4px), le tout en `accent-soft` / `accent`. La barre se cache quand on tape, mais reste au-dessus de la ligne du curseur quand on se déplace aux flèches, Début, Fin ou Page préc. / suiv. Tenir Ctrl fait revenir la barre et écrit le chiffre à côté de chaque icône (Ctrl + 1 à 8). Le libellé et le raccourci complet sont aussi dans l'infobulle et le nom accessible.

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
- **Don't** colorer la feuille selon le thème : elle reste blanche à encre noire (l'affichage « Sans feuille » n'a pas de feuille).
- **Don't** utiliser le violet `plot` ailleurs que sur les pastilles de temps forts.
- **Don't** mettre en capitales un libellé qui n'est pas un en-tête de scène.
- **Don't** utiliser d'ombre dure décalée ni de dégradé décoratif.
