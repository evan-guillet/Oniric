# Oniric

Logiciel libre (GPL-3.0) de création de films pour Windows : écrire, préparer et produire un film, sur son ordinateur, sans compte ni nuage. Oniric ne se connecte à Internet que pour la carte des repérages, et seulement si on l'active.

**Version 0.5** : écrire. En plus du socle de la 0.1 (projet, éditeur aux formats français et américain, PDF, enregistrement automatique, survie aux plantages) :

- l'**Atelier d'écriture**, étapes 1 à 5 : préparation, personnages, structure, documents préparatoires (synopsis, séquencier, traitement, continuité dialoguée), écriture ;
- la **Bible** : personnages, lieux, objets… et liens `@` ou `[[` depuis le scénario et les documents ;
- le **Tableau** (actes, séquences, cartes de scène, lignes d'intrigue) et la **Chronologie** ;
- les **Versions** figées, leur comparaison, et les **notes** en marge du scénario ;
- la **page de titre**, les **formats personnalisés** et le **profil** ;
- l'export **FDX** (Final Draft), l'import FDX et Fountain ;
- les **sauvegardes** automatiques dans un dossier à part, et leur restauration.

Les parties Réalisation et Production sont visibles dans la navigation ; elles arrivent dans les versions 2.0 et 3.0.

Les choix techniques sont décrits dans le [document d'architecture](docs/Architecture_Oniric.md) ; le besoin, dans le [PRD](docs/PRD_Oniric.md) et le [cahier des charges](docs/Cahier_des_charges_Oniric.md).

## Utiliser Oniric

1. Lancer `Oniric_0.5.0_x64-setup.exe`. L'installation se fait pour l'utilisateur, sans droits d'administrateur. L'installateur n'est pas encore signé : Windows SmartScreen demande une confirmation (« Informations complémentaires › Exécuter quand même »).
2. **Nouveau projet** : un titre, un format, un emplacement. Le projet est un dossier ordinaire. **Importer un scénario…** crée un projet à partir d'un fichier Final Draft (`.fdx`) ou Fountain.
3. Écrire. `Entrée` et `Tab` passent d'un élément à l'autre comme dans les logiciels professionnels ; `Ctrl+1` à `Ctrl+8` choisissent l'élément ; taper `INT.` en début d'action crée un en-tête de scène.
4. **Exporter en PDF** (`Ctrl+P`) : le fichier arrive dans le dossier `exports` du projet. **Options d'export…** imprime dans un autre format ; **Page de titre…** la remplit.
5. La colonne de gauche mène aux autres vues : Atelier, Bible, Scénario, Tableau, Chronologie, Versions, Réglages.

Rien à enregistrer à la main : le texte est écrit sur le PC une seconde après la dernière frappe, et recopié dans le dossier du projet toutes les 30 secondes et à la fermeture. `Ctrl+S` force la recopie.

En plus, Oniric garde des **sauvegardes** de chaque projet dans `Documents\Oniric\Sauvegardes` (dossier modifiable dans Réglages) : une copie toutes les 30 minutes quand quelque chose a changé, une à la fermeture, les 20 dernières gardées. **Restaurer une sauvegarde…** (accueil ou Réglages) recrée un projet à côté, sans toucher à l'original.

### Le dossier d'un projet

```
Les Heures Bleues/
├── projet.oniric   ouvre le projet (double-clic)
├── donnees.db      tout le projet, base SQLite ordinaire
├── exports/        PDF et fichiers exportés
├── medias/         images des fiches de la bible
├── versions/       versions figées du scénario
└── .verrou         présent tant que le projet est ouvert
```

Le format est décrit dans [docs/format-projet.md](docs/format-projet.md).

## Développer

Le code, la base et les commentaires sont en anglais ; l'interface est en français.

| Partie | Dossier |
|---|---|
| Cœur Rust : projet, copie de travail, recopie atomique, garde-fous SQL, PDF | `src-tauri/src/` |
| Schéma de la base | `src-tauri/migrations/` |
| Interface React et TypeScript | `src/` (organisation : architecture, 5.1) |
| Règles du scénario (pagination, en-têtes, typographie, enregistrement) | `src/modules/script/screenplay/domain/` |
| Éditeur ProseMirror | `src/modules/script/screenplay/ui/editor/` |
| Fountain | `src/interop/fountain/` |
| Test de coupure et scénarios du cœur | `tests/crash/` |
| Parcours de bout en bout P1 et P5, PDF des scénarios de référence | `tests/e2e/parcours.mjs`, `tests/corpus/` |
| Listes de recette | `docs/recette/` |

### Sous Windows

Installer Node.js 24, Rust (`rustup`, cible MSVC) et les « Outils de génération Visual Studio » (C++), puis :

```bash
npm install
```

```bash
npm run tauri dev
```

Tests :

```bash
npm test
```

```bash
cargo test -p oniric -p oniric-crash-test --no-default-features
```

```bash
cargo run --release -p oniric-crash-test -- lancer --iterations 1000
```

Installateur, puis parcours de bout en bout sur l'application construite :

```bash
npm run tauri build
```

```bash
npm run e2e -- target\release\Oniric.exe
```

Après avoir modifié une commande Rust, régénérer les types de l'interface (`npm run types`), puis `npm run typecheck` signale chaque endroit à adapter.

### Depuis Linux ou WSL

Le cœur se teste sans Tauri (`--no-default-features`). L'application Windows peut être compilée de façon croisée (cible `x86_64-pc-windows-gnu`, `cargo zigbuild`, `windres`, `makensis` et `make` des paquets Debian) ; c'est ainsi que la v0.1 a été construite, mais le chemin normal est la compilation sous Windows.

## Licence

GPL-3.0 ou ultérieure, voir [LICENSE](LICENSE). Courier Prime est sous licence OFL.
