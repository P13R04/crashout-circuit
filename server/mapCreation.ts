import type { GameState, Team, Vec2 } from './types.js';

/** Shared by drawing, hit testing and server validation: the visible target is the hit area. */
export const MAP_ANCHOR_RADIUS = 95;

export function activeMapTeam(state: Pick<GameState, 'mapStrokes'>): Team | null {
  return !state.mapStrokes.A ? 'A' : !state.mapStrokes.B ? 'B' : null;
}

export function inMapAnchor(point: Vec2, anchor: Vec2): boolean {
  return Math.hypot(point.x - anchor.x, point.y - anchor.y) <= MAP_ANCHOR_RADIUS;
}

/** Either anchor may be the start; the active team and its half stay unchanged. */
export function mapStrokeEndpoints(first: Vec2 | undefined, start: Vec2, end: Vec2): [Vec2, Vec2] {
  return first && inMapAnchor(first, end) ? [end, start] : [start, end];
}

/** Both visible rings keep the same hit area, whatever the drawing direction. */
export function mapEndpointError(pts: Vec2[], start: Vec2, end: Vec2): string | null {
  if (!pts.length || (!inMapAnchor(pts[0], start) && !inMapAnchor(pts[0], end))) return 'mapWrongStart';
  const [, arrival] = mapStrokeEndpoints(pts[0], start, end);
  if (pts.length < 2 || !inMapAnchor(pts[pts.length - 1], arrival)) return 'mapWrongEnd';
  return null;
}
