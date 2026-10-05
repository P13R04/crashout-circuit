# CRASHOUT — Fiche technique unique

Projet étudiant Polytech Nice Sophia, simulé en startup. Doc à jour au 5 oct 2026.
Soutenance finale: **à confirmer** (le contexte d'origine indique le 28 sept 2026, antérieur à la date du doc).

Fiabilité: **[OK]** vérifié source constructeur/littérature · **[EST]** estimation, valeur par défaut à régler en test · **[?]** non vérifié · **[DÉCISION]** choix arbitré entre sources contradictoires, à valider par l'équipe.

Cette fiche est la **seule source de vérité**. Chaque règle porte un identifiant (R-xx, C-xx, E-xx, P-xx) pour être citée dans les spécifications dérivées.

---

## 1. Résumé en 10 lignes

- Jeu de course **2 équipes × 2 joueurs** sur une **table tactile 65"** posée à plat. Les deux équipes courent sur **le même circuit**.
- Chaque équipe: **1 Pilote** (station fixe, conduit avec son smartphone) + **1 Copilote** (mobile autour de la table, agit sur la table).
- Le circuit est **généré** à partir de deux tracés partiels dessinés par deux joueurs, complétés automatiquement puis fusionnés.
- Le Copilote agit par gestes tactiles (lance-pierre, boost, fantôme, destruction de mur), par **objets tangibles** (poteaux électriques) et par **actions synchrones avec son Pilote** (réparation).
- Les objets ramassés en piste ne marchent que si **le Pilote les active et le Copilote les joue**.
- Les tangibles sont **simulés par un Magicien d'Oz** (aucune reconnaissance d'objets sur cette table), mais émettent des événements au format TUIO → du vrai matériel pourra être branché sans toucher au gameplay.
- Moteur: **WebApp HTML/JS, pas Unity**. Serveur Node.js autoritaire.

### Décisions structurantes

| # | Décision | Choix |
|---|---|---|
| D1 | Moteur | WebApp. Navigateur plein écran sur la table. Canvas 2D (PixiJS si besoin de perf) |
| D2 | Serveur | Node.js + WebSocket, **autoritaire** sur la physique et les règles |
| D3 | Pilotage | **Smartphone** (web app via QR code, zéro installation): pédale avant/arrière + joystick + bouton d'action. Remplace le gyroscope des anciens docs [DÉCISION] |
| D4 | Tangibles | Magicien d'Oz via une console web séparée. Format d'événements TUIO (`id`, `x`, `y`, `angle`) |
| D5 | Attribution des joueurs | On ne suit **jamais un doigt vers une personne**. L'équipe se déduit du contexte (zone, bouton d'équipe, objet armé par le Pilote) |
| D6 | Réparation | Action synchrone: **Pilote et Copilote posent chacun un doigt sur leur pad de station** (table). Remplace la « réparation localisée » [DÉCISION] |
| D7 | Table | iiyama ProLite TF6538UHSC-B2AG, PCAP 50 points, **aucune reconnaissance d'objets** |
| D8 | Industrialisation visée | Interactive Scape Scape Tangible / Scape X Module (TUIO natif) |

Argument de soutenance: le prototype valide les **interactions** sur du matériel à ~3 500 €. L'industrialisation branche une vraie reconnaissance d'objets sans réécrire le gameplay.

---

## 2. Contribution IHM revendiquée

Pas « intégrer des objets physiques dans un jeu de course » (Neon Racer, 2005).
Mais **étudier le couplage spatial simultané entre interactions tangibles concurrentes et gestes multitouch collaboratifs sur un même espace physique-numérique en temps réel**.

Principes de conception retenus:
- **Effet = fonction continue de la géométrie**, jamais un simple booléen (ex.: la force du boost dépend de la longueur réelle du segment tracé). Appui: Morris et al., CHI 2006.
- **Collaboration forcée**: au moins une action par course est impossible pour une seule paire de bras (la réparation synchrone). Appui: Piper et al., CSCW 2006 (SIDES).
- **Territorialité**: chaque équipe a sa station et son HUD. Appui: Scott, Carpendale, Inkpen, CSCW 2004.
- **Pas de « haut » sur une table**: chaque élément d'interface est orienté vers le bord le plus proche de son destinataire.

---

## 3. Joueurs, stations, disposition

| Rôle | Mobilité | Entrée principale | Station (table) |
|---|---|---|---|
| Pilote (×2) | **Fixe**, doit rester à sa station | Smartphone (pédale, joystick, bouton) | Pad de réparation + panneau HUD |
| Copilote (×2) | **Mobile** autour de la table | Doigts sur la table + tangibles | Pad de réparation + panneau HUD |

Disposition [DÉCISION]: les équipes sont sur les deux grands côtés de la table.

| Coin | Joueur | Couleur d'équipe |
|---|---|---|
| Bas-gauche | Pilote A | cyan |
| Bas-droite | Copilote A | cyan |
| Haut-gauche | Pilote B | rose |
| Haut-droite | Copilote B | rose |

Chaque coin porte un **panneau HUD** orienté vers son joueur (voir §11).

**R-01** Un Pilote ne quitte pas sa station.
**R-02** Un Copilote peut aller partout autour de la table, mais doit revenir à sa station pour toute action synchrone (réparation).
**R-03** Le système ne sait pas qui touche. L'équipe d'une interaction est déduite ainsi:
1. un **pad ou bouton de station** appartient à son équipe;
2. un **geste d'objet** (lance-pierre, boost) est attribué à l'équipe dont le Pilote a **armé** l'objet;
3. si les deux équipes sont armées en même temps, le geste va à l'équipe dont la station est **la plus proche du centre du geste** [EST];
4. un **tangible** est attribué par l'opérateur Magicien d'Oz (son identifiant fixe l'équipe, §8.2).

---

## 4. Déroulé d'une session (4–6 min, apprentissage ≈ 20 s sans notice)

| Temps | Phase | Contenu |
|---|---|---|
| 0:00 | `LOBBY` | Les joueurs scannent le QR code (Pilotes), rôles attribués |
| 0:00–0:30 | `MAP` | Création de la carte (§5) |
| 0:30–4:30 | `RACE` | Course sur 3 tours [EST] ou limite de temps |
| pendant la course | — | Ramassage d'objets, actions, pannes, réparations |
| fin | `RESULT` | Classement, rotation des rôles, nouvelle partie |

**R-04** Victoire: première équipe qui termine **3 tours** [EST, réglable]. À 5:00 sans vainqueur, gagne l'équipe la plus avancée (tours puis checkpoints).
**R-05** Un tour valide exige de franchir tous les checkpoints dans l'ordre.

---

## 5. Création de la carte

### 5.1 Principe
Deux joueurs (**les deux Copilotes** [DÉCISION], un par équipe) reçoivent chacun **deux points imposés** affichés dans leur moitié de table. Chacun trace un chemin entre ses deux points. Le système **complète automatiquement** chaque tracé en boucle fermée (autofill), puis **mélange** les deux boucles en un circuit unique.

Interprétation retenue de « ils se remplissent l'un l'autre »: chaque joueur remplit ses deux points, et le circuit final contient les deux contributions [?, à confirmer avec l'équipe].

### 5.2 Algorithme (déterministe, simple à coder)

| Étape | Règle |
|---|---|
| 1. Points imposés | Joueur A: P1 en quart haut-gauche, P2 en quart bas-droit. Joueur B: P3 en quart haut-droit, P4 en quart bas-gauche. Jitter ±150 px, distance minimale entre deux points ≥ 400 px [EST] |
| 2. Tracé | Le joueur trace au doigt un chemin de son point de départ à son point d'arrivée. Tracé valide s'il touche les deux points (rayon 60 px) et fait ≥ 300 px |
| 3. Nettoyage | Rééchantillonnage à pas constant, filtre 1€ contre le jitter |
| 4. Autofill (fermeture) | Soit S le tracé et d(s) son décalage latéral par rapport à la droite P1P2. On force S du même côté de la droite (`d' = |d|`), avec amplitude max ≥ 150 px. Le **retour** R est le miroir de S par rapport à la droite, à l'échelle κ ∈ [0,6 ; 1,0] (tiré au hasard) → boucle fermée en forme de **haricot** |
| 5. Mélange | Chaque boucle est orientée dans le sens anti-horaire et rééchantillonnée en N = 256 points. Le décalage d'indice de B qui minimise la distance totale à A est cherché (256 essais). Circuit final `C(i) = 0,5·A(i) + 0,5·B(i)` |
| 6. Lissage | Spline Catmull-Rom **centripète** sur C |
| 7. Largeur | Largeur de base 140 px, variable en fonction de la courbure (±30 px). Minimum 90 px (> 3× la largeur du véhicule) |
| 8. Géométrie | Bords par la normale (mur extérieur magenta, mur intérieur cyan), colliders |
| 9. Marquage | 8 checkpoints répartis, ligne de départ sur la portion la plus rectiligne, voitures côte à côte (±20 px de décalage latéral), 4 emplacements de pickups |

### 5.3 Validations
Rayon de courbure minimal · largeur > gabarit véhicule · pas d'auto-intersection · pas de passage impossible · zone rectiligne pour le départ.
**R-06** Si une validation échoue: relancer le mélange avec poids 0,4 puis 0,6; si encore en échec, utiliser la boucle A seule. L'opérateur Oz peut aussi forcer un circuit de secours.

Pourquoi la table: le dessin seul marcherait sur tablette. Ce qui change ici, c'est que **deux personnes dessinent en même temps sur le même espace**.

---

## 6. Pilote

### 6.1 Contrôles (smartphone, web app, WebSocket)

| Contrôle | Entrée | Valeur envoyée |
|---|---|---|
| Pédale | Curseur vertical, rappel à 0 au relâchement. Haut = avant, bas = arrière | `throttle ∈ [-1, 1]` |
| Joystick | Curseur horizontal, rappel à 0 | `steer ∈ [-1, 1]` |
| Bouton d'objet | Appui | `UseItem` (arme l'objet en stock) |

### 6.2 Véhicule (modèle simple)

| Paramètre | Valeur par défaut |
|---|---|
| Vitesse max avant | 420 px/s [EST] |
| Vitesse max arrière | 140 px/s [EST] |
| Accélération | 600 px/s² [EST] |
| Vitesse de rotation max | 2,5 rad/s [EST] |
| Gabarit | 24 × 14 px |
| Collision avec bord de piste | Rebond, vitesse ×0,6, **aucun dégât** |

### 6.3 Points de vie (HP)

**R-07** HP max = 100.
**R-08** Le Pilote perd des HP **uniquement** à cause d'éléments posés ou lancés par l'équipe adverse:

| Source | Dégâts | Effet associé |
|---|---|---|
| Mur (poteau seul) | −10, puis 1 s d'invulnérabilité | Rebond |
| Arc électrique | −10 par franchissement | Vitesse ×0,5 pendant 1,5 s |
| Pierre du lance-pierre | −25 | Étourdissement 1 s |

**R-09** Les éléments d'une équipe n'affectent jamais sa propre voiture (pas de tir ami). Ils sont affichés semi-transparents pour elle.
**R-10** À **HP = 0**, le véhicule est **hors d'usage**: il s'arrête et ne répond plus au Pilote, jusqu'à la réparation synchrone (§7.4).

---

## 7. Copilote: actions et objets

### 7.1 Vue d'ensemble

| ID | Action | Déclencheur | Entrée | Prio |
|---|---|---|---|---|
| C-01 | Lance-pierre | Objet **ramassé + armé** par le Pilote | 3 doigts sur la table | P1 |
| C-02 | Boost (portail de vitesse) | Objet **ramassé + armé** par le Pilote | 2 doigts sur la piste | P1 |
| C-03 | Fantôme | **Indépendant** (recharge) | Bouton du panneau Copilote | P1 |
| C-04 | Destruction de mur | **Indépendant** (recharge) | Bouton + toucher un mur adverse | P1 |
| C-05 | Poteaux électriques | Objets **tangibles** (stock de 2 par équipe) | Pose sur la table (Magicien d'Oz) | P1 |
| C-06 | Réparation synchrone | Véhicule hors d'usage | Un doigt de chaque joueur sur son pad | **P0** |
| C-07 | Élargir la piste | Indépendant (recharge) | Tirer le bord de piste vers l'extérieur | P2 |

### 7.2 Objets ramassés en piste (pickups)

**R-11** 4 pickups apparaissent à des points fixes de la piste (marqués à la génération, §5.2 étape 9). Ils réapparaissent 15 s après ramassage [EST].
**R-12** Le Pilote qui roule dessus le **ramasse**. Un seul objet en stock; type tiré au hasard entre **lance-pierre** et **boost**.
**R-13** Pour utiliser l'objet: le Pilote appuie sur **UseItem** → l'objet est **armé** pendant 5 s [EST] (halo sur le panneau Copilote de son équipe). Le Copilote doit exécuter le geste correspondant dans cette fenêtre. Sinon l'objet est perdu.
**R-14** Il n'y a pas de pickup pour Fantôme, Destruction de mur et Poteaux.

### 7.3 Détail des actions

**C-01 Lance-pierre**
- Geste: **3 doigts** posés ensemble (cluster ≤ 150 px) sur un point de la table, centre = point visé.
- Effet: après un **délai de signalement 0,8 s**, une pierre frappe ce point. Un cercle rouge d'avertissement est affiché pendant ce délai, orienté vers le joueur adverse le plus proche (l'adversaire peut esquiver).
- Rayon d'impact 60 px [EST]. Touche uniquement la voiture adverse. Dégâts: voir R-08.

**C-02 Boost (portail de vitesse)**
- Geste: **2 doigts** posés sur la piste, écartés de 100 à 400 px. Un segment jaune à extrémités en anneau relie les deux doigts.
- Effet (fonction continue): intensité `k = clamp(longueur / 400, 0,3 ; 1,0)`. Une voiture alliée qui franchit le segment gagne **+80 % × k** de vitesse pendant 2 s [EST].
- Durée de vie du portail: 8 s [EST]. Représente la « ligne d'énergie » de la maquette.

**C-03 Fantôme**
- Activation: bouton du panneau Copilote. Aucun besoin du Pilote.
- Effet: la voiture alliée **traverse murs, poteaux et arcs adverses** pendant 3 s; recharge 20 s [EST].

**C-04 Destruction de mur**
- Activation: appui sur le bouton, puis toucher un **mur adverse** (poteau seul) dans les 3 s.
- Effet: ce mur est **désactivé 10 s**; recharge 15 s [EST].

**C-05 Poteaux électriques (tangibles)**
- Matériel: 2 objets par équipe, ids fixes (§8.2).
- 1 poteau posé = **mur** de 120 px de long, orienté selon `angle`.
- 2 poteaux de la même équipe posés, distance ≤ 500 px [EST] = **arc électrique** entre eux (remplace les deux murs).
- Les poteaux restent actifs tant qu'ils sont sur la table.
- Tout passe par le Magicien d'Oz (§9).

**C-06 Réparation synchrone**
- Condition: voiture hors d'usage (R-10).
- Geste: le Pilote pose un doigt sur **son pad de station** et le Copilote sur **le sien**, **simultanément**, maintenus 2 s [EST]. Les pads sont des disques de 160 px dans le panneau HUD de chaque coin.
- Si l'un lâche, la jauge retombe. À 100 %: HP restaurés à 60 [EST], la voiture repart du dernier checkpoint.
- Obligation de collaborer: le Copilote doit **revenir à sa station** (R-02).

**C-07 Élargir la piste (P2)**
- Geste: un doigt posé sur un bord de piste, tiré vers l'extérieur sur 20 à 60 px [EST]. La largeur locale augmente, les colliders sont recalculés.
- Recharge 20 s [EST]. À activer seulement si le temps le permet.

### 7.4 Budget de points tactiles
Copilote max 3 doigts (lance-pierre) + 2 pads (1 doigt par joueur) + 2 créateurs de carte (1 doigt chacun) → **≤ 10 points simultanés**, y compris si le navigateur n'en expose que 10. Voilà pourquoi le pilotage est sur smartphone (D3).

---

## 8. Matériel et tangibles

### 8.1 Table iiyama ProLite TF6538UHSC-B2AG

| | |
|---|---|
| Diagonale / résolution | 65" (165 cm) · 3840×2160 4K UHD [OK] |
| Dalle | IPS LED, 500 cd/m² [OK] |
| Tactile | **PCAP 50 points** annoncés [OK] (nombre réel remontant au navigateur: [?], voir §12) |
| Format | **Open Frame**, trous de fixation, orientation « Face vers le haut » supportée [OK] |
| Verre | Bord à bord, anti-rayures, anti-reflet, certifié test de chute de bille [OK] |
| Carter / poids | Métal · 59,8 kg [OK] |
| VESA | 600×400 mm [OK] |
| Interfaces | 2×HDMI, DisplayPort, DVI, VGA, LAN, RS-232, USB, audio [OK] |
| Statut / prix | **EOL** [OK] · 4 777 € TTC catalogue, remisé 3 646 € TTC, hors stock [OK] |
| Successeur | ProLite TF6539UHSC-B1AG [OK] |

**Reconnaissance d'objets: AUCUNE** [OK]. C'est un écran tactile, pas une table tangible.

Pourquoi ce choix: 4K sur 65" pour environ un dixième du prix d'une table tangible · mode face-up supporté par le constructeur · open frame intégrable dans un meuble maison · verre et carter robustes en contexte public.
Risques: EOL (pas de réappro) · 59,8 kg, non transportable seul · **pas de PC intégré, à ajouter** · ventilation face-up à vérifier.

### 8.2 Tangibles

| ID | Équipe | Type |
|---|---|---|
| 1, 2 | A (cyan) | Poteau |
| 3, 4 | B (rose) | Poteau |

Forme d'événement TUIO conservée: `id`, `x`, `y`, `angle`.
Prototype: objets physiques simples (poteaux imprimés ou en acrylique) sans électronique; l'opérateur Oz reproduit leur position à distance.

---

## 9. Magicien d'Oz

Un opérateur humain hors du champ de vision des joueurs simule la reconnaissance des tangibles.

### 9.1 Console (page web séparée, sur une tablette)

| Élément | Fonction |
|---|---|
| Miniature de la piste cliquable | Poser ou déplacer un poteau à la position touchée |
| Sélecteur d'identifiant (1 à 4) | Choisit le poteau, donc l'équipe |
| Slider ou cadran d'angle | Émet `angle` |
| Bouton « retirer » par poteau actif | Émet `TangibleRemoved` |
| Boutons de secours | Déclencher un obstacle, un boost, une panne, élargir la piste, forcer un circuit de secours (§5.3) |
| Journal horodaté | Enregistre tous les événements émis, pour rejouer et analyser les sessions |

### 9.2 Protocole d'expérimentation
**R-15** L'opérateur est hors champ de vision des joueurs.
**R-16** La **latence de réaction** de l'opérateur est mesurée et **déclarée** dans les résultats. C'est une limite à assumer, pas à cacher.
**R-17** Un événement émis par l'opérateur et un événement d'une vraie table sont **identiques** pour le serveur.

---

## 10. Architecture et événements

```
[Table iiyama 65"]                    [Smartphones Pilotes]
 navigateur plein écran                web app (QR code)
 Pointer Events (doigts)               sliders pédale/joystick
        |  WebSocket                          |  WebSocket
        +----------------> Serveur Node.js <--+
                            |        ^
                            |        |  WebSocket
                            |   [Console Magicien d'Oz]
                            v
                   Couche d'événements de jeu
                   Logique + physique (serveur autoritaire)
                            |
                   Rendu Canvas 2D sur la table
```

**R-18** La couche d'événements est le **seul contrat** entre les entrées et le gameplay.
**R-19** Le serveur est autoritaire. Table et téléphones sont des clients.
**R-20** Repère de jeu logique: **1920×1080**, mis à l'échelle ×2 pour le 4K. Boucle physique 60 Hz, diffusion d'état 30 Hz [EST].

### 10.1 Messages (JSON, tous avec `type` et `t` = horodatage ms)

| Source → Cible | Message | Champs |
|---|---|---|
| Téléphone → serveur | `PilotInput` | `team`, `throttle`, `steer` |
| Téléphone → serveur | `UseItem` | `team` |
| Table → serveur | `StrokeDraw` | `creator`, `pts[]` |
| Table → serveur | `PadHold` | `team`, `role` (`pilot`/`copilot`), `on` |
| Table → serveur | `Slingshot` | `x`, `y`, `fingers`=3 |
| Table → serveur | `BoostGate` | `a{x,y}`, `b{x,y}` |
| Table → serveur | `Ability` | `team`, `kind` (`ghost`/`destroy`), `targetId?` |
| Table → serveur | `BorderPull` (P2) | `x`, `y`, `dx`, `dy` |
| Oz → serveur | `TangibleMoved` | `id`, `x`, `y`, `angle` |
| Oz → serveur | `TangibleRemoved` | `id` |
| Oz → serveur | `OzTrigger` | `kind`, `params` (secours) |
| Serveur → tous | `State` | `tick`, voitures, murs, arcs, portails, pierres, pickups, tours, phase |
| Serveur → tous | `Feedback` | `kind`, `x`, `y`, `team` (alertes, sons) |

Les gestes (3 doigts, 2 doigts, tracé) sont reconnus **côté navigateur de la table**, qui n'envoie que les messages sémantiques ci-dessus. L'équipe d'un message sans champ `team` est déduite selon R-03.

---

## 11. Interface (maquette de référence)

Style néon, vue de dessus, fond bleu nuit avec grille carrée discrète. Canvas de la maquette: 798×384, à utiliser comme **référence de proportions et de palette seulement** (le canvas réel est 1920×1080).

| Élément | Représentation |
|---|---|
| Piste | Boucle fermée en haricot, lobes larges à gauche et à droite, pincée au milieu |
| Mur extérieur | Ligne pleine **magenta** lumineuse |
| Mur intérieur | Ligne pleine **cyan** lumineuse |
| Ligne centrale | Pointillés gris |
| Voitures | Flèches, cyan (équipe A) et rose (équipe B) |
| Mur ou barrière | Segment **rouge** lumineux |
| Portail de boost | Segment **jaune** à extrémités en anneau |
| Boutons | Violet (étincelle), teal (losange, zigzag) |

**Panneaux de coin** (4, en miroir, 1 par joueur), hors piste, jamais recouverts par la piste:

| Panneau | Contenu |
|---|---|
| Pilote | Barre HP · icône de l'objet en stock (crosshair/compas) · **pad de réparation** |
| Copilote | Boutons **Fantôme** et **Détruire mur** avec anneau de recharge · **pad de réparation** · halo « objet armé » |

Affectation exacte des icônes de la maquette aux boutons: à régler au moment du design.

**R-21** Les alertes (pierre en approche, véhicule en panne) s'affichent **à l'endroit concerné**, orientées vers le joueur le plus proche, pour inciter au déplacement.
**R-22** La piste reste au centre; aucun panneau ne la recouvre.

---

## 12. Vérifications techniques (à mesurer)

| À mesurer | Seuil / question |
|---|---|
| **Points tactiles remontant au navigateur** | 50 annoncés, Windows + Chrome en expose souvent 10. Budget de §7.4 conçu pour tenir à 10. **Test prioritaire** |
| Latence doigt → rendu (aller-retour WebSocket inclus) | < 50 ms |
| Latence pilotage smartphone → rendu | < 80 ms (au-delà, injouable) |
| Latence de réaction du Magicien d'Oz | À mesurer et déclarer (R-16) |
| Palm rejection (bras posés, pad de station) | À caractériser |
| Tenue thermique en face-up prolongé | La ventilation d'un écran couché n'est pas celle d'un écran vertical |
| Canvas 4K, 60 fps, 2 véhicules + effets néon | À profiler; sinon rendre en 1080p upscalé |
| Attribution d'un geste quand les deux équipes sont armées (R-03.3) | À tester en conditions réelles |

---

## 13. Critères d'acceptation (base de tests)

| ID | Critère |
|---|---|
| T-01 | Deux joueurs tracent simultanément; un circuit valide est produit en < 3 s |
| T-02 | Un Pilote conduit via QR code sans installation; latence < 80 ms |
| T-03 | Un mur adverse retire 10 HP, avec 1 s d'invulnérabilité |
| T-04 | Deux poteaux alliés génèrent un arc électrique; la voiture adverse perd 10 HP et ralentit |
| T-05 | Un objet armé sans geste du Copilote dans les 5 s est perdu |
| T-06 | Le lance-pierre à 3 doigts affiche un avertissement 0,8 s avant l'impact |
| T-07 | Le portail de boost est plus fort quand ses extrémités sont plus écartées |
| T-08 | Le Fantôme permet de traverser murs et arcs adverses 3 s, puis recharge de 20 s |
| T-09 | La réparation ne s'enclenche que si **les deux** doigts sont sur leur pad |
| T-10 | Un message `TangibleMoved` de l'opérateur et d'une vraie table donne le même résultat |
| T-11 | Le journal Oz permet de rejouer une session à l'identique |

---

## 14. Paramètres (tous modifiables en un seul fichier de config)

| Clé | Valeur par défaut |
|---|---|
| `lapsToWin` | 3 |
| `sessionMaxSeconds` | 300 |
| `hpMax` | 100 |
| `dmgWall` / `dmgArc` / `dmgStone` | 10 / 10 / 25 |
| `invulnAfterHitS` | 1 |
| `stunStoneS` | 1 |
| `arcSlowFactor` / `arcSlowS` | 0,5 / 1,5 |
| `repairHoldS` / `repairHpRestore` | 2 / 60 |
| `pickupRespawnS` / `armWindowS` | 15 / 5 |
| `stoneTelegraphS` / `stoneRadiusPx` | 0,8 / 60 |
| `boostLenMinPx` / `boostLenMaxPx` | 100 / 400 |
| `boostGateLifeS` / `boostDurationS` / `boostGain` | 8 / 2 / 0,8 |
| `ghostS` / `ghostCooldownS` | 3 / 20 |
| `destroyDisableS` / `destroyCooldownS` | 10 / 15 |
| `wallLengthPx` / `arcMaxDistPx` | 120 / 500 |
| `trackWidthBasePx` / `trackWidthMinPx` | 140 / 90 |
| `vMaxFwd` / `vMaxRev` / `accel` / `turnRate` | 420 / 140 / 600 / 2,5 |

Tout est **[EST]**, à régler pendant les tests utilisateurs.

---

## 15. Ordre de développement

| Priorité | Contenu |
|---|---|
| **P0** | Serveur Node + WebSocket · rendu piste · générateur de carte (§5) · app Pilote smartphone · physique du véhicule · HP et hors d'usage · **réparation synchrone (C-06)** |
| **P1** | Pickups + armement (R-11 à R-13) · Lance-pierre (C-01) · Boost (C-02) · Fantôme (C-03) · Destruction de mur (C-04) · **Poteaux via console Oz (C-05)** · panneaux HUD des 4 coins |
| **P2** | Élargir la piste (C-07) · journal et rejeu Oz · effets néon, sons · circuit de secours |

---

## 16. Écarté du prototype (une seule vérité)

| Élément retiré | Raison |
|---|---|
| Gyroscope pour piloter | Remplacé par pédale + joystick sur smartphone (D3) |
| Tangibles « champ orienté » et « porte progressive » | Remplacés par les poteaux électriques (périmètre plus simple, un seul type de tangible) |
| Réparation localisée sur la zone endommagée | Remplacée par la réparation synchrone aux stations (D6) |
| Contraintes de tracé posées par les autres joueurs | Retirées pour simplifier la génération de carte (§5) |
| Ligne d'énergie en action séparée | Fusionnée avec le boost (portail jaune, C-02) |
| Sortie de piste = véhicule détruit | Les bords sont solides, sans dégâts (§6.2); seul le HP = 0 met hors d'usage |

### Pistes de recherche (hors prototype, à garder pour la soutenance)
1. **Occlusion par les bras comme mécanique**: aider loin de son poste prive le Pilote d'information. Limite: aucun écran PCAP ne détecte le survol; seul le déclenchement manuel par l'opérateur Oz serait possible.
2. **Tangible translucide en fenêtre de diagnostic**: anneau acrylique qui révèle une couche alternative sous la piste. [OK] Produit existant chez Interactive Scape: Scape X Magnify (anneau ø193/161 mm, 148 g).
3. **Surface de contact comme paramètre analogique**: [?] `PointerEvent.width/height` sont souvent constants sur PCAP Windows. À tester avant toute promesse; sinon remplacer par le nombre ou l'écartement des doigts.

---

## 17. Hypothèses à valider par l'équipe

1. Les deux créateurs de carte sont **les Copilotes** (§5.1).
2. Interprétation du « remplissage mutuel » et du « mélange » des deux circuits (§5.1, §5.2 étape 5).
3. Les équipes sont installées sur les deux **grands côtés** de la table (§3).
4. Le Pilote a **un doigt sur la table** (pad) en plus de son smartphone pour la réparation (C-06).
5. Les poteaux ne blessent pas leur propre équipe (R-09).
6. Date de soutenance (28 sept 2026 antérieure à la date du doc).

---

## 18. Références

- Morris et al., CHI 2006: gestes coopératifs (symétrie, parallélisme, distance proxémique, additivité).
- Piper et al., CSCW 2006 (SIDES): la collaboration n'émerge que si les règles interdisent l'action solitaire.
- Scott, Carpendale, Inkpen, CSCW 2004: territorialité sur table.
- Vogel & Balakrishnan: occlusion sur surfaces tactiles.
- Interactive Scape: Scape Tangible, Scape X Module, Scape X Magnify.