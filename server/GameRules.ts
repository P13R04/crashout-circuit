/**
 * GameRules — everything that changes the game state in response to a message
 * or a timer: MAP strokes, pickups and arming, slingshot, boost gates, abilities,
 * tangible lifecycle, synchronous repair, border pull, PC test switches, victory,
 * and the guided tutorial (progression in Tutorial.ts, this class forwards the events).
 *
 * Vehicle motion and collisions live in PhysicsLoop; this class is driven by it
 * (`expire`, `afterMove`, `updateStones`, `updateRepair`, `checkEnd`, `tickMap`).
 * Time comes from an injectable clock so sessions can be replayed in tests (T-11).
 */
import type {
  GameState, Team, Vec2, Phase, ItemKind, Car, Wall, MapTargets, TrackGeometry,
  StrokeDrawMsg, MapDividerMsg, PadHoldMsg, SlingshotMsg, BoostGate, BoostGateMsg, AbilityMsg, BorderPullMsg,
  PilotInputMsg, PowerMsg, TangibleControlMsg, TangibleMovedMsg, TangibleRemovedMsg, TestToggleMsg,
  TangiblePlacementMode, TangibleTouchPlacedMsg,
} from './types.js';
import { orientBoostGate, hitsBoostGate } from './boostGeometry.js';
import { AutomaticPilot } from './AutomaticPilot.js';
import { config } from './config.js';
import { dist, distToSegment, nearestOnTrack, segmentsIntersect, slingshotShot, wrapAngle, clampToTrackRibbon } from './geometry.js';
import { generate, generatePreset, validateStroke, rebuildEdges } from './MapGenerator.js';
import { nearestStationTeam, LOGICAL_W, checkDivider, chargeZoneTeam, localToWorld, panelOf, CHARGE_ZONE_LOCAL } from './layout.js';
import { activeMapTeam, mapEndpointError, mapStrokeEndpoints } from './mapCreation.js';
import { Tutorial, TUTORIAL_ARM_WINDOW_S, TUTORIAL_PICKUP_RESPAWN_S, TUTORIAL_OBSTACLE_PREFIX } from './Tutorial.js';
import { withinCorrection, wallContact } from './tangibleGeometry.js';
import { tangibleArc, tangibleDefinition, validTangiblePose } from './tangibles.js';
import { tangibleTouchPose, TANGIBLE_WAIT_MS } from './tangibleTouch.js';

export const CAR_RADIUS = 10;
export const WALL_HALF_THICKNESS = 4;
const MAP_DURATION_MS = 30_000;
const COUNTDOWN_MS = 3_000;
const MAX_STROKE_POINTS = 4_000;
const PICKUP_RADIUS = 30;
const TEAMS: Team[] = ['A', 'B'];

export interface RulesHost {
  feedback(kind: string, x: number, y: number, team: Team): void;
  transition(phase: Phase, data?: unknown): void;
  /** Broadcast the full state (including the heavy track / QR fields). */
  broadcastFull(): void;
}

export interface TangibleLogEntry {
  t: number;
  type: 'TangibleMoved' | 'TangibleRemoved' | 'TangibleControl';
  action?: TangibleControlMsg['action'];
  team?: Team;
  kind?: 'wall' | 'pylon';
  id: number;
  x?: number;
  y?: number;
  angle?: number;
  active?: boolean;
}

export const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function makeCar(team: Team): Car {
  return {
    team,
    pos: { x: LOGICAL_W / 2, y: 540 },
    angle: 0,
    velocity: { x: 0, y: 0 },
    hp: config.hpMax,
    disabled: false,
    invulnUntil: 0,
    stunUntil: 0,
    ghostUntil: 0,
    lap: 0,
    checkpointIndex: 1,
    heldItem: null,
    itemArmed: false,
    itemArmExpiry: 0,
    speed: 0,
    slowUntil: 0,
    boostUntil: 0,
    boostK: 0,
  };
}

export function createInitialState(): GameState {
  return {
    phase: 'LOBBY',
    sessionMode: 'race',
    driveMode: { A: 'auto', B: 'auto' },
    tick: 0,
    cars: { A: makeCar('A'), B: makeCar('B') },
    walls: [],
    arcs: [],
    boostGates: [],
    stones: [],
    pickups: [],
    repairPads: {
      'A-pilot':   { team: 'A', role: 'pilot',   held: false, startedAt: 0 },
      'A-copilot': { team: 'A', role: 'copilot', held: false, startedAt: 0 },
      'B-pilot':   { team: 'B', role: 'pilot',   held: false, startedAt: 0 },
      'B-copilot': { team: 'B', role: 'copilot', held: false, startedAt: 0 },
    },
    cooldowns: {
      A: { ghost: 0, destroy: 0, borderPull: 0 },
      B: { ghost: 0, destroy: 0, borderPull: 0 },
    },
    track: null,
    deformations: [],
    winner: null,
    sessionStartAt: Date.now(),
    pausedAt: 0,
    mapTargets: null,
    mapDivider: null,
    mapStrokes: { A: false, B: false },
    mapDeadline: 0,
    mapMode: null,
    repairProgress: { A: 0, B: 0 },
    trackVersion: 0,
    tangibles: {},
    tangiblePlacementMode: 'manual',
    tangiblePlacement: null,
    testMode: { invincible: false, allItems: false },
    tutorial: null,
    params: {
      hpMax: config.hpMax,
      lapsToWin: config.lapsToWin,
      sessionMaxSeconds: config.sessionMaxSeconds,
      armWindowS: config.armWindowS,
      ghostS: config.ghostS,
      ghostCooldownS: config.ghostCooldownS,
      destroyCooldownS: config.destroyCooldownS,
      destroyDisableS: config.destroyDisableS,
      borderPullCooldownS: 0,
      trackDeformHoldS: config.trackDeformHoldS,
      trackDeformRelaxS: config.trackDeformRelaxS,
      stoneTelegraphS: config.stoneTelegraphS,
      stoneRadiusPx: config.stoneRadiusPx,
      slingMinPullPx: config.slingMinPullPx,
      slingMaxPullPx: config.slingMaxPullPx,
      slingMinRangePx: config.slingMinRangePx,
      slingMaxRangePx: config.slingMaxRangePx,
      boostLenMinPx: config.boostLenMinPx,
      boostLenMaxPx: config.boostLenMaxPx,
      repairHoldS: config.repairHoldS,
      wallLengthPx: config.wallLengthPx,
      wallWidthPx: config.wallWidthPx,
      pylonBasePx: config.pylonBasePx,
      pylonFieldRadiusPx: config.pylonFieldRadiusPx,
      tangibleTolerancePx: config.tangibleTolerancePx,
      tangibleCorrectionPx: config.tangibleCorrectionPx,
      tangibleCorrectionDegrees: config.tangibleCorrectionDegrees,
      tableDiagonalInches: config.tableDiagonalInches,
      arcMaxDistPx: config.arcMaxDistPx,
      logicalWidth: config.logicalWidth,
      logicalHeight: config.logicalHeight,
    },
  };
}

export class GameRules {
  private placementToken = 0;
  readonly inputs: Record<Team, { throttle: number; steer: number }> = {
    A: { throttle: 1, steer: 0 },
    B: { throttle: 1, steer: 0 },
  };
  /** Last received control heartbeat per team; stale steering is neutralised. */
  private lastPilotInputAt: Record<Team, number> = { A: 0, B: 0 };
  /** Full operator/TUIO log of pylon events (T-11, task 15). */
  readonly tangibleLog: TangibleLogEntry[] = [];

  private strokes: Record<Team, Vec2[] | null> = { A: null, B: null };
  /** A and B must draw on opposite sides of the divider. */
  private mapSide: Record<Team, number> = { A: 1, B: -1 };
  private idCounter = 0;
  private generating = false;
  private pausedAt = 0;
  private deformCounter = 0;
  private rng: () => number;
  private tutorial: Tutorial | null = null;
  private automaticPilot = new AutomaticPilot();

  constructor(
    private state: GameState,
    private host: RulesHost,
    private clock: () => number = Date.now,
    rng: () => number = Math.random,
  ) {
    this.rng = rng;
    // A tutorial lesson is done by the very event the clients are told about.
    const base = host;
    this.host = {
      ...base,
      feedback: (kind, x, y, team) => {
        base.feedback(kind, x, y, team);
        this.tutorial?.onFeedback(kind, team);
      },
    };
  }

  private get now(): number {
    return this.clock();
  }

  /** How long a pickup stays armed: learners get longer than the real rule. */
  private get armWindowMs(): number {
    return (this.state.tutorial ? TUTORIAL_ARM_WINDOW_S : config.armWindowS) * 1000;
  }

  private nextId(prefix: string): string {
    return `${prefix}${++this.idCounter}`;
  }

  // ─── MAP phase (task 2) ────────────────────────────────────────────────────

  /** Open the shared map setup. The first two table contacts define the divider. */
  enterMap(mode: 'table' | 'pc' = 'table'): void {
    const s = this.state;
    s.mapTargets = null;
    s.mapDivider = null;
    s.mapStrokes = { A: false, B: false };
    // Creation never advances by itself: players validate it explicitly.
    s.mapDeadline = 0;
    s.mapMode = mode;
    s.track = null;
    s.deformations = [];
    s.trackVersion++;
    this.strokes = { A: null, B: null };
    this.generating = false;
    s.walls = []; s.arcs = []; s.boostGates = []; s.stones = []; s.pickups = [];
    s.tangibles = {};
    s.winner = null;
    this.host.transition('MAP', { deadline: s.mapDeadline, mode });
    this.host.broadcastFull();
  }

  /**
   * Accept the two initial shared contacts. A draws a→b on one half; B draws
   * b→a on the other. The supplied line therefore stays visible and meaningful
   * all the way from creation to the generated circuit.
   */
  onMapDivider(msg: MapDividerMsg): void {
    const s = this.state;
    if (s.phase !== 'MAP' || s.mapDivider || this.generating) return;
    const a = msg.a, b = msg.b;
    if (![a?.x, a?.y, b?.x, b?.y].every(Number.isFinite)) return;
    // Same rule as the table's immediate check (layout.checkDivider): too short, or
    // outside the free area of the table. The refusal is shown, never silent.
    const verdict = checkDivider(a, b);
    if (verdict !== 'ok') {
      this.host.feedback(verdict === 'tooShort' ? 'dividerTooShort' : 'dividerOutOfZone', a.x, a.y, 'A');
      return;
    }
    s.mapDivider = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    s.mapTargets = { A: [s.mapDivider[0], s.mapDivider[1]], B: [s.mapDivider[1], s.mapDivider[0]] };
    this.host.broadcastFull();
  }

  onStrokeDraw(msg: StrokeDrawMsg): void {
    const s = this.state;
    if (s.phase !== 'MAP' || !s.mapTargets || !s.mapDivider || this.generating) return;
    const team = msg.creator;
    if (team !== 'A' && team !== 'B') return;
    const [p1, p2] = s.mapTargets[team];
    if (s.mapStrokes[team] || activeMapTeam(s) !== team) {
      this.host.feedback(s.mapStrokes[team] ? 'mapLocked' : 'mapWaitCyan', p1.x, p1.y, team);
      return;
    }
    let pts = (msg.pts ?? [])
      .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .slice(0, MAX_STROKE_POINTS)
      .map(p => ({ x: p.x, y: p.y }));
    const error = mapEndpointError(pts, p1, p2)
      ?? (!validateStroke(pts, p1, p2) ? 'mapError' : null)
      ?? (!this.staysInHalf(team, pts, s.mapDivider) ? 'mapWrongSide' : null);
    if (error) {
      const last = pts[pts.length - 1] ?? p1;
      this.host.feedback(error, last.x, last.y, team);
      return;
    }
    const [drawStart, drawEnd] = mapStrokeEndpoints(pts[0], p1, p2);
    if (drawStart === p2) pts = pts.reverse();
    // Once accepted, lock the endpoints exactly to the common anchors. This
    // makes a near miss inside the target ring a clean, continuous circuit.
    pts[0] = { ...p1 };
    pts[pts.length - 1] = { ...p2 };
    this.strokes[team] = pts;
    s.mapStrokes[team] = true;
    this.host.broadcastFull();
    this.host.feedback('mapAccepted', drawEnd.x, drawEnd.y, team);
  }

  /** The shared button is the explicit handoff from drawing to generation. */
  onGenerateTrack(): void {
    if (this.state.phase !== 'MAP' || !this.strokes.A || !this.strokes.B || this.generating) return;
    void this.buildTrack();
  }

  /**
   * A half-stroke belongs to its own side of the divider, but it may loop over it or
   * cross it (a figure of eight is a legitimate circuit): it is refused only when most
   * of it was drawn on the opponent's side.
   */
  private staysInHalf(team: Team, pts: Vec2[], divider: [Vec2, Vec2]): boolean {
    const [a, b] = divider;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const own = pts.filter(p => (this.mapSide[team] * (dx * (p.y - a.y) - dy * (p.x - a.x))) / len >= 0).length;
    return own >= 0.4 * pts.length;
  }

  tickMap(now: number): void {
    const s = this.state;
    // MAP is intentionally player-paced: time never erases a drawing attempt.
    void now;
  }

  /** Runs outside the physics tick (REQ: generation happens once, in a Promise). */
  private async buildTrack(): Promise<void> {
    if (this.generating) return;
    this.generating = true;
    await Promise.resolve();
    const t = this.state.mapTargets!;
    const a = this.strokes.A ?? [];
    const b = this.strokes.B ?? [];
    const started = Date.now();
    const track = generate(a, b, t.A[0], t.A[1], t.B[0], t.B[1]);
    console.log(`[GameRules] Track generated in ${Date.now() - started} ms`);
    this.startRace(track, true);
  }

  // ─── RACE start ────────────────────────────────────────────────────────────

  startRace(track = generatePreset(), waitForPlayers = false): void {
    this.state.tangiblePlacement = null;
    const s = this.state;
    this.generating = true;
    this.automaticPilot.reset();
    s.track = track;
    s.pausedAt = 0;
    this.pausedAt = 0;
    s.deformations = [];
    s.trackVersion++;
    for (const team of TEAMS) {
      const car = makeCar(team);
      const sp = track.startPositions[team === 'A' ? 0 : 1];
      const tan = { x: track.startLine.normal.y, y: -track.startLine.normal.x };
      car.pos = { x: sp.x, y: sp.y };
      car.angle = Math.atan2(tan.y, tan.x);
      s.cars[team] = car;
      this.inputs[team] = { throttle: this.state.driveMode[team] === 'pedal' ? 0 : 1, steer: 0 };
      this.lastPilotInputAt[team] = this.now;
      s.repairProgress[team] = 0;
      s.cooldowns[team] = { ghost: 0, destroy: 0, borderPull: 0 };
    }
    for (const pad of Object.values(s.repairPads)) { pad.held = false; pad.startedAt = 0; }
    s.walls = []; s.arcs = []; s.boostGates = []; s.stones = [];
    s.pickups = track.pickupPositions.map((pos, i) => ({
      id: i, pos: clampToTrackRibbon(pos, track, 25), kind: this.randomItem(), respawnAt: 0,
    }));
    s.winner = null;
    s.sessionStartAt = waitForPlayers ? 0 : this.now + COUNTDOWN_MS;
    this.rebuildTangibles();
    this.host.transition(waitForPlayers ? 'READY' : 'RACE', { startsAt: s.sessionStartAt });
    this.host.broadcastFull();
  }

  /** The generated circuit can be inspected before the actual race countdown. */
  beginRace(): void {
    if (this.state.phase !== 'READY') return;
    this.state.sessionStartAt = this.now + COUNTDOWN_MS;
    this.host.transition('RACE', { startsAt: this.state.sessionStartAt });
    this.host.broadcastFull();
  }

  /** One operator and one copilot can exercise real tangible rules without drivers. */
  startTangibleTest(): void {
    const s = this.state;
    if (s.phase !== 'LOBBY') return;
    s.sessionMode = 'tangibles-test';
    s.mapMode = 'table';
    s.testMode = { invincible: false, allItems: false };
    this.startRace(generatePreset(), true);
  }

  updateAutomaticPilots(now: number): void {
    const s = this.state;
    if (s.sessionMode !== 'tangibles-test' || !s.track || s.phase !== 'RACE') return;
    for (const team of TEAMS) {
      this.inputs[team] = now < s.sessionStartAt + (team === 'B' ? 2000 : 0)
        ? { throttle: 0, steer: 0 } : this.automaticPilot.command(s.cars[team], s.track, s.trackVersion);
    }
  }

  /**
   * Guided session on the predefined circuit: the race phase, but each team follows
   * its own lessons (Tutorial.ts), nobody wins and nothing costs HP. `mode` only tells
   * the table whether a mouse (PC) or fingers (table) are used.
   */
  startTutorial(mode: 'table' | 'pc' = 'table'): void {
    const s = this.state;
    if (s.phase !== 'LOBBY') return;
    s.mapMode = mode;
    s.params.armWindowS = TUTORIAL_ARM_WINDOW_S;
    this.tutorial = new Tutorial(s, {
      now: () => this.now,
      breakDown: (team) => {
        const car = s.cars[team];
        car.hp = 0;
        car.disabled = true;
        car.speed = 0;
        car.velocity = { x: 0, y: 0 };
        this.host.feedback('carDisabled', car.pos.x, car.pos.y, team);
      },
      restore: (team) => {
        const car = s.cars[team];
        car.disabled = false;
        car.stunUntil = 0;
        car.invulnUntil = this.now + config.invulnAfterHitS * 1000;
        this.respawnAtCheckpoint(car);
        s.repairProgress[team] = 0;
      },
      feedback: (kind, x, y, team) => this.host.feedback(kind, x, y, team),
    }, mode);
    this.startRace(generatePreset());
  }

  tutorialSkip(team: Team): void {
    if (this.state.phase === 'RACE' && (team === 'A' || team === 'B')) this.tutorial?.skip(team);
  }

  /** PC-only test switches: ignored unless the session was started in PC mode. */
  onTestToggle(msg: TestToggleMsg): void {
    const s = this.state;
    // The lessons need the real item rules: no free items, no invincibility switch
    if (s.mapMode !== 'pc' || s.tutorial) return;
    if (msg.flag !== 'invincible' && msg.flag !== 'allItems') return;
    s.testMode[msg.flag] = !!msg.on;
    if (msg.flag === 'allItems' && !msg.on) {
      // back to the normal rules: nothing stays armed for free
      for (const t of TEAMS) {
        const car = s.cars[t];
        car.itemArmed = false;
        car.itemArmExpiry = 0;
      }
    }
    this.host.broadcastFull();
  }

  /** Pause freezes physics and timers; resuming shifts the race clock accordingly. */
  togglePause(): void {
    this.cancelTangiblePlacement();
    const s = this.state;
    if (s.phase === 'RACE') {
      this.pausedAt = this.now;
      s.pausedAt = this.pausedAt;
      this.releaseAllPads();
      this.host.transition('PAUSED');
      this.host.broadcastFull();
    } else if (s.phase === 'PAUSED') {
      const delta = this.now - this.pausedAt;
      const shift = (value: number) => value > this.pausedAt ? value + delta : value;
      s.sessionStartAt += delta;
      for (const car of Object.values(s.cars)) {
        for (const key of ['itemArmExpiry', 'invulnUntil', 'stunUntil', 'ghostUntil', 'slowUntil', 'boostUntil'] as const) car[key] = shift(car[key]);
      }
      for (const cd of Object.values(s.cooldowns)) { cd.ghost = shift(cd.ghost); cd.destroy = shift(cd.destroy); }
      for (const wall of s.walls) { wall.disabledUntil = shift(wall.disabledUntil); if (wall.expiresAt) wall.expiresAt = shift(wall.expiresAt); }
      for (const arc of s.arcs) arc.disabledUntil = shift(arc.disabledUntil);
      for (const pickup of s.pickups) pickup.respawnAt = shift(pickup.respawnAt);
      for (const gate of s.boostGates) { gate.expiresAt = shift(gate.expiresAt); if (gate.createdAt !== undefined) gate.createdAt += delta; }
      for (const stone of s.stones) { stone.launchedAt += delta; stone.impactAt = shift(stone.impactAt); }
      for (const d of s.deformations) { d.createdAt += delta; if (d.releaseAt !== null) d.releaseAt += delta; }
      this.pausedAt = 0;
      s.pausedAt = 0;
      this.host.transition('RACE');
      this.host.broadcastFull();
    }
  }

  private randomItem(): ItemKind {
    return this.rng() < 0.5 ? 'slingshot' : 'boost';
  }

  resetToLobby(): void {
    const s = this.state;
    s.winner = null;
    s.track = null;
    s.trackVersion++;
    s.walls = []; s.arcs = []; s.boostGates = []; s.stones = []; s.pickups = [];
    s.tangibles = {};
    s.tangiblePlacement = null;
    s.mapTargets = null;
    s.mapDivider = null;
    s.mapStrokes = { A: false, B: false };
    s.mapMode = null;
    s.sessionMode = 'race';
    this.automaticPilot.reset();
    s.testMode = { invincible: false, allItems: false };
    s.tutorial = null;
    this.tutorial = null;
    s.params.armWindowS = config.armWindowS;
    s.mapDeadline = 0;
    this.generating = false;
    this.strokes = { A: null, B: null };
    this.pausedAt = 0;
    s.pausedAt = 0;
    this.releaseAllPads();
    this.inputs.A = { throttle: 1, steer: 0 };
    this.inputs.B = { throttle: 1, steer: 0 };
    s.cars.A = makeCar('A');
    s.cars.B = makeCar('B');
    s.repairProgress = { A: 0, B: 0 };
    s.cooldowns = {
      A: { ghost: 0, destroy: 0, borderPull: 0 },
      B: { ghost: 0, destroy: 0, borderPull: 0 },
    };
    this.host.transition('LOBBY');
    this.host.broadcastFull();
  }

  // ─── Pilot input & items (task 5, 7) ───────────────────────────────────────

  onPilotInput(team: Team, msg: PilotInputMsg): void {
    if (this.state.sessionMode === 'tangibles-test') return;
    if (!Number.isFinite(msg.throttle) || !Number.isFinite(msg.steer)) return;
    const steer = clamp(msg.steer, -1, 1);
    this.inputs[team] = {
      throttle: clamp(msg.throttle, 0, 1),
      steer: steer * config.steerGain,
    };
    this.lastPilotInputAt[team] = this.now;
    if (this.now >= this.state.sessionStartAt) this.tutorial?.onPilotInput(team, steer, this.inputs[team].throttle);
  }

  /** Each pilot chooses continuous acceleration or a held pedal. */
  toggleDriveMode(team?: Team): void {
    if (this.state.phase === 'RESULT' || this.state.sessionMode === 'tangibles-test') return;
    if (team) {
      this.state.driveMode[team] = this.state.driveMode[team] === 'auto' ? 'pedal' : 'auto';
      this.inputs[team].throttle = 0;
    } else {
      for (const t of TEAMS) {
        this.state.driveMode[t] = this.state.driveMode[t] === 'auto' ? 'pedal' : 'auto';
        this.inputs[t].throttle = 0;
      }
    }

    this.tutorial?.onDriveMode();
    this.host.broadcastFull();
  }

  /** Safety net for a lost pointer-up, a crashed client or a dropped WebSocket. */
  expirePilotInputs(now: number): void {
    if (this.state.sessionMode === 'tangibles-test') return;
    for (const team of TEAMS) {
      if (now - this.lastPilotInputAt[team] > config.pilotInputTimeoutMs) this.inputs[team].steer = 0;
    }
  }

  /** POWER only arms the copilot team’s pickup; tangible activation belongs to Oz. */
  onPower(team: Team, _msg?: PowerMsg): void {
    if (this.state.phase !== 'RACE') return;
    const car = this.state.cars[team];
    if (car.heldItem !== null && !car.itemArmed) {
      car.itemArmed = true;
      car.itemArmExpiry = this.now + this.armWindowMs;
      this.host.feedback('itemArmed', car.pos.x, car.pos.y, team);
    }
  }

  // ─── Slingshot (C-01) ──────────────────────────────────────────────────────

  /** Resolve the armed stock owner; the gesturing team may steal that stock. */
  private resolveArmedTeam(kind: ItemKind, at: Vec2): Team | null {
    const now = this.now;
    const ok = TEAMS.filter(t => {
      const c = this.state.cars[t];
      return c.itemArmed && (this.state.testMode.allItems || c.heldItem === kind) && now < c.itemArmExpiry;
    });
    if (ok.length === 0) return null;
    if (ok.length === 1) return ok[0];
    return nearestStationTeam(at);
  }

  private gestureTeam(at: Vec2, reported?: Team): Team {
    return reported === 'A' || reported === 'B' ? reported : nearestStationTeam(at);
  }

  private consumeItem(team: Team): void {
    const car = this.state.cars[team];
    car.heldItem = null;
    car.itemArmed = false;
    car.itemArmExpiry = 0;
  }

  /**
   * The stone is launched from the pouch through the fork. Too short a pull does
   * nothing and keeps the item armed, so the copilot can simply try again.
   */
  onSlingshot(msg: SlingshotMsg): void {
    this.tickTangiblePlacement(this.now);
    if (this.state.tangiblePlacement) return;
    if (this.state.phase !== 'RACE' || !msg.anchor || !msg.pouch) return;
    const anchor = { x: msg.anchor.x, y: msg.anchor.y };
    const pouch = { x: msg.pouch.x, y: msg.pouch.y };
    if (![anchor.x, anchor.y, pouch.x, pouch.y].every(Number.isFinite)) return;
    const shot = slingshotShot(anchor, pouch, config);
    if (!shot.valid) return;
    const owner = this.resolveArmedTeam('slingshot', anchor);
    if (!owner) return;
    const team = this.gestureTeam(anchor, msg.team);
    this.consumeItem(owner);
    const now = this.now;
    this.state.stones.push({
      id: this.nextId('stone'),
      from: pouch,
      target: shot.target,
      launchedAt: now,
      impactAt: now + config.stoneTelegraphS * 1000,
      team,
    });
    this.host.feedback('stoneWarning', shot.target.x, shot.target.y, team);
  }

  updateStones(now: number): void {
    const s = this.state;
    if (s.stones.length === 0) return;
    const remaining = [];
    for (const stone of s.stones) {
      if (stone.impactAt > now) { remaining.push(stone); continue; }
      const victim = s.cars[other(stone.team)];
      this.host.feedback('stoneImpact', stone.target.x, stone.target.y, stone.team);
      if (!victim.disabled && !s.testMode.invincible && dist(victim.pos, stone.target) <= config.stoneRadiusPx) {
        this.damage(victim, config.dmgStone, now);
        victim.stunUntil = now + config.stunStoneS * 1000;
        victim.speed = 0;
        // Cartoon "POW" on the car that was hit (the impact itself is already announced)
        this.host.feedback('stoneHit', victim.pos.x, victim.pos.y, victim.team);
      }
    }
    s.stones = remaining;
  }

  // ─── Boost gate (C-02) ─────────────────────────────────────────────────────

  onBoostGate(msg: BoostGateMsg): void {
    this.tickTangiblePlacement(this.now);
    if (this.state.tangiblePlacement) return;
    if (this.state.phase !== 'RACE' || !msg.a || !msg.b) return;
    const a = { x: msg.a.x, y: msg.a.y };
    const b = { x: msg.b.x, y: msg.b.y };
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return;
    const len = dist(a, b);
    if (len < config.boostLenMinPx - 1e-6 || len > config.boostLenMaxPx + 1e-6) return;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const owner = this.resolveArmedTeam('boost', mid);
    if (!owner) return;
    const team = this.gestureTeam(mid, msg.team);
    this.consumeItem(owner);
    this.addBoostGate(team, a, b);
  }

  private addBoostGate(team: Team, a: Vec2, b: Vec2): void {
    const mid = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
    const pose = orientBoostGate(a,b,this.state.track);
    this.state.boostGates.push({
      id: this.nextId('gate'),
      team,
      ...pose,
      expiresAt: this.now + config.boostGateLifeS * 1000,
      createdAt: this.now,
    });
    this.host.feedback('boostGate', mid.x, mid.y, team);
  }

  carHitsBoostGate(prev: Vec2, pos: Vec2, g: BoostGate): boolean {
    return hitsBoostGate(prev,pos,g);
  }

  /** k = clamp(length / boostLenMaxPx, 0.3, 1) (REQ-4.3.2) */
  boostFactor(a: Vec2, b: Vec2): number {
    return clamp(dist(a, b) / config.boostLenMaxPx, 0.3, 1);
  }

  // ─── Abilities (C-03, C-04) ────────────────────────────────────────────────

  onAbility(msg: AbilityMsg): void {
    const s = this.state;
    if (s.phase !== 'RACE') return;
    const team = msg.team;
    if (team !== 'A' && team !== 'B') return;
    const now = this.now;
    const cd = s.cooldowns[team];
    const car = s.cars[team];

    if (msg.kind === 'ghost') {
      if (!s.testMode.allItems && now < cd.ghost) return;
      car.ghostUntil = now + config.ghostS * 1000;
      // Recharge starts when the ghost effect ends (T-08: 3 s, then 20 s)
      if (!s.testMode.allItems) cd.ghost = car.ghostUntil + config.ghostCooldownS * 1000;
      this.host.feedback('ghost', car.pos.x, car.pos.y, team);
    } else if (msg.kind === 'destroy') {
      if ((!s.testMode.allItems && now < cd.destroy) || !msg.targetId) return;
      const target = s.walls.find(w => w.id === msg.targetId) ?? s.arcs.find(a => a.id === msg.targetId);
      if (!target || target.team === team) return;
      target.disabledUntil = now + config.destroyDisableS * 1000;
      if (!s.testMode.allItems) cd.destroy = now + config.destroyCooldownS * 1000;
      const at = 'pos' in target ? target.pos : { x: (target.pylon1.x + target.pylon2.x) / 2, y: (target.pylon1.y + target.pylon2.y) / 2 };
      this.host.feedback('wallDestroyed', at.x, at.y, team);
    }
  }

  // ─── Synchronous repair (C-06) ─────────────────────────────────────────────

  onPadHold(msg: PadHoldMsg): void {
    if (this.state.sessionMode === 'tangibles-test' && msg.role === 'pilot') return;
    const pad = this.state.repairPads[`${msg.team}-${msg.role}`];
    if (!pad) return;
    pad.held = !!msg.on;
    pad.startedAt = pad.held ? this.now : 0;
  }

  releaseAllPads(): void {
    for (const pad of Object.values(this.state.repairPads)) { pad.held = false; pad.startedAt = 0; }
  }

  /** Gauge fills only while BOTH pads of a team are held; any release resets it (T-09). */
  updateRepair(dt: number, now: number): void {
    const s = this.state;
    for (const team of TEAMS) {
      const car = s.cars[team];
      const needsRepair = car.disabled || car.hp < config.repairHpRestore;
      if (s.sessionMode === 'tangibles-test') {
        const pilot = s.repairPads[`${team}-pilot`];
        if (pilot.held !== needsRepair) { pilot.held = needsRepair; pilot.startedAt = needsRepair ? now : 0; }
      }
      const both = s.repairPads[`${team}-pilot`].held && s.repairPads[`${team}-copilot`].held;
      if (!both || !needsRepair) { s.repairProgress[team] = 0; continue; }
      s.repairProgress[team] = Math.min(1, s.repairProgress[team] + dt / config.repairHoldS);
      if (s.repairProgress[team] >= 1) this.completeRepair(team, now);
    }
  }

  private completeRepair(team: Team, now: number): void {
    const s = this.state;
    const car = s.cars[team];
    const wasDisabled = car.disabled;
    car.hp = Math.max(car.hp, config.repairHpRestore);
    car.disabled = false;
    car.stunUntil = 0;
    car.invulnUntil = now + config.invulnAfterHitS * 1000;
    if (wasDisabled && s.track) {
      this.respawnAtCheckpoint(car);
      this.automaticPilot.forget(team);
    }
    s.repairProgress[team] = 0;
    if (s.sessionMode === 'tangibles-test') {
      const pilot = s.repairPads[`${team}-pilot`];
      pilot.held = false; pilot.startedAt = 0;
    }
    this.host.feedback('repairDone', car.pos.x, car.pos.y, team);
  }

  respawnAtCheckpoint(car: Car): void {
    const track = this.state.track!;
    const last = (car.checkpointIndex - 1 + track.checkpoints.length) % track.checkpoints.length;
    const cp = track.checkpoints[last];
    car.pos = { x: cp.pos.x, y: cp.pos.y };
    car.angle = Math.atan2(-cp.normal.x, cp.normal.y);
    car.speed = 0;
    car.velocity = { x: 0, y: 0 };
  }

  // ─── Damage ────────────────────────────────────────────────────────────────

  damage(car: Car, amount: number, now: number): void {
    if (car.disabled || this.state.testMode.invincible) return;
    if (this.state.tutorial) amount = 0; // lessons show the hit, never its cost
    car.hp = Math.max(0, car.hp - amount);
    this.host.feedback('hit', car.pos.x, car.pos.y, car.team);
    if (car.hp === 0) {
      car.disabled = true;
      car.speed = 0;
      car.velocity = { x: 0, y: 0 };
      this.host.feedback('carDisabled', car.pos.x, car.pos.y, car.team);
    }
    void now;
  }

  /** Leaving the neon ribbon is a fall, not a wall collision. */
  fallOffTrack(team: Team, now: number): void {
    const car = this.state.cars[team];
    if (car.disabled) return;
    if (this.state.testMode.invincible || this.state.tutorial) {
      // Invincible: the fall costs nothing, the car is simply put back on the track
      this.respawnAtCheckpoint(car);
      this.host.feedback('fall', car.pos.x, car.pos.y, team);
      return;
    }
    car.hp = 0;
    car.disabled = true;
    car.speed = 0;
    car.velocity = { x: 0, y: 0 };
    this.host.feedback('fall', car.pos.x, car.pos.y, team);
    this.host.feedback('carDisabled', car.pos.x, car.pos.y, team);
    void now;
  }

  // ─── Tangible pylons (C-05) ────────────────────────────────────────────────

  setTangiblePlacementMode(mode: TangiblePlacementMode): void {
    if (mode !== 'manual' && mode !== 'touch') return;
    this.state.tangiblePlacementMode = mode;
    this.cancelTangiblePlacement();
    this.host.broadcastFull();
  }

  /** Oz's announcement also acknowledges the physical recharge before this new pose. */
  prepareTangiblePlacement(id: number): void {
    if (this.state.tangiblePlacementMode !== 'touch' || !tangibleDefinition(id)
      || !['READY','RACE'].includes(this.state.phase) || this.state.tangibles[id]?.status === 'placed') return;
    this.state.tangiblePlacement = {id:id as 1|2|3, token:++this.placementToken, expiresAt:this.now+TANGIBLE_WAIT_MS};
    this.host.broadcastFull();
  }

  cancelTangiblePlacement(): void {
    if (!this.state.tangiblePlacement) return;
    this.state.tangiblePlacement = null;
    this.host.broadcastFull();
  }

  tickTangiblePlacement(now: number): void {
    const pending=this.state.tangiblePlacement;
    if (pending && (now>=pending.expiresAt || !['READY','RACE'].includes(this.state.phase))) this.cancelTangiblePlacement();
  }

  onTangibleTouchPlaced(msg: TangibleTouchPlacedMsg): void {
    this.tickTangiblePlacement(this.now);
    const s=this.state, pending=s.tangiblePlacement, definition=tangibleDefinition(msg.id);
    if(s.tangiblePlacementMode!=='touch'||!pending||!definition||pending.id!==msg.id||pending.token!==msg.token
      ||s.tangibles[msg.id]?.status==='placed')return;
    const pose=tangibleTouchPose(definition.kind,msg.a,msg.b,s.params);
    if(!pose)return;
    // The single-use grant is consumed atomically; delayed/replayed packets cannot move it.
    s.tangiblePlacement=null;
    s.tangibles[msg.id]={...pose,kind:definition.kind,team:null,active:true,status:'placed',dockTeam:null,placementOrigin:{...pose}};
    this.tangibleLog.push({t:this.now,type:'TangibleMoved',id:msg.id,...pose,active:true});
    this.rebuildTangibles();
    this.host.broadcastFull();
  }

  /** Neutral inventory; only Oz can acknowledge the physical charging cycle. */
  onTangibleControl(msg: TangibleControlMsg): void {
    const id = Number(msg.id), definition = tangibleDefinition(id);
    if (!definition || !['READY', 'RACE', 'PAUSED'].includes(this.state.phase)) return;
    if (!['dock','activate','deactivate'].includes(msg.action)) return;
    if (this.state.tangiblePlacement?.id === id) this.cancelTangiblePlacement();
    if (msg.action === 'dock') {
      if (msg.team !== 'A' && msg.team !== 'B') return;
      const at = localToWorld(panelOf(msg.team, 'copilot'), CHARGE_ZONE_LOCAL.x, CHARGE_ZONE_LOCAL.y);
      this.state.tangibles[id] = { x: at.x / config.logicalWidth, y: at.y / config.logicalHeight,
        angle: 0, kind: definition.kind, team: null, dockTeam: msg.team, status: 'docked', active: false };
    } else if (msg.action === 'activate' || msg.action === 'deactivate') {
      const t = this.state.tangibles[id];
      if (!t) return;
      t.active = msg.action === 'activate';
    } else return;
    this.tangibleLog.push({ t: this.now, type: 'TangibleControl', id, action: msg.action, team: msg.action === 'dock' ? msg.team : undefined });
    this.rebuildTangibles();
  }

  onTangibleMoved(msg: TangibleMovedMsg): void {
    if (this.state.tangiblePlacementMode === 'touch') return;
    const id = Number(msg.id), definition = tangibleDefinition(id);
    if (!definition || !['READY', 'RACE', 'PAUSED'].includes(this.state.phase)
      || ![msg.x, msg.y, msg.angle].every(Number.isFinite)
      || (msg.active !== undefined && typeof msg.active !== 'boolean')) return;
    const dock = chargeZoneTeam({ x: msg.x * config.logicalWidth, y: msg.y * config.logicalHeight });
    if (dock) { this.onTangibleControl({ ...msg, type: 'TangibleControl', action: 'dock', team: dock }); return; }
    if (!validTangiblePose(definition.kind, msg, config)) return;
    const old = this.state.tangibles[id];
    if (!old || (old.status === 'docked' && !old.active)) return;
    if (old.status === 'placed' && (!old.placementOrigin || !withinCorrection(old.placementOrigin, msg, config))) return;
    const { x, y } = msg, angle = ((msg.angle % 360) + 360) % 360;
    const active = msg.active ?? old.active;
    const placementOrigin = old.status === 'placed' ? old.placementOrigin : { x, y, angle };
    this.state.tangibles[id] = { x, y, angle, active, kind: definition.kind, team: null,
      dockTeam: null, status: 'placed', placementOrigin };
    this.tangibleLog.push({ t: this.now, type: 'TangibleMoved', id, x, y, angle, active });
    this.rebuildTangibles();
  }

  onTangibleRemoved(msg: TangibleRemovedMsg): void {
    const id = Number(msg.id);
    if (!tangibleDefinition(id) || !['READY', 'RACE', 'PAUSED'].includes(this.state.phase)) return;
    if (this.state.tangiblePlacement?.id === id) this.cancelTangiblePlacement();
    this.tangibleLog.push({ t: this.now, type: 'TangibleRemoved', id });
    delete this.state.tangibles[id];
    this.rebuildTangibles();
  }

  private rebuildTangibles(): void {
    const s = this.state;
    const oldDisabled = new Map([...s.walls, ...s.arcs].map(w => [w.id, w.disabledUntil]));
    s.walls = s.walls.filter(w => w.expiresAt);
    s.arcs = s.arcs.filter(a => a.id.startsWith(TUTORIAL_OBSTACLE_PREFIX));
    const px = (t: { x: number; y: number }): Vec2 => ({ x: t.x * config.logicalWidth, y: t.y * config.logicalHeight });
    const wall = s.tangibles[1];
    if (wall?.active && wall.status === 'placed') s.walls.push({ id: 'wall-1', team: null, pos: px(wall), angle: wall.angle,
      lengthPx: config.wallLengthPx, widthPx: config.wallWidthPx, tolerancePx: config.tangibleTolerancePx, disabledUntil: oldDisabled.get('wall-1') ?? 0 });
    const arc = tangibleArc(s.tangibles, config);
    if (arc) s.arcs.push({ ...arc, disabledUntil: oldDisabled.get(arc.id) ?? 0 });
    this.tutorial?.onTangibles();
  }

  /** Wall as a segment: centre ± direction·length/2 (angle in degrees). */
  static wallEnds(w: Pick<Wall, 'pos' | 'angle' | 'lengthPx'>): [Vec2, Vec2] {
    const a = (w.angle * Math.PI) / 180;
    const hx = (Math.cos(a) * w.lengthPx) / 2;
    const hy = (Math.sin(a) * w.lengthPx) / 2;
    return [{ x: w.pos.x - hx, y: w.pos.y - hy }, { x: w.pos.x + hx, y: w.pos.y + hy }];
  }

  // ─── Local border pull (C-07) ──────────────────────────────────────────────

  onBorderPull(msg: BorderPullMsg): void {
    this.tickTangiblePlacement(this.now);
    if (this.state.tangiblePlacement) return;
    const s = this.state;
    const track = s.track;
    if (s.phase !== 'RACE' || !track || ![msg.x, msg.y, msg.dx, msg.dy].every(Number.isFinite)) return;
    const pull = Math.hypot(msg.dx, msg.dy);
    if (pull < 20 || pull > config.trackDeformMaxShiftPx * 1.8) return;
    const team = msg.team ?? nearestStationTeam({ x: msg.x, y: msg.y });
    this.deformTrack({ x: msg.x, y: msg.y }, { x: msg.dx, y: msg.dy }, team);
  }

  /**
   * Shift a short piece of the centerline sideways. Both edges follow the same
   * displacement, so this creates a temporary double chicane rather than a
   * wider road. A new pull starts immediately while the prior one reforms.
   */
  private deformTrack(at: Vec2, drag: Vec2, team: Team): void {
    const track = this.state.track;
    if (!track) return;
    const hit = nearestOnTrack(at, track);
    // Keep only the component that goes out through the grabbed edge.
    const edge = { x: at.x - hit.closest.x, y: at.y - hit.closest.y };
    const edgeLen = Math.hypot(edge.x, edge.y);
    if (edgeLen < 1e-6) return;
    const outward = { x: edge.x / edgeLen, y: edge.y / edgeLen };
    const projected = drag.x * outward.x + drag.y * outward.y;
    if (projected < 20) return;
    const amount = Math.min(config.trackDeformMaxShiftPx, projected);
    const now = this.now;

    // There is one active gesture only. Older local shifts remain briefly as
    // they ease home, which makes repeated interventions continuous.
    for (const deformation of this.state.deformations) {
      if (deformation.releaseAt === null) deformation.releaseAt = now;
    }
    this.state.deformations.push({
      id: `deform-${++this.deformCounter}`,
      index: hit.index,
      dx: outward.x * amount,
      dy: outward.y * amount,
      createdAt: now,
      releaseAt: null,
      strength: 0,
    });
    this.updateTrackDeformations(now);
    this.host.feedback('trackDeformed', hit.closest.x, hit.closest.y, team);
  }

  /** Rebuild the transient road from the immutable centerline every simulation step. */
  updateTrackDeformations(now: number): void {
    const track = this.state.track;
    if (!track || this.state.deformations.length === 0) return;
    const rampMs = config.trackDeformRampS * 1000;
    const holdMs = config.trackDeformHoldS * 1000;
    const relaxMs = config.trackDeformRelaxS * 1000;
    let changed = false;

    for (const d of this.state.deformations) {
      if (d.releaseAt === null && now >= d.createdAt + rampMs + holdMs) d.releaseAt = now;
      const next = d.releaseAt === null
        ? clamp((now - d.createdAt) / rampMs, 0, 1)
        : clamp(1 - (now - d.releaseAt) / relaxMs, 0, 1);
      if (Math.abs(next - d.strength) > 1e-5) changed = true;
      d.strength = next;
    }
    // A just-created pull starts at strength 0, so only discard a deformation
    // once its release animation has actually reached zero.
    const kept = this.state.deformations.filter(d => d.releaseAt === null || d.strength > 0);
    if (kept.length !== this.state.deformations.length) changed = true;
    this.state.deformations = kept;

    if (!changed) return;
    const n = track.baseCenterline.length;
    const radius = config.trackDeformRadiusPoints;
    track.centerline = track.baseCenterline.map((base, i) => {
      let x = base.x, y = base.y;
      for (const d of this.state.deformations) {
        const delta = Math.abs(i - d.index);
        const circular = Math.min(delta, n - delta);
        if (circular > radius) continue;
        const falloff = Math.cos((circular / (radius + 1)) * Math.PI / 2);
        x += d.dx * d.strength * falloff;
        y += d.dy * d.strength * falloff;
      }
      return { x, y };
    });
    rebuildEdges(track);
    this.alignTrackFeatures(track);
    this.state.trackVersion++;
  }

  /** Keep lap marks and checkpoints locked to their centerline anchors. */
  private alignTrackFeatures(track: TrackGeometry): void {
    const tangent = (index: number) => {
      const n = track.centerline.length;
      const a = track.centerline[(index - 1 + n) % n];
      const b = track.centerline[(index + 1) % n];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    };
    track.checkpoints.forEach((checkpoint, i) => {
      const index = track.featureIndices.checkpoints[i];
      checkpoint.pos = { ...track.centerline[index] };
      const t = tangent(index);
      checkpoint.normal = { x: -t.y, y: t.x };
    });
    const start = track.featureIndices.start;
    const t = tangent(start);
    track.startLine = { pos: { ...track.centerline[start] }, normal: { x: -t.y, y: t.x } };
    // Baptiste's pickups follow their own anchor when the road is pulled, even while respawning.
    track.featureIndices.pickups.forEach((index, i) => {
      const direction = tangent(index), normal = { x: -direction.y, y: direction.x };
      const lateral = (track.widths[index] / 2) * .3 * (i % 2 === 0 ? 1 : -1);
      const at = track.centerline[index];
      const safe = clampToTrackRibbon({ x: at.x + normal.x*lateral, y: at.y + normal.y*lateral }, track, 25);
      track.pickupPositions[i] = safe;
      if (this.state.pickups[i]) this.state.pickups[i].pos = { ...safe };
    });
  }

  /** A small grace band prevents an easing edge from unfairly dropping a car. */
  isTrackReforming(): boolean {
    return this.state.deformations.some(d => d.releaseAt !== null);
  }

  // ─── Periodic housekeeping (driven by PhysicsLoop) ─────────────────────────

  expire(now: number): void {
    const s = this.state;
    s.boostGates = s.boostGates.filter(g => g.expiresAt > now);
    s.walls = s.walls.filter(w => !w.expiresAt || w.expiresAt > now);

    for (const p of s.pickups) {
      if (p.respawnAt !== 0 && p.respawnAt <= now) {
        p.respawnAt = 0; p.kind = this.randomItem();
        if (s.track) p.pos = clampToTrackRibbon(s.track.pickupPositions[p.id] ?? p.pos, s.track, 25);
      }
    }
    for (const team of TEAMS) {
      const car = s.cars[team];
      if (s.testMode.allItems) {
        // Test mode: no pickup needed, the item is armed again as soon as it is used
        car.heldItem ??= 'slingshot';
        car.itemArmed = true;
        car.itemArmExpiry = now + config.armWindowS * 1000;
        continue;
      }
      if (car.itemArmed && now >= car.itemArmExpiry) {
        // T-05: armed item that was not used in time is lost
        car.heldItem = null;
        car.itemArmed = false;
        car.itemArmExpiry = 0;
        this.host.feedback('itemLost', car.pos.x, car.pos.y, team);
      }
    }
    this.tutorial?.tick();
  }

  /** Pickups, boost gates, hostile elements and checkpoints after a car moved. */
  afterMove(team: Team, prev: Vec2, now: number): void {
    const s = this.state;
    const car = s.cars[team];
    const track = s.track;
    if (!track || car.disabled) return;

    // Pickups (R-11): picked up only when the stock is empty
    if (car.heldItem === null) {
      for (const p of s.pickups) {
        if (p.respawnAt === 0 && dist(car.pos, p.pos) <= PICKUP_RADIUS) {
          car.heldItem = this.tutorial?.forcedItem(team) ?? p.kind;
          p.respawnAt = now + (s.tutorial ? TUTORIAL_PICKUP_RESPAWN_S : config.pickupRespawnS) * 1000;
          this.host.feedback('pickup', p.pos.x, p.pos.y, team);
          break;
        }
      }
    }

    // Allied boost gates
    if (car.boostUntil <= now) {
      for (const g of s.boostGates) {
        if (g.team !== team) continue;
        if (this.carHitsBoostGate(prev, car.pos, g)) {
          const k = this.boostFactor(g.a, g.b);
          car.boostK = k;
          car.boostUntil = now + config.boostDurationS * 1000;
          car.speed = Math.max(car.speed, 0) * (1 + config.boostGain * k);
          this.host.feedback('boostHit', car.pos.x, car.pos.y, team);
          break;
        }
      }
    }

    // Neutral obstacles affect both teams; legacy owned obstacles still spare their owner.
    if (car.ghostUntil <= now && car.invulnUntil <= now && !s.testMode.invincible) {
      for (const w of s.walls) {
        if (w.team === team || w.disabledUntil > now) continue;
        const hit = wallContact(prev, car.pos, w.pos, w.angle, w.lengthPx,
          w.widthPx ?? WALL_HALF_THICKNESS * 2, CAR_RADIUS + (w.tolerancePx ?? 0));
        if (hit) {
          this.damage(car, config.dmgWall, now);
          car.invulnUntil = now + config.invulnAfterHitS * 1000;
          car.pos = hit.point;
          this.reflect(car, hit.normal.x, hit.normal.y);
          this.tutorial?.onObstacleHit(team, 'wall');
          break;
        }
      }
      if (car.invulnUntil <= now) {
        for (const t of Object.values(s.tangibles)) {
          if (!t.active || t.status !== 'placed' || t.kind !== 'pylon') continue;
          const at = { x: t.x * config.logicalWidth, y: t.y * config.logicalHeight };
          if (distToSegment(at, prev, car.pos) > config.pylonFieldRadiusPx + CAR_RADIUS) continue;
          this.damage(car, config.dmgArc, now);
          car.invulnUntil = now + config.invulnAfterHitS * 1000;
          car.slowUntil = now + config.arcSlowS * 1000;
          car.speed *= config.arcSlowFactor;
          break;
        }
      }
      if (car.invulnUntil <= now) {
        for (const arc of s.arcs) {
          if (arc.team === team || arc.disabledUntil > now) continue;
          if (Math.min(distToSegment(car.pos, arc.pylon1, arc.pylon2), distToSegment(arc.pylon1, prev, car.pos), distToSegment(arc.pylon2, prev, car.pos)) <= CAR_RADIUS + WALL_HALF_THICKNESS || segmentsIntersect(prev, car.pos, arc.pylon1, arc.pylon2)) {
            this.damage(car, config.dmgArc, now);
            car.invulnUntil = now + config.invulnAfterHitS * 1000;
            car.slowUntil = now + config.arcSlowS * 1000;
            car.speed *= config.arcSlowFactor;
            this.tutorial?.onObstacleHit(team, 'arc');
            break;
          }
        }
      }
    }

    // Checkpoints, in order (R-07)
    const cp = track.checkpoints[car.checkpointIndex];
    if (cp) {
      const half = 110;
      const a = { x: cp.pos.x + cp.normal.x * half, y: cp.pos.y + cp.normal.y * half };
      const b = { x: cp.pos.x - cp.normal.x * half, y: cp.pos.y - cp.normal.y * half };
      const tan = { x: cp.normal.y, y: -cp.normal.x };
      const forward = (car.pos.x - prev.x) * tan.x + (car.pos.y - prev.y) * tan.y > 0;
      if (forward && segmentsIntersect(prev, car.pos, a, b)) {
        if (car.checkpointIndex === 0) car.lap++;
        car.checkpointIndex = (car.checkpointIndex + 1) % track.checkpoints.length;
        this.host.feedback('checkpoint', cp.pos.x, cp.pos.y, team);
      }
    }
  }

  /** Reflect the car's velocity about a segment and push it clear (rebound ×0.6). */
  bounceOffSegment(car: Car, a: Vec2, b: Vec2): void {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = clamp(((car.pos.x - a.x) * dx + (car.pos.y - a.y) * dy) / len2, 0, 1);
    const cx = a.x + dx * t, cy = a.y + dy * t;
    let nx = car.pos.x - cx, ny = car.pos.y - cy;
    const d = Math.hypot(nx, ny);
    if (d < 1e-6) { nx = -dy; ny = dx; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; }
    else { nx /= d; ny /= d; }
    const push = CAR_RADIUS + WALL_HALF_THICKNESS + 1;
    car.pos = { x: cx + nx * push, y: cy + ny * push };
    this.reflect(car, nx, ny);
  }

  /** `n` = unit normal pointing back into free space. Speed ×0.6 (REQ-3.2.2). */
  reflect(car: Car, nx: number, ny: number): void {
    const hx = Math.cos(car.angle), hy = Math.sin(car.angle);
    const vx = hx * car.speed, vy = hy * car.speed;
    const vn = vx * nx + vy * ny;
    if (vn >= 0) return; // already moving away
    const rx = (vx - 2 * vn * nx) * 0.6;
    const ry = (vy - 2 * vn * ny) * 0.6;
    const sp = Math.hypot(rx, ry);
    if (sp < 1e-6) { car.speed = 0; return; }
    const forward = car.speed >= 0;
    car.angle = wrapAngle(Math.atan2(forward ? ry : -ry, forward ? rx : -rx));
    car.speed = forward ? sp : -sp;
  }

  // ─── Victory (task 5) ──────────────────────────────────────────────────────

  checkEnd(now: number): void {
    const s = this.state;
    if (s.phase !== 'RACE' || s.tutorial || s.sessionMode === 'tangibles-test' || now < s.sessionStartAt) return;
    const progress = (c: Car) => c.lap * 8 + c.checkpointIndex;
    let winner: Team | 'draw' | null = null;
    for (const t of TEAMS) if (s.cars[t].lap >= config.lapsToWin) { winner = t; break; }
    if (!winner && now - s.sessionStartAt >= config.sessionMaxSeconds * 1000) {
      const a = progress(s.cars.A), b = progress(s.cars.B);
      winner = a === b ? 'draw' : a > b ? 'A' : 'B';
    }
    if (!winner) return;
    s.winner = winner;
    this.releaseAllPads();
    this.inputs.A = { throttle: 0, steer: 0 };
    this.inputs.B = { throttle: 0, steer: 0 };
    this.host.transition('RESULT', { winner });
    this.host.broadcastFull();
  }
}
