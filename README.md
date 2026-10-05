# Crashout Circuit

Jeu de course asymétrique pour grande table multitouch. Deux équipes (pilote + copilote) : le pilote conduit depuis son poste, le copilote transforme la piste et gêne l'équipe adverse. Voir `.kiro/specs/crashout-circuit/` pour les spécifications.

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

Le serveur écoute sur le port 3000 (`PORT=4000 npm start` pour en changer). Il sert les trois clients et affiche dans le terminal les URL réseau et les QR codes des pilotes.

| Client | URL |
|---|---|
| Table (plein écran, F11) | `http://localhost:3000/` |
| Pilote équipe A / B | `http://<ip-du-pc>:3000/pilot?team=A` / `?team=B` |
| Console Magicien d'Oz (tablette) | `http://<ip-du-pc>:3000/oz` |

Les appareils doivent être sur le même réseau local que le PC qui fait tourner le serveur.

### Mode développement

```bash
npm run build:server   # une première fois, le serveur tourne depuis dist/
npm run dev            # serveur (rechargement auto) + Vite sur http://localhost:5173
```

En dev, ouvrir la table sur `http://localhost:5173/client-table/`, Oz sur `/client-oz/` ; Vite relaie le WebSocket vers le port 3000. Après une modification du code serveur, relancer `npm run build:server`.

## Déroulement d'une partie

1. **LOBBY** : la table affiche les QR codes. La partie passe à la phase suivante quand la table et les deux pilotes sont connectés.
2. **MAP** (30 s) : chaque copilote relie ses deux points imposés au doigt ; les deux tracés sont fusionnés en circuit. Sans tracé valide, un circuit de secours est utilisé.
3. **RACE** : compte à rebours, 3 tours ou 5 minutes.
4. **RESULT** : classement, bouton « Nouvelle partie ».

La console Oz simule les poteaux tangibles (clic sur la miniature) et propose des actions de secours (obstacle, boost, panne, élargir, circuit de secours).

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
client-table/    rendu Canvas, HUD, reconnaissance des gestes
client-pilot/    application smartphone du pilote (contrôles non implémentés à ce stade)
client-oz/       console Magicien d'Oz
client-shared/   connexion WebSocket et synchronisation d'état partagées
scripts/         tests d'acceptation
prototypes/      prototype de recherche « piste vivante » (historique, à ne pas modifier)
```

L'application pilote (Task 3) n'est pas encore faite : les pilotes se connectent mais n'ont pas encore de contrôles.
