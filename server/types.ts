/**
 * Déclare les structures d’état et les messages échangés entre le serveur, la table et la console Oz.
 * Liens : server/tangibles.ts.
 * Référencé notamment par client-oz/OzController.ts, client-oz/OzMap.ts, client-oz/main.ts.
 */
import type { TangibleId } from './tangibles.js';

/** Représente une position ou un vecteur à deux coordonnées. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Distingue l’équipe cyan de l’équipe rose dans l’état et les commandes. */
export type Team = 'A' | 'B';
/** Nomme les écrans et les états de session partagés par les clients. */
export type Phase = 'LOBBY' | 'MAP' | 'READY' | 'RACE' | 'PAUSED' | 'RESULT';
/** Distingue les deux bonus ramassables du jeu. */
export type ItemKind = 'slingshot' | 'boost';
/** Nomme le niveau de vitesse choisi pour les voitures. */
export type Difficulty = 'easy' | 'medium' | 'hard';
/** Distingue l’avance automatique de l’accélération avec pédale maintenue. */
export type DriveMode = 'auto' | 'pedal';
/** Distingue la pose calculée par les contacts de la pose manuelle sur la carte Oz. */
export type TangiblePlacementMode = 'manual' | 'touch';
/** Décrit l’annonce de pose avec son objet, son jeton unique et son expiration. */
export interface TangiblePlacementRequest { id: TangibleId; token: number; expiresAt: number }

/** Conserve la pose et l’activation d’un objet réel indépendamment des effets qu’il produit. */
export interface Tangible {
  x: number; y: number; angle: number; // normalized position, angle in degrees
  kind: 'wall' | 'pylon';
  team: Team | null;
  active: boolean;
  dockTeam: Team | null; // legacy wire field, null; tangibles use the neutral depot
  status: 'docked' | 'parked' | 'placed';
  placementOrigin?: { x: number; y: number; angle: number }; // last authoritative pose; no movement budget
}

/** Conserve la pose, le mouvement, la santé, la progression et le stock d’une voiture. */
export interface Car {
  team: Team;
  pos: Vec2;
  angle: number;        // radians
  velocity: Vec2;
  hp: number;           // 0–100
  disabled: boolean;    // hp === 0
  respawnUntil: number; // repaired, waiting for the local restart lights
  invulnUntil: number;  // timestamp ms
  stunUntil: number;
  ghostUntil: number;
  lap: number;
  checkpointIndex: number;
  heldItem: ItemKind | null;
  itemArmed: boolean;
  itemArmVersion: number;
  itemArmExpiry: number; // legacy wire field; 0, armed stock has no deadline
  speed: number;         // signed forward speed, px/s (server-internal, broadcast for HUD)
  slowUntil: number;     // arc slow-down expiry
  boostUntil: number;    // boost gate effect expiry
  boostK: number;        // boost intensity factor of the active boost
}

/** Décrit le volume de collision d’un mur et sa désactivation éventuelle. */
export interface Wall {
  id: string;
  team: Team | null;
  pos: Vec2;
  angle: number;
  lengthPx: number;
  widthPx?: number; // physical footprint, logical units
  tolerancePx?: number; // soft effect fringe outside that footprint
  disabledUntil: number; // 0 = active
  expiresAt?: number;    // temporary walls created by the Oz console
}

/** Décrit une liaison dommageable entre deux piliers et ses échéances d’activation. */
export interface ArcElectric {
  id: string;
  team: Team | null;
  pylon1: Vec2;
  pylon2: Vec2;
  disabledUntil: number; // 0 = active
}

/** Décrit la surface et la durée d’une zone d’accélération attribuée à une équipe. */
export interface BoostGate {
  id: string;
  team: Team;
  a: Vec2;
  b: Vec2;
  expiresAt: number;
  createdAt?: number;
  dir?: Vec2;
  depth?: number;
}

/** Conserve la trajectoire et les instants de départ et d’impact d’une pierre. */
export interface Stone {
  id: string;
  from: Vec2;        // launch point (the pulled pouch)
  target: Vec2;      // landing point, where the warning circle is shown
  launchedAt: number; // timestamp ms
  impactAt: number;  // timestamp ms
  team: Team;
}

/** Décrit le bonus présent sur la piste et son instant de réapparition. */
export interface Pickup {
  id: number;        // 0–3
  pos: Vec2;
  kind: ItemKind;
  respawnAt: number; // 0 = available
}

/** Conserve l’appui de réparation d’un poste et la date de son dernier renouvellement. */
export interface RepairPad {
  team: Team;
  role: 'pilot' | 'copilot';
  held: boolean;
  startedAt: number;
}

/** Conserve les anciennes échéances de capacités maintenues pour compatibilité. */
export interface Cooldown {
  ghost: number;
  destroy: number;
  borderPull: number;
}

/** Réunit la chaussée, sa forme de base et les points d’ancrage des éléments de course. */
export interface TrackGeometry {
  centerline: Vec2[];   // N=256 points
  /** Immutable reference used to rebuild temporary local deformations. */
  baseCenterline: Vec2[];
  outerEdge: Vec2[];
  innerEdge: Vec2[];
  widths: number[];
  checkpoints: Array<{ pos: Vec2; normal: Vec2 }>;
  startLine: { pos: Vec2; normal: Vec2 };
  startPositions: Vec2[];
  pickupPositions: Vec2[];
  /** Indices of feature anchors in the centerline, kept aligned when it moves. */
  featureIndices: { checkpoints: number[]; start: number; starts: number[]; pickups: number[] };
  /** True for the predefined circuit: the players' drawing could not be used. */
  preset?: boolean;
}

/** Conserve le déplacement local d’un geste et les durées de maintien et de retour de la piste. */
export interface TrackDeformation {
  id: string;
  index: number;
  dx: number;
  dy: number;
  createdAt: number;
  /** Set when a newer deformation takes over, then the old one eases back. */
  releaseAt: number | null;
  strength: number;
  holdUntil?: number;
  gestureEnded?: boolean;
}

/** Associe chaque équipe à ses points de départ et d’arrivée pour le demi-tracé. */
export interface MapTargets {
  A: [Vec2, Vec2];
  B: [Vec2, Vec2];
}

/** Nomme les étapes reconnues par les règles et les cartes du tutoriel. */
export type TutorialStepId =
  | 'identify' | 'steer' | 'pedal'
  | 'pickup' | 'power' | 'sling'
  | 'boostPickup' | 'boostPower' | 'boost' | 'boostCross'
  | 'borderPull' | 'repair' | 'wall' | 'arc' | 'pylon' | 'depot';

/** Conserve l’étape et les sous-actions déjà validées par une équipe. */
export interface TutorialTeam {
  /** Index in `TutorialState.steps`; equal to its length once the team is done. */
  step: number;
  /** Role/direction/contact bit field, or progress inside the current lesson. */
  sub: number;
}

/** Réunit les leçons et la progression des deux équipes jusqu’à la fin de l’entraînement. */
export interface TutorialState {
  steps: TutorialStepId[];
  teams: Record<Team, TutorialTeam>;
  /** Both teams went through (or skipped) every step. */
  finished: boolean;
}

/** Décrit les réglages de jeu et les dimensions transmis aux clients avec l’état. */
export interface GameParams {
  difficulty: Difficulty;
  hpMax: number;
  lapsToWin: number;
  sessionMaxSeconds: number;
  armWindowS: number;
  ghostS: number;
  ghostCooldownS: number;
  destroyCooldownS: number;
  destroyDisableS: number;
  /** Retained for compatible clients; local deformation no longer has a cooldown. */
  borderPullCooldownS: number;
  trackDeformMaxShiftPx: number;
  trackDeformHoldS: number;
  trackDeformRelaxS: number;
  stoneTelegraphS: number;
  stoneRadiusPx: number;
  slingMinPullPx: number;
  slingMaxPullPx: number;
  slingMinRangePx: number;
  slingMaxRangePx: number;
  boostLenMinPx: number;
  boostLenMaxPx: number;
  repairHoldS: number;
  wallLengthPx: number;
  wallWidthPx: number;
  pylonBasePx: number;
  pylonFieldRadiusPx: number;
  tangibleTolerancePx: number;
  tangibleCorrectionPx: number;
  tangibleCorrectionDegrees: number;
  tableDiagonalInches: number;
  logicalWidth: number;
  logicalHeight: number;
  arcMaxDistPx: number;
}

/** Conserve l’origine et l’horloge partagée de la révélation du circuit. */
export interface TrackPresentation {
  startedAt: number;
  originIndex: number;
}

/** Regroupe tout l’état de partie validé par le serveur et synchronisé avec les interfaces. */
export interface GameState {
  phase: Phase;
  /** Test sessions use the same physics with automated pilot controls. */
  sessionMode: 'race' | 'tangibles-test';
  /** Host opt-in only; participants cannot enable test tools with a URL or command. */
  developerTools: boolean;
  /** Driving scheme selected independently by each pilot. */
  driveMode: Record<Team, DriveMode>;
  tick: number;
  cars: Record<Team, Car>;
  walls: Wall[];
  arcs: ArcElectric[];
  boostGates: BoostGate[];
  stones: Stone[];
  pickups: Pickup[];
  repairPads: Record<string, RepairPad>; // key: "A-pilot" | "A-copilot" | "B-pilot" | "B-copilot"
  cooldowns: Record<Team, Cooldown>;
  track: TrackGeometry | null;
  /** One active pull at a time; earlier pulls may briefly be reforming. */
  deformations: TrackDeformation[];
  winner: Team | 'draw' | null;
  sessionStartAt: number;
  raceDeadline: number; // 0 when the race timer is disabled
  pausedAt: number;
  /** Ordered start/end targets for each team, set after the two anchor placements. */
  mapTargets: MapTargets | null;
  /** The two shared contacts that split the table before either half is drawn. */
  mapDivider: [Vec2, Vec2] | null;
  /** Accepted and locked halves: cyan A first, then rose B. Also determines the active turn. */
  mapStrokes: Record<Team, boolean>;
  mapDeadline: number;          // ms timestamp, 0 when not in MAP
  /** Both modes place and draw sequentially; PC also enables racing test controls. */
  mapMode: 'table' | 'pc' | null;
  /** Repair gauge per team, 0..1 (C-06). */
  repairProgress: Record<Team, number>;
  /** Incremented whenever `track` changes; State broadcasts omit the track otherwise. */
  trackVersion: number;
  trackPresentation: TrackPresentation | null;
  /** Operator-reported pylons currently on the table, keyed by tangible id. */
  tangibles: Record<number, Tangible>;
  tangiblePlacementMode: TangiblePlacementMode;
  tangiblePlacement: TangiblePlacementRequest | null;
  params: GameParams;
  /** PC test switches (only honoured in the PC mode, see `TestToggleMsg`). */
  testMode: { invincible: boolean; allItems: boolean };
  /** Non-null during the guided tutorial (phase RACE, no laps, no damage). */
  tutorial: TutorialState | null;
}

// ─── WebSocket message types ──────────────────────────────────────────────────

/** Associe un type de commande à son horodatage réseau. */
export interface BaseMsg {
  type: string;
  t: number; // timestamp ms
}

// Table → Server
/** Décrit le réglage de course dans le protocole partagé. */
export interface RaceSettingsMsg extends BaseMsg {
  type: 'RaceSettings'; difficulty?: Difficulty; lapsToWin?: number; sessionMaxSeconds?: number;
}
/** Décrit le tracé d’un demi-circuit dans le protocole partagé. */
export interface StrokeDrawMsg extends BaseMsg {
  type: 'StrokeDraw';
  creator: Team;
  pts: Vec2[];
}

/** Décrit la validation des deux tracés dans le protocole partagé. */
export interface GenerateTrackMsg extends BaseMsg {
  type: 'GenerateTrack';
}

/** Décrit la demande de départ dans le protocole partagé. */
export interface BeginRaceMsg extends BaseMsg {
  type: 'BeginRace';
}

/** Décrit la pose des points de raccord dans le protocole partagé. */
export interface MapDividerMsg extends BaseMsg {
  type: 'MapDivider';
  a: Vec2;
  b: Vec2;
}

/** Décrit le maintien d’un pad de réparation dans le protocole partagé. */
export interface PadHoldMsg extends BaseMsg {
  type: 'PadHold';
  team: Team;
  role: 'pilot' | 'copilot';
  on: boolean;
}

/** Décrit la traction et le relâchement du lance-pierre dans le protocole partagé. */
export interface SlingshotMsg extends BaseMsg {
  type: 'Slingshot';
  anchor: Vec2;
  pouch: Vec2;
  team?: Team; // resolved by the table's gesture recognizer (R-03); server falls back to proximity
}

/** Décrit les contacts d’une zone d’accélération dans le protocole partagé. */
export interface BoostGateMsg extends BaseMsg {
  type: 'BoostGate';
  a: Vec2;
  b: Vec2;
  team?: Team;
}

/** Décrit une ancienne capacité conservée pour compatibilité dans le protocole partagé. */
export interface AbilityMsg extends BaseMsg {
  type: 'Ability';
  team: Team;
  kind: 'ghost' | 'destroy';
  targetId?: string;
}

/** Décrit la traction d’un bord de piste dans le protocole partagé. */
export interface BorderPullMsg extends BaseMsg {
  type: 'BorderPull';
  index?: number;
  gestureId?: string;
  end?: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
  team?: Team;
}

// Conduite et bouton POWER du copilote → serveur
/** Décrit la commande du pilote dans le protocole partagé. */
export interface PilotInputMsg extends BaseMsg {
  type: 'PilotInput';
  team: Team;
  /** 0..1 in pedal mode; ignored in auto mode. */
  throttle: number;
  steer: number;    // [-1, 1]
}

/** Décrit l’armement du stock copilote dans le protocole partagé. */
export interface PowerMsg extends BaseMsg {
  type: 'Power';
  team: Team;
  role: 'copilot';
}

/** Décrit l’entrée en création dans le protocole partagé. */
export interface StartGameMsg extends BaseMsg {
  type: 'StartGame';
  mode?: 'table' | 'pc';
}

/** Décrit l’essai autonome des tangibles dans le protocole partagé. */
export interface StartTangibleTestMsg extends BaseMsg { type: 'StartTangibleTest' }

/** Décrit le démarrage du tutoriel dans le protocole partagé. */
export interface StartTutorialMsg extends BaseMsg {
  type: 'StartTutorial';
  mode?: 'table' | 'pc';
}

/** Décrit le passage d’une étape de tutoriel dans le protocole partagé. */
export interface TutorialSkipMsg extends BaseMsg {
  type: 'TutorialSkip';
  team: Team;
}

/** Décrit le passage du tutoriel à une course normale dans le protocole partagé. */
export interface TutorialRaceMsg extends BaseMsg { type: 'TutorialRace' }

/** Décrit la pause ou la reprise dans le protocole partagé. */
export interface PauseMsg extends BaseMsg {
  type: 'Pause';
}

/** Décrit le choix de conduite d’une équipe dans le protocole partagé. */
export interface ToggleDriveModeMsg extends BaseMsg {
  type: 'ToggleDriveMode';
  team?: Team;
}

// Console Oz → Server
/** Décrit la pose manuelle d’un tangible dans le protocole partagé. */
export interface TangibleMovedMsg extends BaseMsg {
  type: 'TangibleMoved';
  id: TangibleId;
  x: number; // normalized 0–1
  y: number;
  angle: number; // degrees
  active?: boolean; // atomic placement + activation; omitted preserves activation
}

/** Décrit le retrait physique d’un tangible dans le protocole partagé. */
export interface TangibleRemovedMsg extends BaseMsg {
  type: 'TangibleRemoved';
  id: TangibleId;
}

/** Décrit le choix de la méthode de pose dans le protocole partagé. */
export interface TangiblePlacementModeMsg extends BaseMsg { type: 'TangiblePlacementMode'; mode: TangiblePlacementMode }
/** Décrit l’annonce d’une prochaine pose dans le protocole partagé. */
export interface TangiblePrepareMsg extends BaseMsg { type: 'TangiblePrepare'; id: TangibleId }
/** Décrit l’annulation de l’annonce de pose dans le protocole partagé. */
export interface TangiblePlacementCancelMsg extends BaseMsg { type: 'TangiblePlacementCancel' }
/** Décrit la confirmation du tangible par deux contacts dans le protocole partagé. */
export interface TangibleTouchPlacedMsg extends BaseMsg {
  type: 'TangibleTouchPlaced'; id: TangibleId; token: number; a: Vec2; b: Vec2;
}

/** Décrit le changement d’activation du tangible dans le protocole partagé. */
export interface TangibleControlMsg extends BaseMsg {
  type: 'TangibleControl';
  id: TangibleId;
  /** Only Oz: activation; legacy dock returns the object to the neutral depot. */
  action: 'configure' | 'dock' | 'activate' | 'deactivate';
  team?: Team;
  kind?: Tangible['kind'];
}

/** Décrit le retour de compatibilité vers l’accueil dans le protocole partagé. */
export interface NewGameMsg extends BaseMsg {
  type: 'NewGame';
}

/** Décrit la remise à zéro de la session dans le protocole partagé. */
export interface ResetMsg extends BaseMsg {
  type: 'Reset';
}
/** Décrit une aide réservée au développement dans le protocole partagé. */
export interface TestToggleMsg extends BaseMsg {
  type: 'TestToggle';
  flag: 'invincible' | 'allItems';
  on: boolean;
}

/** Décrit la demande de mesure aller-retour dans le protocole partagé. */
export interface PingMsg extends BaseMsg {
  type: 'Ping';
}

// Server → All (broadcast)
/** Décrit l’état de partie transmis aux interfaces dans le protocole partagé. */
export interface StateMsg extends BaseMsg {
  type: 'State';
  state: GameState;
}

/** Décrit un retour d’action destiné aux effets et au tutoriel dans le protocole partagé. */
export interface FeedbackMsg extends BaseMsg {
  type: 'Feedback';
  kind: string;
  x: number;
  y: number;
  team: Team;
  itemKind?: ItemKind;
}

/** Décrit le retour de mesure du temps réseau dans le protocole partagé. */
export interface PongMsg extends BaseMsg {
  type: 'Pong';
  clientT: number; // echoed Ping.t
}

/** Décrit le changement de phase annoncé aux clients dans le protocole partagé. */
export interface PhaseChangeMsg extends BaseMsg {
  type: 'PhaseChange';
  phase: Phase;
  data?: unknown;
}

/** Réunit les commandes que le serveur peut recevoir des deux interfaces. */
export type ClientMessage =
  | RaceSettingsMsg
  | StrokeDrawMsg
  | GenerateTrackMsg
  | BeginRaceMsg
  | MapDividerMsg
  | PadHoldMsg
  | SlingshotMsg
  | BoostGateMsg
  | AbilityMsg
  | BorderPullMsg
  | PilotInputMsg
  | PowerMsg
  | StartGameMsg
  | StartTangibleTestMsg
  | StartTutorialMsg
  | TutorialSkipMsg
  | TutorialRaceMsg
  | PauseMsg
  | ToggleDriveModeMsg
  | TangibleMovedMsg
  | TangibleRemovedMsg
  | TangibleControlMsg
  | TangiblePlacementModeMsg
  | TangiblePrepareMsg
  | TangiblePlacementCancelMsg
  | TangibleTouchPlacedMsg
  | PingMsg
  | NewGameMsg
  | ResetMsg
  | TestToggleMsg;

/** Réunit les états, phases et retours que les interfaces peuvent recevoir du serveur. */
export type ServerMessage = StateMsg | FeedbackMsg | PhaseChangeMsg | PongMsg;
