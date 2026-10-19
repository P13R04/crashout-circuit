import type { GameState, Team, Vec2 } from './types.js';

/** Shared by drawing, hit testing and server validation: the visible target is the hit area. */
export const MAP_ANCHOR_RADIUS = 95;

export function activeMapTeam(state: Pick<GameState, 'mapStrokes'>): Team | null {
  return !state.mapStrokes.A ? 'A' : !state.mapStrokes.B ? 'B' : null;
}

export function inMapAnchor(point: Vec2, anchor: Vec2): boolean {
  return Math.hypot(point.x - anchor.x, point.y - anchor.y) <= MAP_ANCHOR_RADIUS;
}

/** Strict endpoints for the guided creation flow (the generator remains independent). */
export function mapEndpointError(pts: Vec2[], start: Vec2, end: Vec2): string | null {
  if (!pts.length || !inMapAnchor(pts[0], start)) return 'mapWrongStart';
  if (pts.length < 2 || !inMapAnchor(pts[pts.length - 1], end)) return 'mapWrongEnd';
  return null;
}
