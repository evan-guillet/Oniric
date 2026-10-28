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

**La règle de la feuille blanche.** La page de scénario reste `paper` sur `desk` dans les deux thèmes ; aucune couleur d'interface n'entre sur la feuille, sauf les liens vers la Bible en bleu. À l'écriture, le Scénario s'affiche sans feuille, ou en cartes de scène ; la feuille blanche reste celle de l'aperçu, de la page de titre et de l'impression.

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
- **Caption** (500, 11 à 12px) : intitulés de parties de la navigation (12px), barre d'état, pastilles, compteurs.
- **Slug** (600, 11.5px, 0.01em, majuscules) : les en-têtes de scène hors de la feuille (liste des scènes, cartes du tableau, comparaisons de versions), parce qu'un en-tête de scène s'écrit en majuscules.
- **Screenplay** (Courier Prime 400, 12pt, interlignage du format) : la feuille de scénario, réglée par le format. Les formats fournis reprennent les modèles de Final Draft, rangés par genre dans les listes (Cinéma : français, américain, américain en français, allemand ou espagnol, Cole et Haag, Warner Bros., BBC ; Télévision : sitcom multi-caméra, sitcom BBC en studio ; Théâtre : traditionnel, moderne, français ; Audio : podcast), chacun avec une ligne d'explication en `muted` sous son nom. Un élément peut être centré, souligné ou en double interligne (le dialogue des sitcoms) : chaque ligne prend alors deux rangées de la page, à l'écran comme à l'impression.

Les nombres (numéros de scène, durées, compteurs, barre d'état) utilisent `font-variant-numeric: tabular-nums`.

### Named Rules
**La règle des métriques d'impression.** La feuille de scénario suit la pagination de l'impression : police, taille, interlignage et marges viennent du format et ne sont jamais ajustés pour l'écran.

**La règle des majuscules de scène.** Les majuscules sont réservées aux en-têtes de scène, qui sont des majuscules dans le scénario lui-même. Aucun autre libellé n'est mis en capitales.

## Layout

L'application est une grille à deux cadres sur le fond `canvas` : à gauche la colonne de navigation (240px), à droite le panneau de vue ; les deux flottent à 8px des bords et l'un de l'autre. Le panneau empile, de haut en bas : l'en-tête de vue (fil d'Ariane, titre et compteur, padding 12px 20px), une barre d'outils de chips et de sélecteurs (46px minimum, padding 8px 16px, écart 8px), le contenu, puis une barre d'état de 28px.

Les vues à liste latérale gardent une colonne fixe : 340px à droite pour le panneau du Scénario, 264px pour la Bible. Le panneau du Scénario n'a pas de titre et ne montre qu'une chose à la fois : la liste des scènes (onglet « Scènes », `ListTree`), les notes (onglet « Notes ») ou les informations du script (onglet « Informations », `FileText`), qui sont les champs de la page de titre. Ce panneau se règle comme les notes et ne change rien au bureau ; il commence directement par ses champs, sans ligne d'explication. La version et la date n'ont pas de champ : la page imprime toujours la version en cours, celle que proposera « Figer » dans Versions, et la date du jour dans la langue du scénario. « Écrit par » commence avec un seul champ ; « + Plus » (bouton `ghost` en bleu atelier) en ajoute un dessous, et chaque nom peut être retiré par sa croix dès qu'il y en a deux. Le contact a un champ par ligne qu’il imprime, dans cet ordre : Nom, Adresse, Téléphone, E-mail, Agent, puis « Autres lignes » en texte libre. Sous la légende « Contact », une ligne `muted` 12px dit que ces champs viennent du profil, suivie de « Modifier le profil » (bouton texte `accent`) qui ouvre les Réglages sur Profil. Un champ suit le profil tant qu’on ne le change pas, et suit ses changements ; changé, il ne vaut que pour ce script et son libellé (12px 500 `muted`) porte à droite « Reprendre le profil » (bouton texte `muted`, `RotateCcw` 13px) ; retaper la valeur du profil le remet à le suivre. Vider un champ changé le retire de la page. Une page de titre d’avant ces champs, ou importée avec son contact, garde ce contact dans « Autres lignes » sans y ajouter le profil. Les mentions se choisissent dans une liste toute prête (SACD, SGDL, WGA, ©, confidentiel), et « Autre mention… » ouvre un champ libre. Sur la page imprimée, le titre est suivi du sous-titre et des auteurs, centrés sur la feuille et non sur le bloc de texte (la marge de reliure est plus large) ; en bas, le contact à gauche et la version, la date et la mention à droite occupent chacun une moitié de la largeur et montent depuis la marge, sans jamais se chevaucher. Ces champs s'enregistrent à mesure qu'on tape, sans le dire. Il n'y a pas de case pour l'imprimer ou non : dès qu'elle a du contenu, elle ouvre le PDF et les exports. Dans les notes, « Créer une note » est la première carte de la liste, à la forme des notes mais en pointillé `warning-line` sans fond (titre `warning` en 600 avec `Plus`, en dessous « Sur le passage sélectionné, ou la ligne du curseur » en `muted` 12px ; au survol, bord plein et fond `warning-soft`) : elle annote la sélection et ouvre aussitôt le champ, et tient lieu d'état vide ; sous les notes ouvertes, après un filet `line`, une ligne discrète « Archivées » (chevron, texte `muted` 12.5px semi-gras, compte en pastille `sunken`, seulement s'il y en a) déplie les notes archivées, vertes, sous elle. La carte elle-même dit où en est la note, sans point de couleur : ouverte, fond `warning-soft`, bordure `warning-line` et citation en `warning` ; archivée, les mêmes en `ok`. Chaque note porte en haut à droite un « ⋯ » qui range Modifier, Archiver (avec une seconde ligne `muted` qui dit où la retrouver) ou Désarchiver, et Supprimer. Le texte d'une note se lit en clair ; Modifier le remplace par un champ, enregistré en le quittant ou par Ctrl + Entrée, et Échap annule. Scènes, Notes et Informations sont les trois onglets d'un choix segmenté « Panneau », Scènes en premier : l'onglet du panneau ouvert est toujours marqué, et pressé de nouveau il reste ouvert. Aperçu est un bouton à bascule à part (`BookOpen`, `aria-pressed`), juste après « Affichage » puisque tous deux règlent le bureau, puis un filet le sépare des onglets du panneau ; il ne change que le bureau : on peut remplir les informations avec l'aperçu à côté, et la page de titre s'y imprime à mesure. Les notes annotent le texte : les ouvrir quitte l'aperçu, et ouvrir l'aperçu depuis les notes ramène les scènes. « Aperçu » (`BookOpen`) montre sur le bureau le script entier tel qu'il s'imprime, page de titre comprise. Les pages sont séparées de 24px, sans ligne qui les compte. Pendant l'aperçu, avec les scènes au panneau, un clic sur une scène fait défiler jusqu'à sa page, et Échap ou le bouton ramènent à l'écriture. Les en-têtes de scène et les titres d'acte et de séquence ne sont jamais tronqués : trop longs, ils passent à la ligne. Quand l'histoire a des actes et des séquences, la liste des scènes les reprend dans l'ordre du Tableau : chaque acte et chaque séquence est un dépliant de 30px (chevron 14px `muted` qui tourne d'un quart, numéro automatique « Act. I » / « Séq. A » en `muted`, titre entier, acte en 600 `ink` et séquence en 500, nombre de scènes en `hint` à droite) ; l'en-tête d'acte reste collé tout en haut de la liste en défilant, sans jour au-dessus où passeraient les scènes, et le contenu ouvert descend le long d'un filet `line` en retrait de 11px. Les plis sont retenus par projet sur l'ordinateur ; plié, un acte ou une séquence qui contient la scène du curseur passe en `accent-soft`. Au-dessus d'une liste découpée, une bande fixe de 36px (filet `line` dessous), au-dessus de la zone qui défile, si bien que la barre de défilement commence sous elle, donne le nombre de scènes en `muted` et deux boutons de 26px, « Tout déplier » (`ChevronsUpDown`) et « Tout plier » (`ChevronsDownUp`) ; celui qui n'a plus rien à faire s'éteint, et les en-têtes d'acte se collent en haut de la liste, juste sous la bande. Sans acte ni séquence, la liste reste à plat, sans cette bande. Un clic droit sur un acte, une séquence ou une scène (ou la touche menu, Maj + F10) ouvre au pointeur un petit menu, celui du « ⋯ », avec « Supprimer l'acte… », « Supprimer la séquence… » ou « Supprimer la scène… » en `danger` ; la ligne visée garde le fond `hover` et un filet `line-strong` tant qu'il est ouvert. La suppression demande toujours confirmation dans une modale qui nomme la partie (« Act. II · L'initiation ») et dit ce que deviennent ses scènes, avec les mêmes mots que le Tableau : un acte laisse ses séquences et ses scènes sans acte, une séquence laisse ses scènes à la précédente, une scène part dans la corbeille des scènes coupées. Le contenu principal respire avec un padding de 24px 32px 48px. Tableau et Chronologie sont les deux affichages d'une même vue, Structure (`Layers` dans la navigation) : un choix segmenté compact « Tableau » (`SquareKanban`) / « Chronologie » (`ChartGantt`) se tient au bout de l'en-tête, toujours à la même place quoi que l'affichage ajoute avant lui, et le dernier choisi est retenu sur l'ordinateur. Le Tableau est le canevas décrit plus bas (les colonnes d'actes et les lignes d'intrigue ont été retirées). Le fil d'Ariane suit le niveau ouvert (Tableau › Acte › Séquence) : le titre de la vue devient l'acte ou la séquence, les niveaux au-dessus deviennent des liens, et Échap remonte d'un niveau. Un clic sur une scène ouvre sa carte ; seule la poignée (`GripVertical`), qui occupe toute la marge gauche de la carte (22px), lance un glisser. Les ajouts d'acte et de séquence sont des carrés de 52px en pointillés `line-strong` sans libellé, portant un « + » ; l'ajout de scène est une carte vide en pointillés portant « + Scène ». Les couleurs se lisent par fond teinté, jamais par point dans l'en-tête : l'acte prend sa couleur en fond (16 % sur `panel`, bordure à 40 %), la séquence reste neutre (`sunken`), chaque scène prend la couleur de sa gommette de la même façon. La barre d'outils du Tableau ne porte que le filtre. Les actes, séquences et scènes sont numérotés d'office selon leur place : « Act. » et chiffres romains pour les actes (« Act. I Le départ », titre en 14px semi-gras, sans pastille), « Séq. » et lettres continues sur toute l'histoire pour les séquences (« Séq. A Les ferrailleurs »), « Scè. » et chiffres arabes pour les scènes (« Scè. 12 ») ; le numéro est en `muted` sur sa propre ligne au-dessus du titre, qui reste en `ink` ; les cartes et les en-têtes de séquence ne montrent pas de durée en huitièmes ; un numéro tapé à la main en tête de titre s'efface devant le numéro automatique. Renommer et supprimer passent par un bouton « ⋯ » qui ouvre un petit menu : à côté du « + » dans les en-têtes d'acte et de séquence, en haut à droite d'une carte de scène au survol. Le titre d'un acte ou d'une séquence s'ouvre au clic sans changer de fond au survol. Actes, séquences et cartes partagent la même marge intérieure (10px) et le même écart entre ce qu'ils contiennent (8px) ; la poignée d'une carte (22px) s'aligne sur celle d'un en-tête et son écart (16 + 6px) ; la carte ouverte à droite édite aussi l'en-tête, et « Supprimer la scène » l'envoie dans la corbeille des scènes coupées. Le canevas montre l'histoire en arbre sur un fond `canvas` pointillé (points `hint` à 40 %, pas de 22px) : le titre du film en haut à gauche, un tronc vertical vers chaque acte, chaque acte relié par un coude à la rangée de ses séquences (40px d'écart, une flèche de l'une à la suivante), chaque séquence en tête de la colonne de ses scènes (26px d'écart, une flèche vers chacune) ; nœuds et cartes font 300px. Les traits font 1,5px, coudes arrondis à 12px, pointes en chevron de 7px ; le tronc et les coudes vers les actes restent en `hint`, tout ce qui est dans un acte prend sa couleur (70 % mêlée à `hint`), et les ajouts « + » pendent au bout d'un trait en pointillés. Un chevron à gauche du titre plie un acte ou une séquence jusqu'à son en-tête ; plié, le nœud laisse dépasser sous lui le bord d'une feuille (`line-strong`), et les plis sont retenus par projet sur l'ordinateur. « Tout déplier » et « Tout plier » ouvrent la barre d'outils du canevas, séparés du zoom par un filet. Chaque trait entre deux cartes porte un « + » qui insère là un acte, une séquence ou une scène : invisible au repos, il apparaît au survol du trait en pastille ronde de 20px (`panel`, bordure de la couleur du trait), et la carte en dessous ne s'allume pas. Le canevas a la largeur de la vue et défile à la verticale avec la molette ou la barre de droite. Chaque rangée de scènes défile seule à l'horizontale, le film, les actes, les séquences et les autres rangées restant en place : on la tire, cartes comprises, au-delà de 4px (un déplacement n'ouvre jamais de carte), ou Maj + molette ; elle court jusqu'au bord droit, sans barre, et ce qui passe la pointe de flèche de sa séquence s'efface sur 16px. Entre les cartes, le curseur est une double flèche (`ew-resize`) ; sur une carte, la main, puisqu'un clic l'ouvre. Le bouton du milieu déplace le canevas dans les deux sens. Poignées, champs et petits boutons gardent leur geste. Le filet au-dessus des étiquettes d'une carte prend la couleur de sa bordure, au repos, au survol comme sélectionnée. Sélectionnée, la carte garde sa propre couleur, plus claire et plus saturée (oklch : clarté + 0,06, chroma × 1,4), en bordure et en lueur autour d'elle (18px) ; sans couleur, elle prend le bleu atelier de la même façon. Le canevas zoome de 15 à 160 % avec Ctrl + molette ou les boutons « − », pourcentage (retour à 100 %), « + » et « Tout voir » (toute la hauteur) en bas à droite. La Chronologie n'a pas de règle des pages : à 100 %, toute l'histoire tient dans la fenêtre (à moins que les titres entiers des séquences ne la dépassent déjà), la dernière scène au bord des noms, sans blanc à l'un ou l'autre bout ; elle zoome en largeur seulement, jusqu'à 1 200 %, avec Ctrl + molette autour du pointeur ou les boutons « − », pourcentage (retour à 100 %) et « + » en bas à droite des pistes, et défile alors de côté. Un clic sur un acte ou une séquence ne garde que son arbre, qui commence en haut à gauche. Dans la Bible, un clic sur une carte ouvre la fiche en page, à la place des cartes, sous une barre qui porte « Retour » (bouton texte) ; le fil d'Ariane devient Bible › Personnages › Luke Skywalker, et Échap, « Retour » ou la catégorie dans le fil ramènent à la liste quittée, le focus sur la carte de la fiche. Sous l'en-tête (image, nom, puis une seule rangée : type et statut à gauche ; à droite « Enregistré », « Supprimer » (destructif plein) et un « ⋯ » qui range Dupliquer, Archiver, avec une seconde ligne `muted` qui dit ce que fait l'archivage et où retrouver la fiche, et Historique ; « Enregistré » en `muted` 12px avec un point de 6px, gris pendant « Modifications… », rouge pour « Non enregistré », absent avant la première modification), la fiche tient en deux colonnes : à gauche l'écriture (résumé court, champs de texte long, contenu, notes), à droite un rail de 280px séparé par un filet `line` (scènes où la fiche apparaît, une par ligne en `ink` et tronquée, les six premières puis « Voir les N scènes », « Mentionnée dans », puis autres noms, champs courts, étiquettes, liens et galerie). Notes et Galerie vides ne sont qu'un bouton discret « + Notes » / « + Galerie ». Sous 760px de large, le rail passe sous l'écriture. « Dupliquer » affiche une notification, avec « Ouvrir ». Le voile derrière une modale est le jeton `--backdrop` : 32 % d'encre en clair, 62 % de noir en sombre. « + Lier… » garde sa largeur propre (26px de haut) après les étiquettes liées. L'accueil de la Bible n'a pas de titre : une carte par type qui a des fiches (minmax(220px), rayon 10px, bordée `line` sur `panel`), un seul bouton qui ouvre la catégorie, avec son icône 34px sur `sunken`, son pluriel en 14.5px semi-gras et son nombre de fiches à droite en `muted` ; au survol, bord `line-strong` et fond `panel-2`. Les fiches elles-mêmes se trouvent dans la catégorie. La dernière carte de la grille est « Nouveau type » : en pointillés `accent-line` sans fond, « + Nouveau type » centré en 14px semi-gras bleu atelier, « Planète, sortilège, recette… avec ses propres champs » en infobulle ; au survol, bord plein et fond `accent-soft`. Elle ouvre la modale du type (nom, pluriel calculé, icône, champs) ; un type personnalisé se modifie ou se supprime dans la même modale, par « Modifier le type » dans la barre de sa catégorie. Dessous, sous l'étiquette « Sans fiche encore » en capitales `muted` 11px, les types vides en pastilles pointillées (icône, pluriel, `Plus`), chacune crée sa première fiche ; sans type vide, la partie disparaît. Les personnages et les lieux du scénario qui n'ont pas de fiche sont détectés d'eux-mêmes, à mesure qu'on écrit : ils prennent place parmi les fiches de leur type, avec le badge « Détecté » (`accent` sur `accent-soft`, bordure `accent-line`), et la fiche se crée en les ouvrant. Les noms douteux (rôles comme « GARDE 2 », doublons probables, parties d'un lieu) ne s'y montrent pas. Un type personnalisé choisit son icône dans une grille de 41 icônes Lucide (boutons de 34px, `role="radio"`, la choisie en `accent-soft`), rangée par clé dans la colonne `icon` de `bible_type` (migration 0003) ; sans icône, la fiche simple. Cliquer une carte descend dans la catégorie : le fil d'Ariane devient Bible › Personnages, le titre prend le pluriel et le compte, la recherche se limite à la catégorie (« Rechercher dans Personnages… »), et la barre porte « Retour » (bouton texte) à gauche, le tri et « Archivées » (bouton à bascule, seulement s'il y en a) à droite. « Nouvelle fiche », bouton principal, est seul au bout de l'en-tête, après la recherche ; dans une catégorie, il en préremplit le type. Une recherche depuis l'accueil montre les fiches trouvées par catégorie, dont le nom mène à la catégorie. On remonte par « Retour », par « Bible » dans le fil d'Ariane, par Échap, ou par la Bible dans la barre latérale, et le focus revient sur la carte de la catégorie quittée. Le filtre par type a disparu, les catégories le remplacent. Le cadre d'image (128px, rayon 12px) est lui-même le bouton : vide, en pointillés `line-strong` sur `sunken` avec l'icône `ImagePlus` et « Choisir une image », il passe en bleu atelier au survol ; rempli, « Changer » apparaît sur un voile sombre au survol et une croix ronde en haut à droite retire l'image. Les champs image des types de fiches prennent le même cadre. Le panneau de l'Atelier (264px à droite) commence par l'avancement : « 3 sur 5 terminées » (le nombre en `ink` semi-gras, le reste en `muted` 12,5px) et, à droite, le bouton « Affichage » (`Eye`) qui range « Aide » (avec sa seconde ligne `muted`) et une case par étape affichée ; dessous, une barre de 4px en cinq segments, un par étape de la version, `line` à faire, `warning-dot` commencée, `ok-dot` terminée. Les étapes forment un fil : chacune porte son numéro dans un rond de 22px (bordure `line-strong`, `warning-dot` sur `warning-soft` une fois commencée, plein `ok-dot` avec une coche une fois terminée, bordure `ink-2` pour l'étape ouverte) relié au suivant par un trait de 1,5px (`line`, `ok-line` sous une étape terminée) ; le titre suit sans numéro, l'état est lu aux lecteurs d'écran. Les étapes de la 2.0 viennent sous l'intitulé « Version 2.0 » (petites capitales `muted`), rond en pointillés et titre en `muted`. Dans l'Atelier, les jauges de ton sont cinq crans côte à côte entre les deux pôles : le cran du milieu porte un petit trait, les crans entre le milieu et le choix se remplissent à 35 % de bleu atelier, le cran choisi en plein ; les flèches du clavier passent d'un cran à l'autre. Versions tient sur un seul écran, sans sous-page ni barre sous l’en-tête, et se lit dans l’ordre : la question dans l’en-tête, la réponse au centre, le détail à droite. L’en-tête ne porte que les deux versions comparées, deux listes reliées par une flèche (la référence, puis la version comparée), et « Figer » (bouton principal, `Lock`), seul endroit d’où l’on fige avec la page sans version. Le texte de ce qui a changé occupe la page. À droite, un panneau `panel` de 300px (264px sous 1100px ; sous 760px, il passe sous le texte, sur un tiers de la hauteur), filet `line` à gauche, ne montre qu’une chose à la fois, comme celui du Scénario : en tête, un choix segmenté de la largeur du panneau, « Scènes », « Versions » et « Coupées », ces deux derniers suivis de leur nombre en `hint`. « Scènes » commence par une ligne discrète, sans bordure : ce que la liste montre (« Modifications 14 » en 600 `ink-2`, le nombre en `hint`, un chevron qui se retourne ; en `accent` dès qu’elle ne montre plus les modifications), qui ouvre le choix Modifications, Modifiées, Ajoutées, Supprimées, Déplacées ou Tout le scénario avec leurs nombres, puis à droite les lignes « +50 −0 » en `ok` et `danger` (en `hint` quand c’est zéro) et le bouton « Tout replier » / « Tout déplier » (26px, sans bordure). « Versions » est un fil : un rond de 22px par version relié au suivant par un filet `line` (crayon sur `ok-soft` pour la version actuelle, cadenas, et `accent-soft` pour la référence) ; la version actuelle donne ses pages et ses scènes avec leur écart à la dernière version figée dans une petite pastille, chaque version figée sa date, ses pages et ses scènes. Une version figée est un bouton : la choisir en fait la référence, comparée au texte actuel, et elle passe en `accent-soft` avec l’étiquette « Référence » ; son « ⋯ » range « Revenir à cette version », « Copier l’empreinte » (avec ses huit premiers caractères) et « Retirer de la liste ». « Coupées » range les scènes supprimées, la plus récente en haut, chacune dans une carte bordée `line` : l’en-tête en capitales et un « ⋯ » avec « Supprimer définitivement », la première ligne de son texte en Courier Prime 12px `muted`, puis la date en `hint` et « Réintégrer » (`Undo2`). Sous chaque onglet, une note `hint` 12px dit ce qu’on y trouve. Sur fond `sunken`, chaque scène est une carte `panel` centrée, de la largeur d’une carte de scène du Scénario (le texte à sa largeur imprimée, 0,6 pouce de marge de chaque côté), à l’en-tête collant : chevron, « Scè. 9 », en-tête de scène, la sorte seulement si elle n’est pas « modifiée », puis à droite « +2 −0 », la case « Relue » (cochée, elle replie la carte, passe en `ok` et remplace le point de la liste par une coche ; rien n’est gardé d’une comparaison à l’autre) et, quand la scène existe dans la version actuelle, un « ⋯ » qui l’ouvre dans le Scénario ; une scène supprimée du texte actuel qui attend encore parmi les scènes coupées porte « Réintégrer » (`Undo2`). Le texte est mis en page comme dans le Scénario, selon le format du projet : sa police et sa taille, chaque élément à son retrait, sa largeur, son alignement et sa casse (personnages et dialogues en retrait, transitions à droite), et l’espace du format au-dessus de chaque élément, sauf en tête de scène, sous un pli et entre une ligne retirée et sa réécriture. Les numéros (Inter 11px `hint`) sont dans la marge de gauche, au niveau de la première ligne de l’élément : une ligne retirée porte « − » en `danger` sur `danger-soft`, une ligne ajoutée son numéro en `ok` sur `ok-soft`, les mots changés surlignés en `danger-line` / `ok-line` ; chaque suite de changements montre ses lignes retirées puis ses lignes ajoutées. Le fond de couleur court sur toute la largeur de la carte. Une scène sans texte n’ouvre que son en-tête. Les lignes identiques au-delà de trois autour d’un changement se replient en une ligne de 32px, « 14 lignes identiques » centré en `muted`, avec dans la gouttière une flèche vers le haut (`ArrowUpToLine`) en tête de scène, vers le bas (`ArrowDownToLine`) en fin, et `UnfoldVertical` entre deux changements, où un filet `line` court de part et d’autre du texte ; au survol, le tout passe en bleu atelier, et un clic les montre. Le texte est toujours unifié. Les scènes déplacées restent neutres, le violet de l’intrigue n’y apparaît pas. Sans version figée, l’en-tête est vide, le panneau s’ouvre sur « Versions » et la page explique à quoi sert une version, avec « Figer la version actuelle » et un petit exemple de comparaison, dans la même écriture unifiée. La page Scénario n'a plus de bouton « Exporter » : l'export passe par le menu du projet (Importer…, Exporter…, « Ouvrir le dossier du projet » (`FolderOpen`), qui ouvre son dossier dans l'Explorateur et en donne le chemin complet sur une seconde ligne `muted`, puis, après un filet, « Réglages » (`Settings`) ; les trois premiers aussi dans la palette, le chemin en détail à droite). La fenêtre porte ce chemin pour titre, dans la barre des tâches et Alt + Tab, et l'icône de l'application est le logo, la lune sur violet nuit, et Ctrl + P imprime le PDF. La feuille de scénario est centrée sur le bureau avec 32px de marge. L'accueil est une colonne centrée de 640px, sans menu : le nom (logo 44px, Display, slogan en `muted`), deux entrées côte à côte et de même taille, « Nouveau projet » (icône sur fond `accent`) et « Ouvrir un projet… » (icône sur `sunken`), chacune avec une ligne `muted` qui dit ce qu'elle fait, puis les projets récents (liste sur `panel`, une croix au survol pour retirer de la liste ; vide, un cadre en pointillés). En bas, la version à gauche et « Réglages » (bouton `ghost`) à droite. Importer un scénario se fait dans un projet, restaurer une sauvegarde dans Réglages.

Un projet s’ouvre sur son **Tableau de bord** (`LayoutDashboard`), en tête de la navigation, juste sous « Rechercher » et au-dessus des parties ; le fil d’Ariane n’y montre que le projet. La page reprend les sections des Statistiques (titre 15px, cartes `panel` cerclées de `line`, rayon 10px, `--shadow-sm`), dans une colonne de 1040px au plus, 32px entre les sections, sans action dans l’en-tête. De haut en bas : « Reprendre l’écriture », une carte qui donne la scène où était le curseur la dernière fois qu’on écrivait (retenue par projet sur l’ordinateur ; à défaut la première) : numéro « Scè. 12 » en `muted`, puis l’acte et la séquence séparés d’un point `line-strong`, l’en-tête en capitales 13px 600, deux lignes du résumé ou, sans résumé, du texte de la scène ; à droite le seul bouton principal de la page, « Ouvrir la scène » (`PenLine`), et « Page 14 sur 96 » en `muted`. Script vide, la carte devient « Commencer l’écriture » avec « Écrire la première scène ». Puis côte à côte (l’un sous l’autre sous 1100px) : « À traiter », un tableau en groupes (« Notes ouvertes », « Scènes à réécrire », « Sans fiche dans la Bible »), chacun titré en `muted` 12px avec son compte en pastille, trois lignes au plus de 34px (point d’état : `warning-dot` pour une note, `danger-dot` pour une scène à réécrire, `accent` pour les noms sans fiche ; texte tronqué ; « Scè. N » en `muted` à droite), « et N autres » dessous ; une ligne ouvre sa scène, ou la Bible. Rien en attente, une seule ligne au point `ok-dot`. Et « Activité d’écriture », tirée du journal d’écriture : une rangée de quatre chiffres séparés par des filets (aujourd’hui, 7 derniers jours, temps sur 7 jours, jours d’affilée ; deux par deux sous 1380px), puis une barre par jour sur quatre semaines, `--series-1` pour les jours écrits et un trait `line` pour les autres, une date par semaine et « Aujourd’hui » au bout ; avec un objectif de mots par jour (Réglages, Écriture), « Aujourd’hui » se lit « 312 / 500 mots » (l’objectif en `muted`), un pointillé `ok` le trace à travers le graphique et les jours qui l’atteignent passent en `ok` ; au survol, la barre fonce et la ligne sous le graphique donne le jour, les mots et le temps. « Avancement » reprend les tuiles (pages, durée estimée, scènes, mots) et la barre des statuts des Statistiques. « Le projet » enfin, une ligne de 44px par vue (icône `muted`, nom en 500, ce qu’elle contient en `muted`, chevron), l’Atelier avec la barre de ses étapes : la ligne ouvre la vue.

Le rythme repose sur 4, 6, 8, 16, 24 et 32px ; les écarts internes des listes sont de 1px. Sous 1180px, la navigation se réduit à une colonne d'icônes de 64px (titres de parties remplacés par un trait court de 20px, libellés masqués mais lus par les lecteurs d'écran), le panneau du Scénario passe à 280px et le bureau à 20px 16px.

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
- **Hover / Focus :** un seul jeu d'états pour tous les contrôles, boutons, listes de choix (`Select`) et boutons de menu (« Affichage ») : survol en `panel-2`, bordure `--control-line-hover` (`line-strong` mêlé de 30 % de `muted`) et texte `ink` (principal : `accent-hover`), pression en `nav-on` sans ombre (principal : `--accent-press`), transitions de 120ms `ease-out` ; ouverts, une liste ou un bouton de menu gardent l'aspect du survol et retournent leur chevron ; focus par contour de 2px `focus` décalé de 2px. Les boutons sans cadre (fantômes, icônes, « ⋯ », croix de fermeture, plier et déplier) se surlignent de `--control-hover` (`ink` à 11 %), et de `--control-press` (16 %) pressés.
- **Choix segmenté (`Segmented`) :** pour passer d'un affichage à l'autre (Scénario, Tableau), jamais un select. Un rail `--seg-track` cerclé de `line`, 2px de marge ; chaque choix est un bouton pressé (`aria-pressed`) sans bordure, `muted`, survol en `hover` ; le choix en cours devient une petite surface `--seg-on` (anneau `line`, ombre basse), texte `ink` et icône `accent`. Sous 1180px, seules les icônes restent.
- **Actif (`.on`) :** fond `accent-soft`, bordure `accent-line`, texte et icône `accent`.
- **Fantôme :** sans bordure ni ombre, même au survol ; le survol le surligne d'un fond `ink` à 11 % et passe texte et icône en `ink`. **Texte (`.text`) :** sans cadre ni fond, ni au repos ni au survol, sans marge intérieure : son icône ou son texte tombe sur le bord de sa colonne ; texte et icône en `ink-2`, et au survol le libellé passe en `ink` et se souligne (1px, décalé de 4px). C'est « Retour », « + Notes », « + Galerie », « Voir les N scènes » et « Afficher plus » des Statistiques. **Destructif :** le même partout, dans une modale comme sur une fiche : fond `danger-soft`, bordure `danger-line`, texte et icône `danger` ; au survol, aplat `--danger-solid` (`danger-dot` assombri de 18 %) et texte blanc, pressé `--danger-press` (32 %). Le destructif fantôme (« Retirer » dans une ligne) reste sans cadre, en `danger`, et se surligne de `danger-soft`, jamais de gris. **Confirmer toute suppression :** supprimer ou retirer un élément (fiche, image, note, idée, référence, relation, champ, auteur, format, projet récent, partie du scénario) ouvre toujours une modale, `confirmRemoval` : le titre nomme l'élément en question (« Supprimer « Luke Skywalker » ? »), une ligne dit ce qu'il devient, puis « Annuler » et le bouton rouge « Supprimer » ou « Retirer ». Seule exception : une ligne encore vide part sans question, il n'y a rien à perdre. Délier une scène ou ôter une étiquette n'est pas supprimer. **Barres de défilement :** elles ne longent jamais une partie fixe. Une bande ou un en-tête qui reste en place est hors de la zone qui défile ; dans la Chronologie, l'en-tête (actes, séquences, scènes) et la colonne des noms restent fixes, la barre horizontale court sous les pistes seulement et la barre verticale à droite des noms seulement. La suppression qui reste en vue, sur la fiche, porte en plus l'icône `Trash2`.

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
- **Détection de la Bible :** un groupe par sorte de nom (Personnages, Lieux), chacun avec une case « tout cocher » à trois états et le compte coché / trouvé. Les noms douteux (doublon probable, sous-lieu, rôle sans nom) restent décochés, leur nom en `ink-2` et la raison en badge gris à droite ; un doublon propose « Ajouter comme autre nom ». Le bouton « Créer N fiches » est à gauche d'un pied de page collé en bas de la zone qui défile, hors de portée des notifications. La suppression d'une fiche passe par la modale de confirmation, puis la notification propose encore « Annuler ».

### Inputs / Fields
- **Style :** 32px, bordure 1px `line-strong`, fond `panel`, coins de 8px ; listes de choix (`Select`, jamais le `<select>` natif) avec la même ombre basse que les boutons, la valeur tronquée, le chevron Lucide gris de 14px qui se retourne à l'ouverture et les états des boutons ; elles ouvrent le menu d'« Affichage » (même surface, mêmes rangées) avec une case ronde par option, la choisie remplie de bleu atelier, des intitulés de groupe en petites capitales `muted` ; dès 12 options en plusieurs groupes, chaque intitulé devient un bouton qui plie et déplie son groupe (chevron qui tourne d'un quart, compte en `hint`, collé en haut en défilant), seul le groupe du choix en cours s'ouvre avec la liste, → et ← le déplient et le replient, et taper un nom ouvre son groupe, au plus 400px de haut, sous le champ ou au-dessus faute de place ; flèches, Début, Fin, premières lettres, Entrée et Échap au clavier ; recherche avec loupe à gauche.
- **Focus :** champs de saisie en bordure `accent` et halo de 3px `accent-soft`, sans contour natif, survol en bordure `muted` ; une liste de choix prend le contour de focus des boutons.
- **Error :** encart `danger-soft` cerclé de `danger-line`, texte `danger`.

### Navigation
- **Style :** colonne `sunken` sans aucun filet : seuls les espaces séparent les groupes (16px au-dessus de chaque partie). Bloc projet en haut (logo, titre 14px 600), puis « Rechercher » et le Tableau de bord, puis les parties, titrées en 12px 500 `muted`, en minuscules ; leur chevron n’apparaît qu’au survol ou quand la partie est pliée.
- **Pied :** une seule ligne, sans filet, tenue en bas : « Fermer » (`LogOut` retourné, la flèche vers le bord de la fenêtre : on sort du projet ; infobulle et nom accessible « Fermer le projet ») la remplit, puis trois boutons icône de 32px : la langue (`Languages`, infobulle « Langue : Français »), qui ouvre vers le haut un menu des trois langues (Français, English, Español, la courante cochée en `accent`) ; « Raccourcis clavier » (`Keyboard`, Ctrl + / partout dans le projet), qui ouvre les Réglages sur cette page ; et le thème, dont l’icône montre celui où l’on passe (`Moon` en clair, `Sun` en sombre ; infobulle « Passer au thème sombre »). Un bouton dont le menu est ouvert garde le fond `hover`. Plié en rail, les quatre s’empilent. Les Réglages sont dans le menu du projet.
- **Éléments :** 30px, icône Lucide 16px `muted`, texte `ink-2`, survol `hover`.
- **Actif :** fond `panel`, anneau `line` et `--shadow-sm`, texte et icône `ink` en 500 : l'élément actif ressemble à une petite surface posée dans la colonne.
- **À venir :** une partie dont toutes les vues arrivent plus tard porte « À venir » en 11px `hint` au bout de son titre ; ses éléments ont le texte `muted`, et leur numéro de version (2.0, 3.0, 11px 500 `muted`) n’apparaît à droite qu’au survol ou au focus ; l’infobulle dit « Moodboard · arrive en 2.0 ».
- **Tableau de bord :** un élément de navigation ordinaire, sous « Rechercher », au-dessus des parties.
- **Rechercher :** sous le bloc projet, un élément comme les autres (`Search`, « Rechercher ») qui porte à droite ses deux touches « Ctrl » « K » (10.5px, bordure `line`, bas `line-strong`) ; il ouvre la palette de commandes, comme Ctrl + K partout dans le projet (sauf par-dessus une autre modale).

### Palette de commandes
- **Forme :** modale de 600px à 12vh du haut, rayon 12px, `--shadow-lg`, sur le voile `--backdrop` ; un champ de 52px avec la loupe, les résultats, puis une bande `sunken` qui rappelle ↑ ↓, Entrée et Échap.
- **Contenu :** Vues (le Tableau de bord en tête), Scènes, Bible, Actions (importer, exporter, réglages, raccourcis clavier, les trois thèmes, les autres langues, fermer le projet), titrés en caption `muted`. Vide, elle ne montre que les vues disponibles et les actions ; les scènes, les fiches et les vues à venir n'arrivent qu'en tapant, huit au plus par groupe. La recherche ignore accents et casse, demande tous les mots, et met en tête ce qui commence comme la recherche.
- **Lignes :** 34px, icône 16px `muted`, libellé `ink-2` tronqué, détail en `muted` 12px à droite (partie, « Scène 12 », type de fiche). La ligne choisie passe en `accent-soft`, icône `accent` ; le survol la choisit, Entrée ou le clic l'ouvre et ferme la palette.

### Réglages
- **Forme :** modale de 1100 × 860px au plus, sans marge, rayon 12px. À gauche, une colonne `canvas` de 248px : « Rechercher un réglage » (Entrée ouvre la première page trouvée ; la recherche lit aussi chaque réglage de la page), les pages en `nav-link` sous les captions « Application » et « Ce projet » (celle-ci seulement dans un projet), et « À propos » tout en bas. À droite, l’en-tête porte le titre de la page en 17px 600 et, dessous, une ligne `muted` qui dit à quoi elle sert ; la croix ferme (Échap aussi).
- **Pages :** Application : Profil, Apparence, Écriture, Formats de scénario, Sauvegardes, Raccourcis clavier. Ce projet : Script, Parties affichées. Puis À propos. La fenêtre s’ouvre sur Profil.
- **Groupes et lignes :** une page est une colonne de 680px au plus, centrée, faite de groupes espacés de 28px : un titre 13px 600 `ink`, puis un cadre `panel` cerclé de `line`, rayon 10px, sans ombre. Chaque réglage y est une ligne d’au moins 56px séparée de la suivante par un filet `line` : à gauche son nom en 500 `ink` et, dessous, ce qu’il fait en 12.5px `muted` ; à droite son contrôle. Un choix qui demande de la place (numéros de scène) passe sous le texte. Une remarque qui vaut pour toute la page se met en 12.5px `muted`, sans cadre, sous le dernier groupe.
- **Contrôles :** interrupteur de 32 × 18px (piste `line-strong`, `accent` allumé, pastille blanche qui glisse en 160ms) pour ce qui s’allume ou s’éteint ; liste de choix de 220px au moins ; champ de 280px ; nombre suivi de son unité dans un seul champ (« 30 min », « 20 copies », « 500 mots »), enregistré en le quittant ou par Entrée et ramené dans ses bornes. Tout s’enregistre et s’applique aussitôt, sans bouton « Enregistrer ».
- **Profil :** nom, e-mail, téléphone, adresse, agent ; dessous, le contact tel que l’imprime la page de titre, sur une petite feuille `paper` en Courier Prime. Chaque script le suit, champ par champ, sauf ce qu’on change dans son onglet « Informations ».
- **Langue :** sous Apparence, la langue de l’application (Français, English, Español), appliquée aussitôt partout et retenue sur l’ordinateur ; au premier lancement, celle du système si elle est proposée, sinon le français. Elle ne touche pas le scénario : la page de titre, les exports et la typographie suivent la langue du format. Les valeurs rangées dans le projet (genres, fonctions, options des fiches) restent les mêmes et seul leur nom change.
- **Écriture :** défilement machine à écrire (la ligne tapée reste au milieu du bureau, la page monte sous elle ; un clic ne fait pas défiler), correcteur orthographique de Windows dans la langue du format, typographie française (avec un format français, toujours ou jamais), objectif de mots par jour.
- **Sauvegardes :** en tête, dans un projet, l’état des copies dans un bandeau `ok-soft` cerclé de `ok-line` (dernière copie, combien sont gardées) avec « Sauvegarder maintenant » en bleu ; puis Copies automatiques (fréquence, copies gardées, rappel), Emplacement (dossier, coupé par le début ; Choisir…, Par défaut, Ouvrir ; Restaurer une sauvegarde) et la liste des copies de ce projet.
- **Formats de scénario :** Mes formats (Modifier, Dupliquer, Supprimer) puis les formats fournis par famille (Dupliquer) ; le format du projet ouvert porte la pastille `accent-soft` « Ce projet ».
- **Raccourcis clavier :** par vue, ce que font les touches à gauche en `ink-2`, les touches à droite en `kbd`, « ou » entre deux variantes.
- **Script :** le format du projet (en changer refait la pagination, pas le texte) et les numéros de scène : quatre petites feuilles (Aucun, À gauche, À droite, Des deux côtés), le numéro en `accent` à hauteur des en-têtes, la choisie cerclée d’`accent` comme les thèmes. Imprimés, les numéros suivent la liste des scènes, en Courier dans les marges à 0,3 pouce du texte, une fois par en-tête même coupé par une page ; ils passent dans l’aperçu, le PDF, le FDX (`Number`) et le Fountain (`#12#`), sans toucher la pagination.
- **Parties affichées :** un interrupteur par partie ; Écriture reste allumée, grisée.

### En-tête de vue
Fil d'Ariane « Projet › Partie » en 12.5px `muted`, chevrons Lucide 14px en `line-strong` ; dessous, titre de vue en headline suivi du compteur. Séparé de la barre d'outils par un trait `line`.

### Barre d'état
28px sous le contenu, 11.5px `muted` chiffres tabulaires ; l'état d'enregistrement s'annonce par un point de 7px entouré d'un halo de 3px dans les couleurs de son état.

### Feuille de scénario
La page `paper` sur le `desk`, avec `--sheet-shadow` et un intervalle de 28px en `desk` entre les pages ; curseur et sélection en bleu atelier. Courier Prime aux métriques du format.
- **Affichage :** une seule vue, sur `panel` blanc : ni feuille, ni ombre, ni saut de page ; le texte, en `ink`, est posé à même le fond, le bloc de texte (et non la page) centré, curseur et sélection en bleu atelier. Un bouton « Affichage » (`Eye`, 34px, la boîte et les états des boutons, chevron qui se retourne à l'ouverture) en tête de l'en-tête, suivi d'« Aperçu », puis séparé des onglets Notes et Informations par un filet, ouvre un menu d'options à cases à cocher (`menuitemcheckbox` ; case de 16px, rayon 4px, cochée en bleu atelier), chacune avec une seconde ligne `muted` qui dit ce qu'elle fait ; le menu reste ouvert pendant qu'on coche, se ferme par Échap, un clic à côté ou le bouton. Les options sont retenues sur l'ordinateur, le bouton est grisé quand le bureau ne montre pas l'écriture, et rien ne change la pagination, les exports ni l'impression. « Cartes de scène » (décochée par défaut) encadre chaque scène dans une carte (rayon 10px, `shadow-sm`) teintée de sa couleur du Tableau (14 % sur `panel`, bordure à 45 %) ; le fond de la page reste `panel` blanc. La scène du curseur prend une bordure à 70 %. « Liens de la Bible » (cochée par défaut) colore les éléments de la Bible en bleu atelier sur `accent-soft`. Un clic dans un lien place le curseur dans le mot, curseur texte, comme ailleurs ; au survol, un aperçu (nom, type, résumé, « Ouvrir la fiche » en bleu atelier) s'ouvre 4px sous le mot. On peut y glisser le pointeur (il attend 350ms avant de disparaître), il prend alors le curseur main, une bordure `accent-line` et souligne « Ouvrir la fiche », et un clic ouvre la fiche ; Ctrl + clic sur le mot l'ouvre aussi. Décochée, les éléments se lisent comme le texte autour, sans aperçu. « Acte et séquence » (cochée par défaut) montre le repère décrit plus bas ; décochée, il disparaît. Entre deux cartes, 14px ; au survol de cet espace, les deux cartes s'écartent à 46px (260ms, sortie douce) et laissent paraître un filet `accent-line` d'un bord à l'autre, puis au centre la pastille « + Nouvelle scène » (26px, `panel`, bordure `accent-line`, texte en bleu atelier, `accent-soft` au survol). Elle insère une scène vide sous celle du dessus, dans la même séquence, le curseur dans son en-tête ; Ctrl + Z la retire. Le texte garde sa largeur imprimée, la carte déborde de 0,6in dans les marges. Avec ou sans cartes, le numéro de chaque scène, celui de la liste des scènes, se lit dans la marge gauche à hauteur de la première ligne de son en-tête (`hint`, `muted` dans une carte) ; il ne s'imprime pas. À gauche du texte, un repère dit dans quel acte et quelle séquence se trouve la scène qu'il longe : il commence à la hauteur de la première scène, monte avec elle, puis reste collé 28px sous le haut du bureau ; il change pile quand le haut d'une carte (ou, sans cartes, le haut du texte de l'en-tête) arrive à sa hauteur ; numéro (« ACT. II », « SÉQ. C ») en capitales `muted` 10,5px, titre de l'acte en 14px semi-gras `ink`, titre de séquence en 500 `ink-2`, aligné à droite contre un fil de 2px à la couleur de l'acte qui s'efface vers le bas, avec un nœud plein pour l'acte et un nœud cerclé pour la séquence (le fil des étapes de l'Atelier) ; sous la séquence, « Scène 3 sur 9 » en `muted` 11px et, jusqu'à 16 scènes, une rangée de points (passés pleins en `line-strong`, à venir cerclés, l'actuel en trait de 12px à la couleur de l'acte) ; il apparaît en fondu en changeant de partie, prend au plus 180px ou la place laissée à gauche des cartes, et disparaît quand le bureau fait moins de 900px. Sans saut de page montré, un élément qui ouvre une page imprimée garde son interligne à l'écran.
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
- **Don't** colorer la feuille selon le thème : elle reste blanche à encre noire (l'écriture n'a pas de feuille).
- **Don't** utiliser le violet `plot` ailleurs que sur les pastilles de temps forts.
- **Don't** mettre en capitales un libellé qui n'est pas un en-tête de scène.
- **Don't** utiliser d'ombre dure décalée ni de dégradé décoratif.
