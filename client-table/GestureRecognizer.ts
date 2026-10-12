/**
 * GestureRecognizer — turns raw Pointer Events on the table into the semantic
 * messages of the protocol (REQ-9.4): the server never sees a raw touch.
 *
 * Contacts are tracked by pointerId in a Map limited to 10 entries (REQ-9.1).
 * Every contact is classified at pointerdown, and only `free` contacts take part
 * in multi-finger gestures, so the repair pads and the buttons stay independent
 * of gameplay gestures (T-09):
 *
 *   steer      pilot left/right strip; the car advances automatically → PilotInput
 *   item       pilot's item button tap               → UseItem(team)
 *   pad        finger on a repair pad                → PadHold(team, role, on)
 *   ghost      tap on the Ghost button               → Ability(ghost)
 *   destroy    tap on Destroy, then touch a wall     → Ability(destroy, targetId)
 *   stroke     MAP phase drawing                     → StrokeDraw(creator, pts)
 *   free       3 fingers ≤150 px / 2 fingers 100–400 → Slingshot / BoostGate
 *              2 close fingers pulled from one edge  → BorderPull
 *
 * Team attribution (R-03): pad/button → station's team; free gesture → the team
 * whose Pilot armed the matching item; both armed → nearest station to the gesture.
 * No finger is ever tracked back to a person (REQ-5.1).
 */
import type { GameState, Team, Vec2 } from '../server/types.js';
import {
  LOGICAL_W, LOGICAL_H, PANELS, padLocal, panelWidth, PANEL_H, STEER_AREA_LOCAL, PEDAL_LOCAL, ITEM_BTN_LOCAL,
  GHOST_BTN_LOCAL, DESTROY_BTN_LOCAL, worldToLocal, type PanelLayout,
  insidePanel, nearestStationTeam, type Role,
} from '../server/layout.js';
import { distToSegment, nearestOnTrack } from '../server/geometry.js';
import { RESULT_BUTTON, START_TABLE_BUTTON, START_PC_BUTTON, PAUSE_BUTTON, DRIVE_MODE_BUTTON, MAP_GENERATE_BUTTON, RACE_START_BUTTON } from './Renderer.js';
import { RESULT_BUTTON, START_TABLE_BUTTON, START_PC_BUTTON, PAUSE_BUTTON, MAP_GENERATE_BUTTON, RACE_START_BUTTON, RESET_BUTTON } from './Renderer.js';
import type { View } from './view.js';

export const MAX_CONTACTS = 10;
const SETTLE_MS = 180;          // wait for all fingers to land before judging a gesture
const SLING_CLUSTER_PX = 150;
const BOOST_MIN_PX = 100;
const BOOST_MAX_PX = 400;
const EDGE_GRAB_PX = 20;
const PULL_MIN_PX = 20;
const PULL_MAX_PX = 105;
const PULL_PAIR_MAX_PX = 130;
const PULL_EDGE_INDEX_GAP = 8;
const TARGET_RADIUS_PX = 40;
const TARGETING_MS = 3000;
const PALM_MAX_PX = 140;        // contacts wider than this (logical px) are palms/arms

type Zone = 'steer' | 'pedal' | 'item' | 'pad' | 'ghost' | 'destroy' | 'stroke' | 'target' | 'result' | 'pause' | 'mode' | 'free' | 'rejected';

interface Contact {
  id: number;
  x: number; y: number;
  sx: number; sy: number;
  zone: Zone;
  consumed: boolean;
  padKey?: string;
  panel?: PanelLayout;
  steer?: number;
  strokeTeam?: Team;
  outward?: Vec2; // border candidate: unit vector away from the centerline
  edgeIndex?: number;
}

type Send = (msg: { type: string } & Record<string, unknown>) => void;

export class GestureRecognizer {
  private contacts = new Map<number, Contact>();
  private padTouches = new Map<string, Set<number>>();
  /** team → pointerId of the finger holding that team's steering pad. */
  private sticks = new Map<Team, number>();
  /** team → pointerId of the finger holding that team's acceleration pedal. */
  private pedals = new Map<Team, number>();
  private lastInput: Record<Team, { throttle: number; steer: number }> = {
    A: { throttle: 0, steer: 0 }, B: { throttle: 0, steer: 0 },
  };
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  /** event.timeStamp of the latest pointerdown, to measure finger→frame latency. */
  lastDownTs = 0;

  /**
   * Mouse-friendly stand-ins for the multi-finger gestures: arm the simulation from a
   * button, then click on the table — 1 click for the 3-finger slingshot, 2 clicks
   * (the two fingers) for the boost gate. The normal armed-item rules still apply.
   */
  private sim: { kind: 'slingshot' | 'boost'; first?: Vec2 } | null = null;
  /** Two clicks in desktop mode, or two simultaneous touches on the table. */
  private mapDividerPoints: Vec2[] = [];
  onSimChange: (hint: string) => void = () => {};

  simulate(kind: 'slingshot' | 'boost' | null): void {
    this.sim = kind ? { kind } : null;
    this.onSimChange(!kind ? '' : kind === 'slingshot' ? 'Cliquez sur la table : cible du lance-pierre (3 doigts)' : 'Cliquez 2 points (100–400 px) : portail de boost (2 doigts)');
  }

  private simClick(p: Vec2): void {
    const sim = this.sim;
    if (!sim) return;
    if (sim.kind === 'slingshot') {
      const team = this.armedTeam('slingshot', p);
      if (team) { this.send({ type: 'Slingshot', x: p.x, y: p.y, team }); this.onSimChange(''); }
      else this.onSimChange("Aucune équipe n'a armé de lance-pierre (UTILISER d'abord)");
      this.sim = null;
      return;
    }
    if (!sim.first) { sim.first = p; this.onSimChange('Cliquez le 2e point du portail'); return; }
    const d = Math.hypot(p.x - sim.first.x, p.y - sim.first.y);
    const mid = { x: (p.x + sim.first.x) / 2, y: (p.y + sim.first.y) / 2 };
    const team = this.armedTeam('boost', mid);
    if (!team) this.onSimChange("Aucune équipe n'a armé de boost (UTILISER d'abord)");
    else if (d < 100 || d > 400) this.onSimChange(`Écart ${Math.round(d)} px : il doit être entre 100 et 400`);
    else { this.send({ type: 'BoostGate', a: sim.first, b: p, team }); this.onSimChange(''); }
    this.sim = null;
  }

  constructor(
    private canvas: HTMLCanvasElement,
    private view: View,
    private send: Send,
  ) {
    const opts = { passive: false } as const;
    canvas.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    canvas.addEventListener('pointermove', (e) => this.onMove(e), opts);
    canvas.addEventListener('pointerup', (e) => this.onUp(e), opts);
    canvas.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    canvas.addEventListener('lostpointercapture', (e) => this.onUp(e), opts);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // A held steering touch also sends a heartbeat. The server uses it to
    // neutralise a lost touch or a broken connection safely.
    setInterval(() => this.streamInputs(), 1000 / 60);
  }

  private get state(): GameState | null { return this.view.state; }

  private toLogical(e: PointerEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * LOGICAL_W, y: ((e.clientY - r.top) / r.height) * LOGICAL_H };
  }

  // ─── Pointer events ───────────────────────────────────────────────────────

  private onDown(e: PointerEvent): void {
    e.preventDefault();
    this.lastDownTs = e.timeStamp;
    if (this.contacts.size >= MAX_CONTACTS && !this.contacts.has(e.pointerId)) return; // touch budget
    const state = this.state;
    if (!state) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    const p = this.toLogical(e);
    const c: Contact = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, zone: 'free', consumed: false };
    this.contacts.set(c.id, c);
    this.view.debug.contacts = this.contacts.size;

    const hit = (b: { x: number; y: number; w: number; h: number }) =>
      p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

    // Reset button: accessible in all phases (returns state to launch)
    if (hit(RESET_BUTTON)) {
      c.zone = 'result';
      this.send({ type: 'Reset' });
      return;
    }

    // 0 — lobby: start button
    if (state.phase === 'LOBBY') {
      if (hit(START_TABLE_BUTTON) || hit(START_PC_BUTTON)) {
        c.zone = 'result';
        this.send({ type: 'StartGame', mode: hit(START_PC_BUTTON) ? 'pc' : 'table' });
      } else c.zone = 'rejected';
      return;
    }

    // 1 — result screen button
    if (state.phase === 'RESULT') {
      const b = RESULT_BUTTON;
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        c.zone = 'result';
        this.send({ type: 'NewGame' });
      } else c.zone = 'rejected';
      return;
    }

    // 2 — MAP: two shared contacts establish the divider, then each half starts
    // from its own endpoint. Desktop clicks use the same sequence (desync mode).
    if (state.phase === 'MAP') {
      if (insidePanel(p)) { c.zone = 'rejected'; return; }
      const generate = MAP_GENERATE_BUTTON;
      if (state.mapStrokes.A && state.mapStrokes.B && p.x >= generate.x && p.x <= generate.x + generate.w && p.y >= generate.y && p.y <= generate.y + generate.h) {
        c.zone = 'result'; this.send({ type: 'GenerateTrack' }); return;
      }
      if (!state.mapTargets) {
        c.zone = 'target';
        this.mapDividerPoints.push(p);
        if (this.mapDividerPoints.length === 2) {
          this.send({ type: 'MapDivider', a: this.mapDividerPoints[0], b: this.mapDividerPoints[1] });
          this.mapDividerPoints = [];
        }
        return;
      }
      const team = this.mapStrokeStartTeam(state, p);
      if (!team || state.mapStrokes[team]) { c.zone = 'rejected'; return; }
      c.zone = 'stroke';
      c.strokeTeam = team;
      for (const [id, s] of this.view.strokes) if (s.team === team) this.view.strokes.delete(id);
      this.view.strokes.set(c.id, { team, pts: [p], done: false });
      return;
    }
    if (state.phase === 'READY') {
      const b = RACE_START_BUTTON;
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        c.zone = 'result'; this.send({ type: 'BeginRace' });
      } else c.zone = 'rejected';
      return;
    }
    if (state.phase === 'RACE' || state.phase === 'PAUSED') {
      const b = PAUSE_BUTTON;
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        c.zone = 'pause'; this.send({ type: 'Pause' }); return;
      }
      const mode = DRIVE_MODE_BUTTON;
      if (state.phase === 'RACE' && p.x >= mode.x && p.x <= mode.x + mode.w && p.y >= mode.y && p.y <= mode.y + mode.h) {
        c.zone = 'mode'; this.send({ type: 'ToggleDriveMode' }); return;
      }
    }
    if (state.phase !== 'RACE') { c.zone = 'rejected'; return; }

    // 3 — pads and buttons of the corner panels
    for (const panel of PANELS) {
      const l = worldToLocal(panel, p.x, p.y);
      if (panel.role === 'pilot') {
        const steerArea = STEER_AREA_LOCAL;
        if (Math.abs(l.x - steerArea.x) <= steerArea.w / 2 && Math.abs(l.y - steerArea.y) <= steerArea.h / 2) {
          if (this.sticks.has(panel.team)) { c.zone = 'rejected'; return; }
          c.zone = 'steer';
          c.panel = panel;
          this.sticks.set(panel.team, c.id);
          this.updateSteer(c);
          return;
        }
        if (state.driveMode === 'pedal' && Math.abs(l.x - PEDAL_LOCAL.x) <= PEDAL_LOCAL.w / 2 && Math.abs(l.y - PEDAL_LOCAL.y) <= PEDAL_LOCAL.h / 2) {
          if (this.pedals.has(panel.team)) { c.zone = 'rejected'; return; }
          c.zone = 'pedal';
          c.panel = panel;
          this.pedals.set(panel.team, c.id);
          this.view.localPedals[panel.team] = true;
          this.sendCurrentInput(panel.team);
          return;
        }
        if (Math.hypot(l.x - ITEM_BTN_LOCAL.x, l.y - ITEM_BTN_LOCAL.y) <= ITEM_BTN_LOCAL.r + 6) {
          c.zone = 'item';
          this.send({ type: 'UseItem', team: panel.team });
          return;
        }
      }
      const pad = padLocal(panel.role);
      if (Math.hypot(l.x - pad.x, l.y - pad.y) <= pad.r + 6) {
        c.zone = 'pad';
        c.padKey = `${panel.team}-${panel.role}`;
        this.padDown(c.padKey, panel.team, panel.role, c.id);
        return;
      }
      if (panel.role === 'copilot') {
        if (Math.hypot(l.x - GHOST_BTN_LOCAL.x, l.y - GHOST_BTN_LOCAL.y) <= GHOST_BTN_LOCAL.r + 6) {
          c.zone = 'ghost';
          if (this.view.now() >= state.cooldowns[panel.team].ghost) {
            this.send({ type: 'Ability', team: panel.team, kind: 'ghost' });
          }
          return;
        }
        if (Math.hypot(l.x - DESTROY_BTN_LOCAL.x, l.y - DESTROY_BTN_LOCAL.y) <= DESTROY_BTN_LOCAL.r + 6) {
          c.zone = 'destroy';
          if (this.view.now() >= state.cooldowns[panel.team].destroy) {
            this.view.targeting = { team: panel.team, until: Date.now() + TARGETING_MS };
          }
          return;
        }
      }
      // Rest of a panel: not a game surface
      if (Math.abs(l.x) <= panelWidth(panel.role) / 2 && Math.abs(l.y) <= PANEL_H / 2) { c.zone = 'rejected'; return; }
    }

    // 3b — PC testing: simulated multi-finger gesture (toolbar buttons)
    if (this.sim) {
      c.zone = 'target';
      this.simClick(p);
      return;
    }

    // 4 — palm / arm rejection for everything that is not a pad
    const scale = LOGICAL_W / this.canvas.getBoundingClientRect().width;
    if (Math.max(e.width || 0, e.height || 0) * scale > PALM_MAX_PX) { c.zone = 'rejected'; return; }

    // 5 — destroy-wall targeting: the next touch on a hostile wall picks it
    const tg = this.view.targeting;
    if (tg && tg.until > Date.now()) {
      c.zone = 'target';
      const id = this.findHostileWall(state, tg.team, p);
      if (id) {
        this.send({ type: 'Ability', team: tg.team, kind: 'destroy', targetId: id });
        this.view.targeting = null;
      }
      return;
    }

    // 6 — free contact: multi-finger gestures and border pull
    c.zone = 'free';
    if (state.track) {
      const hit = nearestOnTrack(p, state.track);
      if (Math.abs(hit.distance - hit.halfWidth) < EDGE_GRAB_PX && hit.distance > 1e-6) {
        c.outward = { x: (p.x - hit.closest.x) / hit.distance, y: (p.y - hit.closest.y) / hit.distance };
        c.edgeIndex = hit.index;
      }
    }
    this.scheduleEvaluation();
  }

  private onMove(e: PointerEvent): void {
    const c = this.contacts.get(e.pointerId);
    if (!c) return;
    e.preventDefault();
    const p = this.toLogical(e);
    c.x = p.x; c.y = p.y;

    if (c.zone === 'steer') {
      this.updateSteer(c);
    } else if (c.zone === 'stroke') {
      const s = this.view.strokes.get(c.id);
      const last = s?.pts[s.pts.length - 1];
      if (s && last && Math.hypot(p.x - last.x, p.y - last.y) >= 2) s.pts.push(p);
    } else if (c.zone === 'free' && c.outward && !c.consumed) {
      this.tryBorderPullPair();
    }
  }

  private onUp(e: PointerEvent): void {
    const c = this.contacts.get(e.pointerId);
    if (!c) return;
    this.contacts.delete(c.id);
    this.view.debug.contacts = this.contacts.size;

    if (c.zone === 'pad' && c.padKey) this.padUp(c.padKey, c.id);
    if (c.zone === 'steer' && c.panel) this.releaseStick(c.panel.team);
    if (c.zone === 'pedal' && c.panel) this.releasePedal(c.panel.team);
    if (c.zone === 'stroke') {
      const s = this.view.strokes.get(c.id);
      if (s) {
        s.done = true;
        if (s.pts.length >= 2) this.send({ type: 'StrokeDraw', creator: s.team, pts: s.pts });
      }
    }
    if (c.zone === 'free') this.scheduleEvaluation();
  }

  // ─── Remote-control steering ─────────────────────────────────────────────

  private updateSteer(c: Contact): void {
    if (!c.panel) return;
    const local = worldToLocal(c.panel, c.x, c.y);
    // Match the keyboard: either half of the strip is a full left/right turn.
    // Only the zone changes as the finger crosses the centre.
    c.steer = local.x <= STEER_AREA_LOCAL.x ? -1 : 1;
    this.view.sticks[c.panel.team] = { x: c.steer, y: 0, active: true };
  }

  private releaseStick(team: Team): void {
    this.sticks.delete(team);
    this.view.sticks[team] = { x: 0, y: 0, active: false };
    this.sendCurrentInput(team);
  }

  private releasePedal(team: Team): void {
    this.pedals.delete(team);
    this.view.localPedals[team] = false;
    this.sendCurrentInput(team);
  }

  private currentThrottle(team: Team): number {
    return this.state?.driveMode === 'pedal' ? (this.pedals.has(team) ? 1 : 0) : 1;
  }

  private sendCurrentInput(team: Team, force = false): void {
    const stick = this.view.sticks[team];
    this.sendInput(team, this.currentThrottle(team), stick.active ? stick.x : 0, force);
  }

  private streamInputs(): void {
    for (const team of ['A', 'B'] as Team[]) {
      if (!this.view.sticks[team].active && !this.pedals.has(team)) continue;
      this.sendCurrentInput(team, true);
    }
  }

  private sendInput(team: Team, throttle: number, steer: number, force = false): void {
    const last = this.lastInput[team];
    if (!force && last.throttle === throttle && last.steer === steer) return;
    this.lastInput[team] = { throttle, steer };
    this.send({ type: 'PilotInput', team, throttle, steer });
  }

  // ─── Repair pads ──────────────────────────────────────────────────────────

  private padDown(key: string, team: Team, role: Role, id: number): void {
    let set = this.padTouches.get(key);
    if (!set) { set = new Set(); this.padTouches.set(key, set); }
    const first = set.size === 0;
    set.add(id);
    if (first) {
      this.view.localPads[key] = true;
      this.send({ type: 'PadHold', team, role, on: true });
    }
  }

  private padUp(key: string, id: number): void {
    const set = this.padTouches.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) {
      this.view.localPads[key] = false;
      const [team, role] = key.split('-') as [Team, Role];
      this.send({ type: 'PadHold', team, role, on: false });
    }
  }

  /** Release everything (WebSocket lost, tab hidden) so no pad stays "held" on the server. */
  releaseAll(): void {
    for (const key of [...this.padTouches.keys()]) {
      const [team, role] = key.split('-') as [Team, Role];
      this.view.localPads[key] = false;
      this.send({ type: 'PadHold', team, role, on: false });
    }
    this.padTouches.clear();
    for (const team of ['A', 'B'] as Team[]) {
      this.pedals.delete(team);
      this.view.localPedals[team] = false;
    }
    for (const team of ['A', 'B'] as Team[]) {
      this.releaseStick(team);
      this.lastInput[team] = { throttle: 1e9, steer: 1e9 }; // force the neutral frame out
      this.sendCurrentInput(team);
    }
    this.contacts.clear();
    this.view.debug.contacts = 0;
  }

  // ─── Free gestures ────────────────────────────────────────────────────────

  private scheduleEvaluation(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => { this.settleTimer = null; this.evaluate(); }, SETTLE_MS);
  }

  private armedTeam(kind: 'slingshot' | 'boost', at: Vec2): Team | null {
    const state = this.state;
    if (!state) return null;
    const now = this.view.now();
    const armed = (['A', 'B'] as Team[]).filter(t => {
      const car = state.cars[t];
      return car.itemArmed && car.heldItem === kind && now < car.itemArmExpiry;
    });
    if (armed.length === 0) return null;
    return armed.length === 1 ? armed[0] : nearestStationTeam(at);
  }

  /**
   * Judged once the fingers have settled. 3 contacts and 2 contacts are exclusive:
   * a 3-finger touch can never also fire the 2-finger gesture.
   */
  private evaluate(): void {
    const state = this.state;
    if (!state || state.phase !== 'RACE') return;
    const free = [...this.contacts.values()].filter(c => c.zone === 'free' && !c.consumed);

    if (free.length === 3) {
      const cx = (free[0].x + free[1].x + free[2].x) / 3;
      const cy = (free[0].y + free[1].y + free[2].y) / 3;
      if (free.every(c => Math.hypot(c.x - cx, c.y - cy) <= SLING_CLUSTER_PX)) {
        const team = this.armedTeam('slingshot', { x: cx, y: cy });
        if (team) {
          this.send({ type: 'Slingshot', x: cx, y: cy, team });
          free.forEach(c => { c.consumed = true; });
        }
      }
    } else if (free.length === 2 && !free.some(c => c.outward)) {
      const d = Math.hypot(free[0].x - free[1].x, free[0].y - free[1].y);
      if (d >= BOOST_MIN_PX && d <= BOOST_MAX_PX) {
        const mid = { x: (free[0].x + free[1].x) / 2, y: (free[0].y + free[1].y) / 2 };
        const team = this.armedTeam('boost', mid);
        if (team) {
          this.send({
            type: 'BoostGate',
            a: { x: free[0].x, y: free[0].y },
            b: { x: free[1].x, y: free[1].y },
            team,
          });
          free.forEach(c => { c.consumed = true; });
        }
      }
    }
  }

  /** Two nearby fingers must start on the same edge and move out together. */
  private tryBorderPullPair(): void {
    const state = this.state;
    if (!state || state.phase !== 'RACE') return;
    const candidates = [...this.contacts.values()]
      .filter(c => c.zone === 'free' && !c.consumed && c.outward && c.edgeIndex !== undefined);
    if (candidates.length !== 2) return;
    const [a, b] = candidates;
    if (Math.hypot(a.sx - b.sx, a.sy - b.sy) > PULL_PAIR_MAX_PX) return;
    const n = state.track?.centerline.length ?? 0;
    if (n === 0) return;
    const rawGap = Math.abs(a.edgeIndex! - b.edgeIndex!);
    if (Math.min(rawGap, n - rawGap) > PULL_EDGE_INDEX_GAP) return;
    const outward = { x: (a.outward!.x + b.outward!.x) / 2, y: (a.outward!.y + b.outward!.y) / 2 };
    const outLen = Math.hypot(outward.x, outward.y);
    if (outLen < 0.8) return;
    outward.x /= outLen; outward.y /= outLen;
    const dx = ((a.x - a.sx) + (b.x - b.sx)) / 2;
    const dy = ((a.y - a.sy) + (b.y - b.sy)) / 2;
    if (dx * outward.x + dy * outward.y < PULL_MIN_PX) return;
    const mag = Math.hypot(dx, dy);
    const k = Math.min(1, PULL_MAX_PX / mag);
    const start = { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 };
    const team = nearestStationTeam(start);
    this.send({ type: 'BorderPull', x: start.x, y: start.y, dx: dx * k, dy: dy * k, team });
    candidates.forEach(c => { c.consumed = true; });
  }

  private findHostileWall(state: GameState, team: Team, p: Vec2): string | null {
    let best: string | null = null;
    let bestD = TARGET_RADIUS_PX;
    for (const w of state.walls) {
      if (w.team === team) continue;
      const a = (w.angle * Math.PI) / 180;
      const hx = (Math.cos(a) * w.lengthPx) / 2, hy = (Math.sin(a) * w.lengthPx) / 2;
      const d = distToSegment(p, { x: w.pos.x - hx, y: w.pos.y - hy }, { x: w.pos.x + hx, y: w.pos.y + hy });
      if (d < bestD) { bestD = d; best = w.id; }
    }
    for (const arc of state.arcs) {
      if (arc.team === team) continue;
      const d = distToSegment(p, arc.pylon1, arc.pylon2);
      if (d < bestD) { bestD = d; best = arc.id; }
    }
    return best;
  }

  private mapStrokeStartTeam(state: GameState, p: Vec2): Team | null {
    for (const team of ['A', 'B'] as Team[]) {
      const start = state.mapTargets![team][0];
      if (Math.hypot(p.x - start.x, p.y - start.y) <= 100) return team;
    }
    return null;
  }
}
