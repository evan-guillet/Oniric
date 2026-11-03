---
target: section Production
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\eguillet\\Documents\\Aide\\Oniric\\src\\modules\\production\\ui"
timestamp: 2026-11-03T13-32-18Z
slug: src-modules-production-ui
---
Method: dual-agent (A: revue de design · B: détecteur), captures de la version 3.0.0 sur un projet Star Wars, clair et sombre

## Score de santé du design

| # | Heuristique | Score | Problème principal |
|---|---|---|---|
| 1 | Visibilité de l'état | 3 | Bons états (Brouillon, totaux de journée) ; « Répartir… » reste en bleu avec 0 scène à placer |
| 2 | Correspondance avec le monde réel | 2 | Bandes fidèles au métier ; mais codes DOOD anglais (SW/W/WF/H) et la feuille de service n'a jamais l'air d'une feuille de service |
| 3 | Contrôle et liberté | 3 | Échap, retrait, confirmations ; pas d'annulation visible après « Répartir » |
| 4 | Cohérence | 2 | « Princesse Leia Organa » au dépouillement, « LEIA » partout ailleurs ; « Rapports » contre « Rapport » |
| 5 | Prévention des erreurs | 2 | CSV et « Exporter en PDF » proposés sur un rapport vide ; « Diffuser la V1 » sur l'onglet Rapport |
| 6 | Reconnaître plutôt que se souvenir | 2 | Bandes sans en-têtes de colonnes : « 1, 2, 3, 5 » sont des numéros de rôles à retenir |
| 7 | Souplesse et efficacité | 2 | Pas de sélection multiple de bandes, pas d'action groupée dans Rapport |
| 8 | Esthétique et sobriété | 3 | Calme et cohérent ; Distribution = 54 contrôles, Organigramme et Calendrier quasi vides |
| 9 | Récupération des erreurs | 2 | Toasts génériques ; les conflits ne s'expliquent que par une infobulle |
| 10 | Aide et documentation | 2 | Bonne aide en ligne par vue, rien ne guide d'une vue à l'autre |
| **Total** | | **23/40** | **Acceptable** |

## Verdict de spécificité

Moitié métier, moitié formulaire générique. Le plan de travail (couleurs INT/EXT jour/nuit, huitièmes de page, « 9 h 57 / 10 h ») et la fiche de dépouillement (texte en Courier surligné par catégorie) sont authentiques : un régisseur les reconnaît en deux secondes. Le reste (Contacts, Distribution, Organigramme, Calendrier, et surtout la Feuille de service) pourrait sortir de n'importe quel back-office.

Détecteur : 20 alertes dans le code (toutes dans la feuille de style d'impression de productionExport.tsx, couleurs fixes voulues pour le PDF : faux positifs) et 27 alertes dans l'application, réduites à 6 problèmes. Vrais positifs : contraste du gris `--hint` (2,9:1 à 3,3:1) sur l'état des feuilles et les dates de la Présence ; dates de la Présence en 10,5 px ; titres h3 directement sous le h1 et à peine plus gros que le texte (12,5 px pour les catégories du dépouillement, plus petits que le corps). Faux positifs : interlignage serré du texte en Courier (convention du scénario), répétition des décors sur les bandes (c'est le principe).

## Problèmes prioritaires

1. [P1] Le tableau Présence est cassé. La classe globale `.num { display: grid }` (styles.css:2910) s'applique aux `<th>` et `<td className="num">` (ScheduleView.tsx:784-815) : Travail et Attente s'empilent dans une seule colonne, chaque ligne double de hauteur, le numéro flotte en haut et le nom en bas. Même classe dans CallSheetsView.tsx:450-460 et TeamView.tsx:516. Correctif : classe propre `pr-num`.
2. [P1] La feuille de service n'est jamais montrée. On remplit une trentaine de champs ; la vraie feuille n'existe qu'en PDF derrière un « ⋯ » sans libellé, pendant que « Modèle » a un vrai bouton. Correctif : aperçu A4 vivant (en-tête, horaires, météo, scènes, comédiens et convocations, décors, hôpital), édition à côté ; « Exporter en PDF » visible à côté de Diffuser.
3. [P2] Boutons principaux et exports là où ils ne servent à rien : Répartir avec 0 scène, CSV/PDF sur « Rien à rapporter encore », Diffuser sur Rapport, « Ajouter une étape » en bleu sur le calendrier. Correctif : masquer ou rétrograder selon l'état ; replier le bac « À placer » quand il est vide.
4. [P2] Un personnage, deux noms ; des numéros à la place des noms. Correctif : un seul nom affiché par rôle partout ; en-tête de colonnes collant par journée ; noms des rôles en survol/focus visible.
5. [P2] Grilles de contrôles sans action groupée (Distribution, Rapport, bandes). Correctif : valeurs en texte, éditeur au clic ; « Tout tourné » ; sélection multiple de bandes puis « Déplacer vers… ».

## Personas

- Alex (expert) : déplacer une bande au clavier = 3 actions par cran ; deux « ⋯ » indiscernables dans la même barre ; les bandes perdent le sous-décor (« ESPACE » ×12).
- Sam (clavier, lecteur d'écran) : les bandes n'ont pas de nom accessible ; INT/EXT et jour/nuit reposent sur la couleur seule pour l'espace ; codes DOOD sans `abbr` ; la structure du tableau Présence cassée gêne la navigation ; pas de `:focus-visible` sur les bandes.
- Réalisateur indépendant seul : rien n'indique l'ordre du travail (équipe → dépouillement → plan → feuilles) ; jargon anglais DOOD et « Créps. » ; beaucoup de cases Envoyée/Confirmée à cocher seul.

## Observations mineures

- Dates natives « jj/mm/aaaa » à côté des menus personnalisés.
- Mode sombre : les cellules de Présence et les lignes sélectionnées deviennent des blocs indigo lourds ; le bleu sert de couleur de données.
- Calendrier : « Tournage · Plan de travail » et « Du plan de travail » disent deux fois la même chose, sans axe de dates.
- Durées mêlant « 2 h 04 » et « 45 min ».
- Tableau des Rapports : grands vides entre nom, nombre et numéro de scène.
- Organigramme : une carte, aucune hiérarchie ; il ne mérite pas encore son onglet.
- Bouton « CSV » : « Tableur (CSV) » serait plus clair.

## Questions

- Si la feuille de service est la seule chose qu'on imprime chaque soir, pourquoi est-ce le seul livrable qu'on ne voit pas ?
- La Production doit-elle rester quatre vues et treize onglets, ou un parcours guidé comme l'Atelier ?
- 92 bandes : une liste à faire défiler, ou un tableau à voir d'un coup, une colonne par journée ?
