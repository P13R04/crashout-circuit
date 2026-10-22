import type { GameState, Team, Vec2 } from '../server/types.js';
import { MIN_DIVIDER_PX, type DividerCheck } from '../server/layout.js';
import type { SlingshotShot } from '../server/geometry.js';

/** Short-lived visual effect spawned by a server `Feedback` message. */
export interface Effect {
  kind: string;
  x: number;
  y: number;
  team: Team;
  start: number; // performance.now()
  dur: number;   // ms
  /** Comic word shown by `stoneHit` effects, and its tilt in radians. */
  text?: string;
  tilt?: number;
}

/** Slingshot being drawn on the table: fork anchors, pulled pouch and the predicted shot. */
export interface SlingPreview {
  team: Team | null;
  anchors: [Vec2, Vec2];
  pouch: Vec2;
  /** True while the roles (anchors / puller) are not decided yet: nothing pulled so far. */
  idle: boolean;
  shot: SlingshotShot;
}

export interface LocalStroke {
  team: Team;
  pts: Vec2[];
  rejectedAt?: number; // performance.now() of a server mapError
  done: boolean;
  submitting?: boolean;
}

/** Everything the renderer and the HUD need besides the authoritative GameState. */
export interface View {
  state: GameState | null;
  /** Server time in ms (Date.now() corrected by the measured offset). */
  now(): number;
  effects: Effect[];
  /** Immediate touch feedback for the repair pads, before the server echoes it. */
  localPads: Record<string, boolean>;
  /** Immediate feedback for the pilot acceleration pedals. */
  localPedals: Record<Team, boolean>;
  strokes: Map<number, LocalStroke>;
  /** Live slingshot preview (3 fingers, or the mouse stand-in on PC). */
  sling: SlingPreview | null;
  /** Joystick knob per team, normalized to the base radius (x right, y down), as drawn. */
  sticks: Record<Team, { x: number; y: number; active: boolean }>;
  /** Smoothed HP shown on the bars. */
  hpShown: Record<Team, number>;
  /** Last mapError per team (performance.now()). */
  mapErrorAt: Record<Team, number>;
  /** Points currently chosen during the two-point placement stage of MAP phase. */
  pendingDivider: Vec2[];
  dividerSubmitting: boolean;
  /** Transient guidance notice shown during map creation. */
  mapNotice: { text: string; until: number; color?: string } | null;
  debug: { on: boolean; fps: number; frameMs: number; rtt: number; touchMs: number; contacts: number };
}

const DIVIDER_REFUSAL: Record<Exclude<DividerCheck, 'ok'>, string> = {
  tooShort: `Points trop proches : écartez-les d’au moins ${MIN_DIVIDER_PX} px.`,
  outOfZone: 'Point hors de la zone du circuit : placez-le dans le cadre en pointillés.',
};

export const REFUSAL_COLOR = '#ff4040';

export function showMapNotice(view: View, text: string, color = REFUSAL_COLOR): void {
  view.mapNotice = { text, color, until: performance.now() + 4000 };
}

export function showMapError(view: View, kind: string, team: Team): void {
  const start = team === 'A' ? 'P1' : 'P2';
  const end = team === 'A' ? 'P2' : 'P1';
  const messages: Record<string, string> = {
    mapWrongStart: `Commencez dans le cercle ${start}.`,
    mapWrongEnd: `Rejoignez ${end} avant de relâcher.`,
    mapWrongSide: 'Dessinez votre partie dans la zone de votre équipe.',
    mapWaitCyan: 'Équipe rose : patientez, le cyan trace en premier.',
    mapLocked: `Le tracé ${team === 'A' ? 'cyan' : 'rose'} est déjà validé.`,
    mapCancelled: 'Contact interrompu : recommencez depuis le cercle de départ.',
    mapError: 'Tracé trop court ou incomplet : reliez les deux cercles.',
  };
  showMapNotice(view, messages[kind] ?? messages.mapError);
}

/** Tell the players why the dividing line was refused (a refusal is never silent). */
export function showDividerRefusal(view: View, reason: Exclude<DividerCheck, 'ok'>): void {
  view.mapNotice = { text: DIVIDER_REFUSAL[reason], until: performance.now() + 4000, color: REFUSAL_COLOR };
}

export const TEAM_COLOR: Record<Team, string> = { A: '#00e5ff', B: '#ff4081' };
export const TEAM_NAME: Record<Team, string> = { A: 'CYAN', B: 'ROSE' };

export function createView(now: () => number): View {
  return {
    state: null,
    now,
    effects: [],
    localPads: {},
    localPedals: { A: false, B: false },
    strokes: new Map(),
    sling: null,
    sticks: { A: { x: 0, y: 0, active: false }, B: { x: 0, y: 0, active: false } },
    hpShown: { A: 100, B: 100 },
    mapErrorAt: { A: -1e9, B: -1e9 },
    pendingDivider: [],
    dividerSubmitting: false,
    mapNotice: null,
    debug: { on: false, fps: 0, frameMs: 0, rtt: 0, touchMs: 0, contacts: 0 },
  };
}
