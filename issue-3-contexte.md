# Contexte de l'issue #3 — Circuit

> Note de passation pour reprendre le travail dans une autre conversation.

## Dépôt et branche

- **Dépôt :** `P13R04/crashout-circuit` (compte `gh` actif : `QuentinELLEON`).
- **Branche :** `3-circuit-le-circuit-prédéfini-remplace-le-dessin-des-joueurs-et-plusieurs-refus-sont-silencieux`.
- **Base :** commit de ba-giacchero `5d3b31e` « push creation circuit pareillement corrigée » (ligne de partage, ancres P1/P2, union directe des deux demi-tracés).
- **Travail de cette conversation :** **non commité**, dans l'arbre de travail de cette branche.

## Ce que dit l'issue #3

Titre : « Circuit : le circuit prédéfini remplace le dessin des joueurs et plusieurs refus sont silencieux » — labels `bug`, `circuit`.

1. ~1/3 des tracés valides retombaient sur le circuit prédéfini (règle « amplitude ≥ 150 px » absente de l'autofill).
2. La ligne de partage était refusée sans retour visuel (< 360 px ou hors zone).
3. Deux contacts successifs suffisaient pour la ligne de partage ; un contact isolé restait en attente.

## Ce qui a été fait

### Rendu (`client-table/Renderer.ts`, `GestureRecognizer.ts`, `view.ts`)

- **Surface de piste (`paintTrack`)** : dessinée comme la physique la calcule, soit une chaîne de traits à bouts ronds (union de disques) à moins de la demi-largeur locale de la ligne centrale.
  - Les murs sont la bande autour de cette surface : magenta à l'extérieur, cyan côté infield, glow à deux flous.
  - Ligne de départ en damier.
- **Boutons** « Fermer le circuit » / « Lancer la course » : hors du circuit, en bas de table, dupliqués en haut (retournés de 180°) via `drawTwinButton` / `hitTwinButton`. Le voile sombre de la phase READY est supprimé.
- **Bug des traits** : indexés par une clé unique (`strokeKey`) ; la souris réutilise le même `pointerId`, ce qui faisait disparaître le premier demi-tracé.
- **Zones réservées** : dessinées en pointillés rouges en phase MAP ; un trait qui y entre devient rouge.

### Génération (`server/MapGenerator.ts`)

Le circuit **est** le dessin :

1. `closedFromHalves` — A (P1→P2) et B (P2→P1) accrochés exactement sur les deux ancres.
2. `smoothedRing` — rééchantillonnage à 4 px, lissage gaussien sans retard (σ = 9 px), 256 points. Le filtre 1€ (qui décale) et le `relax` (qui rétrécit) ne sont plus utilisés sur ce chemin.
3. `limitCurvature` — arrondi **local** par raccords de Bézier (`filletSharpCorners`) pour les rayons < 57 px (1,15 × 50), puis lissage gaussien de secours borné par une garde d'aire.
4. `limitWidthsByClearance` — voies rétrécies là où deux parties du tracé se rapprochent (largeur ≥ 90 px).
5. `faithfulTrack` — si la boucle est invalide : élargissement progressif du petit axe (1 → 3,6), puis ancien mélange miroir A/B, puis circuit prédéfini.
6. `placeFeatures` — ligne de départ posée sur P1.

### Zones interdites (`server/layout.ts`, partagé serveur/client)

- `isBlocked(p, margin = CIRCUIT_MARGIN = 95)` : bord de table, panneaux joueur, boutons centraux (haut et bas, `CENTER_BUTTON`).
- `GameRules.onMapDivider` refuse une ancre bloquée (feedback `dividerRejected`).
- `GameRules.onStrokeDraw` refuse un trait qui entre dans une zone (`mapError`).
- Le client affiche un message pour une ancre refusée (côté client ou serveur).
- `fitToFreeArea` n'est plus qu'un filet de sécurité (réduction uniforme) ; il remplace l'ancien `PLAY_AREA` de 480 px de haut.

### Résultats mesurés (400 parties synthétiques valides)

| | Avant | Après |
|---|---|---|
| Circuit construit sur le dessin | ~20 % | ~99 % |
| Circuit prédéfini | ~34 % | ~1 % |
| Écart moyen dessin → circuit | 72 à 95 px | ~8 px (~18 px pour un dessin très fin) |
| Rapport d'aire circuit / dessin | ×1,4 à ×1,5 | ×0,96 |

### Tests et documentation

- `scripts/acceptance.ts` : **31 tests passent**.
  - T-01 vérifie que les bords ne passent pas dans un panneau (au lieu d'une bande 215–865 px).
  - Nouveau : « le circuit EST le dessin » (écart moyen, aire, ancres conservées).
  - Nouveau : refus des traits et ancres en zone réservée.
- `context.md` §5.2 décrit le nouvel algorithme.
- `tsc` propre (client et serveur).

## Fichiers modifiés (non commités)

`client-table/GestureRecognizer.ts`, `client-table/Renderer.ts`, `client-table/main.ts`, `client-table/view.ts`, `scripts/acceptance.ts`, `server/GameRules.ts`, `server/MapGenerator.ts`, `server/layout.ts`, `context.md`.

## Restant par rapport à l'issue #3

| Point | État |
|---|---|
| Message « circuit prédéfini utilisé » | **Non fait** — rien n'avertit si la génération retombe sur le prédéfini (~1 %) |
| Contact isolé qui expire | **Non fait** — `view.pendingDivider` reste indéfiniment en attente |
| Ligne de partage < 120 px | Le client l'empêche déjà (message de ba-giacchero) ; le serveur l'ignore en silence si le client est contourné |
| Contacts simultanés en mode table | **Non exigés** |
| Test sur la vraie table | **Non fait** — uniquement Chrome headless + événements souris/CDP |

## Limites connues

- Une pointe aiguë est reculée par le fillet de `r·(1/sin(θ/2) − 1)`, soit ~110 px pour un haricot de ~40° : nécessaire pour être roulable, mais les extrémités sont arrondies.
- Un dessin plus fin que deux voies est élargi (déformation visible, écart moyen ~18 px).
- Les mesures utilisent des tracés synthétiques (arcs avec ondulation) ; de vrais tracés à la main peuvent varier.

## Rapport avec les autres branches et issues

- **Branche #4 (lance-pierre)** : contient le lance-pierre à élastique, les boutons de test PC (invincibilité / objets illimités), l'effet « POW », `dmgStone = 100`. Elle est **séparée** de celle-ci.
- **Conflits probables à la fusion** : `Renderer.ts`, `GestureRecognizer.ts`, `GameRules.ts`, `types.ts`, `acceptance.ts`.
- **Barre de test (branche 4)** : `#testbar` est à 52 px du bas ; le bouton central est à y = 884–964 (coordonnées logiques) — à vérifier visuellement après fusion.
- **Autres issues** : #2 contrôles · #5/#6/#7 thème Oz (murs, arc électrique, autres) · #8 positions aléatoires des objets · #9 élargissement temporaire non cumulable · #10 sortie de course.

## Pour reprendre

- **Lancer :** `npm run build && npm start`, ouvrir `/` et choisir « Mode PC ».
- **Tests :** `npx tsx scripts/acceptance.ts` (31 attendus).
- **Piège Windows :** des processus `node` fantômes occupent le port 3000 et faussent les tests navigateur : `taskkill //F //IM node.exe` avant chaque essai.
- **Consignes du projet :** `AGENTS.md` (ne pas modifier `prototypes/`) ; décisions de conception dans `context.md`.
