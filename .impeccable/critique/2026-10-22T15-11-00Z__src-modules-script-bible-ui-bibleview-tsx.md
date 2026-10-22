---
target: Bible
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\eguillet\\Documents\\Aide\\Oniric\\src\\modules\\script\\bible\\ui\\BibleView.tsx"
target_fingerprint: "sha256:412f4ba09f3052b88152d9ea9e3a7d887d6aabcd9699288620b1e05d7c64cc26"
target_path: "C:\\Users\\eguillet\\Documents\\Aide\\Oniric\\src\\modules\\script\\bible\\ui\\BibleView.tsx"
timestamp: 2026-10-22T15-11-00Z
slug: src-modules-script-bible-ui-bibleview-tsx
---
Method: dual-agent (A: design review · B: detector + CDP)

## Design Health Score — 22/40 (Acceptable)

| # | Heuristique | Note | Problème clé |
|---|---|---|---|
| 1 | Visibilité de l'état | 2 | Aucun retour d'enregistrement dans la modale ; elle masque le « Enregistré » de la barre d'état |
| 2 | Correspondance au réel | 3 | Bon vocabulaire ; « Scènes où … apparaît (0) » repose sur le nom exact, faux pour les événements |
| 3 | Contrôle et liberté | 2 | « Supprimer » est définitif (pas de corbeille, alors que les scènes en ont une) ; Détecter pré-coche tout |
| 4 | Cohérence | 2 | Cartes à 16px de rayon (DESIGN.md : 8) ; liens en select natif mais étiquettes en puces ; « · validé » vs « Validé » |
| 5 | Prévention des erreurs | 2 | Détecter propose doublons et rôles génériques cochés ; changer de type masque des champs sans prévenir |
| 6 | Reconnaissance | 3 | Icônes, libellés de type, aide « @ ou [[ », compteurs dans le filtre |
| 7 | Flexibilité | 1 | Pas de raccourci recherche/création, pas de tri, pas de vue liste, pas d'actions groupées, pas de fiche suivante |
| 8 | Esthétique minimaliste | 2 | Vignettes de 128px vides sur les 60 fiches ; modale en colonne plate de ~12 champs |
| 9 | Récupération d'erreur | 2 | Toasts génériques ; « (fiche supprimée) » sans moyen de réparer le lien |
| 10 | Aide | 3 | Bon état vide, aide des alias, intro claire de Détecter et des Types |

## Verdict de spécificité
Surface générique (galerie de cartes interchangeable), richesse métier enfouie (détection depuis le scénario, liens @/[[, apparitions dans les scènes). Le détecteur : CLI 0 constat (regex seulement), CDP 4 scans → 1 avertissement flat-type-hierarchy dans la modale, faux positif (tailles conformes à DESIGN.md ; les h2 sont des légendes de nav).

## Priority Issues
1. [P1] Focus perdu à la fermeture de la modale (retombe sur body) — mémoriser la carte d'origine et la refocaliser ; focus initial sur le nom.
2. [P1] Détecter peut créer en masse des fiches parasites — grouper Personnages/Lieux avec tout cocher, signaler les doublons probables (« Ajouter comme autre nom »), décocher les sous-lieux, pied collant avec le bouton, pluriels corrects.
3. [P1] Cartes sans information métier — sans image, icône compacte à côté du nom ; tri (alphabétique sans article, récent, présence) ; sections par type ; « 12 scènes · 1re : sc. 3 » ; statut seulement s'il n'est pas par défaut.
4. [P2] Modale en formulaire plat sans retour d'enregistrement — deux colonnes (écriture / métadonnées), Galerie et Notes repliées si vides, « Enregistré » discret, scènes remontées.
5. [P2] Actions secondaires et destructives au même poids — Dupliquer/Archiver/Historique dans un menu « ⋯ », suppression douce avec « Annuler », infobulle sur Archiver.

## Persona Red Flags
- Alex : pas de Ctrl+F, Ctrl+N, flèches dans la grille, tri, vue liste, actions groupées, fiche précédente/suivante ; select « + Lier… » de 60 noms sans filtre.
- Sam : focus perdu ; nom accessible de carte concaténé (« Événement · validéBataille… ») ; « Aucune fiche ne correspond » pas en région live ; pas de titres dans la grille.
- Jordan : « Détecter » et « Types de fiches » non expliqués ; tout pré-coché ; Archiver vs Supprimer flou ; formulaire long sans « facultatif ».

## Minor Observations
Double point « l'Ossuaire.... » ; toast de restauration par-dessus la modale ; voile de la modale trop léger en sombre ; compteur « 60 » et titre « Bible » restent sur Détecter/Types ; types au singulier sur les cartes, au pluriel dans le filtre ; « Retrouver les personnages… » vs « Détecter » ; selects « + Lier… » pleine largeur ; types intégrés listés en texte brut ; rotation du « + » seule animation ludique.

## Questions to Consider
- Pourquoi la carte montre-t-elle 40 % d'image vide et rien du scénario ?
- Détecter doit-il être une page, ou une suggestion continue (« 3 nouveaux personnages dans le scénario ») ?
- Une fiche consultée en pleine écriture ne devrait-elle pas s'ouvrir en panneau latéral à côté du texte plutôt qu'en modale de 1000px ?
