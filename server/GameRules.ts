/**
 * GameRules — everything that changes the game state in response to a message
 * or a timer: MAP strokes, pickups and arming, slingshot, boost gates, abilities,
 * tangible pylons, synchronous repair, border pull, Oz fallback actions, victory.
 *
 * Vehicle motion and collisions live in PhysicsLoop; this class is driven by it
 * (`expire`, `afterMove`, `updateStones`, `updateRepair`, `checkEnd`, `tickMap`).
 * Time comes from an injectable clock so sessions can be replayed in tests (T-11).
 */
import type {
  GameState, Team, Vec2, Phase, ItemKind, Car, Wall, MapTargets, TrackGeometry,
  StrokeDrawMsg, MapDividerMsg, PadHoldMsg, SlingshotMsg, BoostGateMsg, AbilityMsg, BorderPullMsg,
  PilotInputMsg, UseItemMsg, TangibleMovedMsg, TangibleRemovedMsg, OzTriggerMsg, TestToggleMsg,
} from './types.js';
import { config } from './config.js';
import { dist, distToSegment, nearestOnTrack, segmentsIntersect, slingshotShot, wrapAngle } from './geometry.js';
import { generate, generatePreset, validateStroke, rebuildEdges } from './MapGenerator.js';
import { nearestStationTeam, LOGICAL_W, checkDivider } from './layout.js';

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
  type: 'TangibleMoved' | 'TangibleRemoved';
  id: number;
  x?: number;
  y?: number;
  angle?: number;
}

export const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');
const teamOfTangible = (id: number): Team => (id <= 2 ? 'A' : 'B');
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
    driveMode: 'auto',
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
    mapTargets: null,
    mapDivider: null,
    mapStrokes: { A: false, B: false },
    mapDeadline: 0,
    mapMode: null,
    repairProgress: { A: 0, B: 0 },
    trackVersion: 0,
    tangibles: {},
    testMode: { invincible: false, allItems: false },
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
      logicalWidth: config.logicalWidth,
      logicalHeight: config.logicalHeight,
    },
  };
}

export class GameRules {
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

  constructor(
    private state: GameState,
    private host: RulesHost,
    private clock: () => number = Date.now,
    rng: () => number = Math.random,
  ) {
    this.rng = rng;
  }

  private get now(): number {
    return this.clock();
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
    let pts = (msg.pts ?? [])
      .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .slice(0, MAX_STROKE_POINTS)
      .map(p => ({ x: p.x, y: p.y }));
    const [p1, p2] = s.mapTargets[team];
    if (pts.length < 2) return;
    // If the player started at p2 and drew towards p1, reverse so it canonicalizes p1→p2
    if (dist(pts[0], p2) < 160 && dist(pts[pts.length - 1], p1) < 160) {
      pts = pts.reverse();
    }
    if (!validateStroke(pts, p1, p2) || !this.staysInHalf(team, pts, s.mapDivider)) {
      const last = pts[pts.length - 1] ?? p1;
      this.host.feedback('mapError', last.x, last.y, team);
      return;
    }
    // Once accepted, lock the endpoints exactly to the common anchors. This
    // makes a near miss inside the target ring a clean, continuous circuit.
    pts[0] = { ...p1 };
    pts[pts.length - 1] = { ...p2 };
    this.strokes[team] = pts;
    s.mapStrokes[team] = true;
    this.host.broadcastFull();
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
    // MAP is intentionally player-paced. The operator may still force a fallback
    // circuit, but time alone must never erase a drawing attempt.
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
    const s = this.state;
    this.generating = true;
    s.track = track;
    s.deformations = [];
    s.trackVersion++;
    for (const team of TEAMS) {
      const car = makeCar(team);
      const sp = track.startPositions[team === 'A' ? 0 : 1];
      const tan = { x: track.startLine.normal.y, y: -track.startLine.normal.x };
      car.pos = { x: sp.x, y: sp.y };
      car.angle = Math.atan2(tan.y, tan.x);
      s.cars[team] = car;
      this.inputs[team] = { throttle: 1, steer: 0 };
      this.lastPilotInputAt[team] = this.now;
      s.repairProgress[team] = 0;
      s.cooldowns[team] = { ghost: 0, destroy: 0, borderPull: 0 };
    }
    for (const pad of Object.values(s.repairPads)) { pad.held = false; pad.startedAt = 0; }
    s.walls = []; s.arcs = []; s.boostGates = []; s.stones = [];
    s.pickups = track.pickupPositions.map((pos, i) => ({
      id: i, pos: { ...pos }, kind: this.randomItem(), respawnAt: 0,
    }));
    s.winner = null;
    s.sessionStartAt = waitForPlayers ? 0 : this.now + COUNTDOWN_MS;
    this.rebuildTangibles('A');
    this.rebuildTangibles('B');
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

  /** PC-only test switches: ignored unless the session was started in PC mode. */
  onTestToggle(msg: TestToggleMsg): void {
    const s = this.state;
    if (s.mapMode !== 'pc') return;
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
    const s = this.state;
    if (s.phase === 'RACE') {
      this.pausedAt = this.now;
      this.releaseAllPads();
      this.host.transition('PAUSED');
      this.host.broadcastFull();
    } else if (s.phase === 'PAUSED') {
      if (this.pausedAt) s.sessionStartAt += this.now - this.pausedAt;
      this.pausedAt = 0;
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
    s.mapTargets = null;
    s.mapDivider = null;
    s.mapStrokes = { A: false, B: false };
    s.mapMode = null;
    s.testMode = { invincible: false, allItems: false };
    s.mapDeadline = 0;
    this.generating = false;
    this.strokes = { A: null, B: null };
    this.pausedAt = 0;
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
    if (!Number.isFinite(msg.throttle) || !Number.isFinite(msg.steer)) return;
    const steer = clamp(msg.steer, -1, 1);
    this.inputs[team] = {
      throttle: clamp(msg.throttle, 0, 1),
      steer: steer * config.steerGain,
    };
    this.lastPilotInputAt[team] = this.now;
  }

  /** Shared central control: cars either drive continuously or require a held pedal. */
  toggleDriveMode(): void {
    if (this.state.phase !== 'RACE') return;
    this.state.driveMode = this.state.driveMode === 'auto' ? 'pedal' : 'auto';
    for (const team of TEAMS) this.inputs[team].throttle = 0;
    this.host.broadcastFull();
  }

  /** Safety net for a lost pointer-up, a crashed client or a dropped WebSocket. */
  expirePilotInputs(now: number): void {
    for (const team of TEAMS) {
      if (now - this.lastPilotInputAt[team] > config.pilotInputTimeoutMs) this.inputs[team].steer = 0;
    }
  }

  /** UseItem: arm the stocked item for `armWindowS` seconds (REQ-4.1.3). */
  onUseItem(team: Team, _msg?: UseItemMsg): void {
    const car = this.state.cars[team];
    if (this.state.phase !== 'RACE' || car.heldItem === null || car.itemArmed) return;
    car.itemArmed = true;
    car.itemArmExpiry = this.now + config.armWindowS * 1000;
    this.host.feedback('itemArmed', car.pos.x, car.pos.y, team);
  }

  // ─── Slingshot (C-01) ──────────────────────────────────────────────────────

  /** R-03: the team whose Pilot armed `kind`; both armed → closest station. */
  private resolveArmedTeam(kind: ItemKind, at: Vec2, explicit?: Team): Team | null {
    const now = this.now;
    const ok = TEAMS.filter(t => {
      const c = this.state.cars[t];
      return c.itemArmed && (this.state.testMode.allItems || c.heldItem === kind) && now < c.itemArmExpiry;
    });
    if (ok.length === 0) return null;
    if (explicit && ok.includes(explicit)) return explicit;
    if (ok.length === 1) return ok[0];
    return nearestStationTeam(at);
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
    if (this.state.phase !== 'RACE' || !msg.anchor || !msg.pouch) return;
    const anchor = { x: msg.anchor.x, y: msg.anchor.y };
    const pouch = { x: msg.pouch.x, y: msg.pouch.y };
    if (![anchor.x, anchor.y, pouch.x, pouch.y].every(Number.isFinite)) return;
    const shot = slingshotShot(anchor, pouch, config);
    if (!shot.valid) return;
    const team = this.resolveArmedTeam('slingshot', anchor, msg.team);
    if (!team) return;
    this.consumeItem(team);
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
    if (this.state.phase !== 'RACE' || !msg.a || !msg.b) return;
    const a = { x: msg.a.x, y: msg.a.y };
    const b = { x: msg.b.x, y: msg.b.y };
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return;
    const len = dist(a, b);
    if (len < config.boostLenMinPx - 1e-6 || len > config.boostLenMaxPx + 1e-6) return;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const team = this.resolveArmedTeam('boost', mid, msg.team);
    if (!team) return;
    this.consumeItem(team);
    this.addBoostGate(team, a, b);
  }

  private addBoostGate(team: Team, a: Vec2, b: Vec2): void {
    this.state.boostGates.push({
      id: this.nextId('gate'), team, a, b, expiresAt: this.now + config.boostGateLifeS * 1000,
    });
    this.host.feedback('boostGate', (a.x + b.x) / 2, (a.y + b.y) / 2, team);
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
      const both = s.repairPads[`${team}-pilot`].held && s.repairPads[`${team}-copilot`].held;
      const car = s.cars[team];
      const needsRepair = car.disabled || car.hp < config.repairHpRestore;
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
    if (wasDisabled && s.track) this.respawnAtCheckpoint(car);
    s.repairProgress[team] = 0;
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
    if (this.state.testMode.invincible) {
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

  /** Same entry point for the Oz operator and a future TUIO source (T-10). */
  onTangibleMoved(msg: TangibleMovedMsg): void {
    const id = Number(msg.id);
    if (![1, 2, 3, 4].includes(id) || ![msg.x, msg.y, msg.angle].every(Number.isFinite)) return;
    const x = clamp(msg.x, 0, 1), y = clamp(msg.y, 0, 1);
    this.tangibleLog.push({ t: this.now, type: 'TangibleMoved', id, x, y, angle: msg.angle });
    this.state.tangibles[id] = { x, y, angle: msg.angle };
    this.rebuildTangibles(teamOfTangible(id));
  }

  onTangibleRemoved(msg: TangibleRemovedMsg): void {
    const id = Number(msg.id);
    if (![1, 2, 3, 4].includes(id)) return;
    this.tangibleLog.push({ t: this.now, type: 'TangibleRemoved', id });
    delete this.state.tangibles[id];
    this.rebuildTangibles(teamOfTangible(id));
  }

  /**
   * Derive walls/arcs of one team from its pylons: two pylons within
   * `arcMaxDistPx` form an arc that replaces their two individual walls.
   */
  private rebuildTangibles(team: Team): void {
    const s = this.state;
    const ids = team === 'A' ? [1, 2] : [3, 4];
    const px = (id: number): Vec2 => ({
      x: s.tangibles[id].x * config.logicalWidth,
      y: s.tangibles[id].y * config.logicalHeight,
    });

    const oldDisabled = new Map<string, number>();
    for (const w of s.walls) if (w.team === team && !w.expiresAt) oldDisabled.set(w.id, w.disabledUntil);
    for (const a of s.arcs) if (a.team === team) oldDisabled.set(a.id, a.disabledUntil);
    s.walls = s.walls.filter(w => w.team !== team || w.expiresAt);
    s.arcs = s.arcs.filter(a => a.team !== team);

    const present = ids.filter(id => s.tangibles[id]);
    if (present.length === 2 && dist(px(ids[0]), px(ids[1])) <= config.arcMaxDistPx) {
      const arcId = `arc-${team}`;
      s.arcs.push({
        id: arcId, team, pylon1: px(ids[0]), pylon2: px(ids[1]),
        disabledUntil: oldDisabled.get(arcId) ?? 0,
      });
      return;
    }
    for (const id of present) {
      const wid = `wall-${id}`;
      s.walls.push({
        id: wid, team, pos: px(id), angle: s.tangibles[id].angle,
        lengthPx: config.wallLengthPx, disabledUntil: oldDisabled.get(wid) ?? 0,
      });
    }
  }

  /** Wall as a segment: centre ± direction·length/2 (angle in degrees). */
  static wallEnds(w: Wall): [Vec2, Vec2] {
    const a = (w.angle * Math.PI) / 180;
    const hx = (Math.cos(a) * w.lengthPx) / 2;
    const hy = (Math.sin(a) * w.lengthPx) / 2;
    return [{ x: w.pos.x - hx, y: w.pos.y - hy }, { x: w.pos.x + hx, y: w.pos.y + hy }];
  }

  // ─── Local border pull (C-07) ──────────────────────────────────────────────

  onBorderPull(msg: BorderPullMsg): void {
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
  }

  /** A small grace band prevents an easing edge from unfairly dropping a car. */
  isTrackReforming(): boolean {
    return this.state.deformations.some(d => d.releaseAt !== null);
  }

  // ─── Oz fallback actions (REQ-7.2) ─────────────────────────────────────────

  onOzTrigger(msg: OzTriggerMsg): void {
    const s = this.state;
    const params = (msg.params ?? {}) as Record<string, unknown>;
    const team: Team = params.team === 'B' ? 'B' : 'A';
    const now = this.now;
    switch (msg.kind) {
      case 'fallbackTrack':
        if (s.phase === 'MAP' || s.phase === 'RACE') this.startRace(generatePreset());
        return;
      case 'newGame':
        this.resetToLobby();
        return;
    }
    const track = s.track;
    if (s.phase !== 'RACE' || !track) return;
    const n = track.centerline.length;
    const aheadOf = (car: Car, steps: number) => {
      const i = (nearestOnTrack(car.pos, track).index + steps) % n;
      const p = track.centerline[i];
      const q = track.centerline[(i + 1) % n];
      const tan = { x: q.x - p.x, y: q.y - p.y };
      const len = Math.hypot(tan.x, tan.y) || 1;
      return { p, normal: { x: -tan.y / len, y: tan.x / len }, half: track.widths[i] / 2, angleDeg: (Math.atan2(tan.y, tan.x) * 180) / Math.PI };
    };
    switch (msg.kind) {
      case 'obstacle': { // temporary wall of `team` ahead of the opponent
        const spot = aheadOf(s.cars[other(team)], 20);
        s.walls.push({
          id: this.nextId('oz-wall'), team, pos: { ...spot.p }, angle: spot.angleDeg + 90,
          lengthPx: Math.min(config.wallLengthPx, spot.half * 1.6), disabledUntil: 0, expiresAt: now + 8000,
        });
        break;
      }
      case 'boost': { // boost gate across the track ahead of `team`
        const spot = aheadOf(s.cars[team], 15);
        const a = { x: spot.p.x + spot.normal.x * spot.half * 0.9, y: spot.p.y + spot.normal.y * spot.half * 0.9 };
        const b = { x: spot.p.x - spot.normal.x * spot.half * 0.9, y: spot.p.y - spot.normal.y * spot.half * 0.9 };
        this.addBoostGate(team, a, b);
        break;
      }
      case 'giveItem': { // test helper: put an item in the stock of `team`
        const car = s.cars[team];
        car.heldItem = params.item === 'boost' ? 'boost' : 'slingshot';
        car.itemArmed = false;
        break;
      }
      case 'breakdown': { // instant breakdown of the car of `team`
        const car = s.cars[team];
        this.damage(car, car.hp, now);
        break;
      }
      case 'widen': {
        const at = typeof params.x === 'number' && typeof params.y === 'number'
          ? { x: params.x, y: params.y }
          : aheadOf(s.cars[team], 10).p;
        const hit = nearestOnTrack(at, track);
        const n = track.centerline.length;
        const a = track.centerline[(hit.index - 1 + n) % n];
        const b = track.centerline[(hit.index + 1) % n];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const fallback = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
        const dx = typeof params.dx === 'number' ? params.dx : fallback.x * config.trackDeformMaxShiftPx * 0.8;
        const dy = typeof params.dy === 'number' ? params.dy : fallback.y * config.trackDeformMaxShiftPx * 0.8;
        // Oz chooses a side explicitly, as a tangible would be put on an edge;
        // the operator's point itself may be anywhere over the road.
        const dragLen = Math.hypot(dx, dy) || 1;
        const side = { x: dx / dragLen, y: dy / dragLen };
        const edge = {
          x: hit.closest.x + side.x * hit.halfWidth * 0.95,
          y: hit.closest.y + side.y * hit.halfWidth * 0.95,
        };
        this.deformTrack(edge, { x: dx, y: dy }, team);
        break;
      }
    }
  }

  // ─── Periodic housekeeping (driven by PhysicsLoop) ─────────────────────────

  expire(now: number): void {
    const s = this.state;
    s.boostGates = s.boostGates.filter(g => g.expiresAt > now);
    s.walls = s.walls.filter(w => !w.expiresAt || w.expiresAt > now);

    for (const p of s.pickups) {
      if (p.respawnAt !== 0 && p.respawnAt <= now) { p.respawnAt = 0; p.kind = this.randomItem(); }
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
          car.heldItem = p.kind;
          p.respawnAt = now + config.pickupRespawnS * 1000;
          this.host.feedback('pickup', p.pos.x, p.pos.y, team);
          break;
        }
      }
    }

    // Allied boost gates
    if (car.boostUntil <= now) {
      for (const g of s.boostGates) {
        if (g.team !== team) continue;
        if (segmentsIntersect(prev, car.pos, g.a, g.b)) {
          const k = this.boostFactor(g.a, g.b);
          car.boostK = k;
          car.boostUntil = now + config.boostDurationS * 1000;
          car.speed = Math.max(car.speed, 0) * (1 + config.boostGain * k);
          this.host.feedback('boostHit', car.pos.x, car.pos.y, team);
          break;
        }
      }
    }

    // Hostile walls and arcs (never the team's own, never while ghost/invulnerable)
    if (car.ghostUntil <= now && car.invulnUntil <= now && !s.testMode.invincible) {
      for (const w of s.walls) {
        if (w.team === team || w.disabledUntil > now) continue;
        const [a, b] = GameRules.wallEnds(w);
        if (distToSegment(car.pos, a, b) <= CAR_RADIUS + WALL_HALF_THICKNESS) {
          this.damage(car, config.dmgWall, now);
          car.invulnUntil = now + config.invulnAfterHitS * 1000;
          this.bounceOffSegment(car, a, b);
          break;
        }
      }
      if (car.invulnUntil <= now) {
        for (const arc of s.arcs) {
          if (arc.team === team || arc.disabledUntil > now) continue;
          if (distToSegment(car.pos, arc.pylon1, arc.pylon2) <= CAR_RADIUS + WALL_HALF_THICKNESS) {
            this.damage(car, config.dmgArc, now);
            car.invulnUntil = now + config.invulnAfterHitS * 1000;
            car.slowUntil = now + config.arcSlowS * 1000;
            car.speed *= config.arcSlowFactor;
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
    if (s.phase !== 'RACE' || now < s.sessionStartAt) return;
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
