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
export function nearestOnTrack(p: Vec2, track: Pick<TrackGeometry, 'centerline' | 'widths'>): TrackHit {
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

/**
 * Check if a point is within the drivable track ribbon (with an optional safety margin from the outer edge).
 */
export function isInsideTrackRibbon(p: Vec2, track: Pick<TrackGeometry, 'centerline' | 'widths'>, marginPx = 25): boolean {
  if (!track || !track.centerline || track.centerline.length === 0) return false;
  const hit = nearestOnTrack(p, track);
  return hit.distance <= Math.max(0, hit.halfWidth - marginPx) + 1e-6;
}

/**
 * Clamp a position so that it is guaranteed to lie within the drivable track ribbon.
 * If the position is already inside (with marginPx from the edge), it is unchanged.
 * If it is outside or too close to the neon edge, it is pulled onto the ribbon towards the centerline.
 */
export function clampToTrackRibbon(p: Vec2, track: Pick<TrackGeometry, 'centerline' | 'widths'>, marginPx = 25): Vec2 {
  if (!track || !track.centerline || track.centerline.length === 0) return { ...p };
  const hit = nearestOnTrack(p, track);
  const maxAllowedDist = Math.max(0, hit.halfWidth - marginPx);
  if (hit.distance <= maxAllowedDist) {
    return { ...p };
  }
  if (hit.distance < 1e-6) {
    return { ...hit.closest };
  }
  const ratio = maxAllowedDist / hit.distance;
  return {
    x: hit.closest.x + (p.x - hit.closest.x) * ratio,
    y: hit.closest.y + (p.y - hit.closest.y) * ratio,
  };
}

// ─── Slingshot ──────────────────────────────────────────────────────────────

export interface SlingshotParams {
  slingMinPullPx: number;
  slingMaxPullPx: number;
  slingMinRangePx: number;
  slingMaxRangePx: number;
  logicalWidth: number;
  logicalHeight: number;
}

export interface SlingshotShot {
  /** Pull long enough to shoot. */
  valid: boolean;
  /** Distance between the pouch and the fork, px. */
  pull: number;
  /** Unit vector of the flight: from the pouch through the fork. */
  dir: Vec2;
  /** Flight range beyond the fork, px — continuous in the pull length. */
  range: number;
  /** Landing point, kept inside the table. */
  target: Vec2;
}

/**
 * Shared by the server (authoritative) and the table (live preview): the stone flies
 * in the direction opposite to the pull, and the range grows linearly with the pull
 * length between `slingMinPullPx` and `slingMaxPullPx`.
 */
export function slingshotShot(anchor: Vec2, pouch: Vec2, p: SlingshotParams): SlingshotShot {
  const dx = anchor.x - pouch.x;
  const dy = anchor.y - pouch.y;
  const pull = Math.hypot(dx, dy);
  const dir = pull > 1e-6 ? { x: dx / pull, y: dy / pull } : { x: 0, y: -1 };
  const t = Math.max(0, Math.min(1, (pull - p.slingMinPullPx) / Math.max(1, p.slingMaxPullPx - p.slingMinPullPx)));
  const range = p.slingMinRangePx + t * (p.slingMaxRangePx - p.slingMinRangePx);
  const target = {
    x: Math.max(0, Math.min(p.logicalWidth, anchor.x + dir.x * range)),
    y: Math.max(0, Math.min(p.logicalHeight, anchor.y + dir.y * range)),
  };
  return { valid: pull >= p.slingMinPullPx, pull, dir, range, target };
}

/** Smoothed local tangent, stable at sampled bends and across the loop seam. */
export function trackTangent(track: Pick<TrackGeometry,'centerline'>, index:number): Vec2 {
  const points=track.centerline,n=points.length;if(n<2)return{x:1,y:0};
  const a=points[(index-2+n)%n],b=points[(index+2)%n];
  const length=Math.hypot(b.x-a.x,b.y-a.y)||1;return{x:(b.x-a.x)/length,y:(b.y-a.y)/length};
}

/** Nearest rendered bank, including the folded inner edge of a tight corner. */
export function nearestTrackEdge(p:Vec2,track:TrackGeometry,maxDistance=64){
  let best:{index:number;bank:'outer'|'inner';distance:number;point:Vec2}|null=null;
  for(const bank of ['outer','inner'] as const){const points=bank==='outer'?track.outerEdge:track.innerEdge;
    for(let i=0;i<points.length;i++){const point=closestOnSegment(p,points[i],points[(i+1)%points.length]),distance=dist(p,point);
      if(distance<=maxDistance&&(!best||distance<best.distance))best={index:i,bank,distance,point};
    }
  }
  return best;
}
