// ─── Shared types ────────────────────────────────────────────────────────────
// Used by server code and imported by clients via the @shared alias.
import type { TangibleId } from './tangibles.js';

export interface Vec2 {
  x: number;
  y: number;
}

export type Team = 'A' | 'B';
export type Phase = 'LOBBY' | 'MAP' | 'READY' | 'RACE' | 'PAUSED' | 'RESULT';
export type ItemKind = 'slingshot' | 'boost';
export type DriveMode = 'auto' | 'pedal';
export type TangiblePlacementMode = 'manual' | 'touch';
export interface TangiblePlacementRequest { id: TangibleId; token: number; expiresAt: number }

export interface Tangible {
  x: number; y: number; angle: number; // normalized position, angle in degrees
  kind: 'wall' | 'pylon';
  team: Team | null;
  active: boolean;
  dockTeam: Team | null; // legacy wire field, null; tangibles use the neutral depot
  status: 'docked' | 'parked' | 'placed';
  placementOrigin?: { x: number; y: number; angle: number }; // last authoritative pose; no movement budget
}

export interface Car {
  team: Team;
  pos: Vec2;
  angle: number;        // radians
  velocity: Vec2;
  hp: number;           // 0–100
  disabled: boolean;    // hp === 0
  invulnUntil: number;  // timestamp ms
  stunUntil: number;
  ghostUntil: number;
  lap: number;
  checkpointIndex: number;
  heldItem: ItemKind | null;
  itemArmed: boolean;
  itemArmExpiry: number; // legacy wire field; 0, armed stock has no deadline
  speed: number;         // signed forward speed, px/s (server-internal, broadcast for HUD)
  slowUntil: number;     // arc slow-down expiry
  boostUntil: number;    // boost gate effect expiry
  boostK: number;        // boost intensity factor of the active boost
}

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

export interface ArcElectric {
  id: string;
  team: Team | null;
  pylon1: Vec2;
  pylon2: Vec2;
  disabledUntil: number; // 0 = active
}

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

export interface Stone {
  id: string;
  from: Vec2;        // launch point (the pulled pouch)
  target: Vec2;      // landing point, where the warning circle is shown
  launchedAt: number; // timestamp ms
  impactAt: number;  // timestamp ms
  team: Team;
}

export interface Pickup {
  id: number;        // 0–3
  pos: Vec2;
  kind: ItemKind;
  respawnAt: number; // 0 = available
}

export interface RepairPad {
  team: Team;
  role: 'pilot' | 'copilot';
  held: boolean;
  startedAt: number;
}

/** Each value is the timestamp (ms) at which the ability becomes usable again. */
export interface Cooldown {
  ghost: number;
  destroy: number;
  borderPull: number;
}

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

/** A local sideways displacement of the road, never a permanent width change. */
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

export interface MapTargets {
  A: [Vec2, Vec2];
  B: [Vec2, Vec2];
}

/** Each lesson is done by one real game event (see `server/Tutorial.ts`). */
export type TutorialStepId =
  | 'steer' | 'pedal'
  | 'pickup' | 'power' | 'sling'
  | 'boostPickup' | 'boostPower' | 'boost' | 'boostCross'
  | 'borderPull' | 'repair' | 'wall' | 'arc' | 'pylon';

export interface TutorialTeam {
  /** Index in `TutorialState.steps`; equal to its length once the team is done. */
  step: number;
  /** Progress inside the step (bit field for `steer`, 0..2 for `pedal`). */
  sub: number;
}

/** Guided session: the race phase without scoring, one independent progression per team. */
export interface TutorialState {
  steps: TutorialStepId[];
  teams: Record<Team, TutorialTeam>;
  /** Both teams went through (or skipped) every step. */
  finished: boolean;
}

/** Subset of config.json the clients need to draw rings, timers and thresholds. */
export interface GameParams {
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

export interface GameState {
  phase: Phase;
  /** Test sessions use the same physics with automated pilot controls. */
  sessionMode: 'race' | 'tangibles-test';
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

export interface BaseMsg {
  type: string;
  t: number; // timestamp ms
}

// Table → Server
export interface StrokeDrawMsg extends BaseMsg {
  type: 'StrokeDraw';
  creator: Team;
  pts: Vec2[];
}

/** Both accepted map halves are deliberately confirmed before building the track. */
export interface GenerateTrackMsg extends BaseMsg {
  type: 'GenerateTrack';
}

/** The generated track stays inspectable until players explicitly start. */
export interface BeginRaceMsg extends BaseMsg {
  type: 'BeginRace';
}

/** The two initial contacts which establish the shared divider in MAP. */
export interface MapDividerMsg extends BaseMsg {
  type: 'MapDivider';
  a: Vec2;
  b: Vec2;
}

export interface PadHoldMsg extends BaseMsg {
  type: 'PadHold';
  team: Team;
  role: 'pilot' | 'copilot';
  on: boolean;
}

/**
 * Slingshot released: the elastic's fork (`anchor`, midpoint of the two anchoring
 * fingers) and the pulled pouch (`pouch`, where the third finger let go). The stone
 * flies from the pouch through the fork; the server derives direction and range.
 */
export interface SlingshotMsg extends BaseMsg {
  type: 'Slingshot';
  anchor: Vec2;
  pouch: Vec2;
  team?: Team; // resolved by the table's gesture recognizer (R-03); server falls back to proximity
}

export interface BoostGateMsg extends BaseMsg {
  type: 'BoostGate';
  a: Vec2;
  b: Vec2;
  team?: Team;
}

export interface AbilityMsg extends BaseMsg {
  type: 'Ability';
  team: Team;
  kind: 'ghost' | 'destroy';
  targetId?: string;
}

export interface BorderPullMsg extends BaseMsg {
  type: 'BorderPull';
  gestureId?: string;
  end?: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
  team?: Team;
}

// Pilot joystick / item button on the table → Server
export interface PilotInputMsg extends BaseMsg {
  type: 'PilotInput';
  team: Team;
  /** 0..1 in pedal mode; ignored in auto mode. */
  throttle: number;
  steer: number;    // [-1, 1]
}

export interface PowerMsg extends BaseMsg {
  type: 'Power';
  team: Team;
  role: 'copilot';
}

export interface StartGameMsg extends BaseMsg {
  type: 'StartGame';
  mode?: 'table' | 'pc';
}

/** Start an endless tangible test with automatic pilots and a preset circuit. */
export interface StartTangibleTestMsg extends BaseMsg { type: 'StartTangibleTest' }

/** Start the guided tutorial on the predefined circuit (from the lobby). */
export interface StartTutorialMsg extends BaseMsg {
  type: 'StartTutorial';
  mode?: 'table' | 'pc';
}

/** A team gives up its current tutorial step. */
export interface TutorialSkipMsg extends BaseMsg {
  type: 'TutorialSkip';
  team: Team;
}

export interface PauseMsg extends BaseMsg {
  type: 'Pause';
}

export interface ToggleDriveModeMsg extends BaseMsg {
  type: 'ToggleDriveMode';
  team?: Team;
}

// Console Oz → Server
export interface TangibleMovedMsg extends BaseMsg {
  type: 'TangibleMoved';
  id: TangibleId;
  x: number; // normalized 0–1
  y: number;
  angle: number; // degrees
  active?: boolean; // atomic placement + activation; omitted preserves activation
}

export interface TangibleRemovedMsg extends BaseMsg {
  type: 'TangibleRemoved';
  id: TangibleId;
}

/** Oz grants exactly one placement; the table supplies contact geometry, never activation. */
export interface TangiblePlacementModeMsg extends BaseMsg { type: 'TangiblePlacementMode'; mode: TangiblePlacementMode }
export interface TangiblePrepareMsg extends BaseMsg { type: 'TangiblePrepare'; id: TangibleId }
export interface TangiblePlacementCancelMsg extends BaseMsg { type: 'TangiblePlacementCancel' }
export interface TangibleTouchPlacedMsg extends BaseMsg {
  type: 'TangibleTouchPlaced'; id: TangibleId; token: number; a: Vec2; b: Vec2;
}

/** Semantic lifecycle, shared by Oz and a future tangible sensor adapter. */
export interface TangibleControlMsg extends BaseMsg {
  type: 'TangibleControl';
  id: TangibleId;
  /** Only Oz: activation; legacy dock returns the object to the neutral depot. */
  action: 'configure' | 'dock' | 'activate' | 'deactivate';
  team?: Team;
  kind?: Tangible['kind'];
}

export interface NewGameMsg extends BaseMsg {
  type: 'NewGame';
}

export interface ResetMsg extends BaseMsg {
  type: 'Reset';
}
/**
 * PC-mode test switches. `invincible`: both cars are untouchable (no damage, stun,
 * slow-down or fall). `allItems`: every item is always armed and usable, without
 * pickup, and ability cooldowns are ignored. Ignored outside the PC mode.
 */
export interface TestToggleMsg extends BaseMsg {
  type: 'TestToggle';
  flag: 'invincible' | 'allItems';
  on: boolean;
}

export interface PingMsg extends BaseMsg {
  type: 'Ping';
}

// Server → All (broadcast)
export interface StateMsg extends BaseMsg {
  type: 'State';
  state: GameState;
}

export interface FeedbackMsg extends BaseMsg {
  type: 'Feedback';
  kind: string;
  x: number;
  y: number;
  team: Team;
}

export interface PongMsg extends BaseMsg {
  type: 'Pong';
  clientT: number; // echoed Ping.t
}

export interface PhaseChangeMsg extends BaseMsg {
  type: 'PhaseChange';
  phase: Phase;
  data?: unknown;
}

export type ClientMessage =
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

export type ServerMessage = StateMsg | FeedbackMsg | PhaseChangeMsg | PongMsg;
