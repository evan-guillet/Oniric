# Format d'un projet Oniric

Format 1, schéma de base 4, Oniric 0.5. Un projet d'un schéma plus ancien (1 à 3) est mis à jour à sa première ouverture, après une copie de sauvegarde. Ce document permet de lire un projet sans Oniric [FIA-03]. Le schéma fait foi : `src-tauri/migrations/`.

## Le dossier

| Élément | Rôle |
|---|---|
| `projet.oniric` | Fichier JSON qui identifie le projet ; un double-clic l'ouvre dans Oniric |
| `donnees.db` | Toute la donnée du projet, base SQLite 3 ordinaire, non chiffrée |
| `exports/` | Fichiers produits par « Exporter » (PDF, Fountain, FDX, CSV) |
| `medias/` | Images du projet, rangées par sorte : `images/` (choisies dans un fichier), `moodboard/` (collées ou glissées sur un moodboard), `storyboard/` (cases dessinées dans Oniric, en PNG) |
| `versions/` | Versions figées du scénario, un fichier JSON chacune (ci-dessous) |
| `.verrou` | Présent tant qu'Oniric a le projet ouvert : JSON `{"host", "pid", "since"}` (secondes Unix) |

Le dossier peut être copié, renommé, déplacé ou compressé librement, projet fermé. `donnees.db` est remplacé en bloc à chaque recopie (fichier temporaire puis renommage) : on ne trouve jamais de fichier `-wal` ou `-journal` à côté.

## `projet.oniric`

```json
{
  "format": "oniric-project",
  "formatVersion": 1,
  "id": "0192b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b",
  "title": "Les Heures Bleues",
  "createdWith": "0.5.0",
  "database": "donnees.db"
}
```

`id` est un UUID v7. `formatVersion` est la version de l'organisation du dossier ; `PRAGMA user_version` de la base est celle du schéma (4 en 0.5). Un Oniric plus ancien refuse d'ouvrir un projet dont l'un ou l'autre est plus récent, sans le modifier.

## La base

Conventions : tables `STRICT`, identifiants UUID v7 en texte, dates ISO 8601 en UTC (`2026-10-21T09:30:00.000Z`).

### `project_setting`

| Colonne | Contenu |
|---|---|
| `key` | Nom du réglage |
| `value` | Valeur en texte |
| `updated_at` | Date de modification |

Réglages :

| Clé | Valeur |
|---|---|
| `screenplay_format` | `fr` (A4, usage français), `us` (Letter, usage américain) ou l'identifiant d'un format personnalisé |
| `screenplay_format_data` | Le format personnalisé complet, en JSON, pour que le projet s'ouvre pareil sur un autre PC |
| `title_page` | La page de titre, en JSON : `title`, `authors`, `basedOn`, `version`, `date`, `contact`, `notes`, `include` |
| `parts_hidden` | Parties masquées dans la navigation, tableau JSON (`realisation`, `production`) |
| `shot_numbering` | Numéros des plans : `dash` (12-1, 12-2…, par défaut) ou `letter` (12A, 12B…) |
| `storyboard_ratio` | Format du cadre des cases : `1.85`, `2.39`, `16:9` (par défaut), `4:3` ou `9:16` |

### `scene`

Une ligne par scène. Le texte du scénario est la suite des scènes non supprimées, triées par `rank`.

| Colonne | Contenu |
|---|---|
| `id` | UUID v7 |
| `rank` | Rang fractionnaire en base 62 (`0-9A-Za-z`) : trier par ordre binaire de chaîne donne l'ordre des scènes |
| `number` | Numéro affiché (`12`, `12A`), ou vide |
| `number_locked` | 1 si les numéros sont verrouillés (versions suivantes) |
| `heading_int_ext`, `heading_location`, `heading_time` | En-tête découpé (`INT.`, `CUISINE`, `JOUR`), recalculé à chaque enregistrement |
| `content` | Les éléments de la scène, en JSON (ci-dessous) |
| `summary`, `color` | Résumé et couleur de la carte du Tableau |
| `sequence_id` | Séquence de la scène ; vide : la scène suit la séquence de la scène précédente |
| `status` | `todo`, `draft`, `rewrite`, `done`, ou vide |
| `tags`, `plotlines` | Étiquettes et lignes d'intrigue, tableaux JSON de textes |
| `story_time` | Moment de l'histoire, texte libre (« jour 3, matin ») |
| `length_eighths` | Longueur en huitièmes de page |
| `created_at`, `updated_at` | Dates |
| `deleted_at` | Date de mise à la corbeille, sinon vide |

### Le texte d'une scène

`content` est un tableau JSON d'éléments ProseMirror. Chaque élément a un `type` et, s'il n'est pas vide, un tableau `content` de nœuds texte. Pas de gras ni d'italique ; deux marques peuvent porter sur un passage : `wikilink` (`attrs.id` : la fiche de la bible liée) et `note` (`attrs.id` : la note en marge).

```json
[
  { "type": "scene_heading", "content": [{ "type": "text", "text": "INT. CUISINE – JOUR" }] },
  { "type": "action", "content": [{ "type": "text", "text": "Marie pose sa tasse." }] },
  { "type": "character", "content": [{ "type": "text", "text": "MARIE" }] },
  { "type": "parenthetical", "content": [{ "type": "text", "text": "(bas)" }] },
  { "type": "dialogue", "content": [{ "type": "text", "text": "Tu pars déjà ?" }] }
]
```

Types : `scene_heading`, `action`, `character`, `parenthetical`, `dialogue`, `transition`, `shot` (plan), `on_screen_text` (texte à l'écran). Le texte est stocké tel qu'il a été tapé ; les majuscules des en-têtes et des personnages sont un effet d'affichage. En français, les espaces avant `? ! ; :` et à l'intérieur de `« »` sont des espaces insécables (U+00A0).

### Structure : `act`, `sequence`, `structure_beat`, `beat_scene`

Actes et séquences du Tableau, triés par `rank` comme les scènes ; une séquence appartient à un acte (`act_id`) ou à aucun. L'ordre des scènes reste celui du scénario. `structure_beat` garde les points clés de l'atelier par modèle de structure (`model` : `three-acts`, `heros-journey`, `save-the-cat`, `eight-sequences`, `free` ; `key` : le point clé), avec leurs notes ; `beat_scene` les relie aux scènes.

### Atelier : `workshop_field`, `workshop_field_version`, `document`, `document_version`

`workshop_field` : un champ de l'atelier par clé (`prep.premise`, `prep.genres`, `step.2.status`…), valeur en JSON. `workshop_field_version` garde les valeurs précédentes, une au plus toutes les dix minutes. `document` : synopsis (`kind` = `synopsis`), traitement (`treatment`) et continuité dialoguée (`continuity`), en JSON ProseMirror (paragraphes, titres, gras, italique, liens `wikilink`) ; `document_version` : leurs versions nommées.

### Bible : `bible_type`, `bible_entry`, `bible_entry_version`, `relation`

`bible_entry` : une fiche (`type` : `character`, `location`, `object`, `vehicle`, `faction`, `event`, `culture`, `concept`, `creature`, ou l'id d'un `bible_type` créé par l'auteur). `aliases`, `tags`, `links`, `gallery` sont des tableaux JSON ; `fields` est un objet JSON des champs du type ; `content` est le texte libre en JSON ProseMirror ; `image` et `gallery` donnent des chemins dans `medias/`. `bible_entry_version` garde l'historique de chaque fiche (la fiche entière en JSON). `relation` relie deux fiches (`kind` : famille, amour, rivalité…), éventuellement pour un acte.

### `note`

Notes en marge du scénario : `scene_id`, `quote` (le passage annoté au moment de la note), `body`, `resolved` (0 ou 1). Le passage lui-même porte une marque `note` de même id dans le texte de la scène.

### `script_version` et le dossier `versions/`

Une ligne par version figée : `name`, `file` (chemin dans le projet), `sha256` (empreinte du fichier), `pages`, `scenes`. Le fichier `versions/<date>_<nom>.json` contient `format: "oniric-screenplay-version"`, le nom, la date, le titre, le format, la page de titre et les scènes (`id`, `content`) : il suffit à relire ou réimprimer la version.

### Réalisation : `moodboard`, `moodboard_item`, `moodboard_link`, `shot`

`moodboard` : une planche (`name` ; `kind` : `general`, `character`, `location`, `sequence`, `light`, `costume`, `color` ou `other` ; `rank` pour l'ordre de la liste). `moodboard_item` : ce qui est posé dessus, à sa place en pixels (`x`, `y`, `w`, `h`, et `z` : plus il est grand, plus l'élément est au-dessus) ; `kind` vaut `image` (`data` : `{"path"}`, un chemin dans `medias/`), `color` (`{"color": "#rrggbb"}`), `text` ou `note` (`{"text"}`). `moodboard_link` rattache une planche à une scène ou à une fiche de la bible, par son id (`target_id`). Supprimer une planche supprime ce qu'elle porte et ses rattachements, jamais les fichiers de `medias/`.

`shot` : un plan du découpage, dans sa scène (`scene_id` ; supprimer définitivement la scène supprime ses plans). `rank` donne l'ordre du montage dans la scène, `shoot_order` l'ordre de tournage (1, 2…, ou vide). `size` (`xcu` très gros plan, `cu` gros plan, `mcu` plan rapproché, `cowboy` plan américain, `medium` plan moyen, `wide` plan d'ensemble, `extreme` plan général), `angle` (`eye`, `high` plongée, `low` contre-plongée, `dutch` oblique), `movement` (`static`, `pan`, `tracking`, `steadicam`, `handheld`, `crane`, `drone`, `zoom`), `support` (`tripod`, `dolly`, `slider`, `gimbal`, `shoulder`, `crane`, `vehicle`) et `sound` (`sync`, `mos`, `playback`) sont vides ou l'une de ces clés ; `lens`, `camera`, `frame_rate`, `action`, `dialogue`, `lighting`, `effects` et `notes` sont du texte libre ; `characters` est un tableau JSON de noms ; `duration` est la durée à l'écran en secondes, `setup` le temps de tournage en minutes. `covers` est le tableau JSON des textes des éléments de la scène que le plan couvre, comparés sans tenir compte des espaces. La case du storyboard est celle du plan : `frame_image` (un chemin dans `medias/`, ou vide) et `frame_notes`. Le numéro d'un plan n'est pas enregistré : c'est celui de sa scène suivi de sa place dans l'ordre du montage.

### `oniric_journal`

Une ligne par enregistrement : `at` (date), `label` (ce qui a été fait, en français), `tables` (tableau JSON des tables touchées). Sert au diagnostic ; on peut la vider sans perte.

## Lire un projet sans Oniric

```bash
sqlite3 donnees.db "SELECT number, heading_location, content FROM scene WHERE deleted_at IS NULL ORDER BY rank"
```
