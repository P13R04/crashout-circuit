/**
 * Convertit le tracé et les commandes de précision en positions logiques sur la carte.
 * Liens : AccessiblePlacement.ts, server/rules/gameplay/remotePlacementGeometry.ts.
 */
import type { GameParams, TrackGeometry, Vec2 } from '../../../server/types.js';
import { dist, nearestOnTrack, trackTangent } from '../../../server/geometry.js';
import { BOOST_MIN_WIDTH } from '../../../server/track/boostGeometry.js';

/** Renvoie l'angle de la direction indiquée sur la carte. */
export function bearing(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
}

/** Ramène un angle dans un tour complet. */
export function wrapDegrees(angle: number): number { return ((angle % 360) + 360) % 360; }

/** Respecte la largeur de zone minimale et la longueur maximale du geste physique. */
export function boostWidth(width: number, params: GameParams): number {
  return Math.min(params.boostLenMaxPx, Math.max(BOOST_MIN_WIDTH, params.boostLenMinPx, width));
}

/** Conserve le centre et la direction du tracé. Le mur gardera sa longueur réglementaire. */
export function tracedPlacement(start: Vec2, end: Vec2) {
  return {
    pos: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    angle: bearing(start, end),
    length: dist(start, end),
  };
}

/** Donne le point du circuit à un pourcentage du tour depuis la ligne de départ. */
export function pointAlong(track: TrackGeometry, percent: number, offset: number): Vec2 | null {
  const path = orderedPath(track);
  if (path.length < 2) return null;
  const total = path.reduce((sum, entry) => sum + entry.length, 0);
  let remaining = total * percent / 100;
  for (const { a, b, length } of path) {
    if (remaining <= length && length > 0) {
      const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
      return { x: a.x + dx * remaining + dy * offset, y: a.y + dy * remaining - dx * offset };
    }
    remaining -= length;
  }
  return path[0].a;
}

/** Décrit la position projetée sur le tour pour donner un repère sans lire la carte. */
export function trackPercent(track: TrackGeometry, pos: Vec2): number {
  const path = orderedPath(track);
  if (!path.length) return 0;
  const hit = nearestOnTrack(pos, track);
  const at = path.findIndex(entry => entry.index === hit.index);
  const reached = path.slice(0, at).reduce((sum, entry) => sum + entry.length, 0);
  const total = path.reduce((sum, entry) => sum + entry.length, 0);
  return total ? Math.round(100 * (reached + dist(path[at].a, hit.closest)) / total) % 100 : 0;
}

/** Oriente par défaut le boost vers le travers de la chaussée. */
export function transverseAngle(track: TrackGeometry, pos: Vec2): number {
  const tangent = trackTangent(track, nearestOnTrack(pos, track).index);
  return bearing({ x: 0, y: 0 }, { x: -tangent.y, y: tangent.x });
}

/** Indexe la boucle depuis la ligne de départ et mesure ses segments. */
function orderedPath(track: TrackGeometry) {
  const points = track.centerline, count = points.length;
  return points.map((_, step) => {
    const index = (track.featureIndices.start + step) % count;
    const a = points[index], b = points[(index + 1) % count];
    return { index, a, b, length: dist(a, b) };
  });
}
