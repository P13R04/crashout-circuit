# Design — Crashout Circuit

## Architecture globale

```
┌─────────────────────────────────────────────────────────────────┐
│  Table iiyama 65" (navigateur Chromium plein écran)             │
│  • Rendu Canvas 2D 1920×1080 (×2 pour 4K)                       │
│  • Reconnaissance des gestes (Pointer Events API)               │
│  • Envoi messages sémantiques → serveur                         │
└────────────────────┬────────────────────────────────────────────┘
                     │ WebSocket
┌────────────────────▼────────────────────────────────────────────┐
│  Serveur Node.js  (autoritaire)                                  │
│  • Boucle physique 60 Hz                                         │
│  • Diffusion état 30 Hz  →  State { tick, voitures, murs, … }   │
│  • Gestion des phases LOBBY / MAP / RACE / RESULT               │
│  • Bus d'événements interne                                      │
└────┬──────────────────────┬─────────────────────────────────────┘
     │ WebSocket            │ WebSocket
┌────▼────────┐     ┌───────▼──────────────────────────────────┐
│ App Pilote  │     │ Console Magicien d'Oz (tablette)         │
│ (smartphone │     │ • Miniature piste cliquable              │
│  via QR)    │     │ • Sélecteur id 1–4 + slider angle        │
│ Pédale /    │     │ • Boutons de secours                     │
│ Joystick /  │     │ • Journal horodaté                       │
│ UseItem     │     └──────────────────────────────────────────┘
└─────────────┘
```

---

## Structure des dossiers du projet

```
crashout-circuit/
├── server/
│   ├── index.ts               # Point d'entrée WebSocket + HTTP (QR code)
│   ├── GameServer.ts          # Orchestrateur de sessions
│   ├── PhysicsLoop.ts         # Boucle 60 Hz — véhicules, collisions
│   ├── MapGenerator.ts        # Génération du circuit (§5 context.md)
│   ├── GameRules.ts           # HP, pickups, armement, tour, victoire
│   ├── config.ts              # Tous les paramètres (REQ-8.1)
│   └── types.ts               # Types partagés (GameState, messages…)
├── client-table/
│   ├── index.html
│   ├── main.ts                # Bootstrap, connexion WS
│   ├── Renderer.ts            # Canvas 2D — rendu piste, voitures, effets
│   ├── GestureRecognizer.ts   # Pointer Events → messages sémantiques
│   ├── HUD.ts                 # 4 panneaux de coin, anneaux, alertes
│   └── QRDisplay.ts           # Affichage QR code en phase LOBBY
├── client-pilot/
│   ├── index.html
│   ├── main.ts                # Connexion WS, envoi PilotInput / UseItem
│   └── Controls.tsx           # Pédale + joystick (sliders tactiles)
├── client-oz/
│   ├── index.html
│   ├── main.ts                # Console Magicien d'Oz
│   ├── OzMap.ts               # Miniature piste cliquable
│   └── OzLog.ts               # Journal horodaté + rejeu
├── prototypes/
│   └── piste-vivante/         # Prototype de démonstration existant (inchangé)
└── config.json                # Paramètres réglables (REQ-8.1)
```

---

## Modèle de données (GameState)

```typescript
// types.ts — partagé serveur + clients via copie ou package interne

interface Vec2 { x: number; y: number; }

interface Car {
  team: 'A' | 'B';
  pos: Vec2;
  angle: number;         // radians
  velocity: Vec2;
  hp: number;            // 0–100
  disabled: boolean;     // hp === 0
  invulnUntil: number;   // timestamp ms
  stunUntil: number;
  ghostUntil: number;
  lap: number;
  checkpointIndex: number;
  heldItem: 'slingshot' | 'boost' | null;
  itemArmed: boolean;
  itemArmExpiry: number; // timestamp ms
}

interface Wall {
  id: string;
  team: 'A' | 'B';
  pos: Vec2;
  angle: number;
  lengthPx: number;
  disabledUntil: number; // 0 = actif
}

interface ArcElectric {
  id: string;
  team: 'A' | 'B';
  pylon1: Vec2;
  pylon2: Vec2;
}

interface BoostGate {
  id: string;
  team: 'A' | 'B';
  a: Vec2;
  b: Vec2;
  expiresAt: number;
}

interface Stone {
  id: string;
  target: Vec2;
  impactAt: number;     // timestamp ms
  team: 'A' | 'B';
}

interface Pickup {
  id: number;           // 0–3
  pos: Vec2;
  kind: 'slingshot' | 'boost';
  respawnAt: number;    // 0 = disponible
}

interface RepairPad {
  team: 'A' | 'B';
  role: 'pilot' | 'copilot';
  held: boolean;
  startedAt: number;
}

interface Cooldown {
  ghost: number;        // timestamp expiry
  destroy: number;
  borderPull: number;
}

interface TrackGeometry {
  centerline: Vec2[];   // N=256 points
  outerEdge: Vec2[];
  innerEdge: Vec2[];
  widths: number[];
  checkpoints: { pos: Vec2; normal: Vec2 }[];
  startLine: { pos: Vec2; normal: Vec2 };
  startPositions: Vec2[];
  pickupPositions: Vec2[];
}

interface GameState {
  phase: 'LOBBY' | 'MAP' | 'RACE' | 'RESULT';
  tick: number;
  cars: Record<'A' | 'B', Car>;
  walls: Wall[];
  arcs: ArcElectric[];
  boostGates: BoostGate[];
  stones: Stone[];
  pickups: Pickup[];
  repairPads: Record<string, RepairPad>; // clé "A-pilot" | "A-copilot" | …
  cooldowns: Record<'A' | 'B', Cooldown>;
  track: TrackGeometry | null;
  winner: 'A' | 'B' | 'draw' | null;
  sessionStartAt: number;
}
```

---

## Protocole de messages WebSocket

Tous les messages sont JSON avec `{ type: string, t: number, ...payload }`.

### Table → Serveur

| type | champs | description |
|---|---|---|
| `StrokeDraw` | `creator: 'A'|'B', pts: Vec2[]` | Tracé brut d'un Copilote |
| `PadHold` | `team, role: 'pilot'|'copilot', on: boolean` | Doigt sur/hors du pad de réparation |
| `Slingshot` | `x, y` | Lance-pierre (3 doigts détectés côté table) |
| `BoostGate` | `a: Vec2, b: Vec2` | Portail de boost (2 doigts) |
| `Ability` | `team, kind: 'ghost'|'destroy', targetId?: string` | Activation Fantôme ou Destruction mur |
| `BorderPull` | `x, y, dx, dy` | Élargir la piste (P2) |

### Smartphone → Serveur

| type | champs | description |
|---|---|---|
| `PilotInput` | `team, throttle: number, steer: number` | Entrée continue de pilotage |
| `UseItem` | `team` | Armer l'objet en stock |
| `PilotJoin` | `team` | Connexion du Pilote (phase LOBBY) |

### Console Oz → Serveur

| type | champs | description |
|---|---|---|
| `TangibleMoved` | `id: 1|2|3|4, x, y, angle` | Poser/déplacer un poteau |
| `TangibleRemoved` | `id` | Retirer un poteau |
| `OzTrigger` | `kind: string, params: object` | Action de secours |

### Serveur → Tous (broadcast)

| type | champs | description |
|---|---|---|
| `State` | `GameState complet` | Diffusion à 30 Hz |
| `Feedback` | `kind: string, x, y, team` | Alertes, sons, effets ponctuels |
| `PhaseChange` | `phase, data?` | Transition de phase |

---

## Module MapGenerator

```
MapGenerator.generate(strokeA: Vec2[], strokeB: Vec2[]): TrackGeometry

Étapes internes :
1. validate(stroke)           — longueur ≥ 300 px, touche les deux points cibles
2. resample(stroke, step)     — rééchantillonnage à pas constant
3. oneEuroFilter(pts)         — filtre 1€ anti-jitter
4. autofill(stroke, P1, P2)   — fermeture en haricot (κ aléatoire ∈ [0.6, 1.0])
5. makeLoop(stroke)           — boucle anti-horaire, 256 points
6. mergeLoops(A, B)           — décalage optimal + moyennage 0.5/0.5
7. catmullRom(pts)            — lissage Catmull-Rom centripète
8. computeGeometry(center)    — bords, largeurs, colliders
9. placeFeatures(geo)         — checkpoints, ligne de départ, pickups
10. validate(geo)             — rayon min, largeur min, auto-intersection
    → si échec : réessayer avec poids 0.4/0.6, puis boucle A seule
```

---

## Module PhysicsLoop (serveur, 60 Hz)

```
chaque tick (Δt = 1/60 s) :
  pour chaque Car :
    1. Lire PilotInput (dernière valeur reçue)
    2. Si disabled ou stunned : ignorer throttle/steer
    3. Intégrer vitesse : v += clamp(throttle * accel * Δt, -vMaxRev, vMaxFwd)
    4. Intégrer angle : angle += steer * turnRate * Δt
    5. Intégrer position : pos += direction(angle) * v * Δt
    6. Tester collision bords de piste → rebond ×0.6
    7. Tester pickups → ramassage si aucun objet en stock
    8. Tester boostGates alliés → appliquer boost si franchissement
    9. Tester walls/arcs adverses → HP, effets (sauf invulnérable, fantôme)
   10. Tester stones (impactAt ≤ now) → HP, étourdissement
   11. Tester checkpoints dans l'ordre → incrémenter lap si complet
   12. Tester réparation synchrone → progresser jauge si les deux pads tenus

  Expirer : boostGates, stones, itemArm, cooldowns
  Diffuser GameState toutes les 2 ticks (30 Hz)
```

---

## GestureRecognizer (navigateur table)

Utilise l'API `PointerEvent` avec `pointerId` pour tracker chaque contact.

```
Gestures détectées :
  • 3 doigts cluster ≤ 150 px  → Slingshot(centroïde)    si équipe armée slingshot
  • 2 doigts 100–400 px        → BoostGate(a, b)         si équipe armée boost
  • 1 doigt glisse sur bord    → BorderPull(x, y, dx, dy) (P2)
  • Appui sur zone pad         → PadHold(team, role, on)
  • Appui sur bouton Copilote  → Ability(team, kind)
  • Tracé MAP (phase MAP)      → StrokeDraw(creator, pts)

Attribution d'équipe (R-03) :
  1. Zone pad de station → équipe de la station
  2. Bouton panel → équipe du panel
  3. Geste libre → chercher équipe avec itemArmed=true
     Si les deux armées : station la plus proche du centroïde
```

---

## HUD (rendu table) — 4 panneaux de coin

Chaque panneau est orienté (rotation Canvas) vers son bord de table.

```
Coin bas-gauche  → Pilote A    (rotation 0°)
Coin bas-droite  → Copilote A  (rotation 0°)
Coin haut-gauche → Pilote B    (rotation 180°)
Coin haut-droite → Copilote B  (rotation 180°)

Panneau Pilote :
  ┌─────────────────────────────┐
  │  HP ████████░░  80          │
  │  [Icône objet en stock]     │
  │  ◎ PAD RÉPARATION  (160px) │
  └─────────────────────────────┘

Panneau Copilote :
  ┌─────────────────────────────┐
  │  [◷ Fantôme]  [◷ Détruire] │  ← boutons + anneaux de recharge
  │  ◎ PAD RÉPARATION  (160px) │
  │  ✦ OBJET ARMÉ (halo)       │  ← visible 5 s après UseItem
  └─────────────────────────────┘
```

---

## Console Magicien d'Oz

Page HTML/JS autonome sur la même origine (ou port dédié).

```
┌─────────────────────────────────────────────────────────────┐
│  CRASHOUT · CONSOLE OZ                                       │
├─────────────────┬───────────────────────────────────────────┤
│  Miniature piste│  Sélecteur id : ①  ②  ③  ④              │
│  (Canvas 400px) │  Angle : ─────●─── 45°                   │
│  • Clic = poser │  [Retirer poteau sélectionné]             │
│  • Drag = dépl. │                                           │
├─────────────────┴───────────────────────────────────────────┤
│  SECOURS  [Obstacle] [Boost] [Panne] [Élargir] [Circuit↺]   │
├─────────────────────────────────────────────────────────────┤
│  JOURNAL                                                     │
│  14:22:03.412  TangibleMoved  id=1 x=0.42 y=0.61 a=45°     │
│  14:22:05.100  TangibleMoved  id=2 x=0.55 y=0.63 a=45°     │
│  14:22:05.102  ArcElectric activé (id 1+2)                  │
│  [Export JSON]  [Rejouer]                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Application Pilote (smartphone)

Page web mobile responsive, accessible via QR code (URL avec paramètre `?team=A`).

```
┌───────────────────────────────┐
│  CRASHOUT  ▐ ÉQUIPE CYAN      │
│                               │
│   PÉDALE                      │
│  ┌───────────────┐            │
│  │               │            │
│  │      ▲        │   AVANT    │
│  │   ───●───     │            │
│  │      ▼        │   ARRIÈRE  │
│  └───────────────┘            │
│                               │
│   DIRECTION                   │
│  ┌───────────────┐            │
│  │   ◄── ●──►   │            │
│  └───────────────┘            │
│                               │
│  ┌─────────────────────────┐  │
│  │     ✦  UTILISER OBJET  │  │
│  └─────────────────────────┘  │
└───────────────────────────────┘
```

---

## Gestion des phases côté serveur

```
LOBBY
  ← PilotJoin(team) × 2
  ← Copilote A présent (détecté par PadHold ou StrokeDraw)
  ← Copilote B présent
  → PhaseChange(MAP)

MAP
  ← StrokeDraw(creator='A', pts)
  ← StrokeDraw(creator='B', pts)
  → MapGenerator.generate(strokeA, strokeB)
  → Si OK : stocker TrackGeometry, PhaseChange(RACE)
  → Si KO : Feedback(kind='mapError'), réessayer ou circuit secours

RACE
  → boucle physique active
  → victoire : lap ≥ lapsToWin   → PhaseChange(RESULT, winner)
  → timeout : sessionMaxSeconds  → PhaseChange(RESULT, winner=avancé)

RESULT
  → afficher classement
  → attente bouton "Rejouer" → PhaseChange(LOBBY)
```

---

## Choix technologiques

| Aspect | Choix | Justification |
|---|---|---|
| Serveur | Node.js + `ws` | Faible latence WS, boucle event loop adaptée au 60 Hz |
| Rendu table | Canvas 2D natif (PixiJS en fallback) | Contrôle fin, pas de dépendance lourde ; PixiJS si perf insuffisante |
| App Pilote | HTML + CSS + Vanilla TS | Zéro installation, charge rapide sur réseau local |
| Console Oz | HTML + CSS + Vanilla TS | Simple, pas de framework nécessaire |
| Transpilation | Vite + TypeScript | Cohérent avec prototype existant (vite.config.ts présent) |
| Format TUIO | Sous-ensemble custom (id, x, y, angle) | Compatible futur hardware sans réécriture gameplay (D4) |

---

## Considérations de performance

- Canvas à 60 fps : grouper les `shadowBlur` par couleur pour limiter les re-flush GPU.
- WebSocket : throttle `PilotInput` à 60 Hz max côté client ; état diffusé à 30 Hz côté serveur.
- MapGenerator : exécuté une seule fois par partie, hors boucle physique, dans une Promise.
- Budget tactile : `GestureRecognizer` garde un `Map<pointerId, contact>` limité à 10 entrées.

---

## Paramètres de configuration (`config.json`)

```json
{
  "lapsToWin": 3,
  "sessionMaxSeconds": 300,
  "hpMax": 100,
  "dmgWall": 10,
  "dmgArc": 10,
  "dmgStone": 25,
  "invulnAfterHitS": 1,
  "stunStoneS": 1,
  "arcSlowFactor": 0.5,
  "arcSlowS": 1.5,
  "repairHoldS": 2,
  "repairHpRestore": 60,
  "pickupRespawnS": 15,
  "armWindowS": 5,
  "stoneTelegraphS": 0.8,
  "stoneRadiusPx": 60,
  "boostLenMinPx": 100,
  "boostLenMaxPx": 400,
  "boostGateLifeS": 8,
  "boostDurationS": 2,
  "boostGain": 0.8,
  "ghostS": 3,
  "ghostCooldownS": 20,
  "destroyDisableS": 10,
  "destroyCooldownS": 15,
  "wallLengthPx": 120,
  "arcMaxDistPx": 500,
  "trackWidthBasePx": 140,
  "trackWidthMinPx": 90,
  "vMaxFwd": 420,
  "vMaxRev": 140,
  "accel": 600,
  "turnRate": 2.5,
  "physicsHz": 60,
  "broadcastHz": 30,
  "logicalWidth": 1920,
  "logicalHeight": 1080
}
```
