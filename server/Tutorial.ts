/**
 * Tutorial — guided first session on the predefined circuit (issue #32).
 *
 * It is the race phase with `state.tutorial` set: physics, gestures and HUD are the
 * real ones, but there are no laps and no damage. Each team has its own progression
 * through the lessons of `tutorialSteps`; a lesson is done by the real game event
 * that proves the interaction (the same `Feedback` the clients get, plus a few direct
 * hooks), never by a timer. A team can also skip its current lesson.
 *
 * GameRules owns one instance and forwards the events; this class only moves the
 * progression and prepares what a lesson needs (forced item, scripted breakdown,
 * hostile obstacle ahead of the car).
 */
import type { GameState, Team, ItemKind, Vec2, TutorialStepId, TutorialState } from './types.js';
import { config } from './config.js';
import { nearestOnTrack } from './geometry.js';

/** Ids of the obstacles the tutorial places itself; the pylon rebuild must keep them. */
export const TUTORIAL_OBSTACLE_PREFIX = 'tut-';
/** Learners get more time than the real 5 s to read the hint and make the gesture. */
export const TUTORIAL_ARM_WINDOW_S = 12;
/** Taking a pickup must not leave the other team without one for 15 s. */
export const TUTORIAL_PICKUP_RESPAWN_S = 3;

const TEAMS: Team[] = ['A', 'B'];
const OBSTACLE_AHEAD_PX = 700;
const OBSTACLE_LIFE_MS = 10 * 60_000;
const STEER_THRESHOLD = 0.5;
const THROTTLE_THRESHOLD = 0.5;

const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');

const STEPS: TutorialStepId[] = [
  'steer', 'pedal',
  'pickup', 'power', 'sling',
  'boostPickup', 'boostPower', 'boost', 'boostCross',
  'borderPull', 'repair', 'wall', 'arc', 'pylon',
];

/** A mouse has one contact: the two-finger border pull cannot be done on PC. */
export function tutorialSteps(mode: 'table' | 'pc'): TutorialStepId[] {
  return mode === 'pc' ? STEPS.filter(s => s !== 'borderPull') : [...STEPS];
}

/** Item a lesson is about: the pickup hands out exactly this one, whatever the draw says. */
const ITEM_OF: Partial<Record<TutorialStepId, ItemKind>> = {
  pickup: 'slingshot', power: 'slingshot', sling: 'slingshot',
  boostPickup: 'boost', boostPower: 'boost', boost: 'boost',
};

/** `Feedback.kind` that completes a lesson, for the team the feedback is about. */
const DONE_BY: Partial<Record<TutorialStepId, string>> = {
  pickup: 'pickup', boostPickup: 'pickup',
  power: 'itemArmed', boostPower: 'itemArmed',
  sling: 'stoneWarning',
  boost: 'boostGate',
  boostCross: 'boostHit',
  borderPull: 'trackDeformed',
  repair: 'repairDone',
};

export interface TutorialContext {
  now(): number;
  /** Scripted breakdown: the car is out of order until repaired by both players. */
  breakDown(team: Team): void;
  /** Put a car back on the road without the repair event (a skipped repair lesson). */
  restore(team: Team): void;
  feedback(kind: string, x: number, y: number, team: Team): void;
}

export class Tutorial {
  constructor(private state: GameState, private ctx: TutorialContext, mode: 'table' | 'pc') {
    state.tutorial = {
      steps: tutorialSteps(mode),
      teams: { A: { step: 0, sub: 0 }, B: { step: 0, sub: 0 } },
      finished: false,
    };
    for (const team of TEAMS) this.enter(team);
  }

  private get data(): TutorialState {
    return this.state.tutorial!;
  }

  /** Current lesson of a team, null once it has been through all of them. */
  current(team: Team): TutorialStepId | null {
    return this.data.steps[this.data.teams[team].step] ?? null;
  }

  /** Item a pickup gives to this team right now, or null for the normal random draw. */
  forcedItem(team: Team): ItemKind | null {
    const id = this.current(team);
    return (id && ITEM_OF[id]) || null;
  }

  skip(team: Team): void {
    this.complete(team);
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  onFeedback(kind: string, team: Team): void {
    const id = this.current(team);
    if (id && DONE_BY[id] === kind) this.complete(team);
  }

  /** `steer` is the raw [-1, 1] command, before the steering gain. */
  onPilotInput(team: Team, steer: number, throttle: number): void {
    const id = this.current(team);
    const lesson = this.data.teams[team];
    if (id === 'steer') {
      if (steer <= -STEER_THRESHOLD) lesson.sub |= 1;
      if (steer >= STEER_THRESHOLD) lesson.sub |= 2;
      if (lesson.sub === 3) this.complete(team);
    } else if (id === 'pedal' && lesson.sub === 1 && this.state.driveMode[team] === 'pedal' && throttle >= THROTTLE_THRESHOLD) {
      lesson.sub = 2;
    }
  }

  /** The drive mode is shared: the lesson of each team follows it. */
  onDriveMode(): void {
    for (const team of TEAMS) this.syncPedal(team);
  }

  onObstacleHit(team: Team, kind: 'wall' | 'arc'): void {
    if (this.current(team) === kind) this.complete(team);
  }

  /** Oz placed or changed a pylon: a lesson needs one of the team's own arcs. */
  onTangibles(): void {
    for (const team of TEAMS) {
      if (this.current(team) === 'pylon' && this.state.arcs.some(a => a.team === team && !a.id.startsWith(TUTORIAL_OBSTACLE_PREFIX))) {
        this.complete(team);
      }
    }
  }

  /** Item lessons depend on a window that can close: send the team back one lesson. */
  tick(): void {
    for (const team of TEAMS) {
      const id = this.current(team);
      const car = this.state.cars[team];
      if ((id === 'sling' || id === 'boost') && !car.itemArmed) {
        this.relapse(team, id === 'sling' ? 'power' : 'boostPower');
      } else if (id === 'boostCross' && !this.state.boostGates.some(g => g.team === team)) {
        this.relapse(team, 'boostPower'); // the portal expired before the car went through it
      }
    }
  }

  // ─── Progression ───────────────────────────────────────────────────────────

  private complete(team: Team): void {
    const id = this.current(team);
    if (!id) return;
    this.leave(team, id);
    const lesson = this.data.teams[team];
    lesson.step++;
    lesson.sub = 0;
    const car = this.state.cars[team];
    this.ctx.feedback('tutorialStep', car.pos.x, car.pos.y, team);
    if (TEAMS.every(t => this.current(t) === null)) this.data.finished = true;
    else this.enter(team);
  }

  private relapse(team: Team, to: TutorialStepId): void {
    const lesson = this.data.teams[team];
    lesson.step = this.data.steps.indexOf(to);
    lesson.sub = 0;
    this.enter(team);
  }

  /** Make the lesson doable whatever happened before (including a skipped lesson). */
  private enter(team: Team): void {
    const id = this.current(team);
    if (!id) return;
    const car = this.state.cars[team];
    const item = ITEM_OF[id];
    switch (id) {
      case 'pedal':
        this.syncPedal(team);
        break;
      case 'pickup': case 'boostPickup':
        // Empty hands and a pickup of the right kind ready on the road
        car.heldItem = null; car.itemArmed = false; car.itemArmExpiry = 0;
        for (const p of this.state.pickups) { p.respawnAt = 0; p.kind = item!; }
        break;
      case 'power': case 'boostPower':
        car.heldItem = item!; car.itemArmed = false; car.itemArmExpiry = 0;
        break;
      case 'sling': case 'boost':
        car.heldItem = item!;
        if (!car.itemArmed) { car.itemArmed = true; car.itemArmExpiry = this.ctx.now() + TUTORIAL_ARM_WINDOW_S * 1000; }
        break;
      case 'boostCross':
        if (!this.state.boostGates.some(g => g.team === team)) this.complete(team); // skipped portal: nothing to cross
        break;
      case 'repair':
        this.ctx.breakDown(team);
        break;
      case 'wall': case 'arc':
        this.placeObstacle(team, id);
        break;
      case 'pylon':
        this.onTangibles(); // Oz may have placed a pair before
        break;
    }
  }

  private leave(team: Team, id: TutorialStepId): void {
    const car = this.state.cars[team];
    const obstacle = `${TUTORIAL_OBSTACLE_PREFIX}${id}-${team}`;
    if (id === 'wall') this.state.walls = this.state.walls.filter(w => w.id !== obstacle);
    if (id === 'arc') this.state.arcs = this.state.arcs.filter(a => a.id !== obstacle);
    if (id === 'repair') {
      if (car.disabled) this.ctx.restore(team);
      car.hp = config.hpMax;
    }
  }

  private syncPedal(team: Team): void {
    if (this.current(team) !== 'pedal') return;
    const lesson = this.data.teams[team];
    const pedal = this.state.driveMode[team] === 'pedal';
    if (lesson.sub === 0 && pedal) lesson.sub = 1;
    else if (lesson.sub === 1 && !pedal) lesson.sub = 0;
    else if (lesson.sub === 2 && !pedal) this.complete(team);
  }

  // ─── Hostile obstacles ─────────────────────────────────────────────────────

  /**
   * A wall or an electric arc across the road, owned by the opposing team so that it
   * is hostile to this one. The learner meets it a few seconds later.
   */
  private placeObstacle(team: Team, kind: 'wall' | 'arc'): void {
    const ahead = this.roadAhead(team);
    if (!ahead) return;
    const id = `${TUTORIAL_OBSTACLE_PREFIX}${kind}-${team}`;
    if (kind === 'wall') {
      this.state.walls.push({
        id, team: other(team), pos: ahead.at,
        angle: (Math.atan2(ahead.tangent.y, ahead.tangent.x) * 180) / Math.PI + 90,
        lengthPx: config.wallLengthPx, disabledUntil: 0, expiresAt: this.ctx.now() + OBSTACLE_LIFE_MS,
      });
    } else {
      const reach = Math.max(10, ahead.halfWidth - 6);
      const normal = { x: -ahead.tangent.y, y: ahead.tangent.x };
      this.state.arcs.push({
        id, team: other(team), disabledUntil: 0,
        pylon1: { x: ahead.at.x + normal.x * reach, y: ahead.at.y + normal.y * reach },
        pylon2: { x: ahead.at.x - normal.x * reach, y: ahead.at.y - normal.y * reach },
      });
    }
  }

  /** Centerline point about `OBSTACLE_AHEAD_PX` in front of the car, with the local direction. */
  private roadAhead(team: Team): { at: Vec2; tangent: Vec2; halfWidth: number } | null {
    const track = this.state.track;
    if (!track) return null;
    const c = track.centerline;
    const n = c.length;
    let i = nearestOnTrack(this.state.cars[team].pos, track).index;
    for (let travelled = 0, guard = 0; travelled < OBSTACLE_AHEAD_PX && guard < n; guard++) {
      const j = (i + 1) % n;
      travelled += Math.hypot(c[j].x - c[i].x, c[j].y - c[i].y);
      i = j;
    }
    const a = c[(i - 1 + n) % n], b = c[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { at: { x: c[i].x, y: c[i].y }, tangent: { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, halfWidth: track.widths[i] / 2 };
  }
}
