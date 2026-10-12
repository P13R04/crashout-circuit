# Crashout Circuit

Jeu de course asymétrique pour grande table multitouch. Tout se joue sur la table, sans smartphone. Deux équipes (pilote + copilote) : le pilote conduit depuis son poste fixe avec deux commandes directionnelles et le copilote transforme la piste ou gêne l'équipe adverse. Voir `.kiro/specs/crashout-circuit/` pour les spécifications.

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

1. **LOBBY** : choisir **Jouer sur table** (deux contacts simultanés) ou **Mode PC · séquentiel** (clics et demi-tracés successifs).
2. **MAP** : deux contacts communs définissent une ligne qui partage la table. Chaque copilote part de son point, dessine sa moitié sans traverser la ligne, et rejoint le point opposé. Une fois les deux traits acceptés, les joueurs touchent **GÉNÉRER LE CIRCUIT**. Il n'y a pas de passage automatique.
3. **PRÊT** : le circuit généré est affiché et les joueurs touchent **LANCER LA COURSE** lorsqu'ils sont en place.
4. **RACE** : compte à rebours, 3 tours ou 5 minutes. Le bouton central **PILOTAGE** alterne entre **AUTO** (avance continue) et **PÉDALE** (chaque pilote maintient sa pédale pour accélérer, puis ralentit jusqu'à l'arrêt). La bande de direction et **UTILISER** restent disponibles dans les deux modes. Quitter le ruban de piste est une chute : la voiture est hors d'usage jusqu'à la réparation synchronisée.
5. **PAUSE** : le bouton central, Échap ou Espace fige la course et ses compteurs.
6. **RESULT** : classement, bouton « Nouvelle partie ».

La console Oz simule les poteaux tangibles (clic sur la miniature) et propose des actions de secours (obstacle, boost, panne, déformation locale, circuit de secours).

## Activer un objet

1. Le pilote roule sur un pickup (icône sur la piste) : l'objet apparaît dans le bouton rond de son panneau.
2. Il touche **UTILISER** : l'objet est armé pendant 5 s (halo doré sur le panneau du copilote).
3. Le copilote fait le geste dans ces 5 s :
   - **Lance-pierre** : pose **3 doigts** rapprochés (≤ 150 px). Deux doigts forment la fourche ; **tire le troisième vers l'arrière** puis relâche. La pierre part à l'opposé de la traction et va d'autant plus loin que l'élastique est tendu (jauge en %, aperçu de la trajectoire et de la zone d'impact). Une traction trop courte annule le tir sans perdre l'objet.
   - **Portail de boost** : **2 doigts écartés** de 100 à 400 px.

### Tester sur PC (sans multitouch)

Avec une souris, la barre en bas de la table affiche deux boutons (ou `?sim=1` pour les forcer) :

- **🏹 Simuler lance-pierre** puis **clic maintenu sur la fourche, glisser en arrière, relâcher** : la pierre part à l'opposé du glissement (la fourche virtuelle est dessinée de part et d'autre du point de clic).
- **✌ Simuler 2 doigts** puis deux clics (100–400 px d'écart) : portail de boost.

En **Mode PC · séquentiel**, le bouton n'est pas nécessaire pour le lance-pierre : dès qu'il est armé, un simple clic maintenu + glissé + relâché sur la table tire.

### Boutons de test (Mode PC uniquement)

Dans **Mode PC · séquentiel**, une barre orange « TEST (PC) » apparaît au-dessus de la barre de simulation. Le serveur ignore ces commandes dans les autres modes.

- **🛡 Véhicules invincibles** : les deux voitures ne subissent plus aucun effet (dégâts, étourdissement, ralentissement). Une sortie de piste remet simplement la voiture au dernier checkpoint, sans panne.
- **🎁 Tous les objets utilisables** : les deux équipes ont en permanence un objet armé, utilisable pour les deux gestes (lance-pierre et portail de boost) sans ramasser de pickup et sans limite d'usage. Les recharges du fantôme, de la destruction de mur et de l'élargissement sont ignorées.

Les deux boutons sont des interrupteurs (orange = actif) et sont remis à zéro à la fin de la partie.

L'objet doit d'abord être armé (étape 2). Pour ne pas rouler jusqu'à un pickup, la console Oz (`/oz`) a les boutons **+ Lance-pierre** / **+ Boost** (équipe choisie en haut) qui placent l'objet dans le stock.

### Déformer un bord de piste

Deux doigts sont posés près du **même bord**, à moins de 130 px l’un de l’autre, puis glissent ensemble vers l’extérieur. La piste ne s’élargit pas : sa ligne centrale se décale localement et les deux bords suivent, ce qui forme une double chicane temporaire. Une nouvelle déformation peut commencer immédiatement ; la précédente revient progressivement à sa forme de référence. Les paramètres de durée et d’amplitude sont dans `config.json` (`trackDeform*`).

### Clavier pour une partie locale à deux pilotes

| Équipe | Direction | Activer l'objet | Réparation synchronisée |
|---|---|---|---|
| Cyan (A) | `Q` / `D` | `Z` en mode PÉDALE | `A` | maintenir `A` + `P` |
| Rose (B) | `←` / `→` | `↑` en mode PÉDALE | `M` | maintenir `M` + `C` |

`A` ou `M` seuls activent l'objet. Lorsque les deux touches de réparation sont maintenues, le prototype simule les deux appuis synchrones des postes pilote et copilote.

En mode PC, cliquez d’abord les deux extrémités de la séparation, puis dessinez une moitié après l’autre. Le départ et la fin d’un tracé sont validés dans le grand cercle lumineux : relâcher à l’intérieur suffit, le point est recalé automatiquement sur l’ancre exacte.

## Tests et outils

```bash
npm run test:acceptance   # règles serveur et générateur de piste (T-01, T-03 à T-11)
npm run typecheck         # vérification TypeScript des clients
```

- Overlay de performance sur la table : `http://localhost:3000/?debug=1` (ou touche **F3**) — fps, RTT, latence tactile.
- Journal des poteaux côté serveur : `GET /api/oz-log`.
- Procédure de mesure sur la table réelle : `measures.md`.

## Configuration

Tous les paramètres de jeu (vitesses, dégâts, durées…) sont dans `config.json` ; ils sont lus au démarrage du serveur, sans recompilation. Relancer `npm start` après modification.

## Structure

```
server/          serveur Node.js autoritaire (WebSocket, physique 60 Hz, règles, génération de piste)
client-table/    rendu Canvas, HUD (direction pilote, boutons copilote), reconnaissance des gestes
client-oz/       console Magicien d'Oz
client-shared/   connexion WebSocket et synchronisation d'état partagées
scripts/         tests d'acceptation
prototypes/      prototype de recherche « piste vivante » (historique, à ne pas modifier)
```
