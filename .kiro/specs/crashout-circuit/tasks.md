# Tasks — Crashout Circuit

## Ordre de développement

Les tâches suivent les priorités P0 → P1 → P2 définies dans le context.md (§15). Chaque tâche est indépendante et livrable ; les dépendances sont indiquées explicitement.

---

## P0 — Fondations (jouable en mode minimal)

### Task 1 — Initialisation du projet et serveur Node.js WebSocket

**Objectif** : Avoir un serveur Node.js opérationnel avec WebSocket, servant les quatre clients (table, pilote×2, Oz) depuis le même processus.

**Sous-tâches** :
- [x] Initialiser le projet Node.js TypeScript à la racine de `crashout-circuit/` avec Vite et `ws`.
- [x] Créer `server/index.ts` : serveur HTTP + WebSocket sur le port 3000, servant les dossiers `client-table/`, `client-pilot/`, `client-oz/` sur des routes distinctes (`/`, `/pilot`, `/oz`).
- [x] Créer `server/config.ts` chargeant `config.json` avec toutes les valeurs par défaut (section 14 du context.md).
- [x] Créer `server/types.ts` avec toutes les interfaces (`Vec2`, `Car`, `Wall`, `GameState`, messages…).
- [x] Créer `server/GameServer.ts` gérant le registre des connexions WS, l'attribution des rôles et le broadcast.
- [x] Implémenter la phase `LOBBY` : attente des connexions, génération du QR code URL, `PhaseChange → MAP` quand les 4 joueurs sont connectés.
- [x] Vérifier que tous les clients reçoivent bien les messages broadcast avec `type` et `t`.

**Critères** :
- Le serveur démarre sans erreur.
- Trois onglets (table, pilote, Oz) peuvent se connecter simultanément et recevoir un `State` initial.

---

### Task 2 — Générateur de carte (MapGenerator)

**Objectif** : Implémenter l'algorithme de génération de circuit décrit en §5.2 du context.md.

**Dépend de** : Task 1 (types partagés)

**Sous-tâches** :
- [x] Créer `server/MapGenerator.ts` avec la fonction `generate(strokeA, strokeB): TrackGeometry`.
- [x] Implémenter `validate(stroke)` : longueur ≥ 300 px, touche les deux points cibles (rayon 60 px).
- [x] Implémenter `resample(pts, step)` : rééchantillonnage à pas constant.
- [x] Implémenter `oneEuroFilter(pts)` : filtre 1€ (paramètres β=0.007, fCmin=1.0, dCutoff=1.0).
- [x] Implémenter `autofill(stroke, P1, P2, κ)` : fermeture en haricot (miroir + mise à l'échelle κ ∈ [0.6, 1.0]).
- [x] Implémenter `mergeLoops(A, B)` : rééchantillonnage N=256, recherche du décalage optimal (256 essais), moyennage 0.5/0.5.
- [x] Implémenter `catmullRom(pts)` : lissage Catmull-Rom centripète.
- [x] Implémenter `computeGeometry(center)` : calcul des bords extérieur/intérieur par la normale, largeur variable (140 px ±30 px selon courbure, min 90 px), colliders.
- [x] Implémenter `placeFeatures(geo)` : 8 checkpoints uniformément répartis, ligne de départ sur le segment le plus rectiligne, 2 positions de départ (±20 px), 4 emplacements pickups.
- [x] Implémenter `validateGeometry(geo)` : rayon de courbure min, largeur > 24 px, pas d'auto-intersection.
- [x] Implémenter la logique de repli (poids 0.4/0.6, puis boucle A seule).
- [x] Connecter au serveur : en phase `MAP`, recevoir deux `StrokeDraw`, appeler `generate()`, stocker dans `GameState.track`, passer en phase `RACE`.

**Critères** :
- T-01 : deux tracés → circuit valide en < 3 s.
- Aucune auto-intersection sur 100 générations aléatoires.

---

### Task 3 — Application Pilote (smartphone)

**Objectif** : Page web mobile accessible via QR code permettant de piloter la voiture.

**Dépend de** : Task 1

**Sous-tâches** :
- [ ] Créer `client-pilot/index.html` + `client-pilot/main.ts`.
- [ ] Implémenter la connexion WebSocket avec paramètre `?team=A` ou `?team=B` dans l'URL, envoi de `PilotJoin`.
- [ ] Créer `client-pilot/Controls.ts` : pédale (slider vertical, rappel à 0 au `pointerup`, envoie `throttle ∈ [-1, 1]`), joystick (slider horizontal, rappel à 0, envoie `steer ∈ [-1, 1]`), bouton UseItem (envoie `UseItem`).
- [ ] Throttler l'envoi `PilotInput` à 60 Hz max (rAF ou setInterval).
- [ ] Afficher le rôle et la couleur d'équipe clairement (cyan / rose).
- [ ] Générer et afficher le QR code sur la table côté `client-table/QRDisplay.ts` (phase LOBBY) pointant vers `/pilot?team=A` et `/pilot?team=B`.

**Critères** :
- T-02 : connexion sans installation, latence < 80 ms sur réseau local.
- Le rappel à 0 fonctionne au relâchement du doigt.

---

### Task 4 — Rendu de la piste (Renderer)

**Objectif** : Afficher le circuit généré sur la table avec le style néon défini en §11 du context.md.

**Dépend de** : Task 2 (TrackGeometry)

**Sous-tâches** :
- [x] Créer `client-table/index.html` + `client-table/main.ts` : canvas plein écran, connexion WS, boucle `requestAnimationFrame`.
- [x] Créer `client-table/Renderer.ts` avec méthode `render(state: GameState)`.
- [x] Fond : bleu nuit avec grille carrée discrète (style prototype existant).
- [x] Piste : remplissage sombre, mur extérieur magenta lumineux (shadowBlur), mur intérieur cyan lumineux, ligne centrale en pointillés gris.
- [x] Voitures : flèches, cyan pour équipe A, rose pour équipe B.
- [x] Pickups : icônes distinctes (crosshair pour slingshot, compas pour boost) aux positions fixes.
- [x] Ligne de départ : trait blanc perpendiculaire à la piste.
- [x] Appliquer la mise à l'échelle 1920×1080 → 3840×2160 (DPR ×2) comme dans le prototype existant.

**Critères** :
- Le circuit s'affiche correctement après la phase MAP.
- Le rendu tient 60 fps (vérifier avec `performance.now()`).

---

### Task 5 — Physique du véhicule et HP

**Objectif** : Implémenter la boucle physique serveur pour les deux voitures.

**Dépend de** : Task 1, Task 2

**Sous-tâches** :
- [x] Créer `server/PhysicsLoop.ts` avec `start()` lançant un `setInterval` à 60 Hz.
- [x] Intégrer les `PilotInput` (throttle, steer) pour chaque équipe : accélération, rotation, déplacement (voir paramètres config).
- [x] Implémenter la détection de collision avec les bords de piste (polygone bord extérieur + intérieur) → rebond ×0.6, pas de dégâts.
- [x] Implémenter les HP : initialisation à `hpMax`, gestion `disabled`, `invulnUntil`, `stunUntil`.
- [x] Implémenter la détection de franchissement de checkpoint dans l'ordre → incrémenter `checkpointIndex`, puis `lap`.
- [x] Implémenter la logique de victoire (lap ≥ `lapsToWin`) et timeout (`sessionMaxSeconds`) → `PhaseChange(RESULT)`.
- [x] Diffuser `GameState` à 30 Hz (toutes les 2 ticks).
- [x] Afficher les voitures et leurs HP dans le `Renderer` (Task 4).

**Critères** :
- Une voiture suit les inputs du Pilote avec la physique configurée.
- La collision rebondit sans dégâts.

---

### Task 6 — Réparation synchrone (C-06)

**Objectif** : Implémenter l'action de réparation synchrone Pilote + Copilote (P0, priorité maximale).

**Dépend de** : Task 4, Task 5

**Sous-tâches** :
- [x] Créer `client-table/HUD.ts` avec les 4 panneaux de coin (orientés vers leur bord), incluant les pads de réparation (disques 160 px).
- [x] Implémenter la détection `PadHold` dans `GestureRecognizer` : un toucher dans la zone du pad → envoyer `PadHold(team, role, on: true/false)`.
- [x] Côté serveur : si `repairPads['A-pilot'].held && repairPads['A-copilot'].held`, incrémenter jauge (0 → 100% en `repairHoldS`=2s). Si l'un lâche, réinitialiser la jauge.
- [x] À 100% : restaurer HP à `repairHpRestore`=60, repositionner au dernier checkpoint, `disabled=false`.
- [x] Afficher la progression de la jauge sur les deux pads simultanément (anneau qui se remplit).
- [x] Afficher la barre HP dans le panneau Pilote.

**Critères** :
- T-09 : la réparation ne s'enclenche que si les deux doigts sont sur leur pad.
- Si l'un lâche, la jauge repart de zéro.

---

## P1 — Actions complètes

### Task 7 — Pickups et armement

**Objectif** : Implémenter le cycle de ramassage et d'armement des objets (R-11 à R-13).

**Dépend de** : Task 5

**Sous-tâches** :
- [x] Placer 4 pickups aux positions définies par `TrackGeometry.pickupPositions`, type aléatoire (`slingshot` ou `boost`).
- [x] Détecter le passage d'une voiture sur un pickup (rayon de détection 30 px) → ramassage si `heldItem === null` ; pickup désactivé pendant `pickupRespawnS`=15s.
- [x] Implémenter `UseItem` : si `heldItem !== null`, passer `itemArmed=true`, stocker `itemArmExpiry = now + armWindowS*1000`.
- [x] Expirer l'armement si `itemArmExpiry` est dépassé sans geste Copilote → `heldItem=null, itemArmed=false`.
- [x] Afficher les pickups sur la piste (icônes crosshair/compas).
- [x] Afficher le halo « objet armé » sur le panneau Copilote (5 s, décompte visible).
- [x] Afficher l'icône de l'objet en stock sur le panneau Pilote.

**Critères** :
- T-05 : objet armé sans geste dans les 5 s → perdu.
- Le pickup réapparaît 15 s après ramassage.

---

### Task 8 — Lance-pierre (C-01)

**Objectif** : Implémenter le geste à 3 doigts et l'impact de la pierre.

**Dépend de** : Task 7

**Sous-tâches** :
- [x] Dans `GestureRecognizer` : détecter un cluster de 3 contacts actifs dont le centroïde est dans un rayon ≤ 150 px → envoyer `Slingshot(x, y)` (seulement si l'équipe a `itemArmed=true` avec `heldItem='slingshot'`).
- [x] Côté serveur : créer une `Stone { target, impactAt: now + stoneTelegraphS*1000, team }`.
- [x] Côté rendu : afficher un cercle rouge d'avertissement animé pendant `stoneTelegraphS`=0.8s au point cible, orienté vers le joueur adverse le plus proche.
- [x] À `impactAt` : tester si une voiture adverse est dans `stoneRadiusPx`=60px → appliquer −25 HP + `stunUntil = now + stunStoneS*1000`.
- [x] Retirer la pierre de l'état après impact.

**Critères** :
- T-06 : avertissement visible 0.8 s avant impact.
- Impact inflige −25 HP + étourdissement à la voiture adverse uniquement.

---

### Task 9 — Portail de boost (C-02)

**Objectif** : Implémenter le geste à 2 doigts et l'effet de boost continu.

**Dépend de** : Task 7

**Sous-tâches** :
- [x] Dans `GestureRecognizer` : détecter 2 contacts actifs écartés de 100 à 400 px → envoyer `BoostGate(a, b)` (si l'équipe a `itemArmed=true` avec `heldItem='boost'`).
- [x] Côté serveur : créer `BoostGate { a, b, expiresAt: now + boostGateLifeS*1000, team }`.
- [x] Afficher le segment jaune avec extrémités en anneau, semi-transparent pour l'équipe posant le boost.
- [x] Dans `PhysicsLoop` : détecter le franchissement du segment par la voiture alliée → appliquer `v *= (1 + boostGain * k)` pendant `boostDurationS`s, où `k = clamp(dist(a,b) / boostLenMaxPx, 0.3, 1.0)`.
- [x] Expirer le portail après `boostGateLifeS`.

**Critères** :
- T-07 : portail plus long → effet plus fort (vérifiable visuellement).

---

### Task 10 — Fantôme (C-03)

**Objectif** : Implémenter l'activation du mode fantôme depuis le panneau Copilote.

**Dépend de** : Task 6 (HUD)

**Sous-tâches** :
- [x] Ajouter le bouton Fantôme dans le panneau Copilote avec anneau de recharge.
- [x] Détecter le tap sur ce bouton dans `GestureRecognizer` → envoyer `Ability(team, kind='ghost')`.
- [x] Côté serveur : si cooldown écoulé, passer `ghostUntil = now + ghostS*1000`, démarrer cooldown `ghostCooldownS`.
- [x] Dans `PhysicsLoop` : si `ghostUntil > now`, ignorer les collisions avec murs, poteaux et arcs adverses.
- [x] Afficher la voiture semi-transparente / halo violet pendant le mode fantôme.
- [x] Afficher la progression du cooldown sur l'anneau du bouton.

**Critères** :
- T-08 : la voiture traverse les obstacles adverses pendant 3 s, puis recharge 20 s.

---

### Task 11 — Destruction de mur (C-04)

**Objectif** : Implémenter l'action de désactivation d'un mur adverse.

**Dépend de** : Task 6 (HUD)

**Sous-tâches** :
- [x] Ajouter le bouton Détruire Mur dans le panneau Copilote avec anneau de recharge.
- [x] Détecter le tap sur ce bouton → activer le mode « ciblage » pendant 3 s (feedback visuel sur la table).
- [x] En mode ciblage, détecter un toucher sur un segment de mur adverse → identifier le `wallId` le plus proche (rayon 40 px) → envoyer `Ability(team, kind='destroy', targetId=wallId)`.
- [x] Côté serveur : passer `wall.disabledUntil = now + destroyDisableS*1000`, démarrer cooldown.
- [x] Afficher le mur désactivé en pointillés gris.

**Critères** :
- Le mur ciblé est désactivé 10 s.
- Pas d'effet si aucun mur n'est touché dans les 3 s.

---

### Task 12 — Poteaux électriques tangibles via console Oz (C-05)

**Objectif** : Implémenter la gestion des poteaux depuis la console Magicien d'Oz.

**Dépend de** : Task 1

**Sous-tâches** :
- [x] Créer `client-oz/index.html` + `client-oz/main.ts`.
- [x] Créer `client-oz/OzMap.ts` : miniature de la piste cliquable (Canvas 400 px), clic → envoyer `TangibleMoved(id, x, y, angle)` (coordonnées normalisées 0–1).
- [x] Ajouter sélecteur d'id 1–4, slider d'angle (0–360°), bouton « Retirer » par poteau actif → envoyer `TangibleRemoved(id)`.
- [x] Côté serveur (`GameRules.ts`) : recevoir `TangibleMoved` → créer/mettre à jour `Wall(id, team, pos, angle, lengthPx=120)` ; si 2 poteaux de même équipe à ≤ `arcMaxDistPx`=500 px → créer `ArcElectric`, supprimer les deux `Wall`.
- [x] Recevoir `TangibleRemoved` → supprimer le mur/arc correspondant.
- [x] Dans `PhysicsLoop` : mur adverse → −10 HP + rebond + `invulnUntil` ; arc adverse → −10 HP + vitesse ×0.5 pendant 1.5s.
- [x] Afficher les murs (segments rouges) et arcs (segments jaunes animés) sur la table.
- [x] Vérifier R-09 : éléments de l'équipe non affectent pas sa propre voiture (semi-transparents pour elle).

**Critères** :
- T-03 : mur adverse → −10 HP + 1 s d'invulnérabilité.
- T-04 : deux poteaux alliés proches → arc électrique, −10 HP + ralentissement.
- T-10 : `TangibleMoved` opérateur = résultat identique à un vrai TUIO.

---

### Task 13 — Panneaux HUD complets et alertes

**Objectif** : Finaliser les 4 panneaux HUD et les alertes contextuelles.

**Dépend de** : Task 6, Task 7, Task 10, Task 11, Task 12

**Sous-tâches** :
- [x] Finaliser `client-table/HUD.ts` avec les 4 panneaux orientés vers leur bord de table.
- [x] Panneau Pilote : barre HP animée, icône objet en stock, pad de réparation.
- [x] Panneau Copilote : boutons Fantôme + Détruire avec anneaux de recharge SVG animés, pad de réparation, halo objet armé avec décompte.
- [x] Implémenter les alertes `Feedback` : pierre en approche → cercle rouge animé orienté vers le joueur adverse le plus proche ; véhicule hors d'usage → texte clignotant sur le panneau.
- [x] S'assurer que les panneaux ne recouvrent jamais la piste (R-22).

**Critères** :
- Les 4 coins sont lisibles depuis leur bord respectif.
- Les alertes s'affichent à l'endroit concerné (REQ-6.1.4).

---

### Task 14 — Reconnaissance des gestes (`GestureRecognizer`)

**Objectif** : Finaliser et consolider le module de reconnaissance des gestes multitouch.

**Dépend de** : Task 8, Task 9, Task 11

**Sous-tâches** :
- [x] Créer `client-table/GestureRecognizer.ts` unifié gérant le `Map<pointerId, contact>`.
- [x] Implémenter l'attribution d'équipe (R-03) : zone pad → équipe station ; geste libre → équipe armée ; si les deux armées → station la plus proche.
- [x] S'assurer que le budget est ≤ 10 points simultanés (rejeter les contacts au-delà de 10).
- [x] Éviter les faux positifs : un geste à 3 doigts ne doit pas déclencher simultanément un geste à 2 doigts.
- [ ] Tester manuellement avec 2 joueurs simultanés. *(à faire sur la vraie table — la reconnaissance a été vérifiée avec événements souris simulés via CDP, pas en multitouch réel)*

**Critères** :
- T-09 confirmé : les pads de réparation sont indépendants des gestes de jeu.
- Aucun message parasite envoyé au serveur.

---

## P2 — Finitions et expérimentation

### Task 15 — Console Oz : journal horodaté et rejeu

**Objectif** : Permettre l'enregistrement et le rejeu des sessions pour l'analyse.

**Dépend de** : Task 12

**Sous-tâches** :
- [x] Créer `client-oz/OzLog.ts` : écrire chaque événement émis dans un tableau `{ t, type, params }`.
- [x] Afficher le journal en temps réel dans la console (dernières 50 entrées, défilant).
- [x] Bouton « Export JSON » : télécharger le journal complet.
- [x] Bouton « Rejouer » : lire le journal exporté, réémettre les événements avec les délais originaux via `setTimeout`.
- [x] Côté serveur : stocker également un log complet de tous les `TangibleMoved`/`TangibleRemoved` avec horodatage.

**Critères** :
- T-11 : un journal exporté, rechargé et rejoué, produit la même séquence de `State` côté serveur.

---

### Task 16 — Élargir la piste (C-07)

**Objectif** : Permettre au Copilote d'élargir localement la piste.

**Dépend de** : Task 4, Task 5

**Sous-tâches** :
- [x] Dans `GestureRecognizer` : détecter un doigt posé sur un bord de piste (distance < 20 px du bord) tiré vers l'extérieur de 20 à 60 px → envoyer `BorderPull(x, y, dx, dy)`.
- [x] Côté serveur : modifier localement `TrackGeometry.widths` sur les 5 points les plus proches, recalculer les colliders.
- [x] Démarrer cooldown `borderPull` = 20 s après utilisation.
- [x] Afficher l'élargissement (bord s'écarte visuellement).
- [x] Ajouter un bouton de secours dans la console Oz pour déclencher un élargissement.

**Critères** :
- Le bord de piste s'élargit localement après le geste.
- Le cooldown empêche un usage abusif.

---

### Task 17 — Effets néon, sons et polish

**Objectif** : Finaliser l'aspect visuel et ajouter un retour sonore minimal.

**Dépend de** : toutes les tâches P0 et P1

**Sous-tâches** :
- [x] Affiner les effets néon (shadowBlur groupés par couleur pour la performance).
- [x] Ajouter des particules ou flash à l'impact d'une pierre.
- [x] Ajouter un flash à la désactivation d'un mur.
- [x] Implémenter des sons Web Audio API minimalistes : impact pierre, activation fantôme, boost, réparation terminée.
- [ ] S'assurer que le canvas tient 60 fps sur la table réelle (profiler et optimiser si nécessaire ; fallback rendu 1080p upscalé).
- [x] Revoir l'écran `RESULT` : affichage du vainqueur, bouton nouvelle partie.

**Critères** :
- 60 fps sur Chrome/Windows avec 2 voitures + tous les effets actifs.
- Retour sonore présent pour les interactions majeures.

---

### Task 18 — Tests d'acceptation et mesures de latence

**Objectif** : Valider tous les critères T-01 à T-11 et mesurer les seuils techniques.

**Dépend de** : toutes les tâches

> État : les critères T-01, T-03 à T-11 sont couverts par `npm run test:acceptance` (côté serveur). T-02, les mesures de latence et la palm rejection exigent la table et des joueurs réels : voir `measures.md` (outils d'instrumentation prêts : overlay `?debug=1`, Ping/Pong, test de réaction Oz).

**Sous-tâches** :
- [ ] Vérifier T-01 à T-11 avec au moins 2 joueurs réels sur la table.
- [ ] Mesurer la latence doigt→rendu (objectif < 50 ms) avec `PointerEvent.timeStamp` vs `performance.now()` dans le Renderer.
- [ ] Mesurer la latence smartphone→rendu (objectif < 80 ms).
- [ ] Tester le budget tactile : valider que 10 contacts simultanés ne causent pas de crashs.
- [ ] Tester la palm rejection (bras posés sur la table pendant la réparation).
- [ ] Mesurer et déclarer la latence de réaction de l'opérateur Oz (R-16).
- [ ] Documenter les résultats dans `AGENTS.md` ou un fichier `measures.md`.

**Critères** :
- Tous les critères T-xx sont validés.
- Les seuils de latence sont mesurés et documentés.

---

## Récapitulatif des priorités

| Tâche | Priorité | Dépend de |
|---|---|---|
| Task 1 — Serveur Node.js + WS | P0 | — |
| Task 2 — MapGenerator | P0 | 1 |
| Task 3 — App Pilote smartphone | P0 | 1 |
| Task 4 — Rendu piste | P0 | 2 |
| Task 5 — Physique véhicule + HP | P0 | 1, 2 |
| Task 6 — Réparation synchrone | P0 | 4, 5 |
| Task 7 — Pickups + armement | P1 | 5 |
| Task 8 — Lance-pierre | P1 | 7 |
| Task 9 — Portail de boost | P1 | 7 |
| Task 10 — Fantôme | P1 | 6 |
| Task 11 — Destruction de mur | P1 | 6 |
| Task 12 — Poteaux / console Oz | P1 | 1 |
| Task 13 — HUD complets + alertes | P1 | 6, 7, 10, 11, 12 |
| Task 14 — GestureRecognizer unifié | P1 | 8, 9, 11 |
| Task 15 — Journal Oz + rejeu | P2 | 12 |
| Task 16 — Élargir la piste | P2 | 4, 5 |
| Task 17 — Effets + sons + polish | P2 | toutes P0+P1 |
| Task 18 — Tests + mesures | P2 | toutes |
