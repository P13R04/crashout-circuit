# Audit avant les tests utilisateur — 1er novembre 2026

Référence initiale : branche `feat/audio-ferraille`, commit `3df99d4`, plus les modifications locales de tutoriel, de création et de cette passe. Ensemble regroupé sur `feat/preparation-tests-utilisateurs`. Lecture des 32 issues (ouvertes et fermées), de leurs deux commentaires, des branches locales et distantes après `git fetch --all --prune`. Ce document décrit le code ; il ne remplace pas une session sur la dalle.

## Résultat de l’intégration

Les **24 branches distantes et 10 branches locales** pointent toutes vers un ancêtre de HEAD (ou HEAD). Aucune branche n’apporte un commit absent : aucune nouvelle fusion n’était nécessaire. Les adaptations récentes des travaux de Baptiste (#30/#31, dessin, objets qui suivent la piste), des postes (#41), de la console (#34) et du tutoriel (#32) sont présentes. L’inversion des copilotes n’a pas été répétée.

Un ancien cahier des charges n’a pas été réappliqué lorsqu’il contredisait les règles validées : pas de fantôme/détruire, pas de possession/recharge des tangibles, pas de contrôle des bonus ou de départ par l’opérateur. Les modes clavier et voitures autonomes sont conservés derrière une option serveur, désactivée par défaut.

## Revue des issues

Le statut GitHub est conservé tel quel ; aucune issue n’a été fermée automatiquement. Une issue ouverte peut déjà être implémentée. Les contrôles physiques et les séances restent explicitement à faire.

| Issue | État GitHub | Bilan | Vérification et emplacement |
|---|---|---|---|
| [#2 — Contrôles : valider et améliorer le schéma pilote (avance auto, gauche/droite, objet)](https://github.com/P13R04/crashout-circuit/issues/2) | Fermée | Implémenté ; confort à valider | Commandes sémantiques, gauche/droite et réparation, conduite réglable. Le bouton objet du pilote a été remplacé par POWER copilote.<br>Code : client-shared/controls.ts · server/layout.ts · client-table/GestureRecognizer.ts |
| [#3 — Circuit : le circuit prédéfini remplace le dessin des joueurs et plusieurs refus sont silencieux](https://github.com/P13R04/crashout-circuit/issues/3) | Fermée | Implémenté | Le circuit suit les deux tracés ; validation et messages de refus. Les croisements sont conservés.<br>Code : server/MapGenerator.ts · server/GameRules.ts |
| [#4 — Lance-pierre : remplacer la frappe instantanée (ogive) par un vrai tir à l'élastique](https://github.com/P13R04/crashout-circuit/issues/4) | Fermée | Implémenté | Fourche à deux doigts puis poche tirée/relâchée ; vraie pierre, dégâts sur les deux couleurs. Le commentaire demandant le troisième doigt mobile est pris en compte.<br>Code : client-table/GestureRecognizer.ts · server/PhysicsLoop.ts · server/slingshot.ts |
| [#5 — Thème Magicien d'Oz : murs](https://github.com/P13R04/crashout-circuit/issues/5) | Fermée | Implémenté selon les règles actuelles | Mur neutre avec épaisseur et dimensions LEGO ; les anciens murs par équipe et la largeur de 8 px sont remplacés intentionnellement.<br>Code : server/tangibles.ts · server/GameRules.ts · server/geometry.ts |
| [#6 — Thème Magicien d'Oz : arc électrique](https://github.com/P13R04/crashout-circuit/issues/6) | Fermée | Implémenté selon les règles actuelles | Deux piliers neutres, champs au sol et arc jusqu’à 350 px ; les anciennes règles alliées/500 px ne sont pas réintroduites.<br>Code : server/GameRules.ts · server/PhysicsLoop.ts · client-table/NeonObjects.ts |
| [#7 — Thème Magicien d'Oz : autres éléments (console Oz, obstacle, boost, pierres)](https://github.com/P13R04/crashout-circuit/issues/7) | Fermée | Implémenté selon les règles actuelles | La console gère seulement les tangibles. Départ et bonus appartiennent aux joueurs ; accès direct à la console par son URL, sans code.<br>Code : client-oz/ · server/GameServer.ts |
| [#8 — Objets : positions des pickups aléatoires](https://github.com/P13R04/crashout-circuit/issues/8) | Ouverte | Complété dans cette passe | Quatre positions tirées à chaque circuit humain, sur la piste et espacées du départ/entre elles. RNG injectable ; 160 circuits de test. Réapparition au même endroit pendant une course.<br>Code : server/MapGenerator.ts · scripts/pickups.ts |
| [#9 — Élargissement : effet temporaire et non cumulable sur une zone déjà élargie](https://github.com/P13R04/crashout-circuit/issues/9) | Fermée | Implémenté | Déplacement local à deux doigts, largeur constante, borné, temporaire et non cumulatif ; prise dans les virages.<br>Code : client-table/GestureRecognizer.ts · server/GameRules.ts |
| [#10 — Sortie de course : valider la chute sans rebond et améliorer son retour](https://github.com/P13R04/crashout-circuit/issues/10) | Fermée | Implémenté ; matériel à valider | Chute sans rebond artificiel, voiture cachée puis réparation coopérative et feux de reprise.<br>Code : server/PhysicsLoop.ts · server/GameRules.ts · client-table/NeonVehicles.ts |
| [#12 — Rajout d'un bouton de reset](https://github.com/P13R04/crashout-circuit/issues/12) | Fermée | Implémenté | Retour à l’accueil dans les paramètres ; nettoie états, contacts et tutoriel.<br>Code : client-table/main.ts · server/GameRules.ts |
| [#18 — Circuit : Elargir la course](https://github.com/P13R04/crashout-circuit/issues/18) | Fermée | Implémenté | Espace de dessin étendu et postes compacts ; empreintes des contrôles exclues.<br>Code : server/layout.ts · server/MapGenerator.ts |
| [#19 — le bouton d'activation des objets doit se trouver dans la partie co pilote](https://github.com/P13R04/crashout-circuit/issues/19) | Fermée | Implémenté | Seul le copilote propriétaire arme le stock via POWER ; les gestes peuvent être volés.<br>Code : server/GameRules.ts · client-table/HUD.ts |
| [#20 — Amélioration creation circuit](https://github.com/P13R04/crashout-circuit/issues/20) | Ouverte | Implémenté avec adaptation conservée | Placement P1/P2 puis deux tracés successifs, prévisualisation, révélation et roulette. Dessin dans les deux sens conservé pour chaque joueur plutôt que réimposer P1→P2.<br>Code : server/GameRules.ts · server/MapGenerator.ts · client-table/TrackCreation.ts |
| [#23 — Réduire la taille des zones de direction et de la pédale](https://github.com/P13R04/crashout-circuit/issues/23) | Ouverte | Implémenté ; confort à valider | Postes réduits, pilote auto sans pédale dessinée, réparation et santé regroupées. La validation physique des mains reste à faire.<br>Code : server/layout.ts · client-table/HUD.ts |
| [#24 — Bouton de type de conduite avant et pendant la course](https://github.com/P13R04/crashout-circuit/issues/24) | Fermée | Implémenté | Réglage séparé par équipe avant et pendant la course, désormais aussi à l’accueil. Le commentaire confirme le travail fait dans #41.<br>Code : server/GameRules.ts · client-table/main.ts |
| [#25 — Revoir l'interface : textes, inversion pilote/copilote, bouton fantôme](https://github.com/P13R04/crashout-circuit/issues/25) | Fermée | Implémenté selon les règles actuelles | Coéquipiers en diagonale ; pas de double inversion. Les anciens contrôles fantôme/détruire ont été retirés à la demande.<br>Code : server/layout.ts · client-table/HUD.ts |
| [#26 — Clarté : supprimer les textes superflus au profit d'icônes et d'animations](https://github.com/P13R04/crashout-circuit/issues/26) | Ouverte | Implémenté ; retours utilisateurs attendus | Icônes, consignes courtes orientées, animations ; aucun état de préparation opérateur montré. Menu public limité à Tutoriel/Course.<br>Code : client-table/Renderer.ts · client-table/TutorialOverlay.ts · client-table/index.html |
| [#27 — Animation de prise de pickup](https://github.com/P13R04/crashout-circuit/issues/27) | Ouverte | Complété dans cette passe | Apparition douce et réapparition des ramassables ; retour de prise avec le vrai pictogramme, sans masquer le HUD.<br>Code : client-table/NeonObjects.ts · client-table/NeonEffects.ts |
| [#28 — Animation de l'objet ramassé vers son emplacement](https://github.com/P13R04/crashout-circuit/issues/28) | Ouverte | Complété dans cette passe | Le pictogramme rejoint le bon emplacement copilote avec son orientation ; armement et consommation ont leur retour visuel.<br>Code : server/types.ts · server/GameRules.ts · server/layout.ts · client-table/NeonEffects.ts |
| [#29 — Animation de déplacement de la voiture](https://github.com/P13R04/crashout-circuit/issues/29) | Ouverte | Implémenté | Traînées bornées, réacteur, vitesse, impacts et disparition lors de chute ; respect de la réduction des animations.<br>Code : client-table/NeonVehicles.ts · client-table/VisualMotion.ts · client-table/NeonEffects.ts |
| [#30 — Zone de boost : améliorer la mécanique et l'animation](https://github.com/P13R04/crashout-circuit/issues/30) | Fermée | Intégré et adapté | Corridor d’accélération aligné sur le sens de la piste, placement et effet animés dans les cinq thèmes.<br>Code : server/GameRules.ts · client-table/NeonObjects.ts · scripts/boost.ts |
| [#31 — Animation du tangible (pose d'un poteau / mur / arc)](https://github.com/P13R04/crashout-circuit/issues/31) | Fermée | Intégré et adapté | Pose mur/piliers animée, arcs et champs conservés dans notre rendu récent.<br>Code : client-table/NeonObjects.ts · client-table/NeonEffects.ts |
| [#32 — Tutoriel guidé pour montrer et tester le plus d'interactions possibles](https://github.com/P13R04/crashout-circuit/issues/32) | Ouverte | Implémenté ; séance réelle à observer | Parcours à quatre, identification des postes, démos, gestes réels, réparation, manipulation des trois tangibles, rangement et passage à une course normale.<br>Code : server/Tutorial.ts · client-table/TutorialOverlay.ts · client-table/TutorialGestures.ts |
| [#33 — Fabriquer les faux tangibles en bois (mur et pilier)](https://github.com/P13R04/crashout-circuit/issues/33) | Fermée | Remplacé par le choix matériel actuel | La fabrication bois a été remplacée par les tangibles LEGO. Le code est calibré sur les bases 10×4 et 4×4, à comparer à la dalle 55 pouces.<br>Code : server/config.ts · config.json · docs/pose-tactile.md |
| [#34 — Trancher le sens du « thème Magicien d'Oz » (comportement ou habillage)](https://github.com/P13R04/crashout-circuit/issues/34) | Ouverte | Tranché et implémenté | Magicien d’Oz désigne la technique de simulation des capteurs, pas un habillage de conte. Console limitée aux objets neutres, accessible directement par son URL.<br>Code : client-oz/ |
| [#35 — Polish visuel : revoir le style néon](https://github.com/P13R04/crashout-circuit/issues/35) | Ouverte | Implémenté | Cinq ambiances complètes, caches de décors, éclairages, finitions de gradins et circuits ; Ferraille par défaut.<br>Code : client-table/themes.ts · client-table/ThemeWorld.ts · client-table/StandSections.ts |
| [#36 — Sons : retours sonores du jeu](https://github.com/P13R04/crashout-circuit/issues/36) | Ouverte | Implémenté | Retours simples Web Audio, échantillons CC0 pour les bruits complexes, ambiance et musique ; réglages séparés et arrêt à la pause.<br>Code : client-table/Sound.ts · client-table/AudioPlan.ts · docs/audio.md |
| [#37 — Vérification automatique avant fusion (npm run check + CI)](https://github.com/P13R04/crashout-circuit/issues/37) | Ouverte | Implémenté | Vérification locale et CI GitHub ; tests supplémentaires d’accès opérateur et de placements aléatoires inclus.<br>Code : package.json · .github/workflows/check.yml |
| [#38 — Tester et régler les seuils tactiles du lance-pierre sur la vraie table](https://github.com/P13R04/crashout-circuit/issues/38) | Ouverte | Validation matérielle restante | Tolérances temporelles et virages renforcés, tests et protocole présents. Le taux de réussite 9/10 sur la vraie table ne peut pas être certifié ici.<br>Code : client-table/GestureRecognizer.ts · docs/seuils-tactiles.md · measures.md |
| [#39 — Équilibrage du lance-pierre (dégâts et fréquence)](https://github.com/P13R04/crashout-circuit/issues/39) | Ouverte | Réglages intégrés ; équilibre à mesurer | Pierre : 50 points et 1,5 seconde d’étourdissement ; simulation conservée. L’équilibre en partie nécessite les joueurs.<br>Code : server/config.ts · scripts/sling-balance.ts · measures.md |
| [#40 — Sessions de test avec des personnes extérieures](https://github.com/P13R04/crashout-circuit/issues/40) | Ouverte | Préparation faite ; sessions restantes | Protocole mis à jour pour le 2 novembre ; journal téléchargeable depuis la console mobile. Les deux sessions extérieures n’ont pas encore eu lieu.<br>Code : docs/sessions-de-test.md · client-oz/main.ts |
| [#41 — Changer l'emplacement des postes de pilotage](https://github.com/P13R04/crashout-circuit/issues/41) | Ouverte | Implémenté une seule fois | Pilote cyan bas-gauche/copilote haut-droite, pilote rose haut-gauche/copilote bas-droite. Contrôles et attribution des gestes utilisent les mêmes positions.<br>Code : server/layout.ts · scripts/acceptance.ts |

## Branches contrôlées

« Intégrée » signifie que `git merge-base --is-ancestor <branche> HEAD` réussit ; la présence fonctionnelle est revue dans le tableau précédent. Les alias symboliques `origin/HEAD` ne sont pas comptés comme une branche.

| Branche | Commit | Résultat |
|---|---|---|
| `9-élargissement-effet-temporaire-et-non-cumulable-sur-une-zone-déjà-élargie` | `c3e7c38` | Intégrée |
| `feat/26-35-style-visuel-lisibilite` | `f954b54` | Intégrée |
| `feat/audio-ferraille` | `3df99d4` | Intégrée |
| `feat/integration-finale-table` | `5aa32e0` | Intégrée |
| `feat/integration-tangibles-lego` | `3e4e2ad` | Intégrée |
| `feat/pose-tactile-tangibles` | `1edbce8` | Intégrée |
| `feat/test-tangibles-pilotes-auto` | `9e07658` | Intégrée |
| `main` | `d351dcd` | Intégrée |
| `prototype-pierre` | `fe16dd7` | Intégrée |
| `v1-console-oz` | `5acc26f` | Intégrée |
| `origin/10-sortie-de-course-valider-la-chute-sans-rebond-et-améliorer-son-retour` | `e4d59ca` | Intégrée |
| `origin/12-rajout-dun-bouton-de-reset` | `b0b75db` | Intégrée |
| `origin/3-circuit-le-circuit-prédéfini-remplace-le-dessin-des-joueurs-et-plusieurs-refus-sont-silencieux` | `950ba62` | Intégrée |
| `origin/30-zone-de-boost-améliorer-la-mécanique-et-lanimation` | `48f67b0` | Intégrée |
| `origin/31-animation-du-tangible-pose-dun-poteau-mur-arc` | `6820320` | Intégrée |
| `origin/32-tutoriel-guidé-pour-montrer-et-tester-le-plus-dinteractions-possibles` | `d351dcd` | Intégrée |
| `origin/34-trancher-le-sens-du-thème-magicien-doz-comportement-ou-habillage` | `bf38fe8` | Intégrée |
| `origin/37-verification-automatique-avant-fusion-npm-run-check-ci` | `37a2d70` | Intégrée |
| `origin/38-tester-et-regler-les-seuils-tactiles-du-lance-pierre-sur-la-vraie-table` | `9a6347d` | Intégrée |
| `origin/39-equilibrage-du-lance-pierre-degats-et-frequence` | `0bc0cf1` | Intégrée |
| `origin/4-lance-pierre-remplacer-la-frappe-instantanée-ogive-par-un-vrai-tir-à-lélastique` | `949e481` | Intégrée |
| `origin/40-sessions-de-test-avec-des-personnes-exterieures` | `052c7e2` | Intégrée |
| `origin/41-changer-lemplacement-des-postes-de-pilotage` | `020778a` | Intégrée |
| `origin/9-élargissement-effet-temporaire-et-non-cumulable-sur-une-zone-déjà-élargie` | `c3e7c38` | Intégrée |
| `origin/Contrôles` | `fc50fc5` | Intégrée |
| `origin/Issue-20,-amélioration-circuit` | `b64db25` | Intégrée |
| `origin/baptiste` | `0e8ed91` | Intégrée |
| `origin/feat/26-35-style-visuel-lisibilite` | `f954b54` | Intégrée |
| `origin/feat/integration-finale-table` | `5aa32e0` | Intégrée |
| `origin/feat/integration-tangibles-lego` | `3e4e2ad` | Intégrée |
| `origin/feat/test-tangibles-pilotes-auto` | `9e07658` | Intégrée |
| `origin/main` | `d351dcd` | Intégrée |
| `origin/prototype-pierre` | `fe16dd7` | Intégrée |
| `origin/v1-console-oz` | `5acc26f` | Intégrée |

## Durcissement du parcours de séance

- Le lancement normal ne propose que Tutoriel et Course ; Ferraille est imposé pour la séance, le choix du thème et de la conduite est masqué ; les noms des cinq thèmes et difficultés sont français. Les cinq thèmes et leurs préférences restent conservés pour les outils de développement.
- Les commandes de test sont refusées par le serveur sans `CRASHOUT_DEV_TOOLS=1`. Les anciens paramètres d’URL ne les réactivent pas. Les commandes de conduite normales restent disponibles.
- À la demande de l’équipe, l’accès par code ajouté lors de cette passe a été retiré : la console et son journal sont de nouveau accessibles directement par leur URL. Aucun outil opérateur n’est proposé dans l’interface des joueurs.
- Console utilisable sans clavier : sélection, annulation, retrait, activation/désactivation, rotation, journal, changement de vue. Les petits mouvements involontaires du doigt ne déplacent plus un mur lors de sa sélection.
- En portrait et paysage, les outils longs défilent dans leur panneau, la carte garde son espace. La rotation automatique du portrait et le bouton ↻ partagent les transformations de coordonnées déjà testées.

## Vérifications et limites

**Vérifications réussies :** `npm run verify`, puis les contrôles ciblés après les dernières finitions (100 scénarios d’acceptation, 41 contrôles de rendu, types et compilation des clients). Aperçus de console contrôlés en 390×640 et 844×390 avec les outils dépliés ; le paysage utilise une colonne latérale pour préserver la carte.

`npm run verify` contrôle les règles, les gestes, le réseau, les invariants de rendu, les tangibles, la conduite autonome, les paramètres, les sons, la présentation du circuit, la séparation des accès et les positions aléatoires, puis compile le serveur et les clients. Le test réseau ouvre les deux clients sans code, vérifie le circuit du tutoriel, une reconnexion et la pose/activation/retrait des trois tangibles. Les tests de géométrie de la console incluent les quatre rotations et des formats de téléphone.

Avant l’accueil : parcourir le tutoriel avec les quatre mains aux postes, vérifier les contacts avec la prise LEGO et le volume sur la dalle, puis terminer une course. Les essais logiciels et l’aperçu responsive ne certifient ni Safari sur un appareil physique, ni la latence du Wi-Fi, ni le taux de réussite tactile demandé par #38. Voir [le protocole de séance](sessions-de-test.md).
