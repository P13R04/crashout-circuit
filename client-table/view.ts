/**
 * Regroupe l’état d’affichage local de la table, ses messages de dessin, ses contacts et ses effets
 * temporaires.
 * Liens : server/layout.ts, server/geometry.ts, server/types.ts, client-table/themes.ts,
 * client-table/GestureLog.ts.
 * Référencé notamment par client-table/GestureRecognizer.ts, client-table/HUD.ts,
 * client-table/NeonEffects.ts.
 */
import type { GameState, Team, Vec2, ItemKind } from '../server/types.js';
import type { DividerCheck } from '../server/layout.js';
import type { ThemeId } from './themes.js';
import type { SlingshotShot } from '../server/geometry.js';
import type { GestureLogEntry } from './GestureLog.js';

/** Décrit un retour visuel temporaire avec son origine, son équipe et sa durée. */
export interface Effect {
  kind: string;
  itemKind?:ItemKind;
  x: number;
  y: number;
  team: Team;
  start: number; // View.visualTime, so pause also freezes feedback
  dur: number;   // ms
}

/** Conserve les appuis, la poche et la trajectoire provisoire du lance-pierre local. */
export interface SlingPreview {
  team: Team | null;
  anchors: [Vec2, Vec2];
  pouch: Vec2;
  /** True while the roles (anchors / puller) are not decided yet: nothing pulled so far. */
  idle: boolean;
  shot: SlingshotShot;
}

/** Suit un tracé local pendant son dessin et l’attente de sa validation serveur. */
export interface LocalStroke {
  team: Team;
  pts: Vec2[];
  rejectedAt?: number; // performance.now() of a server mapError
  done: boolean;
  submitting?: boolean;
}

/** Regroupe les contacts, les préférences et les aperçus locaux qui ne modifient pas les règles serveur. */
export interface View {
  state: GameState | null;
  reducedMotion: boolean;
  /** Explicit desktop alternative; a mouse click must not change a four-player tutorial. */
  tutorialMode: 'table' | 'pc';
  theme: ThemeId;
  /** Local animation clock, frozen in pause and capped after hidden-tab gaps. */
  visualTime: number;
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
  tangibleTouch: { points: Vec2[]; valid: boolean } | null;
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
  mapNotice: { text: string; until: number; color?: string; reason?: Exclude<DividerCheck, 'ok'> } | null;
  debug: { on: boolean; fps: number; frameMs: number; rtt: number; touchMs: number; contacts: number; gestures: GestureLogEntry[] };
}

/** Associe chaque refus de raccord à une consigne courte affichée sur la table. */
const DIVIDER_REFUSAL: Record<Exclude<DividerCheck, 'ok'>, string> = {
  tooShort: 'Éloignez P2.',
  outOfZone: 'Restez dans la zone pointillée.',
};

export const REFUSAL_COLOR = '#ff4040';

/** Affiche temporairement un message de création dans les deux sens de lecture. */
export function showMapNotice(view: View, text: string, color = REFUSAL_COLOR): void {
  view.mapNotice = { text, color, until: performance.now() + 4000 };
}

/** Associe un refus de tracé à une explication courte destinée à l’équipe concernée. */
export function showMapError(view: View, kind: string, team: Team): void {
  const messages: Record<string, string> = {
    mapWrongStart: 'Partez d’un des deux points.',
    mapWrongEnd: 'Rejoignez l’autre point.',
    mapWrongSide: 'Restez dans votre zone.',
    mapWaitCyan: 'Le cyan trace en premier.',
    mapLocked: `Tracé ${team === 'A' ? 'cyan' : 'rose'} déjà validé.`,
    mapCancelled: 'Contact interrompu. Recommencez.',
    mapError: 'Reliez les deux points.',
  };
  showMapNotice(view, messages[kind] ?? messages.mapError);
}

/** Explique pourquoi les points de raccord ne peuvent pas encore être acceptés. */
export function showDividerRefusal(view: View, reason: Exclude<DividerCheck, 'ok'>): void {
  view.mapNotice = { text: DIVIDER_REFUSAL[reason], reason, until: performance.now() + 4000, color: REFUSAL_COLOR };
}

export const TEAM_COLOR: Record<Team, string> = { A: '#00e5ff', B: '#ff4081' };
export const TEAM_NAME: Record<Team, string> = { A: 'CYAN', B: 'ROSE' };

/** Prépare l’état d’affichage local sans créer ni modifier l’état de jeu du serveur. */
export function createView(now: () => number): View {
  return {
    state: null,
    reducedMotion: false,
    tutorialMode: 'table',
    theme: 'scrap',
    visualTime: 0,
    now,
    effects: [],
    localPads: {},
    localPedals: { A: false, B: false },
    strokes: new Map(),
    sling: null,
    tangibleTouch: null,
    sticks: { A: { x: 0, y: 0, active: false }, B: { x: 0, y: 0, active: false } },
    hpShown: { A: 100, B: 100 },
    mapErrorAt: { A: -1e9, B: -1e9 },
    pendingDivider: [],
    dividerSubmitting: false,
    mapNotice: null,
    debug: { on: false, fps: 0, frameMs: 0, rtt: 0, touchMs: 0, contacts: 0, gestures: [] },
  };
}
