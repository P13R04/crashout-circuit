# Requirements — Crashout Circuit

## Overview

Crashout Circuit est un jeu de course multijoueur conçu pour une table tactile 65" (iiyama ProLite TF6538UHSC-B2AG) posée à plat. Deux équipes de deux joueurs (1 Pilote + 1 Copilote) courent sur un circuit généré collaborativement, en combinant gestes multitouch, pilotage smartphone et objets tangibles simulés par un Magicien d'Oz. L'application est une WebApp HTML/JS avec un serveur Node.js autoritaire.

Le prototype existant (`prototypes/piste-vivante`) contient des scènes de démonstration Canvas 2D illustrant les interactions clés (tracé, boost, lance-pierre, fantôme, respawn) — il sert de référence visuelle mais n'implémente pas encore la logique de jeu complète.

---

## Requirements

### 1. Structure générale et architecture

#### 1.1 Application web multi-clients
- **REQ-1.1.1** Le système doit comprendre quatre clients distincts : la table tactile (navigateur plein écran), deux applications Pilote (smartphone via QR code), et la console Magicien d'Oz (tablette).
- **REQ-1.1.2** Un serveur Node.js doit être la source d'autorité unique pour la physique, les règles de jeu et l'état partagé.
- **REQ-1.1.3** Toutes les communications entre clients et serveur doivent utiliser WebSocket avec des messages JSON portant un champ `type` et un horodatage `t` en millisecondes.
- **REQ-1.1.4** Le repère de jeu logique doit être 1920×1080, mis à l'échelle ×2 pour l'affichage 4K de la table.

#### 1.2 Phases de session
- **REQ-1.2.1** Une session doit suivre les phases ordonnées : `LOBBY` → `MAP` → `RACE` → `RESULT`.
- **REQ-1.2.2** La phase `LOBBY` doit permettre aux Pilotes de scanner un QR code et de rejoindre la partie sans installation.
- **REQ-1.2.3** La phase `MAP` doit permettre aux deux Copilotes de dessiner simultanément leur demi-tracé pour générer le circuit (durée ≈ 30 s).
- **REQ-1.2.4** La phase `RACE` doit durer jusqu'à ce qu'une équipe complète 3 tours ou que 5 minutes s'écoulent.
- **REQ-1.2.5** La phase `RESULT` doit afficher le classement et permettre de lancer une nouvelle partie.

---

### 2. Génération de la carte (phase MAP)

#### 2.1 Tracé collaboratif
- **REQ-2.1.1** Deux points imposés doivent être affichés à chaque Copilote dans sa moitié de table (Copilote A : quart haut-gauche et quart bas-droit ; Copilote B : quart haut-droit et quart bas-gauche), avec un jitter aléatoire de ±150 px et une distance minimale de 400 px entre les deux points d'un même joueur.
- **REQ-2.1.2** Chaque Copilote doit pouvoir tracer un chemin au doigt entre ses deux points imposés. Le tracé est valide s'il touche les deux points (rayon de tolérance 60 px) et mesure au moins 300 px.
- **REQ-2.1.3** Le tracé doit être rééchantillonné à pas constant et filtré (filtre 1€) pour éliminer le jitter.

#### 2.2 Génération automatique du circuit
- **REQ-2.2.1** Chaque tracé doit être complété automatiquement en boucle fermée en forme de haricot : le retour est le miroir du tracé par rapport à la droite entre les deux points, à l'échelle κ ∈ [0,6 ; 1,0] tiré aléatoirement.
- **REQ-2.2.2** Les deux boucles doivent être fusionnées en un seul circuit : rééchantillonnage à N=256 points, recherche du décalage d'indice minimisant la distance totale, puis moyennage `C(i) = 0.5·A(i) + 0.5·B(i)`.
- **REQ-2.2.3** Le circuit final doit être lissé par une spline Catmull-Rom centripète.
- **REQ-2.2.4** La largeur de piste doit être de 140 px de base, variable en fonction de la courbure (±30 px), avec un minimum de 90 px.
- **REQ-2.2.5** Le circuit doit comporter 8 checkpoints répartis, une ligne de départ sur la portion la plus rectiligne, deux positions de départ côte à côte (±20 px de décalage latéral), et 4 emplacements de pickups.

#### 2.3 Validations et repli
- **REQ-2.3.1** Le circuit doit être validé : rayon de courbure minimal, largeur supérieure au gabarit véhicule (24×14 px), pas d'auto-intersection, pas de passage impossible, zone rectiligne pour le départ.
- **REQ-2.3.2** En cas d'échec de validation, le système doit réessayer avec les poids 0,4/0,6, puis utiliser la boucle A seule. La génération complète doit prendre moins de 3 secondes.
- **REQ-2.3.3** L'opérateur Magicien d'Oz doit pouvoir forcer un circuit de secours prédéfini.

---

### 3. Pilote et véhicule

#### 3.1 Contrôles smartphone
- **REQ-3.1.1** L'application Pilote doit être accessible via QR code sur la table, sans installation, dans un navigateur mobile.
- **REQ-3.1.2** L'application doit exposer : une pédale (curseur vertical, rappel à 0, `throttle ∈ [-1, 1]`), un joystick (curseur horizontal, rappel à 0, `steer ∈ [-1, 1]`), et un bouton d'objet (`UseItem`).
- **REQ-3.1.3** La latence entre l'entrée smartphone et le rendu sur la table doit être inférieure à 80 ms.

#### 3.2 Physique du véhicule
- **REQ-3.2.1** Le véhicule doit respecter les paramètres configurables : vitesse max avant 420 px/s, vitesse max arrière 140 px/s, accélération 600 px/s², vitesse de rotation max 2,5 rad/s, gabarit 24×14 px.
- **REQ-3.2.2** Une collision avec un bord de piste doit provoquer un rebond avec vitesse ×0,6, sans dégâts.
- **REQ-3.2.3** La boucle physique doit tourner à 60 Hz ; l'état doit être diffusé à 30 Hz.

#### 3.3 Points de vie (HP)
- **REQ-3.3.1** Chaque véhicule a 100 HP maximum. Il ne perd des HP qu'à cause des éléments posés ou lancés par l'équipe adverse.
- **REQ-3.3.2** Les dégâts par source : mur (poteau) −10 HP + 1 s d'invulnérabilité + rebond ; arc électrique −10 HP + vitesse ×0,5 pendant 1,5 s ; pierre −25 HP + étourdissement 1 s.
- **REQ-3.3.3** Les éléments d'une équipe ne doivent jamais affecter sa propre voiture (pas de tir ami) et doivent être affichés semi-transparents pour elle.
- **REQ-3.3.4** À HP = 0, le véhicule doit s'arrêter et ne plus répondre au Pilote jusqu'à la réparation synchrone.

---

### 4. Copilote — actions et objets

#### 4.1 Pickups
- **REQ-4.1.1** 4 pickups doivent apparaître à des emplacements fixes de la piste. Ils réapparaissent 15 s après ramassage.
- **REQ-4.1.2** Le Pilote qui passe dessus le ramasse automatiquement. Un seul objet en stock ; type aléatoire entre lance-pierre et boost.
- **REQ-4.1.3** Pour utiliser l'objet, le Pilote appuie sur `UseItem` → l'objet est armé pendant 5 s (halo visible sur le panneau Copilote). Le Copilote doit exécuter le geste correspondant dans ce délai, sinon l'objet est perdu.

#### 4.2 Lance-pierre (C-01) — objet armé requis
- **REQ-4.2.1** Le geste doit être 3 doigts posés en cluster (≤ 150 px) sur la table.
- **REQ-4.2.2** Un cercle rouge d'avertissement doit s'afficher pendant 0,8 s, orienté vers le joueur adverse le plus proche, avant l'impact.
- **REQ-4.2.3** L'impact doit avoir un rayon de 60 px et infliger −25 HP + étourdissement 1 s uniquement à la voiture adverse.

#### 4.3 Boost / portail de vitesse (C-02) — objet armé requis
- **REQ-4.3.1** Le geste doit être 2 doigts posés sur la piste, écartés de 100 à 400 px, formant un segment jaune visible.
- **REQ-4.3.2** L'intensité du boost doit être une fonction continue : `k = clamp(longueur / 400, 0.3, 1.0)`. La voiture alliée franchissant le segment gagne +80% × k de vitesse pendant 2 s.
- **REQ-4.3.3** Le portail doit avoir une durée de vie de 8 s.

#### 4.4 Fantôme (C-03) — indépendant, recharge
- **REQ-4.4.1** L'activation doit se faire via le bouton du panneau Copilote, sans nécessiter un pickup.
- **REQ-4.4.2** Pendant 3 s, la voiture alliée doit traverser murs, poteaux et arcs adverses sans effet.
- **REQ-4.4.3** La recharge doit être de 20 s, visible sur le panneau via un anneau de progression.

#### 4.5 Destruction de mur (C-04) — indépendant, recharge
- **REQ-4.5.1** L'activation doit se faire en appuyant sur le bouton, puis en touchant un mur adverse (poteau) dans les 3 s.
- **REQ-4.5.2** Le mur ciblé doit être désactivé pendant 10 s. La recharge est de 15 s.

#### 4.6 Poteaux électriques tangibles (C-05) — via Magicien d'Oz
- **REQ-4.6.1** Chaque équipe dispose de 2 poteaux (ids fixes : 1,2 pour équipe A ; 3,4 pour équipe B).
- **REQ-4.6.2** Un poteau posé crée un mur de 120 px orienté selon son `angle`.
- **REQ-4.6.3** Si 2 poteaux d'une même équipe sont posés à ≤ 500 px l'un de l'autre, un arc électrique se forme entre eux (remplace les deux murs individuels).
- **REQ-4.6.4** Un événement `TangibleMoved` de l'opérateur et d'une vraie table TUIO doit produire un résultat identique côté serveur.

#### 4.7 Réparation synchrone (C-06) — priorité maximale
- **REQ-4.7.1** La réparation doit requérir que le Pilote pose un doigt sur son pad de station ET que le Copilote pose un doigt sur le sien, simultanément, et maintiennent 2 s.
- **REQ-4.7.2** Si l'un des deux lâche, la jauge doit retomber à zéro.
- **REQ-4.7.3** À 100 %, les HP sont restaurés à 60 et la voiture repart depuis le dernier checkpoint.
- **REQ-4.7.4** Les pads de réparation sont des disques de 160 px dans le panneau HUD de chaque coin.

#### 4.8 Élargir la piste (C-07) — priorité P2
- **REQ-4.8.1** Le geste doit consister à poser un doigt sur un bord de piste et le tirer vers l'extérieur de 20 à 60 px.
- **REQ-4.8.2** La largeur locale de la piste doit augmenter et les colliders recalculés. Recharge 20 s.

---

### 5. Attribution des interactions et territorialité

- **REQ-5.1** Le système ne doit jamais tenter de suivre un doigt vers une personne physique.
- **REQ-5.2** L'équipe d'une interaction est déduite par contexte : pad/bouton de station → équipe de la station ; geste d'objet → équipe dont le Pilote a armé l'objet ; si les deux équipes sont armées simultanément → équipe dont la station est la plus proche du centre du geste ; tangible → équipe de l'identifiant (Magicien d'Oz).
- **REQ-5.3** Les panneaux HUD de chaque coin doivent être orientés vers leur joueur (pas de « haut » global de la table).

---

### 6. Interface et rendu

#### 6.1 Table
- **REQ-6.1.1** Le rendu doit utiliser Canvas 2D (PixiJS si les performances l'exigent) en plein écran sur la table.
- **REQ-6.1.2** Le style visuel doit être néon, vue de dessus, fond bleu nuit avec grille carrée discrète. Mur extérieur magenta lumineux, mur intérieur cyan lumineux, ligne centrale en pointillés gris.
- **REQ-6.1.3** La piste doit rester au centre ; les panneaux HUD de coin ne doivent jamais la recouvrir.
- **REQ-6.1.4** Les alertes (pierre en approche, véhicule en panne) doivent s'afficher à l'endroit concerné, orientées vers le joueur le plus proche.

#### 6.2 Panneaux HUD de coin (4 panneaux)
- **REQ-6.2.1** Panneau Pilote : barre HP, icône de l'objet en stock, pad de réparation.
- **REQ-6.2.2** Panneau Copilote : boutons Fantôme et Détruire Mur avec anneaux de recharge, pad de réparation, halo « objet armé ».

---

### 7. Console Magicien d'Oz

- **REQ-7.1** La console doit être une page web séparée accessible sur tablette, avec : miniature de la piste cliquable pour poser/déplacer un poteau, sélecteur d'id (1–4), slider/cadran d'angle, bouton « retirer » par poteau actif.
- **REQ-7.2** La console doit exposer des boutons de secours : déclencher un obstacle, un boost, une panne, élargir la piste, forcer un circuit de secours.
- **REQ-7.3** Un journal horodaté doit enregistrer tous les événements émis pour rejouer et analyser les sessions.
- **REQ-7.4** L'opérateur doit être hors du champ de vision des joueurs. Sa latence de réaction doit être mesurée et déclarée.

---

### 8. Configuration

- **REQ-8.1** Tous les paramètres de jeu (vitesses, dégâts, durées, dimensions) doivent être regroupés dans un seul fichier de configuration, modifiables sans recompilation.
- **REQ-8.2** Les valeurs par défaut sont celles définies dans la section 14 du context.md (lapsToWin=3, sessionMaxSeconds=300, hpMax=100, etc.).

---

### 9. Contraintes techniques

- **REQ-9.1** Le budget tactile est ≤ 10 points simultanés (compatible Chrome/Windows sur PCAP).
- **REQ-9.2** La latence doigt→rendu (aller-retour WebSocket inclus) doit être inférieure à 50 ms.
- **REQ-9.3** Le canvas 4K doit tenir 60 fps avec 2 véhicules et effets néon ; sinon, rendu en 1080p upscalé.
- **REQ-9.4** La reconnaissance des gestes (3 doigts, 2 doigts, tracé) doit être effectuée côté navigateur de la table ; seuls des messages sémantiques sont envoyés au serveur.

---

## Critères d'acceptation

| ID | Critère |
|---|---|
| T-01 | Deux Copilotes tracent simultanément ; un circuit valide est produit en < 3 s |
| T-02 | Un Pilote conduit via QR code sans installation ; latence < 80 ms |
| T-03 | Un mur adverse retire 10 HP avec 1 s d'invulnérabilité |
| T-04 | Deux poteaux alliés génèrent un arc ; la voiture adverse perd 10 HP et ralentit |
| T-05 | Un objet armé sans geste du Copilote dans les 5 s est perdu |
| T-06 | Le lance-pierre affiche un avertissement 0,8 s avant l'impact |
| T-07 | Le portail de boost est plus fort quand ses extrémités sont plus écartées |
| T-08 | Le Fantôme traverse murs et arcs 3 s, puis recharge 20 s |
| T-09 | La réparation ne s'enclenche que si les deux doigts sont sur leur pad |
| T-10 | Un `TangibleMoved` opérateur et un `TangibleMoved` vrai TUIO donnent le même résultat |
| T-11 | Le journal Oz permet de rejouer une session à l'identique |
