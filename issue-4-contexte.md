# Contexte de l'issue #4 — Lance-pierre

> Note de passation pour reprendre le travail dans une autre conversation.

## Dépôt et branche

- **Dépôt :** `P13R04/crashout-circuit` (compte `gh` actif : `QuentinELLEON`).
- **Branche :** `4-lance-pierre-remplacer-la-frappe-instantanée-ogive-par-un-vrai-tir-à-lélastique`.
- **Base :** `main` (merge de la PR #1, `201cde1`).
- **État des changements :** tout le travail ci-dessous a été fait sur cette branche. Je ne sais pas s'il a été commité depuis : à vérifier avec `git status` / `git log` sur la branche.
- **Rapport avec la branche #3 (circuit) :** elles sont **indépendantes**. La branche 3 n'a ni le lance-pierre, ni les boutons de test, ni l'effet « POW ».

## Ce que dit l'issue #4

Titre : « Lance-pierre : remplacer la frappe instantanée (ogive) par un vrai tir à l'élastique » — labels `feature`, `bonus`.

- **Avant :** 3 doigts groupés (≤ 150 px) désignaient un point ; 0,8 s plus tard, impact instantané (rayon 60 px). Aucun projectile ni élastique : effet « ogive ». Icône en viseur.
- **Référence prévue :** scène « 04 · Lance-pierre » de `prototypes/piste-vivante/README.md` : deux appuis servent de base, un troisième est tiré en arrière, un projectile visible part.
- **Questions ouvertes de l'issue** (jamais tranchées par l'équipe, j'ai pris des défauts) :
  - Projectile guidé (comme dans le prototype) ou balistique ?
  - Part-il de la poche ou de la station du copilote ?
  - Garde-t-on l'avertissement de 0,8 s ?

## Le mécanisme implémenté

### Geste (table, `client-table/GestureRecognizer.ts`)

1. Le pilote **arme** l'objet (bouton UTILISER, 5 s).
2. Le copilote pose **3 doigts** dont les positions de départ tiennent dans 150 px autour de leur centroïde (`SLING_CLUSTER_PX`).
3. Le doigt qui s'éloigne de plus de 14 px (`SLING_ROLE_MIN_PX`) pendant que les deux autres bougent moins de 60 % de ce déplacement devient la **poche** ; il le reste. Les deux autres forment la **fourche**.
4. L'élastique est tracé entre les trois contacts, avec aperçu de la trajectoire, de la zone d'impact et jauge en %.
5. Le **premier doigt levé** déclenche le tir (les doigts se lèvent rarement dans un ordre propre). Une traction trop courte annule sans consommer l'objet. On annule en ramenant la poche près de la fourche.
6. Les contacts du lance-pierre sont marqués consommés : ils ne déclenchent pas d'autre geste (boost, élargissement de bord).
7. L'ancien « 3 doigts statiques = frappe instantanée » **n'existe plus**.

### Calcul du tir (`server/geometry.ts` → `slingshotShot`, partagé serveur + aperçu client)

- **Direction :** de la poche **à travers** le milieu de la fourche, donc à l'opposé de la traction.
- **Portée au-delà de la fourche :** linéaire en la traction, de 220 px (traction 40 px, minimum) à 900 px (traction 260 px, maximum).
- **Point d'atterrissage :** ramené dans la table (0..1920 × 0..1080).
- **Traction < 40 px :** tir invalide, item non consommé.

### Côté serveur (`server/GameRules.ts`)

- `onSlingshot(msg)` valide le tir, résout l'équipe armée, consomme l'objet, crée la pierre :
  `Stone { id, from (poche), target, launchedAt, impactAt = now + 0,8 s, team }`.
- `updateStones` : à l'impact, la voiture adverse dans `stoneRadiusPx` (60 px) subit `dmgStone` + étourdissement `stunStoneS` (1 s). Émet le feedback `stoneImpact` (toujours) et `stoneHit` (voiture touchée).
- Message : `Slingshot { anchor: Vec2 (milieu de la fourche), pouch: Vec2, team? }`.

### Dégâts

`dmgStone` passe de 25 à **100** (`config.json` + valeurs par défaut) : une pierre met une voiture pleine santé hors d'usage (il faut la réparation synchrone).

### Paramètres (`config.json`, exposés aux clients dans `GameState.params`)

`slingMinPullPx` 40 · `slingMaxPullPx` 260 · `slingMinRangePx` 220 · `slingMaxRangePx` 900 · `stoneRadiusPx` 60 · `stoneTelegraphS` 0,8 · `stunStoneS` 1 · `dmgStone` 100.

## Rendu

- **`Renderer.drawSling`** : aperçu pendant le geste (élastique de la couleur chauffant du jaune au rouge selon la traction, ligne de vol pointillée, cercle d'atterrissage rouge, pourcentage de puissance orienté vers le joueur de l'équipe).
- **`Renderer.drawProjectile`** : la pierre en vol (disque lumineux, traînée de comète, ombre au sol, légère élévation parabolique).
- **`Renderer.drawStones`** : cercle rouge d'avertissement avec anneau qui se referme et libellé « ⚠ PIERRE » orienté vers le joueur adverse le plus proche.
- **`HUD.drawItemIcon`** : icône en fourche (Y avec élastique et pierre) à la place du viseur, sur les pickups et le panneau du pilote.
- **Effet « touché »** (`Renderer.drawEffects`, cas `stoneHit`) : bulle de BD étoilée jaune/rouge avec rebond et tremblement. Le mot est tiré au hasard dans `HIT_WORDS` (`TOUCHÉ !`, `POW !`, `BAM !`, `BOUM !`, `AÏE !`, `KO !`) dans `client-table/main.ts`. Orientée vers le joueur touché, avec une légère inclinaison aléatoire. Son associé dans `Sound.ts`.

## Version PC (sans écran tactile)

- **Bouton « 🏹 Simuler lance-pierre (clic + tirer + relâcher) »** : clic maintenu sur la fourche, glisser en arrière, relâcher. Une fourche virtuelle de ±38 px est dessinée de part et d'autre de l'axe de traction.
- **En « Mode PC · séquentiel »** (`state.mapMode === 'pc'`) : plus besoin du bouton. Dès qu'un lance-pierre est armé, un simple clic maintenu + glissé + relâché tire.
- **Bouton « Simuler 2 doigts (boost) »** : inchangé (deux clics).
- **Console Oz (`/oz`)** : boutons « + Lance-pierre » / « + Boost » pour placer l'objet dans le stock sans rouler jusqu'à un pickup.

## Boutons de test (Mode PC uniquement)

Barre orange « TEST (PC) » (`#testbar` dans `client-table/index.html`). Le serveur ignore `TestToggle` si `state.mapMode !== 'pc'`. Remis à zéro dans `resetToLobby`.

| Bouton | Effet |
|---|---|
| 🛡 Véhicules invincibles | Ni dégâts (mur, arc, pierre), ni étourdissement, ni ralentissement. Une sortie de piste remet la voiture au dernier checkpoint sans panne. |
| 🎁 Tous les objets utilisables | À chaque tick (`expire()`), les deux équipes ont un objet armé (`heldItem ??= 'slingshot'`), valable pour les deux gestes, sans pickup ni limite d'usage. Les recharges fantôme / destruction / élargissement sont ignorées. À la désactivation, plus rien n'est armé. |

État : `GameState.testMode { invincible, allItems }`. Message : `TestToggle { flag, on }`.

## Fichiers touchés

- **Serveur :** `server/GameRules.ts` (`onSlingshot`, `updateStones`, `onTestToggle`, `damage`, `fallOffTrack`, `expire`, `resolveArmedTeam`), `server/geometry.ts` (`slingshotShot`), `server/types.ts` (`Stone`, `SlingshotMsg`, `GameParams`, `TestToggleMsg`, `testMode`), `server/config.ts`, `server/GameServer.ts`, `config.json`.
- **Table :** `client-table/GestureRecognizer.ts` (`updateSling`, `releaseSling`, `updateSimSling`, `releaseSimSling`, `simulate`), `Renderer.ts`, `HUD.ts`, `view.ts` (`SlingPreview`, `Effect.text/tilt`), `main.ts`, `Sound.ts`, `index.html`.
- **Console Oz :** `client-oz/main.ts` (boutons « + Lance-pierre » / « + Boost », `giveItem`).
- **Tests :** `scripts/acceptance.ts`.
- **Documentation :** `README.md` (« Activer un objet », « Tester sur PC », « Boutons de test »), `context.md` (C-01, T-06, R-08, tableau des paramètres), `.kiro/specs/crashout-circuit/requirements.md` (REQ-3.3.2, REQ-4.2.1, REQ-4.2.3), `measures.md` (T-06).

## Tests

- **35 tests d'acceptation passaient** sur cette branche (T-06 réécrit : pierre visible, impact 0,8 s, voiture hors d'usage, feedback `stoneHit`).
- **Tests ajoutés :**
  - traction trop courte → ignorée, objet toujours armé ;
  - direction opposée à la traction et portée croissante ;
  - atterrissage borné à la table ;
  - interrupteurs de test ignorés hors mode PC ;
  - invincibilité (mur, pierre, chute) ;
  - tous objets (réarmement, boost avec un objet « lance-pierre », pas de recharge).
- **Vérifié en navigateur :** Chrome headless piloté par CDP : souris (mode PC) et vrais événements tactiles à 3 doigts (`Input.dispatchTouchEvent`).
- **Lancer :** `npx tsx scripts/acceptance.ts`.

## Choix par défaut et limites

- **Projectile balistique, pas guidé :** le cercle rouge reste affiché pendant tout le vol pour permettre l'esquive ; le temps de vol est fixé à `stoneTelegraphS` (0,8 s), donc la vitesse varie avec la distance.
- **Départ de la poche**, pas de la station du copilote.
- **Premier doigt levé = tir**, quel que soit son rôle.
- **Atterrissage contre un bord :** le point est ramené sur le bord de la table et peut se retrouver sous un panneau.
- **Seuils à régler en jouant** (jamais testés sur la vraie table, ni en multitouch réel hors CDP) : 14 px pour désigner la poche, 40 px de traction minimale, 150 px de cluster initial.
- **`dmgStone = 100`** : un coup tue ; rien ne limite encore la fréquence (un pickup toutes les 15 s).

## Rapport avec les autres branches et issues

- **Branche #3 (circuit) :** indépendante. Conflits probables à la fusion : `Renderer.ts`, `GestureRecognizer.ts`, `GameRules.ts`, `types.ts`, `acceptance.ts`, `view.ts`.
- **Barre de test PC :** `#testbar` est à `bottom: 52px`, `left: 54%`. Sur la branche #3, le bouton central « Fermer le circuit » / « Lancer la course » est à y = 884–964 (coordonnées logiques) : vérifier visuellement après fusion.
- **Autres issues :** #2 contrôles · #5/#6/#7 thème Oz (murs, arc électrique, autres) · #8 positions aléatoires des objets · #9 élargissement temporaire non cumulable · #10 sortie de course.

## Pour reprendre

- **Lancer :** `npm run build && npm start`, ouvrir `/`, choisir « Mode PC », rouler sur un pickup (ou utiliser la console Oz) puis UTILISER et tirer.
- **Piège Windows :** des processus `node` fantômes occupent le port 3000 et faussent les tests navigateur : `taskkill //F //IM node.exe` avant chaque essai.
- **Consignes du projet :** `AGENTS.md` (ne pas modifier `prototypes/`) ; décisions de conception dans `context.md`.
