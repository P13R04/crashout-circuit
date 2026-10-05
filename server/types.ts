// ─── Shared types ────────────────────────────────────────────────────────────
// Used by server code and imported by clients via the @shared alias.

export interface Vec2 {
  x: number;
  y: number;
}

export type Team = 'A' | 'B';
export type Phase = 'LOBBY' | 'MAP' | 'RACE' | 'RESULT';
export type ItemKind = 'slingshot' | 'boost';

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
  itemArmExpiry: number; // timestamp ms
  speed: number;         // signed forward speed, px/s (server-internal, broadcast for HUD)
  slowUntil: number;     // arc slow-down expiry
  boostUntil: number;    // boost gate effect expiry
  boostK: number;        // boost intensity factor of the active boost
}

export interface Wall {
  id: string;
  team: Team;
  pos: Vec2;
  angle: number;
  lengthPx: number;
  disabledUntil: number; // 0 = active
  expiresAt?: number;    // temporary walls created by the Oz console
}

export interface ArcElectric {
  id: string;
  team: Team;
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
}

export interface Stone {
  id: string;
  target: Vec2;
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
  outerEdge: Vec2[];
  innerEdge: Vec2[];
  widths: number[];
  checkpoints: Array<{ pos: Vec2; normal: Vec2 }>;
  startLine: { pos: Vec2; normal: Vec2 };
  startPositions: Vec2[];
  pickupPositions: Vec2[];
}

export interface MapTargets {
  A: [Vec2, Vec2];
  B: [Vec2, Vec2];
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
  borderPullCooldownS: number;
  stoneTelegraphS: number;
  stoneRadiusPx: number;
  boostLenMinPx: number;
  boostLenMaxPx: number;
  repairHoldS: number;
  logicalWidth: number;
  logicalHeight: number;
}

export interface GameState {
  phase: Phase;
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
  winner: Team | 'draw' | null;
  sessionStartAt: number;
  /** Imposed target points of each copilot, set on entering the MAP phase. */
  mapTargets: MapTargets | null;
  /** Which copilot strokes have been accepted so far. */
  mapStrokes: Record<Team, boolean>;
  mapDeadline: number;          // ms timestamp, 0 when not in MAP
  /** Repair gauge per team, 0..1 (C-06). */
  repairProgress: Record<Team, number>;
  /** Incremented whenever `track` changes; State broadcasts omit the track otherwise. */
  trackVersion: number;
  /** Operator-reported pylons currently on the table, keyed by tangible id. */
  tangibles: Record<number, { x: number; y: number; angle: number }>;
  params: GameParams;
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

export interface PadHoldMsg extends BaseMsg {
  type: 'PadHold';
  team: Team;
  role: 'pilot' | 'copilot';
  on: boolean;
}

export interface SlingshotMsg extends BaseMsg {
  type: 'Slingshot';
  x: number;
  y: number;
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
  throttle: number; // [-1, 1]
  steer: number;    // [-1, 1]
}

export interface UseItemMsg extends BaseMsg {
  type: 'UseItem';
  team: Team;
}

export interface StartGameMsg extends BaseMsg {
  type: 'StartGame';
}

// Console Oz → Server
export interface TangibleMovedMsg extends BaseMsg {
  type: 'TangibleMoved';
  id: 1 | 2 | 3 | 4;
  x: number; // normalized 0–1
  y: number;
  angle: number; // degrees
}

export interface TangibleRemovedMsg extends BaseMsg {
  type: 'TangibleRemoved';
  id: 1 | 2 | 3 | 4;
}

export interface NewGameMsg extends BaseMsg {
  type: 'NewGame';
}

export interface PingMsg extends BaseMsg {
  type: 'Ping';
}

export interface OzTriggerMsg extends BaseMsg {
  type: 'OzTrigger';
  kind: string;
  params: Record<string, unknown>;
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
  | PadHoldMsg
  | SlingshotMsg
  | BoostGateMsg
  | AbilityMsg
  | BorderPullMsg
  | PilotInputMsg
  | UseItemMsg
  | StartGameMsg
  | TangibleMovedMsg
  | TangibleRemovedMsg
  | OzTriggerMsg
  | PingMsg
  | NewGameMsg;

export type ServerMessage = StateMsg | FeedbackMsg | PhaseChangeMsg | PongMsg;
