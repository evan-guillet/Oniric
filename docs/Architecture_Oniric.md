# Architecture technique — Oniric

> Ce document dit **comment** Oniric est construit : les briques, leur rôle, la façon dont les données circulent et sont protégées, et les choix techniques avec leurs raisons. Il complète le [PRD](PRD_Oniric.md), qui dit pourquoi et dans quel ordre, et le [cahier des charges](Cahier_des_charges_Oniric.md), qui dit quoi. Les identifiants entre crochets (par exemple [SAV-01]) renvoient au cahier des charges.

| Élément | Valeur |
|---|---|
| Produit | Oniric |
| Document | Architecture technique |
| Version | 1.1 |
| Date | 21/10/2026 |
| Auteur | Evan Guillet |
| Référence | Cahier des charges v2.4, PRD v1.2 |
| Statut | Confirmé par le prototype (section 13) ; v0.1 alpha construite (section 13.1) |

---

## Sommaire

1. [En bref](#1-en-bref)
2. [Contraintes qui guident l'architecture](#2-contraintes-qui-guident-larchitecture)
3. [Vue d'ensemble](#3-vue-densemble)
4. [Le cœur Rust](#4-le-cœur-rust)
5. [L'interface TypeScript](#5-linterface-typescript)
6. [Stockage et format du projet](#6-stockage-et-format-du-projet)
7. [Enregistrement, récupération et sauvegardes](#7-enregistrement-récupération-et-sauvegardes)
8. [L'éditeur de scénario et la mise en page](#8-léditeur-de-scénario-et-la-mise-en-page)
9. [Import, export et impression](#9-import-export-et-impression)
10. [Réseau : la carte des repérages](#10-réseau--la-carte-des-repérages)
11. [Sécurité](#11-sécurité)
12. [Qualité, tests et livraison](#12-qualité-tests-et-livraison)
13. [Prototype de validation](#13-prototype-de-validation)
14. [Décisions d'architecture](#14-décisions-darchitecture)
15. [Risques techniques](#15-risques-techniques)
16. [Annexes](#16-annexes)

---

## 1. En bref

- **Application de bureau Tauri 2** : une fenêtre WebView2 (le moteur de Microsoft Edge, déjà présent dans Windows 10 et 11) affiche l'interface ; un petit programme en **Rust** fait tout ce qui touche au disque, au système et au réseau.
- **Interface en React + TypeScript**. La logique métier (scènes, numérotation, pagination, dépouillement, plan de travail, budget) est écrite en **TypeScript pur**, sans dépendre de React ni de Tauri, donc facile à tester.
- **Une base SQLite par projet**, ouverte par le cœur Rust, qui est le seul à écrire. Pendant le travail, Oniric écrit dans une **copie de travail locale** et la recopie d'un seul coup dans le dossier projet : un plantage ou une coupure de courant ne peut pas corrompre le projet.
- **L'éditeur de scénario repose sur ProseMirror.** La mise en page est mesurée par le moteur d'affichage lui-même ; l'écran, l'impression et le PDF passent par ce même moteur, ce qui les rend identiques par construction.
- **Une seule porte vers Internet** : un module Rust qui ne sert que la carte, ne connaît que les adresses configurées et peut être coupé. L'interface n'a techniquement pas le droit d'ouvrir une connexion.
- **Ce que le prototype doit confirmer avant tout le reste** : la pagination identique à l'écran et dans le PDF, et l'absence de corruption sur 1 000 coupures brutales (section 13).

---

## 2. Contraintes qui guident l'architecture

| Contrainte | Origine | Conséquence pour l'architecture |
|---|---|---|
| Une seule personne développe, sans échéance | PRD 7 | Peu de technologies, toutes répandues ; le code Rust reste petit et délimité ; la logique est testable sans lancer l'application |
| Ne jamais perdre de travail | SAV-01, FIA-01, E3.1 | Écrivain unique, transactions courtes, copie de travail locale, remplacement atomique des fichiers |
| Plantage ou coupure pendant une écriture | PRJ-06 | La base active n'est jamais dans le dossier projet ; seul un fichier complet et vérifié y est déposé |
| Pagination exacte, en format français, américain ou personnalisé | EDT-02, EDT-04 | Un seul moteur de rendu pour l'écran, l'impression et le PDF |
| Aucune connexion sauf la carte | SEC-01, REP-04b | Interface sans accès réseau ; une passerelle Rust unique, avec liste d'adresses autorisées |
| Format ouvert, lisible sans Oniric | FIA-03 | SQLite au schéma documenté, JSON lisible, médias en fichiers ordinaires |
| Windows d'abord, macOS et Linux possibles plus tard | CPT-01 | Tauri ; code propre à Windows isolé dans un seul module |
| Licence GPL-3.0 | 11 | Toutes les dépendances sous licence compatible (annexe 16.2) |
| Plusieurs fenêtres | UX-03 | Les données vivent dans le cœur ; chaque fenêtre est avertie des changements |
| Démarrage < 3 s, ouverture < 2 s, frappe < 50 ms | 10.1 | Chargement à la demande, listes virtualisées, travaux lourds hors du fil de l'interface |

---

## 3. Vue d'ensemble

### 3.1 Les briques

```
┌──────────────────────────── Oniric.exe (un processus) ─────────────────────────────┐
│                                                                                    │
│  Fenêtre 1 (WebView2)            Fenêtre 2 (WebView2)        Fenêtres cachées       │
│  ┌──────────────────────────┐    ┌───────────────────┐       ┌──────────────────┐   │
│  │ Interface React          │    │ ex. storyboard    │       │ rendu PDF et     │   │
│  │ ─ modules (script, …)    │    │ sur 2e écran      │       │ impression       │   │
│  │ ─ logique métier TS      │    └─────────┬─────────┘       └────────┬─────────┘   │
│  │ ─ Web Workers (imports)  │              │                          │             │
│  └────────────┬─────────────┘              │                          │             │
│               │   commandes IPC  ▲ événements « données modifiées »   │             │
│  ═════════════╪══════════════════╪════════════════════════════════════╪═══════════  │
│               ▼                  │                                    ▼             │
│  Cœur Rust                                                                         │
│  ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────┐  │
│  │ projet   │ │ base       │ │ médias   │ │ réseau    │ │ système  │ │ documents│  │
│  │ ouverture│ │ SQLite,    │ │ import,  │ │ carte     │ │ fichiers,│ │ PDF,     │  │
│  │ verrou,  │ │ écrivain   │ │ vignettes│ │ seulement │ │ notifs,  │ │ impression│ │
│  │ copies   │ │ unique     │ │ protocole│ │           │ │ dialogues│ │ orthogr. │  │
│  └────┬─────┘ └─────┬──────┘ └────┬─────┘ └─────┬─────┘ └──────────┘ └──────────┘  │
└───────┼─────────────┼─────────────┼─────────────┼──────────────────────────────────┘
        ▼             ▼             ▼             ▼
  Dossier projet   Copie de travail   medias/     OpenFreeMap, Nominatim,
                   %LOCALAPPDATA%                 openrouteservice / OSRM
                   \Oniric\travail                (HTTPS, si activé)
```

### 3.2 Répartition des rôles

| Le cœur Rust fait | L'interface TypeScript fait |
|---|---|
| Ouvrir, verrouiller, migrer et vérifier un projet | Afficher, éditer, réagir au clavier et à la souris |
| Exécuter toutes les écritures en base, une à la fois | Décider *quoi* écrire : règles métier, validations, calculs |
| Recopier la base dans le dossier projet, faire les sauvegardes, créer les archives | Mettre en page le scénario, préparer les documents à exporter |
| Copier les médias, créer les vignettes, servir les fichiers à l'interface | Analyser les fichiers importés (FDX, Fountain, DOCX, PDF), dans des Workers |
| Seul accès au réseau (carte) | Annuler et rétablir |
| Notifications, dialogues de fichiers, association de l'extension `.oniric` | Traductions, thèmes, accessibilité |
| Conversion HTML vers PDF et impression par WebView2, orthographe | |

**Règle :** le Rust ne contient **aucune règle métier de cinéma**. S'il faut savoir ce qu'est une scène pour écrire une ligne de code, ce code va dans le TypeScript. Le cœur reste ainsi petit (environ 10 à 15 % du code), stable, et remplaçable (décision D-01).

### 3.3 Un exemple de bout en bout : taper une réplique

1. La frappe modifie le document ProseMirror en mémoire : l'affichage est immédiat, sans attente du disque.
2. L'éditeur note quelles scènes ont changé.
3. Après 1 s sans frappe (au plus toutes les 3 s pendant une frappe continue), l'interface envoie au cœur un **lot d'écritures** : « remplacer le contenu des scènes A et B ».
4. Le cœur exécute le lot dans **une transaction** sur la copie de travail locale, ajoute une ligne au journal [PRJ-08] et confirme.
5. Le cœur émet l'événement « scènes A et B modifiées » ; les autres vues et fenêtres (Tableau, Chronologie) se rafraîchissent.
6. Toutes les 30 s s'il y a eu des changements, et à la fermeture, le cœur dépose une copie complète et vérifiée de la base dans le dossier projet (section 7).

Après une coupure brutale, au pire les 3 dernières secondes de frappe sont perdues (exigence E3.1 : au plus 5 s).

---

## 4. Le cœur Rust

### 4.1 Modules

| Module | Responsabilités | Exigences |
|---|---|---|
| `project` | Créer, ouvrir, fermer ; lire `projet.oniric` ; gérer `.verrou` ; migrer le schéma ; vérifier l'intégrité ; gérer la copie de travail et sa recopie ; sauvegardes ; archive `.oniric` | PRJ-06, PRJ-07, SAV-01 à SAV-05, FIA-01, FIA-02, FIA-04 |
| `db` | Connexions SQLite (une pour écrire, plusieurs pour lire), transactions, journal, événements de changement, garde-fous SQL | FIA-01, PRJ-08, RCH-01 |
| `app_data` | Base de l'application : profil, carnet de contacts, modèles, réglages, projets récents | ACC-01, ACC-03, ACC-04 |
| `media` | Import atomique, liens externes, surveillance de `medias/`, vignettes, protocole `oniric-media://` | FIC-01 à FIC-04, FIA-05 |
| `network` | Passerelle unique vers les services de carte : tuiles, recherche d'adresse, itinéraires, cache, zones hors ligne | REP-04 à REP-04f, SEC-01 |
| `documents` | HTML vers PDF et impression par WebView2 ; orthographe Hunspell | EDT-11, IMP-01 |
| `system` | Dialogues de fichiers, notifications, extension `.oniric`, journal technique, données portables | PRJ-06b, TCH-03, CPT-02 |

Seul le module `system` et une partie de `documents` contiennent du code propre à Windows ; ils sont derrière une interface (*trait*) pour faciliter un portage futur.

### 4.2 Interface entre l'interface et le cœur

Les échanges passent par les commandes Tauri (appels asynchrones typés) et par des événements. Les types sont générés depuis le Rust vers le TypeScript (`specta` + `tauri-specta`) : une commande modifiée d'un côté casse la compilation de l'autre.

| Commande | Rôle |
|---|---|
| `project_create`, `project_open`, `project_close` | Cycle de vie d'un projet ; `open` renvoie l'état (normal, récupération proposée, base endommagée) |
| `db_query(sql, params)` | Lecture sur une connexion en lecture seule |
| `db_write(batch, meta)` | Lot d'écritures exécuté en une transaction ; `meta` décrit l'action pour le journal |
| `project_flush` | Recopie immédiate dans le dossier projet (avant un export d'archive, par exemple) |
| `backup_now`, `backup_list`, `backup_restore` | Sauvegardes |
| `archive_export`, `archive_import` | Archive `.oniric` |
| `media_import(paths, target)` | Import avec progression ; renvoie les fichiers créés |
| `map_geocode`, `map_route`, `map_offline_area_*` | Carte (les tuiles passent par un protocole, voir section 10) |
| `document_to_pdf(html, options)`, `document_print` | Conversion et impression |
| `spellcheck(words)`, `spell_suggest(word)` | Orthographe |

| Événement | Contenu |
|---|---|
| `db:changed` | Tables et identifiants modifiés, fenêtre d'origine |
| `project:flushed` | Recopie dans le dossier projet terminée (indicateur d'état) |
| `media:detected` | Fichiers déposés à la main dans `medias/` [PRJ-06] |
| `task:progress` | Progression d'un import, d'un export ou d'une sauvegarde |
| `network:activity` | La carte se connecte (indicateur exigé par REP-04e) |

**Pourquoi des requêtes SQL envoyées par l'interface ?** Écrire une commande Rust par opération (créer une fiche, déplacer une scène…) multiplierait le code Rust par dix. L'interface construit donc ses requêtes avec **Kysely**, un constructeur de requêtes typé, et le cœur les exécute. Garde-fous côté cœur : seule la base du projet ouvert est accessible, et un *authorizer* SQLite refuse `ATTACH`, le chargement d'extensions et les `PRAGMA` qui modifient la base. L'interface n'affiche aucun contenu venu d'Internet (section 11), ce qui rend ce choix acceptable.

### 4.3 Concurrence

- **Un seul écrivain** : une file d'attente exécute les lots d'écritures l'un après l'autre. Pour un seul utilisateur, il n'y a pas de conflit réel : le dernier qui écrit l'emporte.
- **Lecteurs en parallèle** grâce au mode WAL de SQLite : une liste longue se charge pendant qu'une écriture a lieu.
- **Travaux lourds** (copie de médias, vignettes, sauvegardes, archives) dans des tâches asynchrones, avec événements de progression ; l'interface ne gèle jamais.
- **Un scénario n'est éditable que dans une fenêtre à la fois.** Les autres fenêtres le montrent en lecture et se mettent à jour à chaque `db:changed`. Cela évite de fusionner deux éditions du même texte.

---

## 5. L'interface TypeScript

### 5.1 Organisation du code

```
src/
├── core/                      noyau partagé
│   ├── ids.ts                 identifiants UUID v7
│   ├── ordering.ts            rangs fractionnaires (ordre des scènes, cartes…)
│   ├── db/                    client Kysely sur IPC, types du schéma générés
│   ├── commands/              pile annuler / rétablir
│   ├── events.ts              abonnement à db:changed
│   └── i18n/                  fr.json, en.json
├── modules/
│   ├── project/               accueil, création, tableau de bord, réglages
│   ├── script/
│   │   ├── workshop/          atelier d'écriture
│   │   ├── bible/             fiches, types personnalisés, liens wiki
│   │   ├── screenplay/        éditeur, pagination, versions, comparaison
│   │   └── views/             vue Tableau, vue Chronologie
│   ├── directing/             moodboard, découpage, storyboard          (v2)
│   ├── production/            équipe, dépouillement, plan de travail…   (v2, v3)
│   └── shared/                fichiers, recherche, tâches, liens
│       └── <chaque module>/
│           ├── domain/        règles métier pures : aucun import de React ni de Tauri
│           ├── application/   cas d'usage : lit, applique les règles, écrit un lot
│           └── ui/            composants React
├── interop/                   formats : fdx/, fountain/, docx/, pdf/, celtx/, ical/, vcard/
└── ui-kit/                    composants de base accessibles, thèmes
```

Une règle vérifiée automatiquement par l'outil de lint (`eslint-plugin-boundaries`) : `domain` n'importe rien d'autre que `core` ; `ui` n'écrit jamais directement en base ; un module n'importe que la partie publique d'un autre.

### 5.2 Langue du code

Le code, la base et les commentaires sont **en anglais**, pour faciliter les contributions sur GitHub ; l'interface est en français et en anglais [UX-01]. Le glossaire de l'annexe 16.1 fixe la traduction de chaque terme métier (Scène → `Scene`, Bande → `Strip`, Feuille de service → `CallSheet`…). Les noms visibles par l'utilisateur dans le dossier projet (`donnees.db`, `medias/`…) restent ceux du cahier des charges.

### 5.3 Données affichées et rafraîchissement

- **TanStack Query** garde en mémoire le résultat des lectures. À chaque `db:changed`, les requêtes qui concernent les tables modifiées sont relues : c'est ce qui rend les trois vues du récit cohérentes entre elles [5.4] et entre fenêtres.
- **Zustand** garde l'état de l'interface qui n'est pas en base : onglet ouvert, panneau replié, sélection.
- Les longues listes (scènes, éléments, contacts) sont **virtualisées** : seules les lignes visibles sont créées.

### 5.4 Annuler et rétablir

- **Dans l'éditeur**, l'historique de ProseMirror gère le texte.
- **Ailleurs**, chaque action est une *commande* qui sait s'appliquer et s'annuler (déplacer une scène, renommer une fiche…). Une pile par fenêtre, illimitée pendant la session [EDT-13].
- Une action qui touche le texte depuis une autre vue (déplacer une scène dans le Tableau) est envoyée à l'éditeur comme transaction ProseMirror, pour que Ctrl + Z s'y comporte normalement.

### 5.5 Composants d'interface

| Besoin | Choix | Raison |
|---|---|---|
| Composants de base (menus, dialogues, listes, onglets) | **React Aria Components** | Accessibilité clavier et lecteur d'écran déjà traitée [UX-04] |
| Style | CSS Modules + variables CSS | Thèmes clair et sombre par variables [UX-02], aucune dépendance de plus |
| Glisser-déposer (Tableau, kanban des tâches, stripboard) | **dnd-kit** | Accessible au clavier, rapide sur 200 cartes |
| Frise et pistes (Chronologie) | SVG dessiné par React | Volume faible, facile à rendre accessible |
| Canevas (moodboard, storyboard, plan au sol) | **Konva** + **perfect-freehand** pour le trait au stylet | Licences MIT ; voir D-08 pour l'abandon de tldraw |
| Carte | **MapLibre GL JS** | Tuiles vectorielles, rendu fluide |
| Palette de commandes | `cmdk` | Ctrl + K [RCH-02] |
| Traductions | i18next | Fichiers JSON simples à traduire [UX-01] |

---

## 6. Stockage et format du projet

### 6.1 Où vivent les données

| Données | Emplacement | Forme |
|---|---|---|
| Projet | Dossier choisi par l'utilisateur | `projet.oniric`, `donnees.db`, `medias/`, `exports/`, `versions/`, `.verrou` [PRJ-06] |
| Copie de travail du projet ouvert | `%LOCALAPPDATA%\Oniric\travail\<id du projet>\` | Base SQLite active (+ fichiers WAL) |
| Données de l'application | `%APPDATA%\Oniric\application.db` | Profil, carnet de contacts, modèles, réglages, projets récents |
| Cache de la carte | `%LOCALAPPDATA%\Oniric\carte\tuiles.db` | Tuiles et zones hors ligne, partagées entre projets [REP-04c] |
| Vignettes | `%LOCALAPPDATA%\Oniric\vignettes\<id du projet>\` | Images réduites, recréables à tout moment |
| Journal technique | `%LOCALAPPDATA%\Oniric\journaux\` | Fichiers texte, 10 derniers jours, jamais envoyés |
| Sauvegardes | Dossier choisi par l'utilisateur [SAV-03] | Voir 7.4 |

L'installateur place aussi l'application dans `%LOCALAPPDATA%\Oniric` (installation par utilisateur) ; la désinstallation n'efface que ses propres fichiers, jamais `travail\` ni les journaux.

**Version portable** [CPT-02] : si un fichier `portable` se trouve à côté de l'exécutable, tous les dossiers ci-dessus sont créés dans `donnees\` à côté de lui.

### 6.2 Le fichier `projet.oniric`

Petit fichier JSON qui sert à reconnaître et ouvrir le projet :

```json
{
  "format": "oniric-project",
  "formatVersion": 1,
  "id": "0192b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b",
  "title": "Les Heures Bleues",
  "createdWith": "0.1.0",
  "database": "donnees.db"
}
```

**Même extension pour le fichier d'ouverture et pour l'archive.** Le cahier des charges utilise `.oniric` pour les deux. Oniric les distingue par leur contenu : une archive commence par la signature d'un fichier ZIP (`PK`), le fichier d'ouverture est du JSON. Un double-clic fait donc toujours la bonne action.

### 6.3 Conventions du schéma SQLite

| Convention | Règle | Raison |
|---|---|---|
| Identifiants | `id TEXT` au format UUID v7 | Uniques partout [RG-05], triables par date de création, fusions futures possibles [14] |
| Tables | `STRICT`, clés étrangères activées | Types vérifiés par SQLite, aucune référence orpheline |
| Dates | Texte ISO 8601 en UTC (`2026-10-21T09:30:00.000Z`) | Lisible sans Oniric [FIA-03] |
| Suivi | `created_at`, `updated_at` sur chaque table | Journal, tri, diagnostic |
| Suppression | `deleted_at` (corbeille) pour les objets que l'utilisateur peut récupérer | RG-01, E8.2 |
| Ordre | Colonne `rank TEXT` à **rangs fractionnaires** | Déplacer une scène ne modifie qu'une ligne, même parmi 200 [10.1] |
| Texte riche | JSON ProseMirror dans une colonne `TEXT`, avec `CHECK (json_valid(...))` | Structure documentée, lisible par tout outil JSON |
| Références vers « n'importe quel objet » | Paires `target_type` + `target_id` (tâches, fichiers, liens) | TCH-01, FIC-02, RCH-03 |
| Champs personnalisés de la bible | Table `field_definition` + valeurs en JSON | Types de fiches personnalisés [5.2] sans changer le schéma |
| Version du schéma | `PRAGMA user_version` + `formatVersion` de `projet.oniric` | Migrations [FIA-04] |

### 6.4 Le scénario dans la base

La scène est l'objet pivot [3] : le scénario n'est donc **pas stocké comme un seul document**, mais **une ligne par scène**.

```
act ──< sequence ──< scene ──< shot ──< storyboard_panel           (v2)
                       │
                       ├──< scene_character >── bible_entry (personnage)
                       ├──  location_id ──────> bible_entry (lieu)
                       ├──< breakdown_item                          (v2)
                       └──< strip >── shooting_day                  (v2)
```

Colonnes principales de `scene` :

| Colonne | Contenu |
|---|---|
| `sequence_id`, `rank` | Place dans le récit |
| `number`, `number_locked` | Numéro affiché, verrouillage [EDT-05, RG-03] |
| `heading_*` | En-tête analysé : intérieur/extérieur, lieu, moment de la journée, recopié depuis le texte pour les filtres et la production |
| `content` | Corps de la scène : JSON ProseMirror des éléments (action, personnage, dialogue…) |
| `summary`, `status`, `color`, `tags`, `plotlines` | Données de la carte de scène [VUE-04] |
| `story_time` | Date et heure dans l'histoire [VUE-11] |
| `length_eighths` | Longueur en huitièmes de page, recalculée par la mise en page |
| `deleted_at` | Corbeille de scènes [RG-01] |

À l'ouverture, l'éditeur assemble les scènes dans l'ordre en un document ProseMirror dont chaque nœud de premier niveau est une scène portant son identifiant. À l'enregistrement, seules les scènes modifiées sont réécrites. Un texte placé avant le premier en-tête (« FONDU D'OUVERTURE ») forme une scène sans en-tête.

Les éléments dépouillés [7.2] et les notes de marge [EDT-07] sont ancrés au texte par des *marques* ProseMirror portant l'identifiant de l'objet : ils suivent le texte quand on le modifie.

### 6.5 Versions figées

Une version figée [E8.1] est écrite dans `versions/` sous forme d'un fichier JSON autonome (toutes les scènes, la page de titre, le format), accompagné de son empreinte SHA-256 et de sa date [PI-02]. La base garde la liste des versions. La comparaison est calculée en TypeScript, scène par scène puis mot à mot (`jsdiff`).

### 6.6 Recherche

Une table FTS5 `search_index(target_type, target_id, title, body)` est tenue à jour par la couche `application` dans le même lot que chaque écriture. Le découpage en mots ignore les accents (`unicode61 remove_diacritics 2`) : chercher « cafe » trouve « café » [RCH-01].

### 6.7 Médias

- **Import atomique** [FIA-01] : copie vers `medias/<type>/.import-<id>.tmp`, écriture forcée sur le disque, renommage, puis seulement enregistrement en base. Un média n'est jamais référencé à moitié copié.
- **Noms de fichiers** : nom d'origine nettoyé et dédoublonné, lisible dans l'explorateur ; la base garde l'empreinte SHA-256 pour reconnaître un fichier déplacé [FIA-05].
- **Fichiers liés** [FIC-03] : chemin absolu en base, vérifié à l'ouverture.
- **Affichage** : protocole interne `oniric-media://<id>`, qui accepte les lectures partielles pour la vidéo, sans jamais charger un fichier entier en mémoire [10.1].
- **Surveillance** de `medias/` (crate `notify`) pour proposer l'import des fichiers déposés à la main [PRJ-06].
- **Vidéo** (v2) : vignettes et export d'animatique MP4 par **FFmpeg**, fourni à côté de l'exécutable dans une version LGPL.

### 6.8 Migrations

- Fichiers SQL numérotés dans `src-tauri/migrations/`, appliqués dans l'ordre à l'ouverture, **jamais modifiés une fois publiés**.
- Avant toute migration, la base d'origine est copiée dans le dossier de sauvegarde [FIA-04].
- Un projet créé par une version **plus récente** d'Oniric n'est pas ouvert : un message invite à mettre à jour, et le projet n'est pas modifié.

### 6.9 Documentation du format

`docs/format-projet.md` décrit le dossier, `projet.oniric`, chaque table et le schéma JSON du texte riche. Il est **généré en partie depuis les migrations** et vérifié en intégration continue, pour ne jamais être en retard sur le code [FIA-03, critère de sortie v1.0].

---

## 7. Enregistrement, récupération et sauvegardes

### 7.1 Pourquoi une copie de travail locale

Oniric travaille sur une **copie locale**, et ne dépose dans le dossier projet que des **fichiers complets, vérifiés, remplacés d'un seul coup**. Un plantage ou une coupure de courant pendant l'écriture ne laisse jamais un projet à moitié écrit, et la copie de travail permet de récupérer ce qui n'était pas encore recopié.

### 7.2 Cycle de vie

```
Ouverture
  1. Lire projet.oniric, vérifier le format
  2. .verrou présent ?
       ├─ même PC, processus disparu  → plantage précédent : récupération (7.3)
       ├─ autre PC, récent             → « Ce projet semble ouvert sur PORTABLE-SOFIA » :
       │                                 ouvrir en lecture seule ou forcer
       └─ absent                       → écrire .verrou (PC, processus, heure)
  3. Copier donnees.db vers la copie de travail ; PRAGMA quick_check
  4. Migrer si besoin (après copie de sauvegarde)
  5. Ouvrir en mode WAL, synchronous=FULL

Pendant le travail
  • Lots d'écritures dans la copie de travail (1 s après la dernière frappe, au plus toutes les 3 s)
  • Toutes les 30 s si quelque chose a changé : recopie dans le dossier projet (7.2.1)
  • Selon le réglage : sauvegarde datée (7.4)

Fermeture
  • Dernière recopie, sauvegarde de fermeture, suppression de .verrou et de la copie de travail
```

#### 7.2.1 Recopie dans le dossier projet

1. Un **identifiant de recopie** aléatoire est écrit dans la copie de travail, et ajouté à la liste des recopies tentées depuis la dernière recopie confirmée.
2. `VACUUM INTO 'donnees.db.tmp'` dans le dossier projet : SQLite produit un fichier complet et compact, qui porte cet identifiant. Le fichier est passé en mode de journal classique (`DELETE`) : un seul fichier, sans annexe WAL.
3. `PRAGMA quick_check` sur ce fichier, puis écriture forcée sur le disque.
4. Remplacement atomique de `donnees.db` par `donnees.db.tmp` (`MoveFileExW` avec `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH`).
5. La recopie est notée comme confirmée ; les identifiants plus anciens sont oubliés.

**Pourquoi une liste et pas un simple numéro.** Le prototype X2 a montré qu'un seul compteur ne suffit pas : si le programme est coupé juste après le remplacement (étape 4) mais avant l'étape 5, puis coupé de nouveau pendant la recopie suivante, la copie de travail ne reconnaît plus la version du dossier et se croit, à tort, dépassée. Avec la liste, la copie de travail reconnaît toute recopie qu'elle a pu déposer.

Si une étape échoue (clé retirée, disque plein), l'ancien `donnees.db` reste intact, la copie de travail aussi. L'interface affiche « Projet non enregistré dans son dossier » et réessaie.

### 7.3 Récupération après plantage [SAV-02, FIA-02]

| Situation à l'ouverture | Proposition |
|---|---|
| Copie de travail présente et saine, et `donnees.db` porte l'un de ses identifiants de recopie | « Oniric s'est fermé de façon inattendue. Restaurer votre travail le plus récent ? » (choix par défaut) |
| `donnees.db` porte un identifiant inconnu de la copie de travail (projet modifié ailleurs entre-temps) | Ouvrir le dossier ; la copie de travail est mise de côté, jamais supprimée |
| `donnees.db` endommagé, copie de travail saine | Restaurer depuis la copie de travail |
| Les deux endommagés | Ouvrir la dernière sauvegarde valide, liste des sauvegardes à l'appui |

### 7.4 Sauvegardes [SAV-03, SAV-05]

```
<dossier de sauvegarde>/
└── Les Heures Bleues (0192b3c4)/
    ├── bases/
    │   ├── 2026-10-21_09-30_auto.db
    │   ├── 2026-10-21_12-00_fermeture.db
    │   └── 2026-10-21_08-58_avant-migration-v3.db
    ├── medias/            copie miroir, chaque fichier copié une seule fois
    └── sauvegarde.json    liste des copies, empreintes, version d'Oniric
```

- Une base complète par sauvegarde (`VACUUM INTO`, quelques Mo) ; les médias, qui peuvent peser des Go, sont **copiés une seule fois** et reconnus par leur empreinte.
- Nombre de copies gardées réglable ; les copies « avant migration » ne sont jamais supprimées automatiquement.
- **Restaurer** recrée un dossier projet complet à partir d'une copie, sans toucher à l'original.
- Le rappel SAV-05 compare la date de la dernière sauvegarde réussie au délai choisi.

### 7.5 Archive `.oniric` [SAV-04]

Un ZIP contenant le dossier projet (sans `.verrou` ni fichiers temporaires) et un `manifest.json` avec les empreintes. Les médias déjà compressés (JPEG, MP4) sont stockés sans recompression, pour aller vite. L'import décompresse dans un dossier temporaire, vérifie les empreintes, puis renomme le dossier : une archive incomplète ne donne jamais un projet à moitié importé.

---

## 8. L'éditeur de scénario et la mise en page

C'est la partie la plus difficile et la plus importante du produit : c'est là que l'utilisatrice passe ses journées, et c'est ce que le PRD demande de valider en premier.

### 8.1 Le moteur d'édition

**ProseMirror, utilisé directement** (D-04). Le schéma définit un nœud par élément du scénario :

```
doc
└── scene (id)                 un nœud par scène
    ├── scene_heading          INT. CUISINE – NUIT
    ├── action
    ├── character              MARIE (CONT'D)
    ├── parenthetical
    ├── dialogue
    ├── dual_dialogue          deux colonnes [EDT-08]
    ├── transition
    ├── shot
    └── on_screen_text
```

- **Clavier** : Entrée et Tab passent à l'élément suivant selon les règles habituelles (après un personnage, un dialogue ; Tab sur une action vide, un personnage…) [EDT-01] ; une table de correspondance rend les raccourcis personnalisables.
- **Autocomplétion** des personnages, lieux et moments à partir de la bible [EDT-03].
- **Orthographe** : le texte visible est envoyé au cœur par paquets ; les fautes sont soulignées par des *décorations*, sans modifier le document. Les noms de la bible sont ajoutés au dictionnaire du projet.
- **Scripts en deux colonnes** [EDT-12] : un autre schéma de document (rangées image / son), même principe.

### 8.2 Pagination : un seul moteur de rendu pour tout

Le problème : un scénario fait foi par son nombre de pages (une page ≈ une minute), et les règles de coupure sont précises (pas d'en-tête seul en bas de page, dialogue coupé avec « (SUITE) » / « (MORE) » et « (CONT'D) », etc.). Si l'écran et le PDF coupent les lignes différemment, la pagination affichée est fausse.

La solution retenue (D-05) : **le navigateur intégré mesure, l'algorithme décide, et le même navigateur produit le PDF.**

```
 Document ProseMirror  ──►  1. Mesure                    ──►  2. Pagination (TypeScript pur)  ──►  3. Rendu
 + format de scénario       Chaque élément est affiché        Entrée : liste d'éléments avec        a. Éditeur : sauts de page
   (marges, retraits,        avec ses vraies dimensions        leur type et leurs lignes            dessinés par décorations
   police, interligne)       (police embarquée, crénage        Règles : veuves, orphelines,         b. Aperçu, impression, PDF :
                             désactivé). On relève la          en-têtes, dialogues coupés           pages HTML positionnées,
                             position de chaque ligne.         Sortie : pages → lignes              imprimées par WebView2
```

1. **Mesure.** Chaque élément est rendu dans une colonne de la largeur exacte définie par le format, avec la police embarquée. Le découpage en lignes est relevé avec l'API `Range.getClientRects()`. Quand l'éditeur n'est pas ouvert (export depuis l'accueil), la mesure se fait dans un conteneur caché.
2. **Pagination.** Un algorithme pur, sans DOM, reçoit « tel élément, de tel type, fait tant de lignes, coupables à tels endroits » et applique les règles du format choisi. C'est lui qui calcule le nombre de pages, la durée estimée et les **huitièmes de page** de chaque scène [EDT-04], utilisés plus tard par le dépouillement et le plan de travail. Il est couvert par des centaines de tests unitaires.
3. **Rendu.** Dans l'éditeur, les sauts de page sont des décorations (une marge grise entre deux pages, les mentions « (SUITE) ») : l'utilisatrice écrit sur de vraies pages [VUE-01]. Pour l'aperçu, l'impression et le PDF, chaque page est construite en HTML avec les lignes à leur position calculée, puis imprimée par WebView2.

Les mesures, le rendu à l'écran et le PDF viennent du **même moteur Chromium** (WebView2) avec les **mêmes polices embarquées** : ils ne peuvent pas diverger. Changer de format [EDT-02] relance simplement la mesure et la pagination : le texte n'est jamais touché.

**Performance.** La pagination reprend à partir de la première scène modifiée et s'arrête dès que les pages retrouvent leur découpage précédent. Pour 120 pages, une pagination complète doit prendre moins de 50 ms ; le prototype le mesure.

**Polices.** Courier Prime (licence OFL) sert de police à chasse fixe par défaut ; d'autres polices libres sont fournies. Toutes sont embarquées dans l'application, jamais lues depuis Windows : le rendu est identique sur tous les PC [11].

### 8.3 Formats de scénario

Un format est une **donnée**, pas du code : un objet JSON (taille de page, marges, retraits et largeur de chaque élément, police, interligne, majuscules, règles de coupure, textes « (SUITE) » / « (CONT'D) »). Les formats français et américain sont fournis ; les formats personnalisés sont enregistrés comme modèles [EDT-02, ACC-04]. Les exports peuvent utiliser un autre format que celui de travail.

---

## 9. Import, export et impression

### 9.1 Principe

Tous les formats de scénario passent par une **représentation intermédiaire unique** : la liste des scènes et de leurs éléments, avec leur type. Chaque format n'a donc qu'un lecteur et un écrivain vers cette représentation, et un banc de test commun mesure la fidélité (≥ 95 % sur 50 scénarios, critère de sortie v1.0).

Les lecteurs s'exécutent dans des **Web Workers** : un gros fichier ne bloque pas l'interface, et un fichier piégé n'a accès à rien d'autre que son contenu [SEC-05].

### 9.2 Formats

| Format | Import | Export | Bibliothèque |
|---|---|---|---|
| Fountain | Analyseur écrit pour Oniric, d'après la spécification Fountain 1.1 | Écrivain maison | — |
| Final Draft (FDX) | Analyse XML par `DOMParser`, qui ne charge aucune entité externe | Écrivain maison | — |
| DOCX | Styles et retraits reconnus → types d'éléments | Génération | `mammoth` (import), `docx` (export) |
| PDF | Texte et positions extraits, éléments reconnus par leur retrait | Voir 9.3 | `pdf.js` |
| Celtx | Archive ZIP contenant du HTML | — | `fflate` |
| CSV, XLSX | Contacts, éléments, budget | Tableaux | `exceljs` |
| iCal, vCard | vCard en import | iCal, vCard | Écrivains maison (formats simples) |
| MP4 (v2) | — | Animatique | FFmpeg |

### 9.3 PDF et impression

Tous les documents, du scénario à la feuille de service, sont produits de la même façon :

1. L'interface construit le document en HTML et CSS paginé (pour le scénario, les pages calculées en 8.2).
2. Le cœur le charge dans une **fenêtre WebView2 cachée** et appelle sa fonction de conversion en PDF (`PrintToPdf`).
3. Un passage avec `pdf-lib` ajoute les métadonnées (titre, auteur) et, pour le scénario, un signet par scène.

- **Filigrane nominatif** [SEC-04] et **révisions colorées** (v2) : calques CSS ajoutés au HTML avant conversion.
- **Impression** [IMP-01] : le PDF généré s'ouvre dans une fenêtre d'aperçu (visionneuse PDF de WebView2) qui offre l'impression Windows.
- **Solution de repli** si la conversion WebView2 ne tient pas ses promesses dans le prototype : dessiner les mêmes pages calculées directement avec `pdf-lib` et les polices embarquées. La pagination ne change pas, seul le dessin final change.

---

## 10. Réseau : la carte des repérages

La carte arrive en v3, mais ses règles sont posées dès maintenant, parce qu'elles touchent à la sécurité de toute l'application.

### 10.1 Une seule porte

```
 MapLibre (interface)                         Cœur Rust : module network
 ┌──────────────────────┐   oniric-tiles://  ┌────────────────────────────────────────────┐
 │ demande une tuile    │ ─────────────────► │ 1. Carte désactivée ? → cache seul          │
 │ ou un style          │                    │ 2. Dans le cache ? → servie sans connexion  │
 └──────────────────────┘                    │ 3. Adresse autorisée ? (réglages)           │
 ┌──────────────────────┐   map_geocode,     │ 4. HTTPS, User-Agent « Oniric/x.y »         │
 │ recherche, itinéraire│   map_route        │ 5. Limites : Nominatim 1 requête/s,         │
 └──────────────────────┘ ─────────────────► │    zones hors ligne plafonnées              │
                                             │ 6. Mise en cache, événement d'activité      │
                                             └──────────────┬─────────────────────────────┘
                                                            ▼
                                             OpenFreeMap · Nominatim · openrouteservice / OSRM
```

- L'interface **ne peut pas** ouvrir de connexion : sa politique de sécurité de contenu (CSP) n'autorise que l'application elle-même et les protocoles internes (section 11).
- Le module `network` ne contacte **que** les adresses inscrites dans les réglages [REP-04b], **seulement** si la carte est activée [REP-04e], et n'envoie que la zone affichée, le texte cherché ou les points d'un itinéraire.
- Il n'y a **aucun autre code réseau** dans Oniric. Un test d'intégration le vérifie : une compilation sans le module `network` doit fonctionner, et l'analyse des dépendances signale toute bibliothèque réseau ajoutée ailleurs.

### 10.2 Hors ligne [REP-04c, REP-04d]

- Les tuiles consultées et les zones enregistrées sont gardées dans `tuiles.db` (format proche de MBTiles), partagé entre projets.
- Le style de carte, les pictogrammes et les polices de la carte sont **fournis avec l'application** : sans connexion, la carte s'affiche sur les zones en cache, ou sur une grille simple ailleurs.
- Une zone hors ligne est limitée en nombre de tuiles (niveaux de zoom jusqu'à 14, au-delà MapLibre agrandit les tuiles vectorielles).
- Les adresses trouvées, coordonnées, distances et temps de trajet sont **enregistrés dans le projet**, et donc toujours affichables.
- Course du soleil et heure dorée calculées localement (`suncalc`) [REP-07] ; coordonnées lues dans les photos par `exifr` [REP-03].

---

## 11. Sécurité

| Mesure | Détail | Exigence |
|---|---|---|
| Aucun contenu distant dans l'interface | CSP : `default-src 'self'` ; `connect-src` limité à l'IPC et aux protocoles internes ; aucun `eval` | SEC-01 |
| Permissions Tauri minimales | Chaque fenêtre n'a accès qu'aux commandes dont elle a besoin (*capabilities* Tauri 2) ; pas de module d'exécution de commandes système | SEC-05 |
| Liens externes | Ouverts dans le navigateur de l'utilisateur, après confirmation | SEC-01 |
| Fichiers importés | Analysés dans des Workers, jamais exécutés ; tailles maximales ; XML sans entités externes ; ZIP contrôlé contre les chemins qui sortent du dossier | SEC-05 |
| SQL | *Authorizer* SQLite côté cœur (4.2) | FIA-01 |
| Chiffrement (v2) | Base chiffrée par **SQLCipher** (même moteur SQLite, compilé dès la v0.1 pour éviter un changement plus tard) ; médias chiffrés fichier par fichier (XChaCha20-Poly1305) ; clé dérivée du mot de passe par Argon2id ; aucune récupération possible | SEC-02 |
| Champs sensibles | Masqués à l'affichage, exclus des exports par défaut, jamais écrits dans le journal technique | SEC-03 |
| Mises à jour | Aucune vérification automatique ; pas de module de mise à jour intégré | CPT-03 |
| Installateurs | Signés (12.3) ; empreintes SHA-256 publiées dans chaque *Release* | SEC-06 |

---

## 12. Qualité, tests et livraison

### 12.1 Tests

| Niveau | Outil | Ce qui est testé |
|---|---|---|
| Logique métier TS | **Vitest** | Pagination (fichiers de référence), numérotation 12A/12B, rangs, règles de dépouillement, budget ; c'est la grande majorité des tests |
| Formats | Vitest + corpus | Banc d'import / export sur 50 scénarios, fidélité mesurée et suivie |
| Cœur Rust | `cargo test` | Ouverture, verrou, migrations, recopie, récupération, sauvegardes, archives, passerelle réseau |
| **Test de coupure** | Programme de test Rust | Un processus fils écrit sans arrêt ; il est tué à un moment aléatoire ; la base est vérifiée. **1 000 fois** à chaque modification du cœur (critère v0.1), 10 000 fois chaque nuit |
| Composants | Vitest + Testing Library | Clavier de l'éditeur, accessibilité (`axe-core`) |
| Bout en bout | **WebdriverIO + tauri-driver** sur Windows | Parcours P1 à P5 du PRD, dans la vraie application |
| PDF | Comparaison d'images | 5 scénarios de référence en format français et américain : PDF converti en images, comparé aux images validées |
| Performance | Banc de mesure | Démarrage, ouverture de 120 pages, latence de frappe, PDF de 120 pages ; une régression de plus de 20 % fait échouer la vérification |

### 12.2 Intégration continue (GitHub Actions)

| Déclencheur | Travaux |
|---|---|
| Chaque modification | Lint et types (TS, `clippy`), tests TS et Rust, test de coupure ×1 000, construction Windows |
| Chaque nuit | Bout en bout, coupure ×10 000, banc d'import / export, banc de performance |
| Étiquette de version (`v0.1.0`…) | Installateurs signés, version portable, empreintes, brouillon de *Release* avec notes de version |

### 12.3 Paquets livrés [CPT-02, SEC-06]

- **Installateur NSIS** construit par Tauri, installation **par utilisateur** (sans droits administrateur) ; il installe WebView2 s'il manque.
- **Version portable** : ZIP contenant l'exécutable et le fichier `portable`. WebView2 doit être présent, ce qui est le cas sur Windows 11 et sur Windows 10 à jour ; sinon, un message explique comment l'installer.
- **Signature** : demande au programme gratuit de **SignPath Foundation** pour les logiciels libres, dès la bêta publique (v0.5). C'est la parade au risque SmartScreen du PRD.
- **Association** de l'extension `.oniric` par l'installateur [PRJ-06b].

### 12.4 Diagnostic sans télémétrie

Les erreurs sont écrites dans le journal technique local. Un menu « Aide › Copier le rapport de problème » rassemble la version, Windows, et les dernières lignes du journal (sans contenu du projet ni champ sensible), prêts à coller dans un ticket GitHub. Rien n'est jamais envoyé par Oniric.

---

## 13. Prototype de validation

Avant d'écrire la v0.1, trois expériences jetables, de quelques semaines au total, vérifient les points dont dépend tout le reste. Chacune a un critère de réussite et une solution de repli.

| # | Expérience | Réussite si | Sinon |
|---|---|---|---|
| **X1** | **Éditeur et pagination** : schéma ProseMirror minimal (en-tête, action, personnage, dialogue), mesure, pagination, sauts de page dans l'éditeur, PDF par WebView2, formats français et américain | Sur 5 scénarios de référence, l'écran et le PDF ont exactement les mêmes coupures ; pagination complète de 120 pages < 50 ms ; frappe < 50 ms ; PDF de 120 pages < 10 s | PDF dessiné par `pdf-lib` (9.3) ; si la mesure par le DOM est trop lente, mesure par les métriques de police (`fontkit`) avec saut de ligne contraint dans l'éditeur |
| **X2** | **Enregistrement** : copie de travail, lots d'écritures, recopie atomique, test de coupure | 0 corruption sur 10 000 coupures | Recopie moins fréquente |
| **X3** | **Rust et Tauri au quotidien** : une commande typée de bout en bout, un événement, la construction et l'installation sur une machine virtuelle Windows 10 neuve | Le développement côté Rust reste confortable ; installateur < 15 Mo ; démarrage < 3 s | Passer à Electron (D-01) : seule la couche `core/db` et les commandes du cœur sont à réécrire en TypeScript |

Les conclusions sont notées dans les décisions de la section 14, qui passent alors de « proposée » à « confirmée ».

### 13.1 État de la v0.1 alpha

Le dépôt `oniric/` reprend le code des trois prototypes, archivés dans `archives/prototypes/`. Critères de sortie atteints sur le poste de développement : P1 et P5, 1000 coupures sans corruption avec SQLCipher, PDF identique à l'écran sur les 5 scénarios de référence ; détail dans `oniric/docs/recette/v0.1-resultats.md`. Reste la recette manuelle sur Windows 10 neuf.

Écarts avec ce document, à résorber ou à entériner :

- **PDF** (9.3) : imprimé depuis la fenêtre principale, dont une feuille de style d'impression n'affiche que les pages calculées, et non depuis une fenêtre cachée ; pas encore de passage `pdf-lib` (métadonnées, signets).
- **Migrations** (6.8) : la copie d'avant migration est rangée dans la copie de travail (`avant-migration`), le dossier de sauvegarde n'existant pas encore.
- **Format du projet** (6.9) : `docs/format-projet.md` est écrit à la main ; sa génération depuis les migrations reste à faire.

---

## 14. Décisions d'architecture

Chaque décision indique ce qui a été choisi, pourquoi, et ce qu'on abandonne. Statut : **proposée** (à confirmer par le prototype) ou **retenue**.

| ID | Décision | Statut |
|---|---|---|
| D-01 | Tauri 2 plutôt qu'Electron | Confirmée par X3 ; essai sur Windows 10 neuf à faire |
| D-02 | Logique métier en TypeScript, cœur Rust sans règle métier | Retenue |
| D-03 | Le cœur est le seul écrivain ; l'interface envoie des lots de requêtes Kysely | Retenue |
| D-04 | ProseMirror utilisé directement, plutôt que Tiptap | Retenue |
| D-05 | Mise en page mesurée par WebView2, PDF produit par WebView2 | Confirmée par X1, dans Chrome puis dans Tauri |
| D-06 | Copie de travail locale et recopie atomique dans le dossier projet | Confirmée par X2 (coupures) |
| D-07 | Une ligne par scène plutôt qu'un document unique | Retenue |
| D-08 | Konva plutôt que tldraw pour les canevas | Retenue |
| D-09 | Une seule passerelle réseau dans le cœur | Retenue |
| D-10 | Code et base en anglais, interface traduite | Retenue |
| D-11 | SQLCipher compilé dès la v0.1 | Confirmée en v0.1 |

**D-01 — Tauri 2 plutôt qu'Electron.**
*Pourquoi :* installateur d'environ 2 Mo au lieu de 100 (mesuré par X3) ; WebView2 déjà présent sur les PC visés ; le modèle de permissions de Tauri 2 sert la confidentialité. *Prix à payer :* une partie en Rust, un langage à apprendre ; un seul moteur web par système (WebView2 sur Windows, WebKit sur macOS plus tard), qui pourra donner une pagination légèrement différente d'un système à l'autre. *Porte de sortie :* grâce à D-02, la logique et l'interface ne dépendent pas de Tauri ; passer à Electron ne touche que le cœur.

**D-02 — Logique métier en TypeScript.**
*Pourquoi :* un seul langage pour presque tout le code ; les règles se testent en millisecondes avec Vitest, sans lancer l'application ; le Rust reste petit. *Prix :* le cœur ne peut pas vérifier les règles métier, il fait confiance à l'interface, ce qui est sans risque puisque tout tourne sur le même PC pour une seule personne.

**D-03 — Écrivain unique, requêtes construites par l'interface.**
*Pourquoi :* les transactions sont sérialisées sans verrou à gérer ; toutes les fenêtres sont prévenues des changements par un seul point ; pas de commande Rust à écrire par opération. *Prix :* le SQL part de l'interface, ce qui exige les garde-fous de 4.2 et une interface qui n'affiche jamais de contenu distant.

**D-04 — ProseMirror directement.**
*Pourquoi :* la pagination, les décorations, les raccourcis et le schéma du scénario demandent l'accès complet à ProseMirror ; Tiptap ajouterait une couche à contourner, et ses extensions payantes ne sont pas utilisables dans un logiciel GPL. *Prix :* un peu plus de code au départ pour les vues React des nœuds.

**D-05 — Le navigateur intégré mesure et imprime.**
*Pourquoi :* l'écran, l'impression et le PDF sont identiques par construction ; aucune réimplémentation du découpage des lignes, des césures ou des polices. *Prix :* le PDF dépend de WebView2 ; sur macOS, il faudra l'équivalent WebKit. *Repli :* `pdf-lib` (9.3).

**D-06 — Copie de travail locale.**
*Pourquoi :* garantit qu'un plantage ou une coupure ne corrompt jamais le projet, et permet la récupération après plantage. *Prix :* le dossier projet a jusqu'à 30 s de retard sur la copie de travail ; une recopie complète écrit toute la base (quelques Mo, moins d'une seconde) à chaque fois.

**D-07 — Une ligne par scène.**
*Pourquoi :* la scène est l'objet pivot ; les plans, éléments, bandes et tâches s'y rattachent par une vraie clé étrangère ; seules les scènes modifiées sont réécrites ; le Tableau déplace une scène sans relire le texte. *Prix :* l'éditeur doit assembler et découper le document ; les modifications à cheval sur deux scènes (fusion) sont traitées explicitement.

**D-08 — Konva plutôt que tldraw.**
*Pourquoi :* le cahier des charges proposait tldraw, mais la licence de tldraw n'est pas une licence libre (une clé de licence est exigée en production), ce qui la rend inutilisable dans un logiciel GPL-3.0. Konva et perfect-freehand sont sous licence MIT. *Prix :* les outils de sélection, de transformation et de calques sont à construire, à partir des briques de Konva.

**D-09 — Une seule passerelle réseau.**
*Pourquoi :* la promesse « aucune connexion sauf la carte » devient vérifiable dans le code, pas seulement une intention. *Prix :* MapLibre doit passer par un protocole interne au lieu de télécharger lui-même ses tuiles.

**D-10 — Code en anglais.**
*Pourquoi :* contributions plus faciles, bibliothèques et documentation en anglais. *Prix :* un glossaire à tenir (16.1).

**D-11 — SQLCipher dès le départ.**
*Pourquoi :* le chiffrement arrive en v2 ; utiliser dès la v0.1 la version de SQLite qui le permet évite de changer de moteur de base en cours de route. Un projet non chiffré reste une base SQLite ordinaire, lisible par tout outil [FIA-03]. *Prix :* compilation un peu plus longue, exécutable plus lourd de 3,9 Mo (9,5 Mo au lieu de 5,6), installateur de 3,6 Mo. Les 1000 coupures passent sans corruption avec ce moteur.

---

## 15. Risques techniques

| Risque | Probabilité | Impact | Parade |
|---|---|---|---|
| L'écran et le PDF ne coupent pas les pages au même endroit | Moyenne | Fort | D-05, vérifié par X1 et par la comparaison d'images en intégration continue |
| La pagination est trop lente sur 120 pages pendant la frappe | Faible | Moyen | Pagination incrémentale, mesure dans X1, passage en Worker si besoin |
| Courbe d'apprentissage de Rust | Moyenne | Moyen | Cœur réduit à l'infrastructure (D-02) ; X3 ; repli Electron |
| WebView2 absent ou bloqué sur un PC d'entreprise | Faible | Moyen | Installateur avec WebView2 ; message clair dans la version portable |
| Une mise à jour de WebView2 change le rendu | Faible | Moyen | Polices embarquées, crénage désactivé, comparaison d'images chaque nuit |
| Les services de carte gratuits changent leurs conditions | Moyenne | Faible | Adresses configurables [REP-04b], cache, carte facultative |
| Le schéma évolue mal entre versions | Moyenne | Fort | Migrations figées, copie avant migration, test d'ouverture des projets de chaque version publiée |
| Dépendance à une bibliothèque abandonnée | Moyenne | Moyen | Peu de dépendances, toutes répandues ; formats de scénario écrits pour Oniric |

---

## 16. Annexes

### 16.1 Glossaire du code

| Français (interface) | Code et base |
|---|---|
| Projet | `Project` |
| Atelier d'écriture, étape | `Workshop`, `WorkshopStep` |
| Bible, fiche | `Bible`, `BibleEntry` |
| Acte, séquence, scène | `Act`, `Sequence`, `Scene` |
| En-tête de scène | `SceneHeading` |
| Format de scénario | `ScreenplayFormat` |
| Version figée, révision | `ScriptVersion`, `Revision` |
| Point de structure | `StoryBeat` |
| Intrigue | `Plotline` |
| Moodboard | `Moodboard` |
| Découpage technique, plan | `ShotList`, `Shot` |
| Case de storyboard | `StoryboardPanel` |
| Département, poste | `Department`, `Position` |
| Contact | `Contact` |
| Dépouillement, élément dépouillé | `Breakdown`, `BreakdownItem` |
| Plan de travail, journée, bande | `Stripboard`, `ShootingDay`, `Strip` |
| Feuille de service | `CallSheet` |
| Budget, ligne, dépense, financement | `Budget`, `BudgetLine`, `Expense`, `FundingSource` |
| Décor réel, visite de repérage | `Location`, `ScoutingVisit` |
| Lieu (de l'histoire) | `BibleEntry` de type `place` |
| Autorisation de tournage | `Permit` |
| Tâche | `Task` |
| Fichier | `MediaFile` |

### 16.2 Dépendances principales et licences

Toutes sont compatibles avec la GPL-3.0.

| Dépendance | Rôle | Licence |
|---|---|---|
| Tauri 2 | Application de bureau | MIT / Apache-2.0 |
| SQLite, SQLCipher, `rusqlite` | Base de données | Domaine public, BSD-3, MIT |
| `notify`, `image`, `zip`, `reqwest` | Surveillance, vignettes, archives, réseau | MIT / Apache-2.0 |
| `spellbook` + dictionnaires LibreOffice (fr, en) | Orthographe compatible Hunspell | MPL-2.0 |
| React, TypeScript, Vite | Interface | MIT, Apache-2.0, MIT |
| ProseMirror | Éditeur | MIT |
| Kysely, TanStack Query, Zustand | Données | MIT |
| React Aria Components | Composants accessibles | Apache-2.0 |
| dnd-kit, cmdk, i18next | Glisser-déposer, palette, traductions | MIT |
| Konva, perfect-freehand | Canevas (v2) | MIT |
| MapLibre GL JS, suncalc, exifr | Carte, soleil, EXIF (v3) | BSD-3, BSD-2, MIT |
| pdf.js, pdf-lib | Lecture et retouche de PDF | Apache-2.0, MIT |
| mammoth, docx, exceljs, fflate, jsdiff | Formats, comparaison | BSD-2, MIT, MIT, MIT, BSD-3 |
| Courier Prime et polices libres | Polices embarquées | OFL |
| FFmpeg (version LGPL) | Vidéo (v2) | LGPL-2.1 |
| Vitest, WebdriverIO, axe-core | Tests | MIT, MIT, MPL-2.0 |

### 16.3 Structure du dépôt

```
oniric/
├── src/                     interface TypeScript (section 5.1)
├── src-tauri/
│   ├── src/                 cœur Rust : project/, db/, app_data/, media/, network/, documents/, system/
│   ├── migrations/          0001_initial.sql, 0002_….sql
│   └── tauri.conf.json      fenêtres, CSP, permissions, association .oniric
├── assets/                  polices, dictionnaires, style de carte, modèles fournis
├── tests/
│   ├── e2e/                 parcours P1 à P5
│   ├── corpus/              scénarios de référence (libres de droits) et PDF attendus
│   └── crash/               test de coupure
├── docs/
│   ├── format-projet.md     format du dossier projet [FIA-03]
│   ├── decisions/           une fiche par décision (D-01…)
│   └── recette/             listes de contrôle de recette (PRD 13)
├── .github/
│   ├── workflows/           intégration continue (12.2)
│   └── ISSUE_TEMPLATE/      bogue, suggestion
├── LICENSE                  GPL-3.0
└── README.md
```

### 16.4 Traçabilité

| Exigence | Où elle est traitée |
|---|---|
| PRJ-06, PRJ-06b | 6.1, 6.2, 12.3 |
| SAV-01, SAV-02 | 3.3, 7.2, 7.3 |
| SAV-03, SAV-05 | 7.4 |
| SAV-04 | 7.5 |
| FIA-01, FIA-02 | 4.3, 6.7, 7 |
| FIA-03 | 6.3, 6.9 |
| FIA-04 | 6.8 |
| FIA-05 | 6.7 |
| EDT-01 à EDT-13 | 8 |
| VUE-01 à VUE-13 | 5.3, 5.4, 6.4, 8.2 |
| RCH-01 | 6.6 |
| EDT-10, EDT-11, 8.3 | 9 |
| IMP-01 | 9.3 |
| REP-03, REP-04 à REP-04f, REP-07 | 10 |
| SEC-01 à SEC-06 | 10.1, 11, 12.3 |
| UX-01 à UX-04 | 5.2, 5.5 |
| CPT-01 à CPT-03 | 2, 12.3, 11 |
| 10.1 Performance | 4.3, 5.3, 8.2, 12.1 |
| 10.7 Qualité | 12 |
