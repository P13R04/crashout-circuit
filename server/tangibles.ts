/**
 * Définit les trois objets neutres, valide leur emplacement et construit la liaison électrique entre les
 * piliers.
 * Liens : server/layout.ts, server/geometry.ts, server/types.ts, server/tangibleGeometry.ts.
 * Référencé notamment par client-oz/OzController.ts, client-oz/OzMap.ts, client-oz/main.ts.
 */
import type { ArcElectric, Tangible, Vec2 } from './types.js';
import { insidePanel, PANELS, PANEL_H, panelWidth, localToWorld } from './layout.js';
import { segmentsIntersect } from './geometry.js';
import { wallCorners, type TangibleDimensions, type TangiblePose } from './tangibleGeometry.js';

export const TANGIBLES = [
  { id: 1, kind: 'wall', name: 'Mur', shortcut: 'M' },
  { id: 2, kind: 'pylon', name: 'Pylône 1', shortcut: '1 / &' },
  { id: 3, kind: 'pylon', name: 'Pylône 2', shortcut: '2 / é' },
] as const;
/** Limite les commandes aux identifiants fixes du mur et des deux piliers. */
export type TangibleId = typeof TANGIBLES[number]['id'];
/** Retrouve le type fixé à l’identifiant du tangible demandé. */
export const tangibleDefinition = (id: number) => TANGIBLES.find(/* Associe l’identifiant demandé à l’un des trois objets définis. */ t => t.id === id);

/** Construit l’arc seulement lorsque les deux piliers sont posés, actifs et suffisamment proches. */
export function tangibleArc(tangibles: Record<number, Tangible>, params: {
  logicalWidth: number; logicalHeight: number; arcMaxDistPx: number;
}): ArcElectric | null {
  const a = tangibles[2], b = tangibles[3];
  if (!a?.active || !b?.active || a.status !== 'placed' || b.status !== 'placed') return null;
  const pylon1 = { x: a.x * params.logicalWidth, y: a.y * params.logicalHeight };
  const pylon2 = { x: b.x * params.logicalWidth, y: b.y * params.logicalHeight };
  if (Math.hypot(pylon1.x - pylon2.x, pylon1.y - pylon2.y) > params.arcMaxDistPx) return null;
  return { id: 'arc-2-3', team: null, pylon1, pylon2, disabledUntil: 0 };
}

/** Écarte les poses non finies ou incompatibles avec les postes des joueurs. */
export function validTangiblePose(kind: Tangible['kind'], pose: TangiblePose, p: TangibleDimensions): boolean {
  if (![pose.x, pose.y, pose.angle].every(Number.isFinite)) return false;
  const at = { x: pose.x * p.logicalWidth, y: pose.y * p.logicalHeight };
  // Allow objects anywhere on the table, including slightly outside the table/circuit edges
  const margin = Math.max(p.wallLengthPx, 200);
  if (at.x < -margin || at.x > p.logicalWidth + margin || at.y < -margin || at.y > p.logicalHeight + margin) return false;

  const length = kind === 'wall' ? p.wallLengthPx : p.pylonBasePx;
  const width = kind === 'wall' ? p.wallWidthPx : p.pylonBasePx;
  const corners = wallCorners(at, pose.angle, length, width);
  if (insidePanel(at) || corners.some(/* Signale un coin du tangible qui empiète sur un poste joueur. */ v => insidePanel(v))) return false;
  for (const panel of PANELS) {
    const panelCorners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(/* Construit les coins du poste dans son orientation réelle pour tester le recouvrement. */ ([x,y]) => localToWorld(panel, x*panelWidth(panel.role)/2,y*PANEL_H/2));
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (segmentsIntersect(corners[i], corners[(i+1)%4], panelCorners[j], panelCorners[(j+1)%4])) return false;
      }
    }
  }
  return true;
}
