# Cahier des charges — Oniric

> Logiciel libre (GPL-3.0) et gratuit pour ordinateur, sans connexion (sauf la carte), qui aide une personne à créer son film : écriture du scénario, réalisation et production (préproduction, tournage, postproduction).

| Élément | Valeur |
|---|---|
| Projet | Oniric |
| Document | Cahier des charges fonctionnel et technique |
| Version | 2.4 (choix techniques détaillés dans le document d'architecture) |
| Date | 21/10/2026 |
| Auteur | Evan Guillet |
| Statut | Brouillon à valider |

---

## Sommaire

1. [Présentation du projet](#1-présentation-du-projet)
2. [Utilisateur](#2-utilisateur)
3. [Architecture fonctionnelle](#3-architecture-fonctionnelle)
4. [Socle commun : application et projet](#4-socle-commun--application-et-projet)
5. [Partie Script](#5-partie-script)
6. [Partie Réalisation](#6-partie-réalisation)
7. [Partie Production](#7-partie-production)
8. [Fonctions transverses](#8-fonctions-transverses)
9. [Modèle de données](#9-modèle-de-données)
10. [Exigences non fonctionnelles](#10-exigences-non-fonctionnelles)
11. [Choix techniques](#11-choix-techniques)
12. [Positionnement face à StudioBinder](#12-positionnement-face-à-studiobinder)
13. [Lotissement et priorisation](#13-lotissement-et-priorisation)
14. [Évolutions envisagées](#14-évolutions-envisagées)
15. [Points ouverts](#15-points-ouverts)
16. [Annexes](#16-annexes)

---

## 1. Présentation du projet

### 1.1 Contexte

Écrire et fabriquer un film passe par des dizaines d'outils : un traitement de texte pour le synopsis, un logiciel de scénario pour le format, des tableurs pour le dépouillement et le budget, des dossiers d'images pour les ambiances. Les informations sont dupliquées et se désynchronisent : un personnage renommé dans le scénario ne l'est pas dans le dépouillement.

Des outils comme StudioBinder couvrent bien la production, mais ils sont payants, en ligne, et restent légers sur le **développement de l'histoire** : personnages, structure dramatique, univers (lore) et étapes d'écriture qui précèdent le scénario.

### 1.2 Objectifs

Oniric doit permettre à une personne de **tout faire au même endroit, sur son ordinateur, sur une seule source de vérité**, de l'idée de départ jusqu'à la préparation et au suivi du tournage :

- **O1 — Accompagner l'écriture** : guider l'auteur à travers chaque étape (idée, prémisse, personnages, structure, synopsis, traitement, scénario, réécritures, diffusion).
- **O2 — Construire un univers** : documenter personnages, lieux, objets, véhicules, factions, histoire du monde, comme une encyclopédie vivante reliée au scénario.
- **O3 — Préparer la mise en scène** : moodboards, découpage technique, storyboards, rattachés aux scènes.
- **O4 — Organiser la production** : équipe, dépouillement, plan de travail, feuilles de service, budget, repérages, autorisations.

### 1.3 Principes structurants

- **Un logiciel pour ordinateur.** Oniric s'installe et s'utilise sur un PC. Il n'y a ni serveur, ni compte, ni version web.
- **Aucune connexion, sauf pour la carte.** L'application fonctionne sans Internet. **Seule exception : la carte des repérages**, qui se connecte à des services cartographiques libres pour afficher le fond de carte, chercher des adresses et calculer des itinéraires (voir 7.6). Aucune autre partie ne se connecte ; la météo se saisit à la main.
- **Une seule personne aux commandes.** Un projet est utilisé par une seule personne. Il n'y a pas de collaboration, de partage en ligne, de messagerie ni de chat. Les échanges avec l'équipe se font en dehors d'Oniric, à partir des documents qu'il exporte (PDF, CSV, calendrier).
- **Un projet contient les trois parties** : Script, Réalisation et Production, toutes disponibles dès la création.
- **Les données appartiennent à l'utilisateur.** Un projet est un dossier sur son disque, dans un format ouvert et documenté, qu'il peut copier, sauvegarder et archiver comme il veut.
- **Libre et gratuit.** Le code source est publié sous licence **GPL-3.0** ; le logiciel est gratuit.
- **Pas d'intelligence artificielle.** Toutes les aides (analyse, détection, pré-dépouillement) reposent sur des règles explicites et déterministes.

### 1.4 Périmètre

| Inclus | Exclu (version actuelle) |
|---|---|
| Application de bureau pour Windows | Versions macOS et Linux, version web, application mobile |
| Carte interactive en ligne pour les repérages, avec zones gardées hors ligne | Vue satellite |
| Fonctionnement hors ligne de tout le reste du logiciel | Toute autre connexion réseau, télémétrie |
| Un utilisateur par projet | Comptes, droits, collaboration, partage par lien |
| Script, Réalisation et Production dans chaque projet | Studios, propositions de projets |
| Exports PDF, Final Draft (FDX), Fountain, DOCX, CSV, XLSX, iCal | Messagerie, chat, envoi d'e-mails ou de SMS |
| Gestion de fichiers et médias de référence | Montage vidéo, étalonnage, mixage ; stockage de rushes |
| Préparation du budget et des documents administratifs | Comptabilité légale, paie, signature électronique |

### 1.5 Public cible

- **Cinéastes, auteurs et scénaristes** indépendants qui développent leur projet seuls.
- **Réalisateurs-producteurs** de courts métrages, films d'école, longs métrages indépendants, web-séries, qui préparent eux-mêmes leur tournage.
- **Étudiants en cinéma**, qui ont besoin d'un outil complet et gratuit.

### 1.6 Les grandes étapes couvertes

```
SCRIPT                         RÉALISATION                PRODUCTION
idée → prémisse → thème        moodboard                  équipe & contacts
personnages → structure        découpage technique        dépouillement
synopsis → séquencier          storyboard                 plan de travail
traitement → scénario                                     feuilles de service
réécritures → retours                                     budget
protection → diffusion                                    repérages & autorisations
                    ↘                 ↓                 ↙
        un seul dossier projet : scènes, personnages, lieux, éléments
```

---

## 2. Utilisateur

- **USR-01** Une seule personne utilise un projet. Il n'y a ni compte, ni identification, ni gestion de droits.
- **USR-02** Au premier lancement, l'utilisateur renseigne un **profil local** facultatif (nom, coordonnées, logo) qui préremplit les pages de titre, en-têtes de documents et feuilles de service.
- **USR-03** Un projet peut être protégé par un **mot de passe** : son contenu est alors chiffré sur le disque (voir 10.3).
- **USR-04** Pour éviter que deux instances du logiciel modifient le même projet en même temps, un projet ouvert est **verrouillé** par un fichier `.verrou` dans son dossier ; une seconde ouverture est proposée en lecture seule. Un verrou laissé par un plantage peut être levé après confirmation.

---

## 3. Architecture fonctionnelle

```
Oniric (application de bureau)
├── Accueil
│   ├── Projets récents
│   ├── Créer / ouvrir / importer un projet
│   ├── Carnet de contacts (partagé entre les projets du PC)
│   └── Bibliothèque de modèles
└── Projet (un dossier projet Oniric)
    ├── Tableau de bord
    ├── SCRIPT
    │   ├── Atelier d'écriture (étapes 1 à 9)
    │   ├── Bible du film (fiches univers)
    │   ├── Éditeur de scénario
    │   └── Vues : Page · Tableau · Chronologie
    ├── RÉALISATION
    │   ├── Moodboards
    │   ├── Découpage technique (shotlist)
    │   └── Storyboard
    ├── PRODUCTION
    │   ├── Équipe et rôles
    │   ├── Dépouillement
    │   ├── Plan de travail (planning de tournage)
    │   ├── Feuilles de service
    │   ├── Budget
    │   ├── Repérages
    │   └── Autorisations de tournage
    ├── Fichiers
    └── Tâches
```

**Principe central** : la **scène** est l'objet pivot. Elle est écrite dans la partie Script, illustrée dans le storyboard, découpée en plans, dépouillée en éléments, placée dans le plan de travail, appelée dans une feuille de service et chiffrée dans le budget. Toute modification d'une scène se répercute partout où elle apparaît.

---

## 4. Socle commun : application et projet

### 4.1 Accueil

- **ACC-01** Liste des projets récents avec titre, image, format, phase et date de dernière modification.
- **ACC-02** Créer un projet, ouvrir un dossier projet, ouvrir une archive `.oniric`, importer un scénario (FDX, Fountain, DOCX, PDF) pour démarrer un projet.
- **ACC-03** **Carnet de contacts** local, réutilisable d'un projet à l'autre (voir 7.1).
- **ACC-04** **Bibliothèque de modèles** : structures narratives, catégories de dépouillement, modèles de feuille de service, grilles budgétaires, modèles de documents d'autorisation. Modèles fournis et modèles créés par l'utilisateur ; import et export de modèles en fichier.

### 4.2 Projet

- **PRJ-01** Créer un projet : titre, titre de travail, format (long métrage, court métrage, clip, publicité, documentaire), durée visée, genre, langue, format de scénario (voir EDT-02).
- **PRJ-02** Un projet contient toujours les **trois parties** Script, Réalisation et Production. L'utilisateur peut masquer une partie dont il ne se sert pas ; ses données sont conservées.
- **PRJ-03** Les séries (saisons et épisodes, chacun avec son propre scénario, bible partagée) ne font pas partie des premiers lots ; elles sont prévues au lot 3 (voir 13). Le modèle de données les anticipe.
- **PRJ-04** Phase du projet : Développement, Préproduction, Tournage, Postproduction, Diffusion, Archivé.
- **PRJ-05** **Tableau de bord** : avancement de l'écriture (étapes complétées, nombre de pages, durée estimée), tâches en cours, prochaines journées de tournage, état du budget, autorisations en attente, rappels.
- **PRJ-06** Un projet est un **dossier** créé à l'emplacement choisi par l'utilisateur. Il contient :

  ```
  Les Heures Bleues/
  ├── projet.oniric        (fichier d'ouverture : nom, version du format)
  ├── donnees.db           (base SQLite : scénario, bible, plans, production…)
  ├── medias/              (images, vidéos, sons, PDF importés, rangés par type)
  ├── exports/             (PDF, CSV, iCal générés, rangés par date)
  ├── versions/            (versions figées du scénario)
  └── .verrou              (présent tant que le projet est ouvert)
  ```

  L'utilisateur peut parcourir le dossier `medias` depuis l'explorateur Windows ; les fichiers qu'il y dépose sont détectés et proposés à l'import dans le projet.
- **PRJ-06b** Ouvrir un projet en double-cliquant sur `projet.oniric` dans l'explorateur Windows (association de l'extension).
- **PRJ-07** Dupliquer un projet (avec ou sans contenu), l'enregistrer sous un autre nom, l'archiver.
- **PRJ-08** Journal des modifications du projet (quoi, quand), consultable et filtrable.

### 4.3 Enregistrement et sauvegarde

- **SAV-01** **Enregistrement automatique** continu : aucune perte de plus de quelques secondes de travail, même en cas de coupure de courant ou de plantage.
- **SAV-02** **Récupération après plantage** : à la réouverture, proposition de restaurer l'état le plus récent.
- **SAV-03** **Copies de sauvegarde automatiques** : à intervalles réguliers et à chaque fermeture, une copie datée est créée dans un dossier de sauvegarde choisi par l'utilisateur (idéalement sur un autre disque) ; nombre de copies conservées paramétrable.
- **SAV-04** **Export d'archive** : le dossier projet est compressé en un seul fichier `.oniric` (archive) pour le transférer sur un autre ordinateur ; l'import le décompresse en dossier.
- **SAV-05** Rappel si aucune sauvegarde n'a été faite sur un autre support depuis un délai paramétrable.

### 4.4 Tâches et rappels

- **TCH-01** Créer des tâches rattachées à n'importe quel objet (scène, personnage, lieu, poste budgétaire, autorisation…), avec échéance, priorité et statut. Une tâche peut mentionner la personne de l'équipe concernée, à titre d'information.
- **TCH-02** Vue liste et vue kanban des tâches.
- **TCH-03** **Rappels** : notifications du système d'exploitation à l'échéance d'une tâche, d'une autorisation ou d'une date de relecture, quand l'application est ouverte.

---

## 5. Partie Script

### 5.1 Atelier d'écriture guidé

L'atelier suit les étapes classiques d'écriture d'un scénario. Chaque étape est une page dédiée avec des champs structurés, des explications courtes et des exemples. L'auteur navigue librement entre les étapes : rien n'est bloquant, mais un indicateur montre ce qui est rempli.

- **ATL-01** Afficher la progression du projet à travers les 9 étapes (indicateur par étape : vide / en cours / terminé, défini par l'auteur).
- **ATL-02** Chaque champ garde un historique de ses versions.
- **ATL-03** Une aide contextuelle (masquable) explique chaque notion.
- **ATL-04** Les étapes peuvent être masquées pour un auteur qui ne souhaite pas être guidé.

#### Étape 1 — Préparation

| Champ | Description |
|---|---|
| Idée de départ | Texte libre : sujet, personnage, situation, question « et si… ? ». Plusieurs idées possibles, une est retenue. |
| Prémisse (pitch) | Une à deux phrases. Aide structurée : *qui* veut *quoi*, *qu'est-ce qui l'en empêche*, *quels enjeux*. Compteur de mots. |
| Thème | Ce que le film veut dire au fond. Champ principal + thèmes secondaires (étiquettes). |
| Genre | Liste (drame, comédie, thriller, horreur, science-fiction, fantastique, romance, policier, guerre, western, animation, documentaire…), sous-genres, multi-sélection. |
| Ton | Curseurs ou étiquettes (sombre ↔ lumineux, réaliste ↔ stylisé, lent ↔ nerveux). |
| Codes du genre | Pense-bête des attentes du genre choisi, modifiable. |
| Références | Films, livres, œuvres qui inspirent le projet (lien vers le moodboard). |

#### Étape 2 — Construction des personnages

- **PER-01** Désigner le **protagoniste** : désir (ce qu'il veut), besoin (ce dont il a réellement besoin), faille, arc de transformation (état initial → état final).
- **PER-02** Désigner l'**antagoniste** ou la **force d'opposition** (personne, groupe, nature, société, soi-même).
- **PER-03** Lister les **personnages secondaires** avec leur fonction dramatique (mentor, allié, confident, faire-valoir, gardien du seuil, messager, ombre, etc.).
- **PER-04** Chaque personnage dispose d'une fiche complète (voir 5.2).
- **PER-05** Carte des relations : graphe interactif des liens entre personnages (famille, amour, rivalité, hiérarchie…), avec évolution possible au fil des actes.

#### Étape 3 — Structure de l'histoire

- **STR-01** Choisir un **modèle de structure** :
  - Trois actes (Acte I ≈ 25 %, Acte II ≈ 50 %, Acte III ≈ 25 %) ;
  - Le voyage du héros (12 étapes) ;
  - Les 15 beats de Blake Snyder (*Save the Cat*) ;
  - Les 8 séquences ;
  - Structure libre ou modèle personnalisé créé par l'utilisateur.
- **STR-02** Chaque modèle propose ses **points clés** (incident déclencheur, premier point de bascule, point médian, moment le plus bas, climax, dénouement…) à remplir et à relier à une ou plusieurs scènes.
- **STR-03** Visualiser la répartition réelle des actes par rapport à la répartition théorique (en pages et en minutes estimées) et signaler les écarts importants.
- **STR-04** Changer de modèle sans perdre le contenu : les points clés existants sont proposés à la réaffectation.

#### Étape 4 — Documents préparatoires

| Document | Exigences |
|---|---|
| Synopsis | Éditeur de texte riche, objectif 1 à 2 pages, fin comprise. Compteur de pages. |
| Séquencier | Liste ordonnée des grandes séquences ; chaque entrée devient une **séquence** du projet, visible dans la vue Tableau. |
| Traitement | Version narrative de 5 à 20 pages, au présent, quasi sans dialogues. Peut être généré comme squelette à partir du séquencier (titres des séquences en intertitres). |
| Continuité dialoguée | Facultatif. Scène par scène, avec premiers dialogues ; peut être convertie en scénario formaté. |

- **DOC-01** Ces documents sont liés : ajouter une séquence dans le séquencier la crée dans le traitement et dans la vue Tableau.
- **DOC-02** Chaque document a ses propres versions et peut être exporté seul en PDF ou DOCX.

#### Étape 5 — Écriture du scénario

Voir l'éditeur de scénario (5.3). L'étape affiche en plus :

- un objectif de pages et la durée estimée (≈ une page par minute) ;
- un **mode premier jet** : plein écran, correcteur et notes masqués, compteur de mots de la session, pour écrire sans s'arrêter ;
- des rappels de bonnes pratiques (« montrer, pas dire », voix propre à chaque personnage, sous-texte).

#### Étape 6 — Réécriture

- **REE-01** **Gel de version** : figer une version (V1, V2, « version producteur »…) avant de réécrire. Nombre de versions illimité.
- **REE-02** **Comparaison** de deux versions côte à côte, différences surlignées.
- **REE-03** **Passes de réécriture** : créer une liste de passes (structure, personnages, scènes, dialogues, style), cocher les scènes traitées dans chaque passe.
- **REE-04** **Rappel de repos** : l'auteur programme une date de relecture (« relire dans 10 jours ») avec rappel.
- **REE-05** **Analyse d'aide à la relecture** : longueur des scènes, temps de parole par personnage, scènes sans personnage principal, personnages absents longtemps, scènes non reliées à un point de structure.
- **REE-06** **Corbeille de scènes coupées** : une scène supprimée est conservée et peut être réintégrée.
- **REE-07** **Révisions colorées** (norme de production) : une fois le scénario « verrouillé », chaque série de modifications reçoit une couleur (blanc, bleu, rose, jaune, vert, or…), les pages et lignes modifiées sont marquées d'un astérisque en marge, la numérotation des scènes et des pages est verrouillée (scènes 12A, pages 34A…).

#### Étape 7 — Retours et polissage

Les lecteurs n'ont pas accès à Oniric : on leur envoie un PDF, et l'auteur reporte leurs retours dans l'application.

- **RET-01** **Export pour lecteur** : PDF de la version choisie, avec filigrane au nom du lecteur et numéro d'exemplaire.
- **RET-02** **Saisie des retours** : pour chaque lecteur, une fiche de lecture structurée (points forts, faiblesses, compréhension, note globale) et des remarques ancrées à un passage du scénario.
- **RET-03** **Import d'annotations** d'un PDF annoté par le lecteur (commentaires PDF), rattachées automatiquement aux passages correspondants quand c'est possible.
- **RET-04** Tri des retours : à appliquer, à discuter, rejeté ; suivi de leur prise en compte.
- **RET-05** Vérifications : orthographe et grammaire (dictionnaires embarqués), format (en-têtes mal formés, personnages orthographiés différemment, scènes sans en-tête), mise en page.

#### Étape 8 — Protection et diffusion

- **DIF-01** Suivi des **dépôts** : organisme (SACD, WGA, INPI, enveloppe Soleau, autre), date, numéro, version déposée, justificatif en pièce jointe. Oniric ne réalise pas le dépôt, il en garde la trace.
- **DIF-02** Rédaction des documents de diffusion : **logline**, **synopsis court**, **note d'intention**, **biographie de l'auteur**, **note de réalisation**.
- **DIF-03** Génération d'un **dossier de présentation** PDF (page de titre, logline, synopsis, note d'intention, personnages principaux, sélection du moodboard).
- **DIF-04** Suivi des **soumissions** : producteurs, agents, concours, aides (CNC, régions), résidences ; statut (envoyé, en lecture, refusé, accepté), date limite, rappels de relance.

#### Étape 9 — Développement

- **DEV-01** Enregistrer les **demandes de réécriture** (de qui, quoi, échéance) et les relier aux scènes concernées.
- **DEV-02** Passer le projet en préproduction : verrouillage du scénario et activation des révisions colorées.

### 5.2 Bible du film (encyclopédie de l'univers)

Une base documentaire de tout ce qui constitue le monde du film, à la manière du *Silmarillion* de Tolkien ou d'une documentation historique réelle.

#### Types de fiches

| Type | Champs spécifiques (en plus des champs communs) |
|---|---|
| Personnage | Nom, surnoms, âge, date de naissance (calendrier du monde), apparence, physique, costume type, passé, motivations, désir / besoin / faille, arc, façon de parler (tics, registre, accent, exemples de répliques), relations, comédien associé (lien production) |
| Lieu | Type (ville, bâtiment, pièce, planète…), lieu parent (hiérarchie : pays > ville > maison > cuisine), description, ambiance, époque, carte ou plan, décor réel associé (lien repérage) |
| Objet / accessoire | Description, propriétaire, importance dramatique, histoire de l'objet, apparition dans les scènes |
| Véhicule | Type, modèle, époque, état, propriétaire, caractéristiques |
| Faction / organisation | Membres, hiérarchie, idéologie, alliés et ennemis |
| Événement historique | Date (calendrier du monde), lieu, personnages impliqués, conséquences ; alimente la chronologie de l'univers |
| Culture / peuple / espèce | Coutumes, langue, religion, apparence, histoire |
| Concept / règle du monde | Système de magie, technologie, lois physiques, règles sociales, glossaire |
| Animal / créature | Description, comportement, besoins de tournage (lien dépouillement) |
| Type personnalisé | L'utilisateur crée son propre type avec ses champs (texte, nombre, date, liste, image, lien vers une fiche) |

#### Champs communs à toutes les fiches

Nom, image principale, galerie, résumé court, contenu riche (texte, images, tableaux), étiquettes, liens vers d'autres fiches, scènes où l'élément apparaît (calculé automatiquement), notes, statut (idée, validé, abandonné), historique des versions.

#### Exigences

- **BIB-01** Créer, modifier, dupliquer, archiver une fiche de n'importe quel type.
- **BIB-02** **Liens wiki** : taper `@` ou `[[` dans n'importe quel texte (scénario, traitement, fiche) pour lier une fiche ; survoler le lien affiche un aperçu.
- **BIB-03** **Détection automatique** : les noms de personnages en majuscules dans le scénario sont reconnus ; les lieux des en-têtes de scène sont proposés comme fiches Lieu.
- **BIB-04** **Calendrier du monde** personnalisable (ères, années, mois propres à l'univers, ou calendrier réel) pour dater événements et naissances.
- **BIB-05** **Chronologie de l'univers** : frise des événements historiques, distincte de la chronologie du récit, avec zoom (millénaires → jours).
- **BIB-06** **Cartes** : importer une carte (image), y placer des épingles reliées aux fiches Lieu.
- **BIB-07** **Arbres généalogiques** générés à partir des relations familiales.
- **BIB-08** Vérification de cohérence : un personnage décédé à une date qui apparaît dans une scène postérieure est signalé.
- **BIB-09** **Export et import d'une bible** dans un fichier, pour la réutiliser dans un autre projet (suite, univers étendu).
- **BIB-10** Export de la bible en PDF (format livre ou wiki).

### 5.3 Éditeur de scénario

- **EDT-01** **Format standard automatique** : en-tête de scène (INT./EXT. – LIEU – JOUR/NUIT), action, personnage, parenthèse, dialogue, transition, plan, texte à l'écran. Les éléments s'enchaînent au clavier (Entrée, Tab) comme dans les logiciels professionnels.
- **EDT-02** **Format de scénario flexible** :
  - formats fournis : **français** et **américain** (Courier 12, marges standard) ;
  - formats personnalisés : marges, retraits de chaque élément, police, taille, interligne, majuscules, style des en-têtes et transitions, enregistrables comme modèles ;
  - le format se change à tout moment sans toucher au texte : la mise en page est recalculée ;
  - l'export peut utiliser un autre format que celui de travail (écrire en format français, exporter en format américain).
- **EDT-03** **Autocomplétion** des noms de personnages, des lieux et des moments de la journée à partir de la bible.
- **EDT-04** **Pagination réelle** : affichage en pages, ≈ une page par minute, durée estimée totale et par scène (en huitièmes de page pour la production).
- **EDT-05** **Numérotation des scènes** automatique, verrouillable.
- **EDT-06** **Page de titre** personnalisable (titre, auteurs, d'après, version, date, contact, mentions de dépôt).
- **EDT-07** **Notes de marge** ancrées à un passage.
- **EDT-08** **Dialogue double** (deux personnages qui parlent en même temps).
- **EDT-09** **Mode concentration** : interface épurée, thème sombre, défilement type machine à écrire (ligne courante centrée).
- **EDT-10** **Import** : Final Draft (.fdx), Fountain (.fountain), PDF (reconnaissance du format), DOCX, Celtx.
- **EDT-11** **Export** : PDF (avec ou sans filigrane, avec ou sans révisions colorées), FDX, Fountain, DOCX ; export par personnage (ses répliques surlignées) pour les comédiens.
- **EDT-12** **Scripts audiovisuels en deux colonnes** (image / son) pour documentaires, publicités et clips.
- **EDT-13** Annuler / rétablir illimités dans la session ; raccourcis clavier documentés et personnalisables.

### 5.4 Les trois vues du récit

Les trois vues présentent **les mêmes données** (actes, séquences, scènes) : une modification dans l'une est immédiatement visible dans les autres.

#### Vue Page (écriture)

- **VUE-01** Feuille blanche au format du scénario, sommaire latéral repliable (actes > séquences > scènes) pour naviguer.
- **VUE-02** Le même mode feuille est disponible pour le synopsis, le traitement, la note d'intention et les fiches de la bible.

#### Vue Tableau (type kanban)

- **VUE-03** Colonnes = **actes** (ou les étapes du modèle de structure choisi) ; à l'intérieur, des **séquences** ; dans les séquences, des **cartes de scène**.
- **VUE-04** Une carte affiche : numéro, en-tête, résumé, personnages présents, durée estimée, couleur, étiquettes, point de structure associé, statut d'écriture (à écrire, premier jet, à réécrire, validée).
- **VUE-05** **Glisser-déposer** une scène ou une séquence pour la déplacer : le scénario est réordonné en conséquence (avec confirmation et possibilité d'annuler).
- **VUE-06** Créer une scène depuis le tableau sans avoir encore écrit son texte (carte vide qui apparaît dans le scénario comme un en-tête à compléter).
- **VUE-07** Niveaux de zoom : actes seuls, actes + séquences, tout.
- **VUE-08** Filtres et coloration : par personnage, lieu, intrigue (A, B, C…), étiquette, statut. Exemple : « colorer les scènes où apparaît Marie ».
- **VUE-09** Affichage en **lignes d'intrigue** : une ligne par intrigue ou par personnage, pour voir l'entrelacement.

#### Vue Chronologie

- **VUE-10** Frise horizontale des scènes **dans l'ordre du récit**, largeur proportionnelle à la durée estimée, actes et points de structure matérialisés.
- **VUE-11** Bascule **ordre du récit / ordre chronologique de l'histoire** : chaque scène peut recevoir une date et une heure internes à l'histoire (« jour 3, 22 h », « 1944 »), ce qui permet de gérer flashbacks, récits non linéaires et ellipses.
- **VUE-12** Pistes superposées : une piste par personnage pour voir qui est présent quand ; courbe d'intensité dramatique éditable.
- **VUE-13** Les événements de la chronologie de l'univers (5.2) peuvent être affichés en arrière-plan.

---

## 6. Partie Réalisation

### 6.1 Moodboard

- **MOO-01** Créer plusieurs moodboards par projet (général, par personnage, par lieu, par séquence, lumière, costumes, couleurs…).
- **MOO-02** **Canevas libre** : images, vidéos (fichiers locaux), GIF, couleurs, textes, notes ; redimensionner, superposer, grouper.
- **MOO-03** Ajout par glisser-déposer depuis l'explorateur de fichiers ou par collage depuis le presse-papiers (une image copiée dans un navigateur peut être collée).
- **MOO-04** **Palette de couleurs** extraite automatiquement des images, avec codes HEX.
- **MOO-05** Rattacher un moodboard à des scènes, personnages ou lieux ; il apparaît sur leur fiche.
- **MOO-06** Mode présentation plein écran ; export PDF et image.

### 6.2 Découpage technique (shotlist)

- **DEC-01** Pour chaque scène, une liste ordonnée de **plans** (numérotation 12-1, 12-2… ou 12A, 12B…).
- **DEC-02** Champs d'un plan : taille de plan (très gros plan, gros plan, plan rapproché, plan américain, plan moyen, plan d'ensemble, plan général), angle (plongée, contre-plongée, niveau, oblique), mouvement (fixe, panoramique, travelling, steadicam, épaule, grue, drone, zoom), objectif / focale, caméra, cadence, support (pied, dolly…), son (direct, sans son, playback), personnages dans le champ, description de l'action, dialogue couvert, durée estimée, lumière, effets (SFX/VFX), notes.
- **DEC-03** Lier un plan au passage exact du scénario qu'il couvre (surlignage dans le texte), et vérifier la couverture (passages non couverts signalés).
- **DEC-04** Vue tableau (type tableur) et vue cartes ; colonnes personnalisables et masquables.
- **DEC-05** **Plan au sol** : schéma du décor vu de dessus avec positions de la caméra, des personnages, des sources de lumière et leurs déplacements, par plan.
- **DEC-06** Ordre de tournage distinct de l'ordre de montage (pour regrouper les plans par axe de caméra).
- **DEC-07** Estimation du temps de tournage d'une scène à partir de ses plans ; transmise au plan de travail.
- **DEC-08** Export PDF et CSV.

### 6.3 Storyboard

- **STB-01** Une **case** par plan du découpage (ou indépendante), avec image et légende (description, dialogue, mouvement).
- **STB-02** Sources d'image : import de fichier, **dessin directement dans l'outil** (crayon, gomme, calques, flèches de mouvement de caméra, prise en charge des tablettes graphiques et de la pression du stylet, cadre au format choisi : 1.85, 2.39, 16/9, 4/3, 9/16), reprise d'une image du moodboard.
- **STB-03** Mise en page : grille (2, 3, 4, 6 cases par page), format paysage ou portrait.
- **STB-04** Synchronisation avec le découpage : ajouter un plan crée une case, les informations techniques s'affichent sous la case.
- **STB-05** **Animatique** : lecture des cases à la suite avec durées, et piste son importée (dialogues enregistrés, musique temporaire) pour juger du rythme ; export vidéo.
- **STB-06** Notes et versions sur chaque case.
- **STB-07** Export PDF et images.

---

## 7. Partie Production

L'utilisateur prépare et suit la production seul dans Oniric. Les documents destinés à l'équipe (feuilles de service, listes, plannings) sont **exportés** puis envoyés par ses propres moyens.

### 7.1 Équipe, contacts et rôles

- **EQU-01** **Carnet de contacts** local, réutilisable entre les projets du PC : identité, photo, coordonnées, adresse, langue, métiers, agent, régime (intermittent, salarié, prestataire, bénévole), allergies et régime alimentaire (pour la cantine), contact d'urgence, documents (CV, bande démo). Champs sensibles (numéro de sécurité sociale, RIB) facultatifs, masqués par défaut.
- **EQU-02** **Équipe du projet** : affecter un contact à un ou plusieurs **postes** dans un **département**, avec dates de présence, tarif, statut du contrat.
- **EQU-03** **Catalogue de postes** prérempli avec les 15 départements et leurs métiers (voir annexe 16.1), modifiable et extensible.
- **EQU-04** **Organigramme** généré automatiquement par département, avec chefs de poste.
- **EQU-05** **Distribution** : lier un comédien à un personnage de la bible ; gérer rôles principaux, secondaires, silhouettes, figuration, doublures et cascadeurs.
- **EQU-06** **Casting** : rôles à pourvoir, candidats, auditions (date, vidéo importée, notes), présélection, choix final.
- **EQU-07** **Disponibilités** de chaque personne saisies dans un calendrier, prises en compte par le plan de travail.
- **EQU-08** Liste d'équipe exportable en PDF, CSV et vCard ; import de contacts depuis un fichier CSV ou vCard.

### 7.2 Dépouillement

- **DEP-01** Pour chaque scène, une **fiche de dépouillement** : numéro, en-tête, INT/EXT, jour/nuit, décor, durée en huitièmes de page, résumé, et éléments par catégorie.
- **DEP-02** **Catégories standard**, colorées selon l'usage professionnel : rôles, silhouettes, figuration, cascades, véhicules, accessoires, accessoires de jeu, décor, costumes, maquillage et coiffure, effets spéciaux plateau, effets visuels, animaux, animalier, musique, son, équipements spéciaux, sécurité, notes. Catégories **personnalisables**.
- **DEP-03** **Marquage dans le texte** : sélectionner un mot du scénario et l'affecter à une catégorie ; il se surligne dans la couleur de la catégorie.
- **DEP-04** **Pré-dépouillement automatique** : personnages, lieux et éléments de la bible détectés dans le texte et proposés ; l'utilisateur valide ou rejette.
- **DEP-05** Les éléments dépouillés sont **les fiches de la bible** quand elles existent (un objet de la bible devient un accessoire du dépouillement), sans double saisie.
- **DEP-06** Rapports : liste des éléments par catégorie avec scènes concernées, liste des scènes par décor, par personnage, par élément ; export PDF et CSV.
- **DEP-07** Une modification du scénario après dépouillement signale les scènes à revoir.

### 7.3 Plan de travail (planning de tournage)

- **PDT-01** **Stripboard** : une bande par scène, couleur selon INT/EXT et JOUR/NUIT, avec décor, personnages (par numéro), durée en huitièmes, estimation du temps de tournage.
- **PDT-02** Organiser les bandes en **journées de tournage** par glisser-déposer ; insérer jours de repos, déplacements, bannières.
- **PDT-03** **Optimisation assistée** : regrouper par décor, par comédien, par moment de la journée ; afficher les conflits (comédien indisponible, décor sans autorisation à cette date, journée trop chargée).
- **PDT-04** **Tableau de présence des comédiens** (*day out of days*) : jours de travail, de début, de fin, de repos par comédien.
- **PDT-05** Plusieurs versions de planning en parallèle (scénarios « beau temps » / « pluie »).
- **PDT-06** **Calendrier de production** global (préparation, essais, tournage, montage, livraison) ; export en fichier iCal à importer dans n'importe quel agenda.
- **PDT-07** Export du plan de travail en PDF et XLSX.

### 7.4 Feuilles de service

- **FDS-01** Créer la feuille de service d'une journée **à partir du plan de travail** : scènes du jour, décors, personnages, éléments nécessaires sont préremplis.
- **FDS-02** Contenu : titre, date, numéro de journée (« J12 / 30 »), horaires (rendez-vous général, PAT – prêt à tourner –, repas, fin prévue), météo prévue (saisie manuelle), lever et coucher du soleil (calculés à partir des coordonnées du décor), adresse des décors avec plan d'accès généré depuis la carte (décor, base, parking, hôpital), parking, base / cantine, **hôpital et pharmacie les plus proches** (repris de la fiche du décor), numéros d'urgence, scènes du jour (résumé, pages, personnages, décor), comédiens (personnage, heure de prise en charge, HMC – habillage, maquillage, coiffure –, heure sur le plateau), figuration, horaires par département, besoins particuliers (véhicules, animaux, cascades, effets), consignes de sécurité, programme prévisionnel du lendemain, contacts clés.
- **FDS-03** **Horaires individuels** : export d'une version personnalisée par destinataire, avec **son** heure de convocation en tête.
- **FDS-04** **Modèles** de feuille de service personnalisables (logo, sections, ordre).
- **FDS-05** **Export** en PDF (version générale et versions individuelles en un seul lot, un fichier par personne nommé à son nom) pour envoi par l'utilisateur.
- **FDS-06** **Suivi de diffusion manuel** : liste des destinataires avec cases « envoyée » et « confirmée » à cocher.
- **FDS-07** Mise à jour après diffusion : nouvelle version numérotée, différences surlignées.
- **FDS-08** **Rapport de fin de journée** : scènes et plans tournés, minutage, horaires réels, incidents, notes de continuité.

### 7.5 Budget

- **BUD-01** **Grille budgétaire** hiérarchique : chapitres > postes > lignes. Modèles fournis : **devis type CNC** (France) et grille *Above the line / Below the line* (international) ; modèles personnalisés.
- **BUD-02** Une ligne : libellé, quantité, unité (jour, semaine, forfait), taux, nombre de personnes, total, charges sociales (taux paramétrables selon régime), TVA, notes.
- **BUD-03** **Liens avec les autres modules** : une ligne peut être reliée à un poste de l'équipe (taux × jours de présence), à des éléments du dépouillement, à un décor, au nombre de jours du plan de travail ; mise à jour automatique quand ces données changent.
- **BUD-04** **Imprévus** (pourcentage paramétrable), frais généraux, assurance, garantie de bonne fin.
- **BUD-05** **Plusieurs versions** du budget (estimatif, prévisionnel, réalisé) ; comparaison.
- **BUD-06** **Suivi des dépenses** : saisir une dépense (montant, date, fournisseur, ligne, justificatif scanné ou photographié), suivi du réalisé par rapport au prévisionnel, alertes de dépassement.
- **BUD-07** **Plan de financement** : sources (apport personnel, coproducteurs, préachats, CNC, régions, SOFICA, financement participatif, investisseurs, crédit), montants, statut (demandé, accordé, versé).
- **BUD-08** **Récapitulatif** (topsheet) et rapports exportables en PDF et XLSX.
- **BUD-09** Multidevise avec taux de change saisis manuellement.

### 7.6 Repérages

- **REP-01** Fiche **décor réel** : nom, adresse, coordonnées GPS, type, propriétaire / contact, photos et vidéos, plan, orientation, accès, parking, électricité disponible, sanitaires, réseau téléphonique, nuisances sonores, contraintes, coût de location, hôpital et pharmacie les plus proches, statut (piste, visité, retenu, refusé, réservé).
- **REP-02** Relier un décor réel à un ou plusieurs **lieux de la bible** (un même décor peut servir pour plusieurs lieux de l'histoire, et inversement).
- **REP-03** **Coordonnées GPS lues automatiquement** dans les photos importées (données EXIF), pour remplir la fiche.
- **REP-04** **Carte interactive** de type Google Maps :
  - fond de carte vectoriel issu d'OpenStreetMap : rues, bâtiments, noms de lieux, déplacement et zoom fluides de la vue du pays jusqu'à la rue ;
  - **recherche d'adresse** et de lieux (villes, rues, numéros) ;
  - **épingles** pour chaque décor réel, piste de repérage, base, parking, cantine, hôpital et pharmacie ; couleur selon le statut ; clic sur une épingle pour ouvrir la fiche ;
  - placer un décor en cliquant sur la carte, ou automatiquement à partir de son adresse ou des coordonnées GPS de ses photos ;
  - **distances** et **itinéraires** routiers entre décors et base, avec temps de trajet estimé en voiture ou à pied ;
  - affichage de la **direction du soleil** au lever, au coucher et à l'heure choisie sur le décor sélectionné (calcul local) ;
  - calques : décors du projet, pistes refusées, journées de tournage (filtrer les décors d'une journée) ;
  - capture d'une zone de carte pour l'intégrer à une feuille de service ou à un dossier.
- **REP-04b** **Connexion de la carte** : c'est la **seule partie du logiciel qui se connecte à Internet**. Elle utilise par défaut des services libres et gratuits, sans clé ni inscription quand c'est possible :

  | Besoin | Service par défaut | Conditions à respecter |
  |---|---|---|
  | Fond de carte | **OpenFreeMap** (tuiles vectorielles OpenStreetMap) | Gratuit, sans clé, sans limite annoncée, usage commercial autorisé ; financé par les dons, sans garantie de disponibilité |
  | Recherche d'adresse | **Nominatim** (serveur public de la fondation OpenStreetMap) | Uniquement des recherches lancées par l'utilisateur, au plus une requête par seconde, pas d'autocomplétion à chaque frappe, identifiant d'application (User-Agent) explicite, résultats mis en cache |
  | Itinéraires | **openrouteservice** avec une clé gratuite créée par l'utilisateur ; à défaut, serveur de démonstration **OSRM** | Quotas journaliers d'openrouteservice ; serveur OSRM sans garantie et sans requêtes en masse |

  Les adresses de ces services se modifient dans les réglages, pour basculer vers un autre fournisseur ou un serveur auto-hébergé sans mise à jour du logiciel. L'attribution « © contributeurs OpenStreetMap » et celle de chaque service sont affichées en permanence sur la carte.
- **REP-04c** **Zones hors ligne** : comme dans Google Maps, l'utilisateur peut enregistrer une zone (autour d'un décor, d'une commune) pour la consulter sans connexion, par exemple sur le lieu de tournage. La taille d'une zone est limitée pour ne pas surcharger les services gratuits. Les tuiles déjà consultées sont gardées en cache, partagé entre tous les projets du PC.
- **REP-04d** **Sans connexion** : les épingles, adresses, coordonnées, distances et temps de trajet déjà calculés restent affichés, sur le fond des zones enregistrées ou, à défaut, sur une grille simple. Le reste de la fiche décor reste entièrement utilisable.
- **REP-04e** **Contrôle par l'utilisateur** : la connexion de la carte peut être désactivée dans les réglages ; un indicateur montre quand la carte est en train de se connecter. Seules les données nécessaires sont envoyées (zone affichée, texte de la recherche, points de l'itinéraire), jamais le contenu du projet.
- **REP-04f** Vue satellite non fournie (aucune source d'images libre et gratuite utilisable dans ces conditions) ; une photo aérienne ou une capture peut être importée et calée sur la carte comme calque.
- **REP-05** **Comparer** plusieurs pistes pour un même lieu de l'histoire (photos côte à côte, grille de critères notée).
- **REP-06** **Visites de repérage** : date, participants, compte rendu, photos.
- **REP-07** **Course du soleil** et heure dorée calculées localement pour une date et des coordonnées données.

### 7.7 Autorisations de tournage

- **AUT-01** Par décor et par période, une **demande d'autorisation** : organisme (mairie, préfecture, police, gestionnaire d'espace public, propriétaire privé, parc naturel, aviation civile pour le drone…), type (occupation de voirie, stationnement, drone, armes factices, pyrotechnie, fermeture de rue…), dates, horaires, contact, documents fournis.
- **AUT-02** **Statut** : à faire, envoyée, en instruction, accordée, refusée, expirée ; avec date limite de dépôt et rappels.
- **AUT-03** **Modèles de documents** (courrier de demande, contrat de location de décor, autorisation de droit à l'image, cession de droits, accord de propriétaire) remplis automatiquement avec les données du projet, éditables, exportables en PDF et DOCX.
- **AUT-04** **Alerte de cohérence** : une journée du plan de travail dans un décor sans autorisation accordée est signalée.
- **AUT-05** Suivi des **autorisations de droit à l'image** des figurants et des personnes filmées (document signé scanné en pièce jointe).
- **AUT-06** Suivi des **assurances** et attestations par décor ou par activité à risque.

---

## 8. Fonctions transverses

### 8.1 Fichiers et médias

- **FIC-01** Espace de fichiers par projet, organisé en dossiers, avec aperçu des images, PDF, vidéos et sons.
- **FIC-02** Tout fichier peut être lié à un ou plusieurs objets du projet.
- **FIC-03** Les fichiers importés sont copiés dans le projet ; option pour **lier** des fichiers volumineux (vidéos) restés ailleurs sur le disque, avec signalement si le lien est rompu.
- **FIC-04** Indicateur de la taille du projet et outil de nettoyage des fichiers inutilisés.

### 8.2 Recherche et navigation

- **RCH-01** Recherche globale dans le projet (texte du scénario, fiches, plans, contacts, fichiers) avec filtres par type.
- **RCH-02** Palette de commandes (Ctrl + K) pour naviguer et agir vite.
- **RCH-03** Panneau « Liens » sur chaque objet : tout ce qui y fait référence.
- **RCH-04** Navigation par onglets et historique (précédent / suivant).

### 8.3 Import et export

| Domaine | Formats |
|---|---|
| Projet complet | Dossier projet (format ouvert et documenté) ; archive `.oniric` pour le transfert |
| Cartographie | Services en ligne OpenStreetMap configurables ; zones hors ligne en cache |
| Scénario | FDX, Fountain, PDF, DOCX, Celtx (import) ; FDX, Fountain, PDF, DOCX (export) |
| Tableaux | CSV, XLSX |
| Documents | PDF personnalisés (logo, en-tête, filigrane), DOCX |
| Contacts | CSV, vCard |
| Calendriers | iCal (export) |
| Animatique | MP4 (export) |
| Modèles et bible | Fichiers d'échange dédiés |

### 8.4 Impression

- **IMP-01** Impression directe de tous les documents (scénario, feuilles de service, découpage, storyboard, rapports), avec aperçu.

### 8.5 Expérience utilisateur

- **UX-01** Interface en français et en anglais, traduction prévue pour d'autres langues (fichiers de traduction ouverts aux contributions).
- **UX-02** Thème clair et sombre.
- **UX-03** Adapté aux écrans d'ordinateur portable et de bureau, à partir de 1280 × 720 ; plusieurs fenêtres possibles (par exemple scénario sur un écran, storyboard sur l'autre).
- **UX-04** Accessibilité : navigation complète au clavier, contrastes suffisants, compatibilité avec les lecteurs d'écran ; WCAG 2.1 niveau AA visé.
- **UX-05** Parcours de démarrage : projet d'exemple, visite guidée, modèles.
- **UX-06** Aide intégrée consultable hors ligne.

---

## 9. Modèle de données

### 9.1 Entités principales

| Entité | Description | Relations clés |
|---|---|---|
| Profil | Informations de l'utilisateur pour les documents | utilisé par tous les projets |
| Contact | Personne du carnet local | affectée à des Postes, joue des Personnages |
| Modèle | Structure, catégories, feuille de service, budget, document | réutilisé par les Projets |
| Projet | Le film, un dossier projet | contient Bible, Scénario, Équipe… ; Épisodes au lot 3 |
| Épisode | Pour les séries (lot 3) | appartient à Projet, a son Scénario |
| FormatScénario | Format fourni ou personnalisé | utilisé par Projet et par les exports |
| ZoneHorsLigne / CacheCarte | Zones de carte enregistrées et tuiles en cache | partagé entre tous les Projets |
| ÉtapeÉcriture | Contenu des étapes 1 à 9 | appartient à Projet |
| ModèleStructure | Trois actes, Snyder, voyage du héros… | a des PointsDeStructure |
| Acte | Grande division du récit | contient des Séquences |
| Séquence | Groupe de scènes | appartient à Acte, contient des Scènes |
| **Scène** | **Objet pivot** | dans Séquence ; a Personnages, Lieu, Plans, ÉlémentsDépouillés, Bandes |
| VersionScénario | Version figée ou révision colorée | contient l'état des Scènes |
| Retour / Lecteur | Fiche de lecture et remarques | remarques ancrées à des passages |
| Fiche | Élément de la bible (type + champs) | liée à d'autres Fiches et aux Scènes |
| ÉvénementUnivers | Fait historique daté | lié à Fiches |
| Moodboard / ÉlémentMoodboard | Planche d'ambiance et son contenu | lié à Scènes, Fiches |
| Plan | Plan du découpage technique | appartient à Scène, a une CaseStoryboard |
| CaseStoryboard | Dessin ou image d'un plan | liée à Plan |
| Département / Poste | Organisation de l'équipe | Poste rattaché à Département et Contact |
| CatégorieDépouillement / ÉlémentDépouillé | Besoins par scène | ÉlémentDépouillé lié à Scène, éventuellement à Fiche |
| JournéeTournage / Bande | Plan de travail | Bande = Scène placée dans une Journée |
| FeuilleDeService / Destinataire | Convocation du jour | issue d'une Journée ; suivi manuel par Destinataire |
| Budget / LigneBudget / Dépense / SourceFinancement | Finances | LigneBudget liée à Poste, Élément, Décor |
| DécorRéel / VisiteRepérage | Repérages | DécorRéel lié à Fiches Lieu |
| Autorisation | Démarches administratives | liée à DécorRéel et Journées |
| Tâche | À faire | polymorphe : sur tout objet |
| Fichier | Média intégré ou lié | lié à tout objet |

### 9.2 Règles de gestion importantes

- **RG-01** Une scène supprimée n'est jamais effacée immédiatement : elle passe dans la corbeille de scènes ; ses plans, éléments dépouillés et bandes sont conservés et désactivés.
- **RG-02** Renommer une fiche (personnage, lieu) propose de mettre à jour toutes ses occurrences dans le scénario.
- **RG-03** Une fois le scénario verrouillé, les numéros de scènes ne changent plus ; les scènes ajoutées sont numérotées 12A, 12B…
- **RG-04** Un contact du carnet local utilisé dans un projet est copié dans le dossier du projet, pour que le projet reste complet s'il est ouvert sur un autre PC ; les modifications peuvent être resynchronisées avec le carnet sur demande.
- **RG-05** Chaque objet a un identifiant unique universel, pour permettre plus tard des fusions ou des échanges entre projets (voir 14).

---

## 10. Exigences non fonctionnelles

### 10.1 Performance

Sur un ordinateur portable courant (4 cœurs, 8 Go de RAM, SSD) :

| Exigence | Cible |
|---|---|
| Démarrage de l'application | < 3 s |
| Ouverture d'un projet avec un scénario de 120 pages | < 2 s |
| Latence de frappe dans l'éditeur | imperceptible (< 50 ms) |
| Génération d'un PDF de scénario de 120 pages | < 10 s |
| Réordonner 200 scènes dans la vue Tableau | fluide, sans attente perceptible |
| Projet de 5 Go de médias | ouverture sans charger tous les médias en mémoire |

### 10.2 Fiabilité des données

- **FIA-01** Écritures sur disque **atomiques** : la base du projet n'est jamais laissée dans un état corrompu, même en cas de coupure pendant l'enregistrement ; un média n'est référencé qu'une fois entièrement copié dans le dossier.
- **FIA-02** Vérification d'intégrité à l'ouverture ; en cas de problème, proposition d'ouvrir la dernière copie de sauvegarde valide.
- **FIA-03** **Format ouvert et documenté** : le dossier projet peut être lu sans Oniric (base SQLite au schéma documenté, médias en fichiers ordinaires), pour que les données restent accessibles même si le logiciel n'est plus maintenu.
- **FIA-05** Un média supprimé ou déplacé à la main dans le dossier est signalé à l'ouverture, avec proposition de le retrouver.
- **FIA-04** Compatibilité ascendante : un projet créé avec une version antérieure s'ouvre toujours dans une version plus récente (migration automatique, avec copie de l'original).

### 10.3 Sécurité et confidentialité

- **SEC-01** **Aucune connexion réseau**, en dehors de la carte des repérages (REP-04b), qui peut être désactivée ; aucune télémétrie, aucune vérification de mise à jour automatique. Les connexions de la carte passent uniquement en HTTPS.
- **SEC-02** **Chiffrement facultatif** d'un projet par mot de passe (algorithme standard et éprouvé). Un mot de passe oublié ne peut pas être récupéré : l'utilisateur en est clairement averti.
- **SEC-03** Champs sensibles du carnet de contacts (sécurité sociale, RIB, santé) masqués à l'affichage et exclus des exports par défaut.
- **SEC-04** **Filigrane** nominatif sur les exports de scénario, pour dissuader les fuites.
- **SEC-05** Les fichiers importés ne sont jamais exécutés ; les formats importés sont analysés de manière sûre.
- **SEC-06** Paquets d'installation signés ; empreintes publiées pour vérification.

### 10.4 Données personnelles

Les données restent sur l'ordinateur de l'utilisateur, qui est seul responsable de leur usage. Le logiciel l'aide à respecter le RGPD vis-à-vis des personnes de son équipe :

- **RGP-01** Export de toutes les données d'un contact (droit d'accès) et suppression complète d'un contact dans le carnet et dans les projets choisis (droit à l'effacement).
- **RGP-02** Modèle de mention d'information à remettre à l'équipe, fourni dans la bibliothèque de documents.

### 10.5 Propriété intellectuelle

- **PI-01** Les contenus restent la propriété exclusive de leurs auteurs.
- **PI-02** Horodatage local des versions figées, à titre d'indication ; il ne remplace pas un dépôt officiel.

### 10.6 Compatibilité

- **CPT-01** Système : **Windows 10 et 11** (64 bits) uniquement au lancement. La technologie retenue permettra macOS et Linux plus tard sans réécriture (voir 14).
- **CPT-02** Installation sans droits administrateur possible ; version portable (sans installation) proposée.
- **CPT-03** Mises à jour : téléchargement manuel du nouvel installateur ; l'application ne cherche jamais de mise à jour d'elle-même.

### 10.7 Qualité

- Tests automatisés (unitaires, intégration, bout en bout) sur les parcours critiques : écriture, enregistrement et récupération, import/export de scénario, dépouillement, feuille de service, budget.
- Intégration continue (GitHub Actions), publication des versions avec notes de version dans les *Releases* GitHub.
- Recette manuelle des parcours critiques sur une installation neuve de Windows 10 et 11 avant chaque version (voir le PRD).

---

## 11. Choix techniques

Ces choix sont détaillés et justifiés dans le [document d'architecture](Architecture_Oniric.md), qui fait foi en cas d'écart. Les points les plus risqués y sont confirmés par un prototype avant la v0.1.

| Couche | Proposition | Justification |
|---|---|---|
| Application de bureau | **Tauri 2** (repli : Electron) | Multiplateforme, installateur léger, accès au système de fichiers ; cœur Rust limité à l'infrastructure |
| Interface | React + TypeScript | Interfaces riches : éditeur, kanban, canevas, frise |
| Éditeur de texte | **ProseMirror** | Format scénario personnalisé, raccourcis, annulation, pagination par décorations |
| Canevas (moodboard, storyboard, plan au sol) | **Konva** + perfect-freehand | Dessin, calques, stylet, manipulation d'images ; licence MIT (tldraw écarté : licence non libre) |
| Stockage | **SQLite** (compilé avec SQLCipher) dans le dossier projet, copie de travail locale pendant l'édition, médias en fichiers ordinaires | Fiable, transactionnel, résistant aux plantages, lisible par d'autres outils |
| Carte | MapLibre GL (rendu vectoriel) + tuiles OpenFreeMap | Carte fluide type Google Maps, données libres, gratuite et sans clé |
| Recherche d'adresse | API Nominatim, adresse configurable | Libre et gratuit, dans le respect de sa politique d'usage |
| Itinéraires | API openrouteservice (clé gratuite de l'utilisateur) ou OSRM, adresse configurable | Distances et temps de trajet sans service payant |
| Recherche | Recherche plein texte de SQLite (FTS5) | Aucun service supplémentaire |
| Génération PDF | Conversion HTML vers PDF par WebView2 (repli : pdf-lib) | Même moteur pour l'écran, l'impression et le PDF : pagination identique |
| Orthographe | Dictionnaires Hunspell embarqués | Fonctionne hors ligne |
| Polices | Polices libres embarquées (dont une police à chasse fixe type Courier) | Rendu identique sur tous les PC, aucun téléchargement |
| Licence | **GPL-3.0** | Logiciel libre et gratuit ; toute version modifiée et redistribuée reste libre |
| Distribution | Dépôt **GitHub** public (code, tickets, publications), installateur Windows (MSI/EXE) et version portable | Accès libre au code et aux exécutables |
| Intégration continue | GitHub Actions | Tests automatisés et construction des installateurs à chaque modification |

---

## 12. Positionnement face à StudioBinder

| Fonction | StudioBinder | Oniric |
|---|---|---|
| Éditeur de scénario formaté, révisions colorées | Oui | Oui |
| Scripts AV deux colonnes | Oui | Oui |
| **Atelier d'écriture guidé (idée → diffusion)** | Non | **Oui, cœur du logiciel** |
| **Bible / lore / encyclopédie de l'univers** | Non | **Oui** |
| **Vue Tableau actes / séquences / scènes** | Partielle (plans de scénario) | **Oui, synchronisée avec le texte** |
| **Chronologie récit / histoire** | Non | **Oui** |
| Dépouillement | Oui | Oui, relié à la bible |
| Shotlist, storyboard, moodboard | Oui | Oui + animatique, plan au sol |
| Plan de travail, stripboard | Oui | Oui |
| Feuilles de service | Oui, envoi et suivi en ligne | Oui, export PDF individuel et suivi manuel |
| Budget | Oui | Oui + devis type CNC, plan de financement |
| **Repérages détaillés** | Limité | **Oui (soleil, comparaison, GPS des photos)** |
| **Autorisations de tournage** | Via documents | **Oui, module dédié avec suivi et alertes** |
| Collaboration, partage en ligne | Oui | Non (usage individuel) |
| **Fonctionnement sans connexion** | Non | **Oui, sauf la carte (avec zones hors ligne)** |
| **Données sur son propre ordinateur, format ouvert** | Non (cloud) | **Oui** |
| Prix | Abonnement payant | **Gratuit** |
| Code source | Fermé | **Libre** |
| Adapté au contexte français (SACD, CNC, intermittence) | Non | **Oui** |

**Proposition de valeur** : *le logiciel libre et gratuit qui accompagne un film de l'idée jusqu'au tournage, entièrement sur son ordinateur, avec une bible vivante qui relie l'histoire à sa fabrication.*

---

## 13. Lotissement et priorisation

Priorités selon la méthode MoSCoW : **M** = indispensable, **S** = important, **C** = souhaitable, **W** = plus tard.

Les trois parties existent dans chaque projet dès le lot 1 ; les lots enrichissent progressivement chacune d'elles.

### Lot 1 — Écrire

Objectif : écrire son film de A à Z sur son PC.

| Fonction | Priorité |
|---|---|
| Application de bureau Windows, dossier projet, enregistrement automatique, sauvegardes, récupération | M |
| Formats de scénario français, américain et personnalisés | M |
| Accueil, projets récents, profil local | M |
| Atelier d'écriture étapes 1 à 4 | M |
| Bible : personnages, lieux, objets, véhicules, événements, types personnalisés, liens wiki | M |
| Éditeur de scénario formaté, pagination, export PDF / FDX / Fountain, import FDX / Fountain | M |
| Vue Page, vue Tableau (actes / séquences / scènes) | M |
| Versions, comparaison, notes | M |
| Vue Chronologie (ordre du récit) | S |
| Squelette des parties Réalisation et Production (navigation, écrans vides prêts) | S |

### Lot 2 — Mettre en scène et préparer

Objectif : passer de l'écriture à la préparation du tournage.

| Fonction | Priorité |
|---|---|
| Étapes 5 à 9 complètes (passes, saisie des retours, dépôts, soumissions) | M |
| Révisions colorées, verrouillage | M |
| Moodboards | M |
| Découpage technique, storyboard (import d'images + dessin simple) | M |
| Carnet de contacts, équipe, catalogue des postes, distribution | M |
| Dépouillement manuel et assisté | M |
| Plan de travail, stripboard | M |
| Feuilles de service avec export PDF individuel | M |
| Chronologie ordre de l'histoire, cartes de la bible, arbres généalogiques | S |
| Chiffrement du projet par mot de passe | S |

### Lot 3 — Produire

Objectif : piloter la production complète.

| Fonction | Priorité |
|---|---|
| Budget, suivi des dépenses, plan de financement | M |
| Repérages complets | M |
| Autorisations de tournage, modèles de documents | M |
| Rapports de fin de journée | S |
| Casting | S |
| Séries : saisons et épisodes | S |
| Carte interactive, recherche d'adresse, itinéraires, zones hors ligne | M |
| Animatique, plan au sol | C |
| Import des annotations PDF des lecteurs | C |

---

## 14. Évolutions envisagées

Ces fonctions ont été étudiées puis **écartées de la version actuelle**. Elles sont notées ici pour que l'architecture ne les rende pas impossibles plus tard (identifiants uniques, format ouvert, séparation claire des données par projet) :

- **Studios** : structures qui gèrent plusieurs projets sans en créer, et auxquelles un cinéaste peut proposer son projet, y compris un studio dont il ne fait pas partie.
- **Collaboration** : plusieurs personnes sur un même projet, avec droits par partie, et écriture à plusieurs sur un même scénario.
- **Synchronisation** entre plusieurs appareils.
- **Messagerie interne** capable d'écrire à des contacts extérieurs, et **chat** général et par équipe.
- **Envoi des feuilles de service** depuis le logiciel, avec suivi de lecture.
- **Version serveur auto-hébergée** sur un VPS.
- **Versions macOS et Linux** de l'application de bureau.

---

## 15. Points ouverts

### 15.1 Décisions prises

| Sujet | Décision |
|---|---|
| Plateforme | Application pour ordinateur, **Windows uniquement** au lancement |
| Connexion | Aucune, sauf la carte des repérages |
| Utilisateurs | Une seule personne aux commandes d'un projet |
| Contenu d'un projet | Script, Réalisation et Production |
| Stockage | **Un dossier par projet** |
| Séries | Pas dans le premier lot ; prévues au lot 3 |
| Format de scénario | **Flexible** : français, américain ou personnalisé, modifiable à tout moment |
| Carte des repérages | **Carte interactive de type Google Maps**, connectée à des services OpenStreetMap libres et gratuits, avec zones hors ligne |
| Studios, collaboration, messagerie, chat | Écartés de la version actuelle |
| Prix et licence | Gratuit, licence **GPL-3.0** |
| Nom | **Oniric** |
| Développement | Une seule personne, sans échéance |
| Hébergement du code | **GitHub** |
| Intelligence artificielle | Aucune |

### 15.2 Questions restantes

Aucune question bloquante à ce stade. Un point de vigilance : les services cartographiques gratuits n'offrent aucune garantie de disponibilité et leurs conditions peuvent changer. Les adresses étant configurables (REP-04b), un changement de fournisseur ne demande pas de nouvelle version.

---

## 16. Annexes

### 16.1 Catalogue des postes par département

Ce catalogue est préchargé dans l'application (EQU-03) ; chaque projet peut l'adapter.

**1. Développement et production**
- Producteur / productrice — porte le projet, trouve les financements, supervise l'ensemble
- Producteur exécutif — gère le budget et l'organisation au quotidien
- Directeur de production — planning, budget, logistique, contrats
- Administrateur de production / comptabilité — suivi financier, paie, factures
- Assistants de production — coordination, transport, intendance
- Juridique et assurances — droits, contrats, assurances du tournage

**2. Écriture**
- Scénaristes
- Script doctor
- Dialoguiste
- Consultants (historique, scientifique, technique, juridique…)

**3. Réalisation**
- Réalisateur / réalisatrice
- Premier assistant réalisateur — planning de tournage, direction du plateau
- Deuxième et troisième assistants — figurants, coordination des acteurs
- Scripte — continuité, raccords, notes de tournage
- Directeur de casting et assistants casting
- Régisseur de figuration

**4. Image**
- Directeur de la photographie (chef opérateur)
- Cadreur
- Premier et second assistants caméra
- Opérateur Steadicam
- Photographe de plateau
- DIT (Digital Imaging Technician) et data manager
- Équipe drone

**5. Lumière et machinerie**
- Chef électricien et électriciens
- Chef machiniste, machinistes, grutiers
- Groupman (gestion de l'électricité)

**6. Son**
- Ingénieur du son (son direct)
- Perchman
- Assistant son
- Monteur son, bruiteur, mixeur
- Concepteur sonore (sound designer)

**7. Décors**
- Chef décorateur / production designer
- Ensemblier-décorateur
- Accessoiristes (de décor et de plateau)
- Constructeurs (menuisiers, staffeurs, peintres décorateurs)
- Régisseur d'extérieur et repéreurs (location scouts)
- Régisseur général et régie

**8. Costumes, maquillage et coiffure**
- Chef costumier et habilleurs
- Chef maquilleur, maquilleurs
- Chef coiffeur, coiffeurs
- Maquilleur effets spéciaux (prothèses, SFX)

**9. Acteurs**
- Rôles principaux et secondaires
- Figurants et silhouettes
- Doublures et cascadeurs
- Coordinateur de cascades
- Coachs (dialecte, combat, danse, enfants…)
- Coordinateur d'intimité

**10. Effets spéciaux**
- Effets spéciaux de plateau (SFX) : pyrotechnie, pluie, fumée, mécanique
- Effets visuels (VFX) : superviseur VFX, artistes 3D, compositing, matte painting, motion capture
- Animateurs et spécialistes d'animatronique

**11. Postproduction**
- Monteur image et assistant monteur
- Étalonneur (colorist)
- Truquiste / graphiste
- Générique et titrage
- Laboratoire / studio de postproduction
- Mastering (DCP)

**12. Musique**
- Compositeur
- Orchestrateur, musiciens, chef d'orchestre
- Superviseur musical — choix des musiques existantes, droits
- Ingénieur du son musique / studio d'enregistrement

**13. Logistique et sécurité**
- Régie, transport, cantine (catering)
- Sécurité du plateau
- Médecin ou secouriste de plateau
- Coordinateur sécurité / responsable HSE
- Chauffeurs

**14. Communication et distribution**
- Distributeur et vendeur international
- Attaché de presse / agence de relations presse
- Responsable marketing et graphistes (affiche, bande-annonce)
- Équipe réseaux sociaux
- Exploitants (salles) et plateformes (VOD, streaming)
- Responsable festivals

**15. Financement et institutions**
- Coproducteurs
- Chaînes de télévision et plateformes (préachats)
- CNC, régions, fonds d'aide
- SOFICA et investisseurs privés
- Banque / financeur de crédit
- Société de garantie (completion bond)

> Les départements 14 et 15 regroupent surtout des **partenaires externes** : ils sont gérés comme des contacts liés au projet (et au plan de financement pour le 15) plutôt que comme des membres de l'équipe technique.

### 16.2 Parcours type

1. Camille installe Oniric sur son PC et crée le projet « Les Heures Bleues », long métrage, drame. Elle crée le dossier du projet dans ses Documents et choisit un disque externe pour les sauvegardes.
2. Dans l'atelier, elle note son idée, rédige la prémisse, choisit le thème « la culpabilité » et le ton « sombre, réaliste ».
3. Elle crée les fiches de ses personnages ; la carte des relations se construit.
4. Elle choisit la structure en trois actes, remplit les points clés, rédige le synopsis puis le séquencier : les séquences apparaissent dans la vue Tableau.
5. Elle écrit le scénario en mode premier jet ; les noms de personnages s'autocomplètent depuis la bible.
6. Elle fige la V1 et exporte deux PDF filigranés pour deux lecteurs. À leur retour, elle saisit leurs remarques, les trie et réécrit par passes jusqu'à la V4.
7. Elle note son dépôt SACD, génère le dossier de présentation et suit ses envois aux producteurs.
8. Le projet avance : elle verrouille le scénario, crée les moodboards, le découpage et le storyboard.
9. Elle compose l'équipe à partir de son carnet de contacts, lance le dépouillement, monte le plan de travail et le budget. Pour les repérages, elle place ses décors sur la carte, compare les temps de trajet depuis la base, enregistre la zone de chaque décor pour l'avoir hors ligne sur place, et suit les autorisations.
10. La veille de chaque journée, elle génère la feuille de service à partir du planning, exporte une version PDF par personne avec son heure de convocation, l'envoie par sa propre messagerie et coche les confirmations reçues.

### 16.3 Glossaire

| Terme | Définition |
|---|---|
| Dossier projet | Dossier qui contient tout un projet (base de données et médias), dans un format ouvert |
| Archive `.oniric` | Dossier projet compressé en un seul fichier pour le transférer |
| Zone hors ligne | Portion de carte enregistrée sur le PC pour être consultée sans connexion |
| GPL-3.0 | Licence libre qui oblige toute version modifiée et redistribuée à rester libre |
| Logiciel libre | Logiciel dont le code source est publié et que chacun peut utiliser, étudier, modifier et redistribuer |
| Prémisse / pitch | Résumé du film en une ou deux phrases |
| Logline | Phrase d'accroche commerciale du film |
| Séquencier | Liste ordonnée des grandes séquences |
| Traitement | Version narrative détaillée, au présent, sans dialogues |
| Continuité dialoguée | Version scène par scène avec premiers dialogues |
| En-tête de scène | Ligne INT./EXT. – LIEU – JOUR/NUIT |
| Révisions colorées | Système de couleurs identifiant chaque série de modifications après verrouillage |
| Bible | Ensemble de la documentation de l'univers du film |
| Découpage technique / shotlist | Liste des plans à tourner par scène |
| Storyboard | Représentation dessinée des plans |
| Animatique | Storyboard animé avec durée et son |
| Plan au sol | Schéma vu de dessus des positions caméra, acteurs, lumières |
| Dépouillement | Recensement de tous les éléments nécessaires à chaque scène |
| Huitième de page | Unité de mesure de la longueur d'une scène en production |
| Plan de travail / stripboard | Planning de tournage organisé en bandes de scènes |
| Day out of days | Tableau de présence des comédiens sur la durée du tournage |
| Feuille de service | Document de convocation de l'équipe pour une journée de tournage |
| PAT | Prêt à tourner |
| HMC | Habillage, maquillage, coiffure |
| Topsheet | Page récapitulative du budget |
| Completion bond | Garantie de bonne fin |
| SACD / WGA | Sociétés d'auteurs permettant le dépôt des œuvres (France / États-Unis) |
| CNC | Centre national du cinéma et de l'image animée |
| SOFICA | Sociétés de financement du cinéma et de l'audiovisuel |
| DCP | Digital Cinema Package, format de livraison en salle |
