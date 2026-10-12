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
 *   free       3 fingers ≤150 px, one pulled back  → Slingshot (released)
 *              2 fingers 100–400 px, no 3rd finger  → BoostGate
 *              one finger pulled off a track edge    → BorderPull
 *
 * Team attribution (R-03): pad/button → station's team; free gesture → the team
 * whose Pilot armed the matching item; both armed → nearest station to the gesture.
 * No finger is ever tracked back to a person (REQ-5.1).
 */
import type { GameState, Team, Vec2 } from '../server/types.js';
import {
  LOGICAL_W, LOGICAL_H, PANELS, padLocal, panelWidth, PANEL_H, STEER_AREA_LOCAL, PEDAL_LOCAL, ITEM_BTN_LOCAL,
  GHOST_BTN_LOCAL, DESTROY_BTN_LOCAL, worldToLocal, type PanelLayout,
  insidePanel, nearestStationTeam, checkDivider, inPlayArea, type Role,
} from '../server/layout.js';
import { distToSegment, nearestOnTrack, slingshotShot } from '../server/geometry.js';
import { RESULT_BUTTON, START_TABLE_BUTTON, START_PC_BUTTON, PAUSE_BUTTON, DRIVE_MODE_BUTTON, MAP_GENERATE_BUTTON, RACE_START_BUTTON, RESET_BUTTON} from './Renderer.js';
import { REFUSAL_COLOR, showDividerRefusal, type View } from './view.js';

export const MAX_CONTACTS = 10;
/** The second divider contact must come within this delay of the first (or the first is dropped). */
export const DIVIDER_PAIR_MS = 4000;
/** On the table, a finger lifted from the first point still counts for this long (contact bounce). */
const DIVIDER_RELEASE_GRACE_MS = 600;
const SETTLE_MS = 180;          // wait for all fingers to land before judging a gesture
const SLING_CLUSTER_PX = 150;   // the three fingers must land together...
const SLING_ROLE_MIN_PX = 14;   // ...then the one that moves this far is the pouch...
const SLING_DOMINANCE = 1.5;    // ...provided it moved this many times more than each other finger
const SIM_FORK_HALF_PX = 38;    // mouse stand-in: virtual anchors either side of the pull axis
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

type Zone = 'simsling' | 'steer' | 'pedal' | 'item' | 'pad' | 'ghost' | 'destroy' | 'stroke' | 'target' | 'result' | 'pause' | 'mode' | 'free' | 'rejected';

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
  strokeKey?: number; // unique per drawn stroke (a mouse reuses the same pointerId)
  outward?: Vec2; // border candidate: unit vector away from the centerline
  edgeIndex?: number;
}

type Send = (msg: { type: string } & Record<string, unknown>) => void;

export class GestureRecognizer {
  private contacts = new Map<number, Contact>();
  private strokeSeq = 0;
  /** Contact that placed the first divider point, and the timer that drops it. */
  private pendingContact: number | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
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
  /** Active touch slingshot: its three contacts and, once decided, the pulling one. */
  private slingIds: number[] | null = null;
  private slingPuller: number | null = null;
  /** Mouse stand-in: the press (fork) point and the dragging pointer. */
  private simSling: { id: number; anchor: Vec2 } | null = null;
  /** Two clicks in desktop mode, or two simultaneous touches on the table. */
  private mapDividerPoints: Vec2[] = [];
  onSimChange: (hint: string) => void = () => {};

  simulate(kind: 'slingshot' | 'boost' | null): void {
    this.sim = kind ? { kind } : null;
    this.onSimChange(!kind ? '' : kind === 'slingshot'
      ? 'Maintenez le clic sur la fourche, tirez en arrière, relâchez pour tirer'
      : 'Cliquez 2 points (100–400 px) : portail de boost (2 doigts)');
  }

  private simClick(p: Vec2): void {
    const sim = this.sim;
    if (!sim || sim.kind !== 'boost') return;
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
      const generate = MAP_GENERATE_BUTTON;
      if (state.mapStrokes.A && state.mapStrokes.B && p.x >= generate.x && p.x <= generate.x + generate.w && p.y >= generate.y && p.y <= generate.y + generate.h) {
        c.zone = 'result'; this.send({ type: 'GenerateTrack' }); return;
      }
      if (!state.mapTargets) {
        c.zone = 'target';
        this.placeDividerPoint(c, p, state.mapMode);
        return;
      }
      const team = this.mapStrokeStartTeam(state, p);
      if (!team) { c.zone = 'rejected'; return; }
      c.zone = 'stroke';
      c.strokeTeam = team;
      for (const [key, s] of this.view.strokes) if (s.team === team) this.view.strokes.delete(key);
      c.strokeKey = ++this.strokeSeq;
      this.view.strokes.set(c.strokeKey, { team, pts: [p], done: false });
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
    // PC mode needs no toolbar button for the slingshot: with a slingshot armed, a plain
    // mouse press is the fork and the drag pulls the pouch.
    const pcAutoSling = !this.sim && state.mapMode === 'pc' && e.pointerType === 'mouse'
      && this.armedTeam('slingshot', p) !== null;
    if (this.sim || pcAutoSling) {
      if (pcAutoSling || this.sim?.kind === 'slingshot') {
        const team = this.armedTeam('slingshot', p);
        if (!team) {
          c.zone = 'target';
          this.sim = null;
          this.onSimChange("Aucune équipe n'a armé de lance-pierre (UTILISER d'abord)");
          return;
        }
        c.zone = 'simsling';
        this.simSling = { id: c.id, anchor: p };
        this.updateSimSling(c);
        return;
      }
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
    this.updateSling();
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
      const s = this.view.strokes.get(c.strokeKey ?? -1);
      const last = s?.pts[s.pts.length - 1];
      if (s && last && Math.hypot(p.x - last.x, p.y - last.y) >= 2) s.pts.push(p);
    } else if (c.zone === 'simsling') {
      this.updateSimSling(c);
    } else if (c.zone === 'free' && !c.consumed) {
      this.updateSling();
      // the fingers of a slingshot are never a border pull
      if (!this.slingIds && c.outward && !c.consumed) this.tryBorderPull(c);
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
    // On the table both points are put down together: a lifted finger stops waiting
    if (c.zone === 'target' && c.id === this.pendingContact && this.state?.mapMode !== 'pc') {
      this.armPendingTimer(DIVIDER_RELEASE_GRACE_MS);
    }
    if (c.zone === 'stroke') {
      const s = this.view.strokes.get(c.strokeKey ?? -1);
      if (s) {
        s.done = true;
        if (s.pts.length >= 2) this.send({ type: 'StrokeDraw', creator: s.team, pts: s.pts });
      }
    }
    if (c.zone === 'simsling') this.releaseSimSling(c);
    if (this.slingIds?.includes(c.id)) this.releaseSling(e.type === 'pointercancel');
    if (c.zone === 'free') this.scheduleEvaluation();
  }

  // ─── Divider (the two shared contacts) ───────────────────────────────────

  /**
   * First contact: wait for the other player's. Second contact: the line is sent, or a
   * message says why it is refused. An isolated contact never waits for long: it is
   * dropped after DIVIDER_PAIR_MS (or right after being lifted on the table), so a
   * palm or a stray touch cannot pair with a contact made much later.
   */
  private placeDividerPoint(c: Contact, p: Vec2, mode: 'table' | 'pc' | null): void {
    const view = this.view;
    if (!inPlayArea(p)) { showDividerRefusal(view, 'outOfZone'); return; }
    const first = view.pendingDivider[0];
    if (!first) {
      view.pendingDivider = [{ ...p }];
      this.pendingContact = c.id;
      this.armPendingTimer(DIVIDER_PAIR_MS);
      view.mapNotice = {
        text: mode === 'pc'
          ? 'Point P1 posé ! Cliquez pour placer le point P2.'
          : 'Point P1 posé ! L’autre joueur pose le point P2 maintenant.',
        until: performance.now() + DIVIDER_PAIR_MS,
        color: '#00e5ff',
      };
      return;
    }
    const verdict = checkDivider(first, p);
    if (verdict !== 'ok') { showDividerRefusal(view, verdict); return; }
    this.dropPendingDivider();
    view.mapNotice = null;
    this.send({ type: 'MapDivider', a: first, b: { ...p } });
  }

  private armPendingTimer(ms: number): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.dropPendingDivider();
      const shown = this.view.mapNotice;
      if (shown && shown.color === REFUSAL_COLOR && shown.until > performance.now()) return; // keep the reason
      this.view.mapNotice = {
        text: this.state?.mapMode === 'pc'
          ? 'Point P1 expiré : recommencez.'
          : 'Contact isolé abandonné : les deux points doivent être posés ensemble.',
        until: performance.now() + 3500,
        color: '#ffb300',
      };
    }, ms);
  }

  private dropPendingDivider(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    this.pendingContact = null;
    this.view.pendingDivider = [];
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
      return car.itemArmed && (state.testMode.allItems || car.heldItem === kind) && now < car.itemArmExpiry;
    });
    if (armed.length === 0) return null;
    return armed.length === 1 ? armed[0] : nearestStationTeam(at);
  }

  /**
   * Judged once the fingers have settled: the 2-finger boost gate. The 3-finger
   * slingshot is handled live by `updateSling`; its fingers are never free for this,
   * and nothing is fired while a sling is being formed.
   */
  private evaluate(): void {
    const state = this.state;
    if (!state || state.phase !== 'RACE' || this.slingIds) return;
    const free = [...this.contacts.values()].filter(c => c.zone === 'free' && !c.consumed);

    if (free.length === 2 && !free.some(c => c.outward)) {
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

  // ─── Slingshot ────────────────────────────────────────────────────────────

  /**
   * Three free fingers landing together while a slingshot is armed form the sling.
   * The landing order says nothing about the roles (fingers land within a few ms of
   * each other): the pouch is the finger that has clearly travelled the most, the
   * other two are the fork. The choice is not final — a finger that merely slid while
   * settling loses it as soon as another one is pulled much farther. Until one finger
   * dominates, no role is shown. The shot is fired on release.
   */
  private updateSling(): void {
    const state = this.state;
    if (!state || state.phase !== 'RACE') { this.cancelSling(); return; }

    if (!this.slingIds) {
      const free = [...this.contacts.values()].filter(c => c.zone === 'free' && !c.consumed);
      if (free.length !== 3) return;
      const cx = (free[0].sx + free[1].sx + free[2].sx) / 3;
      const cy = (free[0].sy + free[1].sy + free[2].sy) / 3;
      if (!free.every(c => Math.hypot(c.sx - cx, c.sy - cy) <= SLING_CLUSTER_PX)) return;
      if (!this.armedTeam('slingshot', { x: cx, y: cy })) return;
      this.slingIds = free.map(c => c.id);
      this.slingPuller = null;
    }

    const cs = this.slingIds.map(id => this.contacts.get(id)).filter((c): c is Contact => !!c);
    if (cs.length !== 3) { this.cancelSling(); return; }
    const disp = (c: Contact) => Math.hypot(c.x - c.sx, c.y - c.sy);

    const far = [...cs].sort((a, b) => disp(b) - disp(a));
    // A finger takes (or takes back) the pouch role only when it left its spot while
    // both others stayed comparatively still; otherwise the previous choice is kept.
    if (disp(far[0]) >= SLING_ROLE_MIN_PX && disp(far[0]) >= disp(far[1]) * SLING_DOMINANCE) this.slingPuller = far[0].id;

    const puller = cs.find(c => c.id === this.slingPuller) ?? null;
    const anchors = puller ? cs.filter(c => c !== puller) : cs.slice(0, 2);
    const a: Vec2 = { x: (anchors[0].x + anchors[1].x) / 2, y: (anchors[0].y + anchors[1].y) / 2 };
    const pouch: Vec2 = puller ? { x: puller.x, y: puller.y } : { x: cs[2].x, y: cs[2].y };
    this.view.sling = {
      team: this.armedTeam('slingshot', a),
      anchors: [{ x: anchors[0].x, y: anchors[0].y }, { x: anchors[1].x, y: anchors[1].y }],
      pouch,
      idle: !puller,
      shot: slingshotShot(a, pouch, state.params),
    };
  }

  /**
   * The first finger to lift releases the sling: fingers rarely leave the glass in a
   * clean order, so any lift fires the shot as long as the pull is long enough. To
   * cancel, bring the pouch back near the fork before lifting.
   */
  private releaseSling(cancelled: boolean): void {
    const state = this.state;
    const sling = this.view.sling;
    for (const id of this.slingIds ?? []) {
      const o = this.contacts.get(id);
      if (o) o.consumed = true; // the remaining fingers must not trigger other gestures
    }
    this.cancelSling();
    if (cancelled || !state || !sling || sling.idle || !sling.shot.valid) return;
    const anchor = { x: (sling.anchors[0].x + sling.anchors[1].x) / 2, y: (sling.anchors[0].y + sling.anchors[1].y) / 2 };
    const team = this.armedTeam('slingshot', anchor);
    if (team) this.send({ type: 'Slingshot', anchor, pouch: { ...sling.pouch }, team });
  }

  private cancelSling(): void {
    this.slingIds = null;
    this.slingPuller = null;
    if (!this.simSling) this.view.sling = null;
  }

  /** Mouse stand-in: the press point is the fork, dragging pulls the pouch. */
  private updateSimSling(c: Contact): void {
    const state = this.state;
    if (!state || !this.simSling) return;
    const anchor = this.simSling.anchor;
    const pouch: Vec2 = { x: c.x, y: c.y };
    const shot = slingshotShot(anchor, pouch, state.params);
    // Virtual anchors either side of the pull axis, so the elastic looks like a Y
    const nx = -shot.dir.y, ny = shot.dir.x;
    this.view.sling = {
      team: this.armedTeam('slingshot', anchor),
      anchors: [
        { x: anchor.x + nx * SIM_FORK_HALF_PX, y: anchor.y + ny * SIM_FORK_HALF_PX },
        { x: anchor.x - nx * SIM_FORK_HALF_PX, y: anchor.y - ny * SIM_FORK_HALF_PX },
      ],
      pouch,
      idle: shot.pull < 4,
      shot,
    };
  }

  private releaseSimSling(c: Contact): void {
    const state = this.state;
    const sim = this.simSling;
    this.simSling = null;
    this.view.sling = null;
    if (!state || !sim) return;
    const shot = slingshotShot(sim.anchor, { x: c.x, y: c.y }, state.params);
    if (!shot.valid) {
      this.onSimChange(`Tirez plus en arrière (au moins ${state.params.slingMinPullPx} px)`);
      return; // the simulation stays armed: try again
    }
    const team = this.armedTeam('slingshot', sim.anchor);
    if (team) this.send({ type: 'Slingshot', anchor: sim.anchor, pouch: { x: c.x, y: c.y }, team });
    this.sim = null;
    this.onSimChange('');
  }

  private tryBorderPull(c: Contact): void {
    const state = this.state;
    if (!state || state.phase !== 'RACE' || this.slingIds) return;
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
    if (!state.mapTargets) return null;
    const p1 = state.mapTargets.A[0]; // Anchor 1
    const p2 = state.mapTargets.A[1]; // Anchor 2
    const d1 = Math.hypot(p.x - p1.x, p.y - p1.y);
    const d2 = Math.hypot(p.x - p2.x, p.y - p2.y);
    const TOLERANCE = 150;

    // Which side of the divider line is the touch?
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const cross = dx * (p.y - p1.y) - dy * (p.x - p1.x);
    // cross >= 0 -> Team A side; cross < 0 -> Team B side
    const touchSideTeam: Team = cross >= 0 ? 'A' : 'B';

    if (d1 <= TOLERANCE) {
      if (!state.mapStrokes.A) return 'A';
      if (!state.mapStrokes.B) return 'B';
      return touchSideTeam;
    }
    if (d2 <= TOLERANCE) {
      if (!state.mapStrokes.B) return 'B';
      if (!state.mapStrokes.A) return 'A';
      return touchSideTeam;
    }
    if (d1 <= TOLERANCE * 1.5 || d2 <= TOLERANCE * 1.5) {
      return touchSideTeam;
    }
    return null;
  }
}
