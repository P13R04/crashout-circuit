import type { GameState, Team, Vec2 } from '../server/types.js';

/** Short-lived visual effect spawned by a server `Feedback` message. */
export interface Effect {
  kind: string;
  x: number;
  y: number;
  team: Team;
  start: number; // performance.now()
  dur: number;   // ms
}

export interface LocalStroke {
  team: Team;
  pts: Vec2[];
  rejectedAt?: number; // performance.now() of a server mapError
  done: boolean;
}

/** Everything the renderer and the HUD need besides the authoritative GameState. */
export interface View {
  state: GameState | null;
  /** Server time in ms (Date.now() corrected by the measured offset). */
  now(): number;
  effects: Effect[];
  /** Immediate touch feedback for the repair pads, before the server echoes it. */
  localPads: Record<string, boolean>;
  /** Destroy-wall targeting mode, deadline in local Date.now() ms. */
  targeting: { team: Team; until: number } | null;
  strokes: Map<number, LocalStroke>;
  /** Joystick knob per team, normalized to the base radius (x right, y down), as drawn. */
  sticks: Record<Team, { x: number; y: number; active: boolean }>;
  /** Smoothed HP shown on the bars. */
  hpShown: Record<Team, number>;
  /** Last mapError per team (performance.now()). */
  mapErrorAt: Record<Team, number>;
  debug: { on: boolean; fps: number; frameMs: number; rtt: number; touchMs: number; contacts: number };
}

export const TEAM_COLOR: Record<Team, string> = { A: '#00e5ff', B: '#ff4081' };
export const TEAM_NAME: Record<Team, string> = { A: 'CYAN', B: 'ROSE' };

export function createView(now: () => number): View {
  return {
    state: null,
    now,
    effects: [],
    localPads: {},
    targeting: null,
    strokes: new Map(),
    sticks: { A: { x: 0, y: 0, active: false }, B: { x: 0, y: 0, active: false } },
    hpShown: { A: 100, B: 100 },
    mapErrorAt: { A: -1e9, B: -1e9 },
    debug: { on: false, fps: 0, frameMs: 0, rtt: 0, touchMs: 0, contacts: 0 },
  };
}
