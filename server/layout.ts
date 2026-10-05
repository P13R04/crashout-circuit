/**
 * Table layout shared by the server and the table client (no Node imports).
 * Logical space is 1920×1080; every corner panel faces its own table edge (REQ-5.3).
 */
import type { Team, Vec2 } from './types.js';

export const LOGICAL_W = 1920;
export const LOGICAL_H = 1080;

export type Role = 'pilot' | 'copilot';

export const PANEL_H = 200;
/** The pilot panel is wider: it holds the joystick, the item button and the repair pad. */
export const PILOT_PANEL_W = 700;
export const COPILOT_PANEL_W = 460;
export const panelWidth = (role: Role): number => (role === 'pilot' ? PILOT_PANEL_W : COPILOT_PANEL_W);
export const PAD_R = 80; // 160 px repair disc (REQ-4.7.4)

export interface PanelLayout {
  team: Team;
  role: Role;
  cx: number;  // panel centre, logical px
  cy: number;
  rot: number; // radians — rotation so that the panel faces its player
}

export const PANELS: PanelLayout[] = [
  { team: 'A', role: 'pilot',   cx: 370,  cy: 960, rot: 0 },
  { team: 'A', role: 'copilot', cx: 1670, cy: 960, rot: 0 },
  { team: 'B', role: 'pilot',   cx: 370,  cy: 120, rot: Math.PI },
  { team: 'B', role: 'copilot', cx: 1670, cy: 120, rot: Math.PI },
];

/**
 * Positions inside a panel, in the panel's own frame (origin = centre, y down,
 * "up" = away from the player = forward for the car).
 */
export const PAD_LOCAL_COPILOT = { x: 140, y: 18, r: PAD_R };
export const PAD_LOCAL_PILOT = { x: 250, y: 10, r: PAD_R };
export const padLocal = (role: Role) => (role === 'pilot' ? PAD_LOCAL_PILOT : PAD_LOCAL_COPILOT);
/** Touchpad-style joystick of the pilot: vertical axis = throttle, horizontal = steering. */
export const JOY_LOCAL = { x: -255, y: 10, r: 85 };
/** Grab radius: a touch starting slightly outside the base still grabs the stick. */
export const JOY_GRAB_R = 105;
export const ITEM_BTN_LOCAL = { x: -20, y: 45, r: 40 };
export const GHOST_BTN_LOCAL = { x: -150, y: 20, r: 42 };
export const DESTROY_BTN_LOCAL = { x: -50, y: 20, r: 42 };

export function panelOf(team: Team, role: Role): PanelLayout {
  return PANELS.find(p => p.team === team && p.role === role)!;
}

export function localToWorld(panel: PanelLayout, lx: number, ly: number): Vec2 {
  const c = Math.cos(panel.rot), s = Math.sin(panel.rot);
  return { x: panel.cx + lx * c - ly * s, y: panel.cy + lx * s + ly * c };
}

export function worldToLocal(panel: PanelLayout, wx: number, wy: number): Vec2 {
  const dx = wx - panel.cx, dy = wy - panel.cy;
  const c = Math.cos(-panel.rot), s = Math.sin(-panel.rot);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

/** Team whose copilot station is closest to a point (R-03 tie-break). */
export function nearestStationTeam(p: Vec2): Team {
  let best: Team = 'A';
  let bestD = Infinity;
  for (const panel of PANELS) {
    if (panel.role !== 'copilot') continue;
    const d = Math.hypot(panel.cx - p.x, panel.cy - p.y);
    if (d < bestD) { bestD = d; best = panel.team; }
  }
  return best;
}

/** True when a point lies inside any corner HUD panel (plus margin). */
export function insidePanel(p: Vec2, margin = 0): boolean {
  for (const panel of PANELS) {
    const l = worldToLocal(panel, p.x, p.y);
    if (Math.abs(l.x) <= panelWidth(panel.role) / 2 + margin && Math.abs(l.y) <= PANEL_H / 2 + margin) return true;
  }
  return false;
}

/** Rotation (radians) that makes text readable for the closest player of `team` to `p`. */
export function rotationTowardsTeam(team: Team, p: Vec2): number {
  let best = PANELS[0];
  let bestD = Infinity;
  for (const panel of PANELS) {
    if (panel.team !== team) continue;
    const d = Math.hypot(panel.cx - p.x, panel.cy - p.y);
    if (d < bestD) { bestD = d; best = panel; }
  }
  return best.rot;
}
