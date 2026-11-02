/**
 * Partage les règles des points de raccord et de l’ordre des tracés entre la reconnaissance, le dessin et le
 * serveur.
 * Liens : server/types.ts.
 * Référencé par client-table/GestureRecognizer.ts, client-table/Renderer.ts, server/GameRules.ts.
 */
import type { GameState, Team, Vec2 } from './types.js';

/** Shared by drawing, hit testing and server validation: the visible target is the hit area. */
export const MAP_ANCHOR_RADIUS = 95;

/** Retrouve l’équipe qui doit dessiner le prochain demi-circuit. */
export function activeMapTeam(state: Pick<GameState, 'mapStrokes'>): Team | null {
  return !state.mapStrokes.A ? 'A' : !state.mapStrokes.B ? 'B' : null;
}

/** Vérifie qu’un contact reste dans la zone de raccord affichée. */
export function inMapAnchor(point: Vec2, anchor: Vec2): boolean {
  return Math.hypot(point.x - anchor.x, point.y - anchor.y) <= MAP_ANCHOR_RADIUS;
}

/** Adapte le départ et l’arrivée au sens de dessin choisi par le joueur. */
export function mapStrokeEndpoints(first: Vec2 | undefined, start: Vec2, end: Vec2): [Vec2, Vec2] {
  return first && inMapAnchor(first, end) ? [end, start] : [start, end];
}

/** Explique quel raccord manque lorsque le tracé ne rejoint pas les points imposés. */
export function mapEndpointError(pts: Vec2[], start: Vec2, end: Vec2): string | null {
  if (!pts.length || (!inMapAnchor(pts[0], start) && !inMapAnchor(pts[0], end))) return 'mapWrongStart';
  const [, arrival] = mapStrokeEndpoints(pts[0], start, end);
  if (pts.length < 2 || !inMapAnchor(pts[pts.length - 1], arrival)) return 'mapWrongEnd';
  return null;
}
