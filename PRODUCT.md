# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Scénaristes et réalisateurs, souvent seuls, qui écrivent un film sur leur PC Windows : de l'idée de départ au scénario formaté, puis (à terme) la préparation et la production.

## Product Purpose

Oniric est un logiciel libre (GPL-3.0) de création de films : écrire, préparer et produire un film, sur son ordinateur, sans compte ni nuage. La version 0.5 couvre l'écriture : Atelier d'écriture en étapes, Bible du film, éditeur de scénario aux formats français et américain, Tableau, Chronologie, Versions, notes, exports PDF, FDX et Fountain.

## Positioning

Tout le parcours d'un film dans une seule application locale : l'Atelier guide l'écriture pas à pas et la Bible relie personnages, lieux et objets au texte du scénario, là où les outils voisins ne font que formater des pages.

## Operating Context

- Application de bureau Windows (Tauri 2 et WebView2) ; l'interface est en React.
- Un projet est un dossier ordinaire (`projet.oniric`, `donnees.db`, `exports`, `medias`, `versions`).
- Enregistrement automatique, sauvegardes dans un dossier à part, aucune connexion requise.
- Longues sessions d'écriture : l'éditeur de scénario est l'écran principal.

## Capabilities and Constraints

- Interface entièrement en français ; code et commentaires en anglais.
- La page de scénario à l'écran suit la pagination de l'impression (Courier Prime, marges du format) : ses métriques ne doivent pas changer.
- Les parties Réalisation et Production sont visibles dans la navigation mais arrivent en 2.0 et 3.0.
- Clair et sombre, selon le réglage de Windows.

## Brand Commitments

- Nom : Oniric.
- Ton simple, sans jargon technique.

## Product Principles

- Le texte d'abord : rien ne doit gêner l'écriture.
- Local et sûr : l'utilisateur ne s'occupe jamais de l'enregistrement.
- Guider sans enfermer : l'Atelier aide, il n'oblige pas.
