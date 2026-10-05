/**
 * Small 2D geometry helpers shared by the server modules.
 */
import type { Vec2, TrackGeometry } from './types.js';

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return dist(p, closestOnSegment(p, a, b));
}

export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** True when segment (a1,a2) crosses segment (b1,b2). */
export function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-9) return false;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / cross;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / cross;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export interface TrackHit {
  index: number;      // centerline segment index
  closest: Vec2;      // closest point on the centerline
  distance: number;   // distance from the query point to the centerline
  halfWidth: number;  // interpolated half-width at that point
}

/** Nearest point on the closed centerline, with the local half-width. */
export function nearestOnTrack(p: Vec2, track: TrackGeometry): TrackHit {
  const c = track.centerline;
  const n = c.length;
  let best: TrackHit = { index: 0, closest: c[0], distance: Infinity, halfWidth: 70 };
  for (let i = 0; i < n; i++) {
    const a = c[i];
    const b = c[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < best.distance) {
      const w = track.widths[i] * (1 - t) + track.widths[(i + 1) % n] * t;
      best = { index: i, closest: { x: cx, y: cy }, distance: d, halfWidth: w / 2 };
    }
  }
  return best;
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
