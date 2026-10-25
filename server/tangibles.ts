import type { ArcElectric, Tangible, Vec2 } from './types.js';
import { insidePanel } from './layout.js';
import { wallEndpoints, type TangiblePose } from './tangibleGeometry.js';

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
  if (!a?.active || !b?.active) return null;
  const pylon1 = { x: a.x * params.logicalWidth, y: a.y * params.logicalHeight };
  const pylon2 = { x: b.x * params.logicalWidth, y: b.y * params.logicalHeight };
  if (Math.hypot(pylon1.x - pylon2.x, pylon1.y - pylon2.y) > params.arcMaxDistPx) return null;
  return { id: 'arc-2-3', team: null, pylon1, pylon2, disabledUntil: 0 };
}

/** Shared validation: the console and authoritative server accept the same poses. */
export function validTangiblePose(kind: Tangible['kind'], pose: TangiblePose,
  params: { logicalWidth: number; logicalHeight: number; wallLengthPx: number }): boolean {
  if (![pose.x, pose.y, pose.angle].every(Number.isFinite)) return false;
  const at = { x: pose.x * params.logicalWidth, y: pose.y * params.logicalHeight };
  const points: Vec2[] = kind === 'wall' ? [at, ...wallEndpoints(at, pose.angle, params.wallLengthPx)] : [at];
  return points.every(p => p.x >= 0 && p.y >= 0 && p.x <= params.logicalWidth && p.y <= params.logicalHeight && !insidePanel(p));
}
