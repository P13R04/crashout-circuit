/**
 * Table layout shared by the server and the table client (no Node imports).
 * Logical space is 1920×1080; every corner panel faces its own table edge (REQ-5.3).
 */
import type { Team, Vec2, DriveMode } from './types.js';

export const LOGICAL_W = 1920;
export const LOGICAL_H = 1080;

export type Role = 'pilot' | 'copilot';

export const PANEL_H = 160;
/** The pilot panel is wider: it holds steering, the optional pedal and repair. */
export const PILOT_PANEL_W = 420;
export const COPILOT_PANEL_W = 280;
export const panelWidth = (role: Role, mode: DriveMode = 'auto'): number => role === 'pilot' ? mode === 'pedal' ? 520 : PILOT_PANEL_W : COPILOT_PANEL_W;
export const PAD_R = 58; // compact 116 px repair disc

export interface PanelLayout {
  team: Team;
  role: Role;
  cx: number;  // panel centre, logical px
  cy: number;
  rot: number; // radians — rotation so that the panel faces its player
}

export const PANELS: PanelLayout[] = [
  { team: 'A', role: 'pilot',   cx: 280,  cy: 990, rot: 0 },
  { team: 'A', role: 'copilot', cx: 1760, cy: 90, rot: Math.PI },
  { team: 'B', role: 'pilot',   cx: 280,  cy: 90, rot: Math.PI },
  { team: 'B', role: 'copilot', cx: 1760, cy: 990, rot: 0 },
];

/**
 * Positions inside a panel, in the panel's own frame (origin = centre, y down,
 * "up" = away from the player = forward for the car).
 */
export const PAD_LOCAL_COPILOT = { x: 65, y: 12, r: PAD_R };
export const PAD_LOCAL_PILOT = { x: 130, y: 12, r: PAD_R };
export const padLocal = (role: Role, mode: DriveMode = 'auto') => role === 'pilot' ? { ...PAD_LOCAL_PILOT, x: mode === 'pedal' ? 180 : 130 } : PAD_LOCAL_COPILOT;
/**
 * One steering strip split into two zones. A pilot may cross the centre without
 * lifting their finger, while each half keeps the keyboard's full-turn feel.
 */
export const STEER_AREA_LOCAL = { x: -80, y: 23, w: 220, h: 78 };
export const steerArea = (mode: DriveMode = 'auto') => ({...STEER_AREA_LOCAL, x: mode === 'pedal' ? -130 : -80});
/** Pedal shown only in manual-drive mode, held to accelerate. */
export const PEDAL_LOCAL = { x: 40, y: 23, w: 80, h: 78 };
export const POWER_BTN_LOCAL = { x: -65, y: 14, r: 40 };
/** Historical coordinates for journal compatibility; no charging surface exists. */
export const CHARGE_ZONE_LOCAL = { x: -43, y: 12, w: 144, h: 144 };

/** Compatibility for old journals: copilot stations no longer contain a charging zone. */
export function chargeZoneTeam(_p: Vec2): Team | null { return null; }

export const TANGIBLE_DEPOT = { x:1780, y:345, w:128, h:390 };
export const SETTINGS_BUTTON = { x:25, y:502, w:90, h:76 };
export const NEUTRAL_CONTROLS = { x:12, y:480, w:116, h:120 };
export const rectContains = (r:{x:number;y:number;w:number;h:number},p:Vec2) => p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
export const inTangibleDepot = (p:Vec2) => rectContains(TANGIBLE_DEPOT,p);
export const inNeutralUi = (p:Vec2) => rectContains(NEUTRAL_CONTROLS,p) || (p.x>=900&&p.x<=1020&&p.y>=12&&p.y<=152);
export function depotPose(id:number,W=LOGICAL_W,H=LOGICAL_H){
  return {x:1844/W,y:({1:425,2:555,3:660} as Record<number,number>)[id]/H,angle:id===1?90:0};
}

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
  if(inNeutralUi(p) || [NEUTRAL_CONTROLS,{x:900,y:12,w:120,h:140}].some(r=>rectContains({x:r.x-margin,y:r.y-margin,w:r.w+margin*2,h:r.h+margin*2},p)))return true;
  for (const panel of PANELS) {
    const l = worldToLocal(panel, p.x, p.y);
    if (Math.abs(l.x) <= panelWidth(panel.role, 'pedal') / 2 + margin && Math.abs(l.y) <= PANEL_H / 2 + margin) return true;
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

/**
 * Free area of the table for the circuit centerline: between the two rows of corner
 * panels, half a lane plus its wall away from the edges (R-22). The edges of the
 * generated circuit therefore stay within y ∈ [185, 895].
 */
export const PLAY_AREA = { x0: 230, y0: 270, x1: 1680, y1: 810 };

/** The two shared contacts of the divider are at least this far apart (context.md §5.2 step 1). */
export const MIN_DIVIDER_PX = 360;

export function inPlayArea(p: Vec2): boolean {
  return p.x >= PLAY_AREA.x0 && p.x <= PLAY_AREA.x1 && p.y >= PLAY_AREA.y0 && p.y <= PLAY_AREA.y1;
}

export type DividerCheck = 'ok' | 'tooShort' | 'outOfZone';

/** Single rule for the divider, used by the table (immediate message) and the server. */
export function checkDivider(a: Vec2, b: Vec2): DividerCheck {
  if (!inPlayArea(a) || !inPlayArea(b)) return 'outOfZone';
  if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_DIVIDER_PX) return 'tooShort';
  return 'ok';
}
