/**
 * Table layout shared by the server and the table client (no Node imports).
 * Logical space is 1920×1080; every corner panel faces its own table edge (REQ-5.3).
 */
import type { Team, Vec2 } from './types.js';

export const LOGICAL_W = 1920;
export const LOGICAL_H = 1080;

export type Role = 'pilot' | 'copilot';

export const PANEL_W = 460;
export const PANEL_H = 200;
export const PAD_R = 80; // 160 px repair disc (REQ-4.7.4)

export interface PanelLayout {
  team: Team;
  role: Role;
  cx: number;  // panel centre, logical px
  cy: number;
  rot: number; // radians — rotation so that the panel faces its player
}

export const PANELS: PanelLayout[] = [
  { team: 'A', role: 'pilot',   cx: 250,  cy: 960, rot: 0 },
  { team: 'A', role: 'copilot', cx: 1670, cy: 960, rot: 0 },
  { team: 'B', role: 'pilot',   cx: 250,  cy: 120, rot: Math.PI },
  { team: 'B', role: 'copilot', cx: 1670, cy: 120, rot: Math.PI },
];

/** Positions inside a panel, in the panel's own frame (origin = centre, y down). */
export const PAD_LOCAL = { x: 140, y: 18, r: PAD_R };
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
    if (Math.abs(l.x) <= PANEL_W / 2 + margin && Math.abs(l.y) <= PANEL_H / 2 + margin) return true;
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
