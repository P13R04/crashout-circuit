/**
 * Définit l’emplacement des postes, des commandes et de la réserve, ainsi que les conversions de coordonnées
 * sur la table.
 * Liens : server/types.ts.
 * Référencé notamment par client-oz/OzController.ts, client-oz/OzMap.ts, client-table/GestureRecognizer.ts.
 */
import type { Team, Vec2, DriveMode } from './types.js';

export const LOGICAL_W = 1920;
export const LOGICAL_H = 1080;

/** Distingue les commandes et l’orientation du pilote et du copilote. */
export type Role = 'pilot' | 'copilot';

export const PANEL_H = 160;
/** The pilot panel is wider: it holds steering, the optional pedal and repair. */
export const PILOT_PANEL_W = 420;
export const COPILOT_PANEL_W = 280;
/** Choisit la largeur du poste en fonction du rôle et de la présence de la pédale. */
export const panelWidth = (role: Role, mode: DriveMode = 'auto'): number => role === 'pilot' ? mode === 'pedal' ? 520 : PILOT_PANEL_W : COPILOT_PANEL_W;
export const PAD_R = 58; // compact 116 px repair disc

/** Décrit la place et l’orientation d’un poste appartenant à une équipe et à un rôle. */
export interface PanelLayout {
  team: Team;
  role: Role;
  cx: number;  // panel centre, logical px
  cy: number;
  rot: number; // radians — rotation so that the panel faces its player
}

/** Fixe les quatre places en diagonale et le sens de lecture de chaque rôle sur la table. */
// Fixe une seule fois les quatre postes en diagonale et leur orientation de lecture.
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
/** Place le bouton de réparation dans le repère du poste et de son mode de conduite. */
export const padLocal = (role: Role, mode: DriveMode = 'auto') => role === 'pilot' ? { ...PAD_LOCAL_PILOT, x: mode === 'pedal' ? 180 : 130 } : PAD_LOCAL_COPILOT;
/**
 * One steering strip split into two zones. A pilot may cross the centre without
 * lifting their finger, while each half keeps the keyboard's full-turn feel.
 */
export const STEER_AREA_LOCAL = { x: -80, y: 23, w: 220, h: 78 };
/** Décale la bande de direction pour laisser la place à la pédale lorsqu’elle est affichée. */
export const steerArea = (mode: DriveMode = 'auto') => ({...STEER_AREA_LOCAL, x: mode === 'pedal' ? -130 : -80});
/** Pedal shown only in manual-drive mode, held to accelerate. */
export const PEDAL_LOCAL = { x: 40, y: 23, w: 80, h: 78 };
export const POWER_BTN_LOCAL = { x: -65, y: 14, r: 40 };
export const ITEM_SLOT_LOCAL = {x:POWER_BTN_LOCAL.x,y:-43};
/** Historical coordinates for journal compatibility; no charging surface exists. */
// Ancien repère conservé pour compatibilité ; la réserve active est TANGIBLE_DEPOT.
export const CHARGE_ZONE_LOCAL = { x: -43, y: 12, w: 144, h: 144 };

/** Conserve l’ancien point d’entrée de recharge sans attribuer de tangible à une équipe. */
export function chargeZoneTeam(_p: Vec2): Team | null { return null; }

export const TANGIBLE_DEPOT = { x:1780, y:345, w:128, h:390 };
export const SETTINGS_BUTTON = { x:25, y:502, w:90, h:76 };
export const NEUTRAL_CONTROLS = { x:12, y:480, w:116, h:120 };
/** Vérifie qu’un point appartient au rectangle demandé. */
export const rectContains = (r:{x:number;y:number;w:number;h:number},p:Vec2) => p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
/** Indique si la pose se trouve dans la réserve neutre des objets. */
export const inTangibleDepot = (p:Vec2) => rectContains(TANGIBLE_DEPOT,p);
/** Écarte des gestes de jeu les zones communes de pause et de paramètres. */
export const inNeutralUi = (p:Vec2) => rectContains(NEUTRAL_CONTROLS,p) || (p.x>=900&&p.x<=1020&&p.y>=12&&p.y<=152);
/** Renvoie l’emplacement de rangement de chacun des trois objets dans la réserve. */
export function depotPose(id:number,W=LOGICAL_W,H=LOGICAL_H){
  return {x:1844/W,y:({1:425,2:555,3:660} as Record<number,number>)[id]/H,angle:id===1?90:0};
}

/** Retrouve le poste de l’équipe et du rôle demandés. */
export function panelOf(team: Team, role: Role): PanelLayout {
  return PANELS.find(/* Retrouve le poste dont l’équipe et le rôle correspondent à la demande. */ p => p.team === team && p.role === role)!;
}

/** Transforme les coordonnées du poste orienté en coordonnées logiques de la table. */
export function localToWorld(panel: PanelLayout, lx: number, ly: number): Vec2 {
  const c = Math.cos(panel.rot), s = Math.sin(panel.rot);
  return { x: panel.cx + lx * c - ly * s, y: panel.cy + lx * s + ly * c };
}

/** Ramène une position de la table dans le repère orienté du poste. */
export function worldToLocal(panel: PanelLayout, wx: number, wy: number): Vec2 {
  const dx = wx - panel.cx, dy = wy - panel.cy;
  const c = Math.cos(-panel.rot), s = Math.sin(-panel.rot);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

/** Attribue une position au copilote le plus proche pour les gestes partagés. */
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

/** Vérifie qu’une position empiète sur un poste ou une zone de commande réservée. */
export function insidePanel(p: Vec2, margin = 0): boolean {
  if(inNeutralUi(p) || [NEUTRAL_CONTROLS,{x:900,y:12,w:120,h:140}].some(/* Inclut la marge demandée autour des commandes communes de l’interface. */ r=>rectContains({x:r.x-margin,y:r.y-margin,w:r.w+margin*2,h:r.h+margin*2},p)))return true;
  for (const panel of PANELS) {
    const l = worldToLocal(panel, p.x, p.y);
    if (Math.abs(l.x) <= panelWidth(panel.role, 'pedal') / 2 + margin && Math.abs(l.y) <= PANEL_H / 2 + margin) return true;
  }
  return false;
}

/** Choisit l’orientation du poste de l’équipe le plus proche du message à afficher. */
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

/** Vérifie qu’un point appartient à la surface réservée au dessin du circuit. */
export function inPlayArea(p: Vec2): boolean {
  return p.x >= PLAY_AREA.x0 && p.x <= PLAY_AREA.x1 && p.y >= PLAY_AREA.y0 && p.y <= PLAY_AREA.y1;
}

/** Nomme les motifs possibles de refus de la paire de raccords du circuit. */
export type DividerCheck = 'ok' | 'tooShort' | 'outOfZone';

/** Valide les points de raccord et leur écart avant d’accepter la création. */
export function checkDivider(a: Vec2, b: Vec2): DividerCheck {
  if (!inPlayArea(a) || !inPlayArea(b)) return 'outOfZone';
  if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_DIVIDER_PX) return 'tooShort';
  return 'ok';
}
