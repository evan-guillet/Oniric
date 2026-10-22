# PRD — Oniric

> Document d'exigences produit (*Product Requirements Document*). Il dit **pourquoi** Oniric existe, **pour qui**, **ce qu'il faut livrer d'abord** et **comment savoir que c'est réussi**. Le détail fonctionnel reste dans le [cahier des charges](Cahier_des_charges_Oniric.md), la conception technique dans le [document d'architecture](Architecture_Oniric.md) : les identifiants entre crochets (par exemple [EDT-02]) renvoient à ses exigences.

| Élément | Valeur |
|---|---|
| Produit | Oniric |
| Document | PRD |
| Version | 1.2 (lien vers le document d'architecture) |
| Date | 21/10/2026 |
| Auteur | Evan Guillet |
| Référence | Cahier des charges v2.4, Architecture technique v1.0 |
| Statut | Brouillon à valider |

---

## Sommaire

1. [En bref](#1-en-bref)
2. [Problème](#2-problème)
3. [Vision et proposition de valeur](#3-vision-et-proposition-de-valeur)
4. [Utilisateurs](#4-utilisateurs)
5. [Objectifs et indicateurs de réussite](#5-objectifs-et-indicateurs-de-réussite)
6. [Principes produit et non-objectifs](#6-principes-produit-et-non-objectifs)
7. [Feuille de route](#7-feuille-de-route)
8. [Version 1 « Écrire » : épopées et récits utilisateur](#8-version-1--écrire--épopées-et-récits-utilisateur)
9. [Version 2 « Mettre en scène et préparer »](#9-version-2--mettre-en-scène-et-préparer)
10. [Version 3 « Produire »](#10-version-3--produire)
11. [Expérience utilisateur](#11-expérience-utilisateur)
12. [Exigences de qualité](#12-exigences-de-qualité)
13. [Critères de sortie des versions](#13-critères-de-sortie-des-versions)
14. [Hypothèses, risques et parades](#14-hypothèses-risques-et-parades)
15. [Questions ouvertes](#15-questions-ouvertes)
16. [Annexe : traçabilité](#16-annexe--traçabilité)

---

## 1. En bref

**Oniric est un logiciel libre et gratuit pour Windows qui accompagne une personne de l'idée de son film jusqu'au tournage, sur son ordinateur, sans compte ni abonnement.**

- **Pour qui** : les cinéastes indépendants, auteurs et étudiants qui écrivent et préparent leur film seuls.
- **Le problème** : aujourd'hui, ils jonglent entre un traitement de texte, un logiciel de scénario, des tableurs et des dossiers d'images. Les informations se dupliquent et se contredisent. Les outils complets, comme StudioBinder, sont payants, en ligne et faibles sur le développement de l'histoire.
- **La réponse** : un seul dossier projet où la **scène** est l'objet central. Elle est écrite, illustrée, découpée, dépouillée, planifiée et chiffrée sans double saisie, et une **bible vivante** relie l'univers de l'histoire à sa fabrication.
- **Première version** : « Écrire ». Elle comprend l'atelier d'écriture guidé (étapes 1 à 4), la bible, un éditeur de scénario professionnel et les vues Page et Tableau, avec une garantie : **ne jamais perdre une ligne**.

---

## 2. Problème

### 2.1 Ce que vivent les utilisateurs

| Douleur | Conséquence |
|---|---|
| **Outils éparpillés** : Word pour le synopsis, un logiciel de scénario, Excel pour le dépouillement et le budget, Pinterest pour les ambiances | Copier-coller permanent ; un personnage renommé dans le scénario ne l'est pas dans le dépouillement |
| **Logiciels professionnels payants** (abonnements mensuels) | Inaccessibles aux étudiants et aux projets sans budget, qui se rabattent sur des modèles Word bricolés |
| **Outils en ligne** | Impossible de travailler sans réseau (train, lieu de tournage) ; scénarios inédits stockés chez un tiers |
| **Peu d'aide au développement de l'histoire** | Les logiciels démarrent au scénario formaté, alors que le travail commence par l'idée, les personnages, la structure, le traitement |
| **Pas de mémoire de l'univers** | Les détails du monde (âge d'un personnage, histoire d'un lieu, règles d'un univers fantastique) se perdent dans des notes et se contredisent d'une scène à l'autre |
| **Contexte français absent** | Pas de format de scénario français, pas de devis type CNC, pas de SACD ni d'intermittence |

### 2.2 Pourquoi maintenant

- Les technologies de bureau légères (Tauri, SQLite, moteurs d'édition structurée) permettent à une seule personne de produire une application fiable et rapide.
- Les services cartographiques libres (OpenStreetMap, OpenFreeMap) rendent possible une carte de qualité sans coût.
- Il n'existe pas aujourd'hui de logiciel **libre** qui couvre à la fois l'écriture, l'univers et la préparation du tournage.

---

## 3. Vision et proposition de valeur

### 3.1 Vision

> *Que n'importe qui puisse mener un film de l'idée au tournage avec un seul outil, gratuit, qui lui appartient.*

### 3.2 Proposition de valeur

*Le logiciel libre et gratuit qui accompagne un film de l'idée jusqu'au tournage, entièrement sur son ordinateur, avec une bible vivante qui relie l'histoire à sa fabrication.*

### 3.3 Ce qui différencie Oniric

1. **L'atelier d'écriture guidé**, de l'idée à la diffusion, que les concurrents n'ont pas.
2. **La bible vivante** : chaque personnage, lieu ou objet est une fiche reliée aux scènes, au dépouillement, à la distribution et aux repérages.
3. **Une seule source de vérité** : la scène est saisie une fois et se retrouve partout.
4. **Sur l'ordinateur de l'utilisateur** : hors ligne (sauf la carte), format ouvert, aucune donnée chez un tiers.
5. **Libre (GPL-3.0) et gratuit**, adapté au contexte français.

---

## 4. Utilisateurs

### 4.1 Personas

**Camille, 34 ans — autrice-réalisatrice indépendante** *(persona principale)*
- Écrit son premier long métrage, un drame, le soir et le week-end, sur un PC portable Windows.
- Utilise aujourd'hui Word, un logiciel de scénario en version gratuite limitée et des dossiers d'images.
- **Veut** : avancer étape par étape sans se perdre, garder la cohérence de ses personnages, produire un scénario au format professionnel et un dossier pour démarcher des producteurs.
- **Craint** : perdre son travail, voir son scénario circuler, payer un abonnement.

**Yanis, 21 ans — étudiant en école de cinéma**
- Écrit et tourne des courts métrages avec des camarades, sans budget.
- **Veut** : un outil gratuit et complet pour l'écriture, le découpage, le storyboard et une feuille de service correcte à envoyer à son équipe.
- **Craint** : un outil trop complexe ; perdre du temps à apprendre.

**Sofia, 42 ans — réalisatrice-productrice de courts métrages et de clips**
- Prépare elle-même ses tournages : équipe, plan de travail, budget, autorisations en mairie.
- **Veut** : passer du scénario au dépouillement puis à la feuille de service sans tout ressaisir, et suivre ses démarches administratives.
- **Craint** : un oubli d'autorisation, un dépassement de budget non vu.

### 4.2 Utilisateur prioritaire

La **version 1** vise **Camille** (l'écriture). Les versions 2 et 3 élargissent à **Yanis** (mise en scène, tournage léger) puis à **Sofia** (production complète).

### 4.3 Hors cible

- Les sociétés de production qui ont besoin de collaboration, de droits par personne et de comptabilité légale.
- Les équipes qui veulent écrire à plusieurs en même temps.

Ces besoins figurent dans les évolutions envisagées du cahier des charges (section 14).

---

## 5. Objectifs et indicateurs de réussite

Oniric ne collecte **aucune donnée d'usage** (pas de télémétrie, [SEC-01]). Les indicateurs reposent donc sur le **dépôt GitHub** (publications, tickets), la **recette** menée par l'auteur et les **retours volontaires**.

### 5.1 Objectifs produit

| # | Objectif | Lié à |
|---|---|---|
| OP1 | Permettre d'écrire un scénario complet, de l'idée à un PDF au format professionnel | O1 |
| OP2 | Tenir la bible de l'univers à jour sans effort, grâce aux liens avec le scénario | O2 |
| OP3 | Passer de la scène écrite à la feuille de service sans double saisie | O3, O4 |
| OP4 | Ne jamais faire perdre de travail à l'utilisateur | — |

### 5.2 Indicateurs

| Indicateur | Cible version 1 | Source |
|---|---|---|
| **Perte de données** | **0** cas confirmé | Tickets, tests de coupure automatisés |
| Parcours critiques de la version réussis | Tous | Recette par l'auteur (voir 13) |
| Temps pour écrire et exporter une première scène formatée, depuis l'installation | < 10 min | Recette chronométrée sur une installation neuve |
| Fidélité d'import / export FDX et Fountain | ≥ 95 % des éléments retrouvés sur un corpus de 50 scénarios | Banc de test automatisé |
| Délai de première réponse à un ticket | < 1 mois | Tickets GitHub |
| Téléchargements de la version 1 sur 6 mois | 2 000 | Statistiques des publications GitHub |
| Signalements de plantage bloquant par version | < 5 | Tickets GitHub |

Les cibles chiffrées sont indicatives et seront revues après la première version.

---

## 6. Principes produit et non-objectifs

### 6.1 Principes

Ces principes tranchent les arbitrages pendant la conception :

1. **Les données d'abord.** En cas de doute entre une fonction et la sûreté des données, la sûreté gagne.
2. **Guider sans enfermer.** L'atelier explique et propose, il ne bloque jamais ; tout guidage peut être masqué [ATL-04].
3. **Saisir une fois.** Toute information déjà connue (personnage, lieu, scène, contact) est réutilisée, jamais ressaisie.
4. **Professionnel par défaut.** Les documents produits (scénario, feuille de service, budget) respectent les usages du métier sans réglage.
5. **Rien dans le dos de l'utilisateur.** Aucune connexion cachée, aucune IA, des aides fondées sur des règles qu'on peut expliquer.
6. **Rapide comme un outil local.** Aucune attente perceptible pendant l'écriture.

### 6.2 Non-objectifs

Oniric **ne fera pas**, dans les trois premières versions :

- de collaboration, de partage en ligne, de messagerie ni de chat ;
- d'accès pour les membres de l'équipe : ils figurent dans le projet (contacts, postes, convocations) pour que l'utilisateur gère sa production, mais n'utilisent jamais Oniric et n'y répondent pas ;
- d'envoi de documents depuis le logiciel (l'utilisateur exporte puis envoie par ses moyens) ;
- de montage, d'étalonnage ni de mixage ;
- de comptabilité légale, de paie ni de signature électronique ;
- de génération par intelligence artificielle ;
- de versions macOS, Linux, web ou mobile.

---

## 7. Feuille de route

Chaque version correspond à un lot du cahier des charges (section 13). Les trois parties (Script, Réalisation, Production) sont présentes dans chaque projet dès la version 1 ; les versions les enrichissent.

```
v0.1 alpha ──► v0.5 bêta ──► v1.0 « Écrire » ──► v2.0 « Mettre en scène et préparer » ──► v3.0 « Produire »
  socle          lot 1          lot 1 stable          lot 2                                   lot 3
```

| Jalon | Contenu | Pour qui | Objectif |
|---|---|---|---|
| **v0.1 alpha** | Socle : installation, dossier projet, enregistrement automatique et récupération, éditeur de scénario au format français et américain, export PDF | L'auteur, en usage personnel | Valider la fiabilité et le ressenti de l'éditeur |
| **v0.5 bêta** | Tout le lot 1 fonctionnel | Public, en préversion sur GitHub | Valider le parcours « de l'idée au PDF » |
| **v1.0 « Écrire »** | Lot 1 stabilisé, documenté, traduit en anglais | Public | Première version publique stable |
| **v2.0 « Mettre en scène et préparer »** | Lot 2 : étapes 5 à 9, révisions colorées, moodboards, découpage, storyboard, équipe, dépouillement, plan de travail, feuilles de service | Public | Passer de l'écriture à la préparation du tournage |
| **v3.0 « Produire »** | Lot 3 : budget, repérages et carte, autorisations, casting, séries | Public | Piloter la production complète |

**Pas d'échéance.** Oniric est développé par une seule personne : chaque version sort quand ses critères de sortie (section 13) sont remplis, jamais avant. Les versions sont publiées dans les *Releases* du dépôt GitHub.

---

## 8. Version 1 « Écrire » : épopées et récits utilisateur

Chaque récit suit la forme *« En tant que… je veux… afin de… »* et précise ses **critères d'acceptation**. Priorités MoSCoW : **M** indispensable, **S** important, **C** souhaitable.

### E1 — Installer et démarrer

**E1.1 (M)** En tant qu'autrice, je veux installer Oniric sans droits administrateur, afin de l'utiliser sur un PC que je ne maîtrise pas entièrement. [CPT-02]
- L'installateur fonctionne sous un compte Windows standard, sur Windows 10 et 11 64 bits.
- Une version portable (dossier à décompresser) est proposée.
- L'application démarre en moins de 3 secondes sur la machine de référence.

**E1.2 (M)** En tant qu'utilisatrice qui découvre le logiciel, je veux un projet d'exemple et une visite guidée, afin de comprendre l'outil en quelques minutes. [UX-05]
- Le premier lancement propose : visite guidée, ouverture d'un projet d'exemple, création d'un projet.
- La visite peut être quittée à tout moment et relancée depuis l'aide.
- Le projet d'exemple contient un court scénario, des fiches de bible et une structure en trois actes remplie.

**E1.3 (S)** En tant qu'autrice, je veux renseigner mon profil une fois, afin que mes pages de titre soient préremplies. [USR-02]
- Le profil est facultatif ; nom, coordonnées et logo sont repris sur la page de titre de tout nouveau projet.

### E2 — Gérer ses projets

**E2.1 (M)** En tant qu'autrice, je veux créer un projet dans le dossier de mon choix, afin de savoir où sont mes données. [PRJ-01, PRJ-06]
- La création demande : titre, format, genre, langue, format de scénario, emplacement.
- Le dossier créé respecte la structure décrite au cahier des charges (`projet.oniric`, `donnees.db`, `medias/`, `exports/`, `versions/`).
- Double-cliquer sur `projet.oniric` dans l'explorateur ouvre le projet [PRJ-06b].

**E2.2 (M)** En tant qu'autrice, je veux retrouver mes projets récents à l'accueil, afin de reprendre mon travail en un clic. [ACC-01]
- Chaque projet affiche titre, image, format, phase et date de dernière modification.
- Un projet déplacé ou supprimé apparaît comme introuvable, avec possibilité de le localiser ou de le retirer de la liste.

**E2.3 (M)** En tant qu'autrice, je veux être protégée si j'ouvre deux fois le même projet, afin de ne pas l'abîmer. [USR-04]
- Une seconde ouverture est proposée en lecture seule.
- Après un plantage, le verrou restant peut être levé après confirmation.

**E2.4 (S)** En tant qu'autrice, je veux exporter mon projet en une archive `.oniric` et l'importer sur un autre PC, afin de changer d'ordinateur. [SAV-04]
- L'archive importée redonne un projet identique, médias compris.

### E3 — Ne jamais perdre son travail

**E3.1 (M)** En tant qu'autrice, je veux que tout soit enregistré automatiquement, afin de ne jamais penser à sauvegarder. [SAV-01, FIA-01]
- Aucune action « Enregistrer » n'est nécessaire.
- Après une coupure brutale (arrêt du processus) pendant la frappe, au plus 5 secondes de travail sont perdues.
- La base du projet n'est jamais corrompue, vérifié par un test automatisé de coupure répété au moins 1 000 fois.

**E3.2 (M)** En tant qu'autrice, je veux retrouver mon travail après un plantage, afin de reprendre là où j'en étais. [SAV-02, FIA-02]
- À la réouverture, l'application propose de restaurer l'état le plus récent.
- En cas de base endommagée, elle propose d'ouvrir la dernière copie de sauvegarde valide.

**E3.3 (M)** En tant qu'autrice, je veux des copies de sauvegarde automatiques sur un autre disque, afin de survivre à une panne de mon ordinateur. [SAV-03, SAV-05]
- La création de projet propose de choisir un dossier de sauvegarde.
- Une copie datée est créée à intervalle régulier et à chaque fermeture ; le nombre de copies gardées est réglable.
- Un rappel apparaît si aucune sauvegarde sur un autre support n'a eu lieu depuis le délai choisi.

### E4 — Atelier d'écriture (étapes 1 à 4)

**E4.1 (M)** En tant qu'autrice, je veux être guidée de l'idée à la prémisse, afin de clarifier mon histoire avant d'écrire. [Étape 1]
- Les champs idée, prémisse, thème, genre, ton, codes du genre et références sont disponibles.
- L'aide à la prémisse propose la grille *qui / veut quoi / obstacle / enjeux* et compte les mots.
- Chaque étape porte un indicateur vide / en cours / terminé, réglé par l'autrice [ATL-01].

**E4.2 (M)** En tant qu'autrice, je veux construire mes personnages principaux et leurs relations, afin d'avoir des personnages cohérents. [PER-01 à PER-05]
- Le protagoniste a désir, besoin, faille et arc ; l'antagoniste ou la force d'opposition est désignée.
- Les personnages secondaires ont une fonction dramatique choisie dans une liste ou libre.
- La carte des relations se met à jour quand un lien est ajouté sur une fiche.

**E4.3 (M)** En tant qu'autrice, je veux choisir un modèle de structure et remplir ses points clés, afin de bâtir mon récit. [STR-01 à STR-04]
- Modèles fournis : trois actes, voyage du héros, 15 beats de Snyder, 8 séquences, libre.
- Un point clé peut être relié à une ou plusieurs scènes.
- Changer de modèle propose de réaffecter les points clés existants, sans perte.
- La répartition réelle des actes est comparée à la répartition théorique.

**E4.4 (M)** En tant qu'autrice, je veux rédiger synopsis, séquencier et traitement reliés entre eux, afin de ne pas réécrire la même chose. [Étape 4, DOC-01, DOC-02]
- Ajouter une séquence au séquencier la crée dans le traitement et dans la vue Tableau.
- Le traitement peut être généré comme squelette à partir du séquencier.
- Chaque document s'exporte seul en PDF et DOCX.

### E5 — Bible du film

**E5.1 (M)** En tant qu'autrice, je veux créer des fiches personnage, lieu, objet, véhicule et événement, afin de documenter mon univers. [BIB-01]
- Chaque type a ses champs spécifiques et les champs communs (image, résumé, contenu riche, étiquettes, statut, historique).
- Une fiche peut être créée, modifiée, dupliquée et archivée.

**E5.2 (M)** En tant qu'autrice d'un univers particulier, je veux créer mes propres types de fiches, afin de décrire ce qui n'existe pas dans les modèles (magie, espèces…). [Types personnalisés]
- L'autrice définit les champs d'un type (texte, nombre, date, liste, image, lien vers une fiche).

**E5.3 (M)** En tant qu'autrice, je veux lier une fiche depuis n'importe quel texte en tapant `@` ou `[[`, afin de naviguer dans mon univers. [BIB-02, RCH-03]
- Une liste de fiches filtrée s'affiche pendant la frappe.
- Survoler un lien affiche un aperçu ; cliquer ouvre la fiche.
- Chaque fiche liste les scènes où elle apparaît, calculées automatiquement.

**E5.4 (S)** En tant qu'autrice, je veux que les personnages et les lieux du scénario soient reconnus, afin de ne pas créer les fiches à la main. [BIB-03]
- Les noms en majuscules et les lieux des en-têtes sans fiche sont proposés, sans création automatique.

**E5.5 (S)** En tant qu'autrice, je veux qu'un renommage de fiche se répercute dans le scénario, afin d'éviter les incohérences. [RG-02]
- Renommer une fiche propose la liste des occurrences à mettre à jour, avec aperçu et possibilité d'annuler.

### E6 — Éditeur de scénario

**E6.1 (M)** En tant qu'autrice, je veux écrire au format professionnel uniquement au clavier, afin de rester concentrée sur l'histoire. [EDT-01, EDT-13]
- Entrée et Tab enchaînent les éléments (en-tête, action, personnage, parenthèse, dialogue, transition) comme dans les logiciels du marché.
- Annuler et rétablir sont illimités dans la session.
- La latence de frappe reste sous 50 ms sur un scénario de 120 pages.

**E6.2 (M)** En tant qu'autrice française, je veux choisir le format français, américain ou un format personnalisé, et en changer à tout moment, afin de répondre à chaque destinataire. [EDT-02]
- Changer de format recalcule la mise en page sans modifier le texte.
- L'export peut utiliser un autre format que celui de travail.
- Un format personnalisé s'enregistre comme modèle.

**E6.3 (M)** En tant qu'autrice, je veux l'autocomplétion des personnages, lieux et moments, afin d'écrire vite et sans faute. [EDT-03]
- Les propositions viennent de la bible et des en-têtes déjà écrits.

**E6.4 (M)** En tant qu'autrice, je veux une pagination réelle et la durée estimée, afin de maîtriser la longueur de mon film. [EDT-04, EDT-05]
- L'affichage en pages correspond page pour page à l'export PDF.
- La durée estimée totale et par scène est affichée ; les scènes sont numérotées automatiquement.

**E6.5 (M)** En tant qu'autrice, je veux une page de titre, des notes de marge et le dialogue double, afin de couvrir les besoins courants. [EDT-06, EDT-07, EDT-08]

**E6.6 (S)** En tant qu'autrice, je veux un mode concentration et un mode premier jet, afin d'écrire sans distraction. [EDT-09, Étape 5]
- Plein écran, thème sombre, ligne courante centrée, compteur de mots de la session.

**E6.7 (S)** En tant qu'autrice de documentaires ou de clips, je veux un script en deux colonnes image / son. [EDT-12]

**E6.8 (S)** En tant qu'autrice, je veux une vérification orthographique hors ligne en français et en anglais. [RET-05]
- Avancée du lot 2 au lot 1 : un outil d'écriture sans correcteur serait mal reçu.

### E7 — Vues du récit

**E7.1 (M)** En tant qu'autrice, je veux naviguer dans mon scénario par actes, séquences et scènes depuis un sommaire, afin de m'y retrouver dans un long texte. [VUE-01, VUE-02]

**E7.2 (M)** En tant qu'autrice, je veux voir mes scènes en cartes rangées par actes et séquences, et les déplacer par glisser-déposer, afin de travailler ma structure. [VUE-03 à VUE-07]
- Déplacer une carte réordonne le scénario, après confirmation, et peut s'annuler.
- Une carte vide créée depuis le tableau apparaît dans le scénario comme un en-tête à compléter.
- Réordonner 200 scènes reste fluide.

**E7.3 (S)** En tant qu'autrice, je veux filtrer et colorer les cartes par personnage, lieu, intrigue ou statut, afin de voir l'équilibre de mon récit. [VUE-08, VUE-09]

**E7.4 (S)** En tant qu'autrice, je veux une frise de mes scènes proportionnelle à leur durée, afin de voir le rythme du film. [VUE-10, VUE-12]
- La v1 couvre l'ordre du récit ; l'ordre chronologique de l'histoire arrive en v2 [VUE-11].

### E8 — Versions et notes

**E8.1 (M)** En tant qu'autrice, je veux figer une version de mon scénario et la comparer à une autre, afin de réécrire sans crainte. [REE-01, REE-02]
- Les versions sont illimitées et nommées (V1, « version producteur »…).
- La comparaison affiche les différences surlignées côte à côte.

**E8.2 (M)** En tant qu'autrice, je veux récupérer une scène que j'ai supprimée, afin de revenir sur un choix. [REE-06, RG-01]

**E8.3 (S)** En tant qu'autrice, je veux l'historique de chaque champ de l'atelier et de la bible, afin de retrouver une ancienne formulation. [ATL-02]

### E9 — Importer et exporter

**E9.1 (M)** En tant qu'autrice qui utilise déjà un autre logiciel, je veux importer mon scénario Final Draft ou Fountain, afin de continuer dans Oniric. [EDT-10, ACC-02]
- L'import crée les scènes, les personnages et les lieux correspondants.
- Un rapport signale les éléments non reconnus.

**E9.2 (M)** En tant qu'autrice, je veux exporter mon scénario en PDF, FDX et Fountain, afin de l'envoyer à qui je veux. [EDT-11]
- L'export DOCX est souhaitable (C) en v1.
- Un PDF de 120 pages est généré en moins de 10 secondes.
- L'export PDF peut porter un filigrane nominatif [SEC-04].
- Un aller-retour FDX → Oniric → FDX conserve au moins 95 % des éléments sur le corpus de test.

**E9.3 (C)** En tant qu'autrice, je veux importer un scénario PDF ou DOCX, afin de reprendre un ancien texte. [EDT-10]

### E10 — Reste du projet

**E10.1 (S)** En tant qu'utilisatrice, je veux voir dès la v1 les parties Réalisation et Production dans la navigation, afin de comprendre où va le logiciel. [Lot 1]
- Les écrans affichent ce qui arrivera et quand, sans fonction inactive qui ressemble à un bogue.

**E10.2 (M)** En tant qu'autrice, je veux chercher dans tout mon projet et naviguer au clavier, afin d'aller vite. [RCH-01, RCH-02, RCH-04]
- La recherche globale couvre scénario, fiches et documents ; la palette de commandes s'ouvre avec Ctrl + K.

**E10.3 (M)** En tant qu'utilisatrice, je veux une interface en français et en anglais, en thème clair ou sombre. [UX-01, UX-02]

**E10.4 (S)** En tant qu'autrice, je veux un tableau de bord qui montre l'avancement de mon écriture. [PRJ-05]

---

## 9. Version 2 « Mettre en scène et préparer »

Objectif : passer de l'écriture à la préparation du tournage. Persona élargie : **Yanis**.

| Épopée | Récit principal | Exigences |
|---|---|---|
| E11 Réécrire et diffuser | En tant qu'autrice, je veux réécrire par passes, saisir les retours de mes lecteurs, garder la trace de mes dépôts et suivre mes envois, afin de mener mon scénario jusqu'aux producteurs. | REE-03 à REE-05, RET-01, RET-02, RET-04, DIF-01 à DIF-04, DEV-01 |
| E12 Verrouiller le scénario | En tant que réalisatrice, je veux verrouiller le scénario et suivre les révisions colorées, afin que l'équipe sache ce qui a changé. | REE-07, DEV-02, RG-03 |
| E13 Moodboards | En tant que réalisateur, je veux des planches d'ambiance libres rattachées aux scènes, personnages et lieux, afin de partager ma vision. | MOO-01 à MOO-06 |
| E14 Découpage et storyboard | En tant que réalisateur, je veux découper chaque scène en plans et les illustrer, en important des images ou en dessinant, afin de préparer le tournage. | DEC-01 à DEC-04, DEC-06 à DEC-08, STB-01 à STB-04, STB-06, STB-07 |
| E15 Équipe | En tant que réalisateur, je veux composer mon équipe à partir de mon carnet de contacts et des 15 départements, et lier comédiens et personnages. | EQU-01 à EQU-05, EQU-07, EQU-08 |
| E16 Dépouillement | En tant que réalisateur, je veux dépouiller chaque scène en m'appuyant sur la bible, afin de savoir ce dont j'ai besoin sans ressaisie. | DEP-01 à DEP-07 |
| E17 Plan de travail | En tant que réalisateur, je veux organiser mes scènes en journées de tournage et voir les conflits, afin de bâtir un planning réaliste. | PDT-01 à PDT-07 |
| E18 Feuilles de service | En tant que réalisateur, je veux générer la feuille de service du jour à partir du planning et l'exporter en un PDF par personne, afin de convoquer mon équipe. | FDS-01 à FDS-07 |
| E19 Univers étendu | En tant qu'autrice, je veux l'ordre chronologique de l'histoire, des cartes de mon monde et des arbres généalogiques. | VUE-11, VUE-13, BIB-04 à BIB-08 |
| E20 Confidentialité | En tant qu'autrice, je veux chiffrer un projet par mot de passe. | USR-03, SEC-02 |

**Récit clé de la v2** (parcours à réussir en test) : à partir d'un scénario écrit, dépouiller trois scènes, les placer sur deux journées de tournage et exporter les feuilles de service individuelles, **sans ressaisir un seul nom de personnage ou de lieu**.

---

## 10. Version 3 « Produire »

Objectif : piloter la production complète. Persona élargie : **Sofia**.

| Épopée | Récit principal | Exigences |
|---|---|---|
| E21 Budget | En tant que productrice, je veux un budget (devis type CNC ou international) relié à l'équipe et au planning, le suivi des dépenses et un plan de financement, afin de ne jamais être surprise par un dépassement. | BUD-01 à BUD-09 |
| E22 Repérages et carte | En tant que productrice, je veux placer mes décors sur une carte, comparer les pistes, calculer les trajets et garder les zones hors ligne pour le jour du tournage. | REP-01 à REP-07 |
| E23 Autorisations | En tant que productrice, je veux suivre mes demandes d'autorisation avec rappels, générer les courriers et contrats, et être alertée si une journée tombe dans un décor non autorisé. | AUT-01 à AUT-06 |
| E24 Suivi du tournage | En tant que productrice, je veux un rapport de fin de journée. | FDS-08 |
| E25 Casting | En tant que productrice, je veux suivre rôles à pourvoir, candidats et auditions. | EQU-06 |
| E26 Séries | En tant qu'autrice, je veux gérer saisons et épisodes avec une bible partagée. | PRJ-03 |
| E27 Compléments | Animatique, plan au sol, import des annotations PDF des lecteurs (souhaitables). | STB-05, DEC-05, RET-03 |

**Exigence propre à la carte** : la carte est la **seule fonction connectée** ; elle doit pouvoir être désactivée, afficher un indicateur quand elle se connecte, et rester utile sans réseau grâce aux zones hors ligne [REP-04b à REP-04f, SEC-01].

---

## 11. Expérience utilisateur

### 11.1 Parcours critiques

Ces parcours sont maquettés avant développement, puis rejoués à chaque version lors de la recette (voir 13) :

| # | Parcours | Version | Mesure de réussite |
|---|---|---|---|
| P1 | Installer, créer un projet, écrire une scène, exporter un PDF | v0.1 | < 10 min sur une installation neuve |
| P2 | De l'idée à la structure : prémisse, personnages, trois actes, séquencier | v0.5 | Les séquences apparaissent dans le tableau sans ressaisie |
| P3 | Réorganiser le récit en déplaçant des cartes dans le tableau | v0.5 | Le scénario suit, l'annulation fonctionne |
| P4 | Importer un FDX, réécrire, figer une version, comparer | v1.0 | Aucune perte de mise en forme visible |
| P5 | Survivre à un plantage | v0.1 | Travail retrouvé à la réouverture |
| P6 | Du scénario à la feuille de service | v2.0 | Aucun nom ressaisi |
| P7 | Préparer un décor : carte, trajet, zone hors ligne, autorisation | v3.0 | Décor consultable sans réseau |

### 11.2 Lignes directrices

- **Une chose à la fois** : chaque écran a une action principale évidente ; les options avancées sont repliées.
- **L'écriture d'abord** : l'éditeur occupe tout l'espace disponible ; les panneaux s'escamotent.
- **Raccourcis clavier** pour toutes les actions fréquentes, documentés et personnalisables [EDT-13].
- **Vocabulaire du métier** expliqué par une aide contextuelle, jamais imposé [ATL-03].
- **Accessibilité** : navigation complète au clavier, contrastes suffisants, lecteurs d'écran ; WCAG 2.1 AA visé [UX-04].
- **États vides utiles** : chaque écran vide explique à quoi il sert et propose une première action.

---

## 12. Exigences de qualité

Résumé des exigences du cahier des charges (section 10) qui conditionnent la réussite du produit :

| Domaine | Exigence | Référence |
|---|---|---|
| Fiabilité | Écritures atomiques, vérification d'intégrité, format ouvert lisible sans Oniric | FIA-01 à FIA-05 |
| Performance | Démarrage < 3 s, ouverture d'un projet de 120 pages < 2 s, frappe < 50 ms, PDF de 120 pages < 10 s | 10.1 |
| Confidentialité | Aucune connexion hors carte, aucune télémétrie, chiffrement facultatif | SEC-01, SEC-02 |
| Sécurité | Fichiers importés jamais exécutés, installateurs signés | SEC-05, SEC-06 |
| Compatibilité | Windows 10 et 11 64 bits ; projets anciens toujours lisibles | CPT-01, FIA-04 |
| Données personnelles | Export et effacement d'un contact | RGP-01, RGP-02 |

---

## 13. Critères de sortie des versions

Une version n'est publiée que si **tous** ses critères sont remplis.

**Méthode de recette.** L'auteur est le seul testeur avant la bêta publique. Pour limiter le biais de celui qui connaît déjà le logiciel :

- les parcours critiques sont rejoués avec une **liste de contrôle écrite**, sur une **installation neuve** de Windows 10 et de Windows 11 (machines virtuelles) ;
- l'auteur **utilise Oniric pour un vrai projet** de film, du début à la fin de chaque version ;
- les tests automatisés couvrent les parcours critiques [10.7] et tournent à chaque modification (GitHub Actions) ;
- à partir de la v0.5, la bêta est publique sur GitHub, avec des modèles de tickets pour les bogues et les suggestions.

### v0.1 alpha

- Parcours P1 et P5 réussis en recette.
- Test automatisé de coupure : aucune corruption sur 1 000 essais.
- Export PDF conforme aux formats français et américain, vérifié sur 5 scénarios de référence.

### v1.0 « Écrire »

- Tous les récits **M** de la section 8 livrés et validés par leurs critères d'acceptation.
- Parcours P1 à P5 réussis en recette.
- Au moins un **court métrage complet** écrit dans Oniric par l'auteur, de l'idée au PDF.
- Aucun ticket GitHub bloquant ouvert issu de la bêta.
- Indicateurs de performance atteints sur la machine de référence (4 cœurs, 8 Go, SSD).
- Banc d'import / export : ≥ 95 % de fidélité sur le corpus de 50 scénarios.
- Aucun défaut connu pouvant causer une perte de données.
- Interface et aide complètes en français et en anglais.
- Documentation du format de projet publiée [FIA-03].
- Installateur signé et version portable publiés, avec empreintes.

### v2.0 et v3.0

- Tous les récits **M** de la version livrés.
- Récit clé de la version réussi en recette (section 9 pour la v2 ; parcours P7 pour la v3).
- Un projet créé en v1.0 s'ouvre sans perte dans la nouvelle version [FIA-04].

---

## 14. Hypothèses, risques et parades

### 14.1 Hypothèses à vérifier

Avant la bêta publique, l'auteur est le seul utilisateur : ces hypothèses ne seront vraiment éprouvées qu'après la publication sur GitHub.

| # | Hypothèse | Comment la vérifier |
|---|---|---|
| H1 | Les auteurs veulent être guidés étape par étape, pas seulement disposer d'un éditeur | Usage personnel sur un vrai projet ; retours GitHub après la bêta |
| H2 | Un outil sans collaboration convient à la cible | Part des demandes de collaboration dans les tickets GitHub |
| H3 | Le format français est un vrai motif de choix | Tickets et discussions GitHub |
| H4 | La bible est utilisée au-delà des personnages | Usage personnel ; retours GitHub |

### 14.2 Risques

| Risque | Probabilité | Impact | Parade |
|---|---|---|---|
| **Périmètre trop large** pour un développeur seul | Élevée | Élevé | Versions strictement découpées ; la v1 se limite à l'écriture ; tout ajout passe par ce PRD ; sans échéance, aucun raccourci sur la qualité |
| **Disponibilité** du développeur seul (fatigue, interruption) | Moyenne | Élevé | Chaque version est utilisable seule ; code, format de projet et décisions documentés pour qu'une autre personne puisse reprendre le projet |
| **Biais de l'auteur** : le seul testeur connaît déjà le logiciel | Élevée | Moyen | Recette avec liste de contrôle sur installation neuve, projet d'exemple, bêta publique dès la v0.5 |
| **Pagination du scénario** difficile à rendre identique à l'écran et en PDF | Moyenne | Élevé | Moteur de mise en page unique pour l'écran et le PDF ; prototype dès la v0.1 |
| **Fidélité des imports** FDX, PDF, Celtx | Élevée | Moyen | Banc de test sur corpus ; FDX et Fountain d'abord, PDF et DOCX ensuite (souhaitable en v1) |
| **Perte de données** | Faible | Critique | SQLite transactionnel, tests de coupure automatisés, sauvegardes sur un autre disque par défaut |
| **Services cartographiques gratuits** qui changent leurs conditions ou ferment | Moyenne | Moyen | Adresses configurables, zones hors ligne, carte utile même sans fond [REP-04b] |
| **Avertissements Windows** (SmartScreen) sur un installateur non signé | Élevée | Moyen | Signature de code ; programmes de signature gratuits pour les logiciels libres à étudier |
| **Dessin au stylet et canevas** (v2) coûteux à développer | Moyenne | Moyen | Bibliothèque existante (tldraw, Konva) ; dessin simple d'abord |
| **Contributions extérieures rares** | Élevée | Faible | Le projet n'en dépend pas ; elles restent possibles grâce au dépôt public (code, traductions [UX-01]) |

---

## 15. Questions ouvertes

### 15.1 Décisions prises

| Sujet | Décision |
|---|---|
| Équipe | **Une seule personne** développe Oniric |
| Calendrier | **Aucune échéance** : une version sort quand ses critères sont remplis |
| Tests | **Recette par l'auteur** (voir 13), puis bêta publique |
| Hébergement | **GitHub** : code source, tickets, discussions, publications des installateurs, intégration continue |
| Équipe de tournage | Gérée dans le projet, **sans interaction** de ses membres avec Oniric |

### 15.2 Questions restantes

Aucune.

---

## 16. Annexe : traçabilité

| Épopée | Version | Sections du cahier des charges |
|---|---|---|
| E1 Installer et démarrer | v1 | 2, 8.5, 10.6 |
| E2 Gérer ses projets | v1 | 4.1, 4.2 |
| E3 Ne jamais perdre son travail | v1 | 4.3, 10.2 |
| E4 Atelier d'écriture | v1 | 5.1 (étapes 1 à 4) |
| E5 Bible | v1 | 5.2, 9.2 |
| E6 Éditeur de scénario | v1 | 5.3, 5.1 (étape 5) |
| E7 Vues du récit | v1 | 5.4 |
| E8 Versions et notes | v1 | 5.1 (étape 6), 9.2 |
| E9 Importer et exporter | v1 | 5.3, 8.3 |
| E10 Reste du projet | v1 | 4.2, 8.2, 8.5 |
| E11 à E20 | v2 | 5.1 (étapes 6 à 9), 5.2, 5.4, 6, 7.1 à 7.4, 10.3 |
| E21 à E27 | v3 | 4.2, 6, 7.1, 7.4 à 7.7 |
