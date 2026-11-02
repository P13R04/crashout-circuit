/**
 * Fournit les calculs de distance, d’intersection, de repérage sur la piste et de trajectoire du
 * lance-pierre.
 * Liens : server/types.ts.
 * Référencé notamment par client-oz/OzMap.ts, client-table/GestureRecognizer.ts, client-table/RaceGrid.ts.
 */
import type { Vec2, TrackGeometry } from './types.js';

/** Mesure la distance entre deux points. */
export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Mesure la distance entre un point et sa projection sur le segment. */
export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return dist(p, closestOnSegment(p, a, b));
}

/** Projette un point sur le segment en bornant la position entre ses extrémités. */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** Teste si les deux segments se coupent. */
export function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-9) return false;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / cross;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / cross;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Décrit le point de chaussée le plus proche et la largeur locale qui sert aux contacts. */
export interface TrackHit {
  index: number;      // centerline segment index
  closest: Vec2;      // closest point on the centerline
  distance: number;   // distance from the query point to the centerline
  halfWidth: number;  // interpolated half-width at that point
}

/** Retrouve le segment central le plus proche et les caractéristiques locales de la chaussée. */
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

/** Ramène l’angle dans l’intervalle compris entre moins pi et pi. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Vérifie qu’un point reste dans la chaussée en conservant la marge demandée. */
export function isInsideTrackRibbon(p: Vec2, track: Pick<TrackGeometry, 'centerline' | 'widths'>, marginPx = 25): boolean {
  if (!track || !track.centerline || track.centerline.length === 0) return false;
  const hit = nearestOnTrack(p, track);
  return hit.distance <= Math.max(0, hit.halfWidth - marginPx) + 1e-6;
}

/**
 * Ramène un point à l’intérieur de la chaussée lorsqu’il dépasse sa marge autorisée.
 * La position reste inchangée si la marge est respectée ; sinon elle est ramenée vers le centre de la chaussée.
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

/** Regroupe les limites de traction et de portée utilisées pour calculer un tir. */
export interface SlingshotParams {
  slingMinPullPx: number;
  slingMaxPullPx: number;
  slingMinRangePx: number;
  slingMaxRangePx: number;
  logicalWidth: number;
  logicalHeight: number;
}

/** Décrit le départ, la cible et la portée de la pierre calculée. */
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
 * Calcule la trajectoire et la zone d’impact à partir de la fourche et de la poche du lance-pierre.
 * Le serveur et la prévisualisation partagent ce calcul : direction opposée à la traction et portée linéaire entre slingMinPullPx et slingMaxPullPx.
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

/** Calcule la direction moyenne de la piste autour de l’indice demandé. */
export function trackTangent(track: Pick<TrackGeometry,'centerline'>, index:number): Vec2 {
  const points=track.centerline,n=points.length;if(n<2)return{x:1,y:0};
  const a=points[(index-2+n)%n],b=points[(index+2)%n];
  const length=Math.hypot(b.x-a.x,b.y-a.y)||1;return{x:(b.x-a.x)/length,y:(b.y-a.y)/length};
}

/** Retrouve le bord effectivement visible le plus proche, même à l’intérieur d’un virage. */
export function nearestTrackEdge(p:Vec2,track:TrackGeometry,maxDistance=64){
  let best:{index:number;bank:'outer'|'inner';distance:number;point:Vec2}|null=null;
  for(const bank of ['outer','inner'] as const){const points=bank==='outer'?track.outerEdge:track.innerEdge;
    for(let i=0;i<points.length;i++){const point=closestOnSegment(p,points[i],points[(i+1)%points.length]),distance=dist(p,point);
      if(distance<=maxDistance&&(!best||distance<best.distance))best={index:i,bank,distance,point};
    }
  }
  return best;
}
