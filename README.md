# Crashout Circuit

Jeu de course asymétrique pour grande table multitouch. Tout se joue sur la table, sans smartphone. Deux équipes (pilote + copilote) : le pilote conduit avec un joystick tactile dans son panneau de coin, le copilote transforme la piste et gêne l'équipe adverse. Voir `.kiro/specs/crashout-circuit/` pour les spécifications.

## Prérequis

- Node.js ≥ 20
- Un navigateur Chromium (Chrome / Edge) pour la table

## Installation

```bash
npm install
```

## Lancer l'application

### Mode normal (recommandé)

```bash
npm run build
npm start
```

Le serveur écoute sur le port 3000 (`PORT=4000 npm start` pour en changer). Il sert la table et la console Oz.

| Client | URL |
|---|---|
| Table (plein écran, F11) | `http://localhost:3000/` |
| Console Magicien d'Oz (tablette) | `http://<ip-du-pc>:3000/oz` |

La console Oz doit être sur le même réseau local que le PC qui fait tourner le serveur.

### Mode développement

```bash
npm run build:server   # une première fois, le serveur tourne depuis dist/
npm run dev            # serveur (rechargement auto) + Vite sur http://localhost:5173
```

En dev, ouvrir la table sur `http://localhost:5173/client-table/`, Oz sur `/client-oz/` ; Vite relaie le WebSocket vers le port 3000. Après une modification du code serveur, relancer `npm run build:server`.

## Déroulement d'une partie

1. **LOBBY** : la table affiche « COMMENCER » ; un toucher lance la partie.
2. **MAP** (30 s) : chaque copilote relie ses deux points imposés au doigt ; les deux tracés sont fusionnés en circuit. Sans tracé valide, un circuit de secours est utilisé.
3. **RACE** : compte à rebours, 3 tours ou 5 minutes. Le pilote conduit avec le **joystick** de son panneau (haut/bas = accélérer/reculer, gauche/droite = tourner) ; le bouton **UTILISER** arme l'objet ramassé, puis le copilote exécute le geste.
4. **RESULT** : classement, bouton « Nouvelle partie ».

La console Oz simule les poteaux tangibles (clic sur la miniature) et propose des actions de secours (obstacle, boost, panne, élargir, circuit de secours).

## Activer un objet

1. Le pilote roule sur un pickup (icône sur la piste) : l'objet apparaît dans le bouton rond de son panneau.
2. Il touche **UTILISER** : l'objet est armé pendant 5 s (halo doré sur le panneau du copilote).
3. Le copilote fait le geste dans ces 5 s : **3 doigts rapprochés** (≤ 150 px) = lance-pierre, **2 doigts écartés** de 100 à 400 px = portail de boost.

### Tester sur PC (sans multitouch)

Avec une souris, la barre en bas de la table affiche deux boutons (ou `?sim=1` pour les forcer) :

- **✋ Simuler 3 doigts** puis un clic sur la table : lance-pierre à cet endroit.
- **✌ Simuler 2 doigts** puis deux clics (100–400 px d'écart) : portail de boost.

L'objet doit d'abord être armé (étape 2). Pour ne pas rouler jusqu'à un pickup, la console Oz (`/oz`) a les boutons **+ Lance-pierre** / **+ Boost** (équipe choisie en haut) qui placent l'objet dans le stock.

## Tests et outils

```bash
npm run test:acceptance   # règles serveur et générateur de piste (T-01, T-03 à T-11)
npm run typecheck         # vérification TypeScript des clients
```

- Overlay de performance sur la table : `http://localhost:3000/?debug=1` (ou touche **D**) — fps, RTT, latence tactile.
- Journal des poteaux côté serveur : `GET /api/oz-log`.
- Procédure de mesure sur la table réelle : `measures.md`.

## Configuration

Tous les paramètres de jeu (vitesses, dégâts, durées…) sont dans `config.json` ; ils sont lus au démarrage du serveur, sans recompilation. Relancer `npm start` après modification.

## Structure

```
server/          serveur Node.js autoritaire (WebSocket, physique 60 Hz, règles, génération de piste)
client-table/    rendu Canvas, HUD (joystick pilote, boutons copilote), reconnaissance des gestes
client-oz/       console Magicien d'Oz
client-shared/   connexion WebSocket et synchronisation d'état partagées
scripts/         tests d'acceptation
prototypes/      prototype de recherche « piste vivante » (historique, à ne pas modifier)
```
