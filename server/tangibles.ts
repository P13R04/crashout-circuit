import type { ArcElectric, Tangible, Vec2 } from './types.js';
import { insidePanel, PANELS, PANEL_H, panelWidth, localToWorld } from './layout.js';
import { segmentsIntersect } from './geometry.js';
import { wallCorners, type TangibleDimensions, type TangiblePose } from './tangibleGeometry.js';

export const TANGIBLES = [
  { id: 1, kind: 'wall', name: 'Mur', shortcut: 'M' },
  { id: 2, kind: 'pylon', name: 'Pylône 1', shortcut: '1 / &' },
  { id: 3, kind: 'pylon', name: 'Pylône 2', shortcut: '2 / é' },
] as const;
export type TangibleId = typeof TANGIBLES[number]['id'];
export const tangibleDefinition = (id: number) => TANGIBLES.find(t => t.id === id);

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

/** Shared validation: the console and authoritative server accept the same poses. */
export function validTangiblePose(kind: Tangible['kind'], pose: TangiblePose, p: TangibleDimensions): boolean {
  if (![pose.x, pose.y, pose.angle].every(Number.isFinite)) return false;
  const at = { x: pose.x * p.logicalWidth, y: pose.y * p.logicalHeight };
  // Allow objects anywhere on the table, including slightly outside the table/circuit edges
  const margin = Math.max(p.wallLengthPx, 200);
  if (at.x < -margin || at.x > p.logicalWidth + margin || at.y < -margin || at.y > p.logicalHeight + margin) return false;

  const length = kind === 'wall' ? p.wallLengthPx : p.pylonBasePx;
  const width = kind === 'wall' ? p.wallWidthPx : p.pylonBasePx;
  const corners = wallCorners(at, pose.angle, length, width);
  if (insidePanel(at) || corners.some(v => insidePanel(v))) return false;
  for (const panel of PANELS) {
    const panelCorners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => localToWorld(panel, x*panelWidth(panel.role)/2,y*PANEL_H/2));
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (segmentsIntersect(corners[i], corners[(i+1)%4], panelCorners[j], panelCorners[(j+1)%4])) return false;
      }
    }
  }
  return true;
}
