/**
 * MapGenerator — builds TrackGeometry from two freehand strokes.
 *
 * Pipeline (REQ-2.2.x, REQ-2.3.x, T-01):
 *  1. validate(stroke)          — length ≥ 300 px, touches both target points (r=60)
 *  2. resample(stroke, step)    — constant-step resampling
 *  3. oneEuroFilter(pts)        — 1€ filter (β=0.007, fCmin=1.0, dCutoff=1.0)
 *  4. autofill(stroke, P1, P2)  — close as bean shape (mirror + scale κ ∈ [0.6, 1.0])
 *  5. makeLoop(stroke)          — anti-clockwise loop, 256 points
 *  6. mergeLoops(A, B)          — optimal offset + weighted average
 *  7. catmullRom(pts)           — centripetal Catmull-Rom smoothing
 *  8. computeGeometry(center)   — edges, widths, colliders
 *  9. placeFeatures(geo)        — checkpoints, start line, start positions, pickups
 * 10. validateGeometry(geo)     — curvature, width, self-intersection
 *     → fallback: weights 0.4/0.6, then loop A alone
 */

import type { Vec2, TrackGeometry } from './types.js';
import { config } from './config.js';
import { segmentsIntersect } from './geometry.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LOOP_N = 256;
const RESAMPLE_STEP = 8;           // px — initial resample step
const TOUCH_RADIUS = 60;           // px — target point tolerance
const MIN_STROKE_LENGTH = 300;     // px
const MIN_CURVATURE_RADIUS = 50;   // px — below this track is too tight (1.8·R ≥ min width)
const MIN_TRACK_WIDTH = 24;        // px — vehicle clearance
const CHECKPOINT_COUNT = 8;
const PICKUP_COUNT = 4;
const START_LATERAL_OFFSET = 20;   // px — side-by-side start positions

// ─── Math helpers ─────────────────────────────────────────────────────────────

function dist(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

function normalize(v: Vec2): Vec2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len < 1e-9) return { x: 1, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function perpendicular(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

function strokeLength(pts: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
}

/** Project point p onto axis defined by (origin, direction), return signed scalar. */
function projectOntoAxis(p: Vec2, origin: Vec2, dir: Vec2): number {
  const d = sub(p, origin);
  return d.x * dir.x + d.y * dir.y;
}

/** Mirror point p about the line through p1 and p2. */
function mirrorAboutLine(p: Vec2, p1: Vec2, p2: Vec2): Vec2 {
  const dir = normalize(sub(p2, p1));
  const d = sub(p, p1);
  const dot = d.x * dir.x + d.y * dir.y;
  const proj: Vec2 = { x: p1.x + dir.x * dot, y: p1.y + dir.y * dot };
  return { x: 2 * proj.x - p.x, y: 2 * proj.y - p.y };
}

/** Compute the signed area of a polygon (positive = CCW). */
function signedArea(pts: Vec2[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
}

// ─── Step 1: validate(stroke) ─────────────────────────────────────────────────

function validate(stroke: Vec2[], P1: Vec2, P2: Vec2): boolean {
  if (stroke.length < 2) return false;
  const len = strokeLength(stroke);
  if (len < MIN_STROKE_LENGTH) return false;

  // Must touch both target points
  const touchesP1 = stroke.some(pt => dist(pt, P1) <= TOUCH_RADIUS);
  const touchesP2 = stroke.some(pt => dist(pt, P2) <= TOUCH_RADIUS);
  return touchesP1 && touchesP2;
}

// ─── Step 2: resample(stroke, step) ───────────────────────────────────────────

function resample(pts: Vec2[], step: number): Vec2[] {
  if (pts.length === 0) return [];
  const result: Vec2[] = [pts[0]];
  let accumulated = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    accumulated += d;
    while (accumulated >= step) {
      accumulated -= step;
      const t = 1 - accumulated / d;
      result.push(lerp(pts[i - 1], pts[i], t));
    }
  }
  return result;
}

// ─── Step 3: oneEuroFilter ────────────────────────────────────────────────────

/**
 * Minimal 1€ filter implementation.
 * β=0.007, fCmin=1.0, dCutoff=1.0
 * Applied per-axis independently over an assumed constant dt = 1/60.
 */
function oneEuroFilter(pts: Vec2[]): Vec2[] {
  const fCmin = 1.0;
  const beta = 0.007;
  const dCutoff = 1.0;
  const dt = 1 / 60;

  function alpha(cutoff: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  let xPrev = pts[0].x;
  let yPrev = pts[0].y;
  let dxPrev = 0;
  let dyPrev = 0;
  const out: Vec2[] = [pts[0]];

  for (let i = 1; i < pts.length; i++) {
    // Derivative with smoothing
    const aDeriv = alpha(dCutoff);
    const dxRaw = (pts[i].x - xPrev) / dt;
    const dyRaw = (pts[i].y - yPrev) / dt;
    const dx = aDeriv * dxRaw + (1 - aDeriv) * dxPrev;
    const dy = aDeriv * dyRaw + (1 - aDeriv) * dyPrev;

    // Adaptive cutoff
    const speed = Math.sqrt(dx * dx + dy * dy);
    const cutoff = fCmin + beta * speed;
    const aVal = alpha(cutoff);

    const xOut = aVal * pts[i].x + (1 - aVal) * xPrev;
    const yOut = aVal * pts[i].y + (1 - aVal) * yPrev;

    out.push({ x: xOut, y: yOut });
    xPrev = xOut;
    yPrev = yOut;
    dxPrev = dx;
    dyPrev = dy;
  }
  return out;
}

// ─── Step 4: autofill ────────────────────────────────────────────────────────

/**
 * Close the stroke as a bean shape:
 * - Mirror each point about the line P1–P2
 * - Scale the mirrored path by κ ∈ [0.6, 1.0] from the midpoint of P1–P2
 * - Concatenate to form a closed loop
 */
function autofill(stroke: Vec2[], P1: Vec2, P2: Vec2, kappa?: number): Vec2[] {
  const k = kappa ?? (0.6 + Math.random() * 0.4);

  // Mirror about the P1–P2 axis, then scale the distance to the axis by κ.
  // Scaling only across the axis keeps the loop closed on the imposed points.
  const mirrored: Vec2[] = stroke.map(p => {
    const m = mirrorAboutLine(p, P1, P2);
    const proj = projectOnLine(p, P1, P2);
    return { x: proj.x + (m.x - proj.x) * k, y: proj.y + (m.y - proj.y) * k };
  });

  // Concatenate: forward stroke + reversed mirror
  return [...stroke, ...mirrored.reverse()];
}

function projectOnLine(p: Vec2, p1: Vec2, p2: Vec2): Vec2 {
  const dir = normalize(sub(p2, p1));
  const dot = (p.x - p1.x) * dir.x + (p.y - p1.y) * dir.y;
  return { x: p1.x + dir.x * dot, y: p1.y + dir.y * dot };
}

// ─── Step 5: makeLoop ────────────────────────────────────────────────────────

/**
 * Resample to LOOP_N points, ensure anti-clockwise orientation.
 */
function makeLoop(pts: Vec2[]): Vec2[] {
  const n = LOOP_N;
  const total = strokeLength(pts);
  const step = total / n;

  // Resample to exactly N points
  const resampled = resample(pts, step);

  // Pad or trim to exactly N
  while (resampled.length < n) {
    resampled.push(resampled[resampled.length - 1]);
  }
  const loop = resampled.slice(0, n);

  // Ensure CCW (positive signed area)
  if (signedArea(loop) < 0) loop.reverse();

  return loop;
}

// ─── Step 6: mergeLoops ──────────────────────────────────────────────────────

/**
 * Find the rotation offset for B that minimises total point distance to A,
 * then compute weighted average: C(i) = wA*A(i) + wB*B(i+offset).
 */
function mergeLoops(A: Vec2[], B: Vec2[], wA = 0.5, wB = 0.5): Vec2[] {
  const n = A.length; // both LOOP_N

  let bestOffset = 0;
  let bestDist = Infinity;

  for (let offset = 0; offset < n; offset++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      total += dist(A[i], B[(i + offset) % n]);
    }
    if (total < bestDist) {
      bestDist = total;
      bestOffset = offset;
    }
  }

  const merged: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = A[i];
    const b = B[(i + bestOffset) % n];
    merged.push({
      x: wA * a.x + wB * b.x,
      y: wA * a.y + wB * b.y,
    });
  }
  return merged;
}

// ─── Step 7: catmullRom ──────────────────────────────────────────────────────

/**
 * Centripetal Catmull-Rom spline (alpha=0.5).
 * Outputs the same number of points (N=256).
 */
function catmullRom(pts: Vec2[]): Vec2[] {
  const n = pts.length;
  const alpha = 0.5;
  const result: Vec2[] = [];
  const segments = 4; // sub-samples per segment

  function tj(ti: number, pi: Vec2, pj: Vec2): number {
    const dx = pj.x - pi.x;
    const dy = pj.y - pi.y;
    return ti + Math.pow(dx * dx + dy * dy, alpha / 2);
  }

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    const t0 = 0;
    const t1 = tj(t0, p0, p1);
    const t2 = tj(t1, p1, p2);
    const t3 = tj(t2, p2, p3);

    for (let s = 0; s < segments; s++) {
      const t = t1 + (t2 - t1) * (s / segments);

      const A1 = lerp(p0, p1, (t - t0) / (t1 - t0 + 1e-9));
      const A2 = lerp(p1, p2, (t - t1) / (t2 - t1 + 1e-9));
      const A3 = lerp(p2, p3, (t - t2) / (t3 - t2 + 1e-9));
      const B1 = lerp(A1, A2, (t - t0) / (t2 - t0 + 1e-9));
      const B2 = lerp(A2, A3, (t - t1) / (t3 - t1 + 1e-9));
      result.push(lerp(B1, B2, (t - t1) / (t2 - t1 + 1e-9)));
    }
  }

  // Resample back to LOOP_N
  return makeLoop(result);
}

// ─── Step 8: computeGeometry ─────────────────────────────────────────────────

type BaseGeometry = Omit<TrackGeometry, 'checkpoints' | 'startLine' | 'startPositions' | 'pickupPositions'>;

/**
 * Edges from a centerline and per-point widths. The loop is oriented so that the
 * left normal points to the inside of the circuit: outer = centre − normal·w/2.
 * Also used when the track is locally widened (C-07).
 */
export function edgesFromWidths(centerline: Vec2[], widths: number[]): { outerEdge: Vec2[]; innerEdge: Vec2[] } {
  const n = centerline.length;
  const outerEdge: Vec2[] = [];
  const innerEdge: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const tangent = normalize(sub(centerline[(i + 1) % n], centerline[(i - 1 + n) % n]));
    const normal = perpendicular(tangent);
    const half = widths[i] / 2;
    outerEdge.push(add(centerline[i], scale(normal, -half)));
    innerEdge.push(add(centerline[i], scale(normal, half)));
  }
  return { outerEdge, innerEdge };
}

/**
 * Width varies with curvature: base 140 px, wider on straights (up to +30 px),
 * narrower in the tightest bends (down to −30 px), never below 90 px.
 */
function computeGeometry(centerline: Vec2[]): BaseGeometry {
  const n = centerline.length;
  const base = config.trackWidthBasePx;   // 140
  const minW = config.trackWidthMinPx;    // 90
  const variation = 30; // ±30 px

  const curvatures: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = centerline[(i - 1 + n) % n];
    const curr = centerline[i];
    const next = centerline[(i + 1) % n];
    const t1 = normalize(sub(curr, prev));
    const t2 = normalize(sub(next, curr));
    curvatures.push(Math.abs(t1.x * t2.y - t1.y * t2.x));
  }

  const smoothedK: number[] = [];
  const kWindow = 5;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -kWindow; j <= kWindow; j++) sum += curvatures[(i + j + n) % n];
    smoothedK.push(sum / (2 * kWindow + 1));
  }
  const maxK = Math.max(...smoothedK, 1e-9);
  const meanK = smoothedK.reduce((a, b) => a + b, 0) / n;

  // Local radius of curvature (smoothed): the width is capped so the inner edge never folds
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = centerline[(i - 1 + n) % n];
    const next = centerline[(i + 1) % n];
    const arc = (dist(prev, centerline[i]) + dist(centerline[i], next)) / 2;
    radii.push(smoothedK[i] > 1e-6 ? arc / smoothedK[i] : Infinity);
  }

  const widths: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = smoothedK[i];
    // rel ∈ [-1, 1]: +1 at the tightest bend, −1 on a perfectly straight section
    const rel = k > meanK
      ? (k - meanK) / Math.max(maxK - meanK, 1e-9)
      : -(meanK - k) / Math.max(meanK, 1e-9);
    widths.push(Math.max(minW, Math.min(base - variation * rel, 1.8 * radii[i])));
  }

  return { centerline, widths, ...edgesFromWidths(centerline, widths) };
}

// ─── Step 9: placeFeatures ───────────────────────────────────────────────────

function tangentAt(centerline: Vec2[], idx: number): Vec2 {
  const n = centerline.length;
  return normalize(sub(centerline[(idx + 1) % n], centerline[(idx - 1 + n) % n]));
}

/**
 * Checkpoint 0 is the start line: the 8 checkpoints are spread evenly starting
 * from it, so a lap is completed when the car crosses checkpoint 0 again.
 */
function placeFeatures(geo: BaseGeometry): TrackGeometry {
  const { centerline, widths } = geo;
  const n = centerline.length;

  // Straightest 10-point window → start line
  const windowSize = 10;
  let minCurv = Infinity;
  let startIdx = 0;
  for (let i = 0; i < n; i++) {
    let totalCurv = 0;
    for (let j = 0; j < windowSize; j++) {
      const prev = centerline[(i + j - 1 + n) % n];
      const curr = centerline[(i + j) % n];
      const next = centerline[(i + j + 1) % n];
      const t1 = normalize(sub(curr, prev));
      const t2 = normalize(sub(next, curr));
      totalCurv += Math.abs(t1.x * t2.y - t1.y * t2.x);
    }
    if (totalCurv < minCurv) {
      minCurv = totalCurv;
      startIdx = (i + windowSize / 2) % n;
    }
  }

  const checkpoints: Array<{ pos: Vec2; normal: Vec2 }> = [];
  for (let c = 0; c < CHECKPOINT_COUNT; c++) {
    const idx = (startIdx + Math.round((c / CHECKPOINT_COUNT) * n)) % n;
    checkpoints.push({ pos: centerline[idx], normal: perpendicular(tangentAt(centerline, idx)) });
  }

  const startNormal = perpendicular(tangentAt(centerline, startIdx));
  const startLine = { pos: centerline[startIdx], normal: startNormal };

  // Side-by-side, slightly behind the line so neither car starts past it
  const behind = (startIdx - 3 + n) % n;
  const behindNormal = perpendicular(tangentAt(centerline, behind));
  const startPositions: Vec2[] = [
    add(centerline[behind], scale(behindNormal, START_LATERAL_OFFSET)),
    add(centerline[behind], scale(behindNormal, -START_LATERAL_OFFSET)),
  ];

  // 4 pickup spots, halfway between checkpoint pairs
  const pickupPositions: Vec2[] = [];
  for (let p = 0; p < PICKUP_COUNT; p++) {
    const idx = (startIdx + Math.round(((p + 0.5) / PICKUP_COUNT) * n)) % n;
    const normal = perpendicular(tangentAt(centerline, idx));
    const halfW = (widths[idx] ?? config.trackWidthBasePx) / 2;
    const lateral = halfW * 0.3 * (p % 2 === 0 ? 1 : -1);
    pickupPositions.push(add(centerline[idx], scale(normal, lateral)));
  }

  return { ...geo, checkpoints, startLine, startPositions, pickupPositions };
}

// ─── Step 10: validateGeometry ───────────────────────────────────────────────

function validateGeometry(geo: TrackGeometry): boolean {
  const { centerline, widths } = geo;
  const n = centerline.length;

  if (centerline.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;

  // Width must clear the vehicle (24×14 px)
  for (const w of widths) {
    if (w < MIN_TRACK_WIDTH) return false;
  }

  // Minimum radius of curvature
  for (let i = 0; i < n; i++) {
    const prev = centerline[(i - 1 + n) % n];
    const curr = centerline[i];
    const next = centerline[(i + 1) % n];
    const t1 = normalize(sub(curr, prev));
    const t2 = normalize(sub(next, curr));
    const cross = Math.abs(t1.x * t2.y - t1.y * t2.x);
    const arcLen = (dist(prev, curr) + dist(curr, next)) / 2;
    if (arcLen > 1e-9) {
      const curvature = cross / arcLen;
      if (curvature > 1e-4 && 1 / curvature < MIN_CURVATURE_RADIUS) return false;
    }
  }

  // Full self-intersection test of the centerline (256² / 2 segment pairs: ≈ 1 ms)
  for (let i = 0; i < n; i++) {
    const a1 = centerline[i];
    const a2 = centerline[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the wrap
      if (segmentsIntersect(a1, a2, centerline[j], centerline[(j + 1) % n])) return false;
    }
  }

  // "No impossible passage": two parts of the track that are far apart along the
  // path must stay at least ~0.8 track widths apart, or the edges would overlap.
  const cum: number[] = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + dist(centerline[i - 1], centerline[i % n]));
  const total = cum[n];
  const farAlongPath = 2.5 * config.trackWidthBasePx;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const along = Math.min(cum[j] - cum[i], total - (cum[j] - cum[i]));
      if (along < farAlongPath) continue;
      if (dist(centerline[i], centerline[j]) < (widths[i] + widths[j]) / 2 * 0.8) return false;
    }
  }

  // The loop must enclose a real area
  if (Math.abs(signedArea(centerline)) < 20000) return false;

  return true;
}

// ─── Play-area fitting ───────────────────────────────────────────────────────

/** Rectangle of the table that is free of the corner HUD panels (R-22). */
export const PLAY_AREA = { x0: 170, y0: 300, x1: 1750, y1: 780 };

/**
 * Uniformly scale (down only) and translate the loop so that it fits the free
 * area of the table. Uniform scaling preserves absence of self-intersection.
 */
function fitToPlayArea(pts: Vec2[]): Vec2[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const s = Math.min(1, (PLAY_AREA.x1 - PLAY_AREA.x0) / w, (PLAY_AREA.y1 - PLAY_AREA.y0) / h);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const nw = w * s, nh = h * s;
  const tx = Math.min(Math.max(cx, PLAY_AREA.x0 + nw / 2), PLAY_AREA.x1 - nw / 2);
  const ty = Math.min(Math.max(cy, PLAY_AREA.y0 + nh / 2), PLAY_AREA.y1 - nh / 2);
  return pts.map(p => ({ x: tx + (p.x - cx) * s, y: ty + (p.y - cy) * s }));
}

/**
 * Round the cusps left where the stroke meets its mirror at the imposed points
 * (closed-loop Laplacian smoothing), then restore a uniform 256-point spacing.
 */
function relax(pts: Vec2[], iterations: number): Vec2[] {
  const n = pts.length;
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    cur = cur.map((p, i) => {
      const a = cur[(i - 1 + n) % n];
      const b = cur[(i + 1) % n];
      return { x: 0.5 * p.x + 0.25 * (a.x + b.x), y: 0.5 * p.y + 0.25 * (a.y + b.y) };
    });
  }
  const closed = [...cur, cur[0]];
  return makeLoop(closed);
}

/**
 * Stretch the loop across its minor axis (principal component analysis) so that
 * thin beans get a drivable thickness.
 */
function stretchMinorAxis(pts: Vec2[], factor: number): Vec2[] {
  const n = pts.length;
  const cx = pts.reduce((a, p) => a + p.x, 0) / n;
  const cy = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    sxx += (p.x - cx) ** 2; syy += (p.y - cy) ** 2; sxy += (p.x - cx) * (p.y - cy);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy); // major axis angle
  const mx = Math.cos(theta), my = Math.sin(theta);
  return pts.map(p => {
    const dx = p.x - cx, dy = p.y - cy;
    const major = dx * mx + dy * my;
    const minor = -dx * my + dy * mx;
    const m2 = minor * factor;
    return { x: cx + major * mx - m2 * my, y: cy + major * my + m2 * mx };
  });
}

function buildFromCenterline(raw: Vec2[], stretch = 1): TrackGeometry {
  let loop = relax(catmullRom(raw), 40);
  if (stretch !== 1) loop = stretchMinorAxis(loop, stretch);
  return placeFeatures(computeGeometry(fitToPlayArea(loop)));
}

// ─── Fallbacks ───────────────────────────────────────────────────────────────

/** Predefined circuit used when the strokes cannot produce a valid track (REQ-2.3.3). */
export function generatePreset(): TrackGeometry {
  const pts: Vec2[] = [];
  const cx = 960, cy = 540;
  for (let i = 0; i < LOOP_N; i++) {
    const a = (i / LOOP_N) * Math.PI * 2;
    // Rounded bean: ellipse with a gentle dent
    const rx = 640, ry = 220 + 15 * Math.cos(2 * a);
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) * (1 - 0.08 * Math.cos(a)) });
  }
  const loop = signedArea(pts) < 0 ? pts.reverse() : pts;
  return placeFeatures(computeGeometry(loop));
}

/** Try the loop as drawn, then progressively fatter ones (thin beans overlap their own edges). */
function singleLoopTrack(loop: Vec2[]): TrackGeometry | null {
  for (const stretch of [1, 1.3, 1.7, 2.2, 3]) {
    const geo = buildFromCenterline(loop, stretch);
    if (validateGeometry(geo)) return geo;
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Which strategy produced the last circuit (for logs and tests). */
export const generationInfo = { method: '' };

/** Validate a copilot stroke against its two imposed points (REQ-2.1.2). */
export function validateStroke(stroke: Vec2[], p1: Vec2, p2: Vec2): boolean {
  return validate(stroke, p1, p2);
}

function prepareLoop(stroke: Vec2[], P1: Vec2, P2: Vec2): Vec2[] {
  const resampled = resample(stroke, RESAMPLE_STEP);
  const filtered = oneEuroFilter(resampled.length >= 2 ? resampled : stroke);
  return makeLoop(autofill(filtered, P1, P2));
}

/**
 * Generate a TrackGeometry from two freehand strokes. Always returns a valid
 * track: weights 0.5/0.5, then 0.4/0.6, then loop A alone, then loop B alone,
 * and finally the predefined circuit.
 *
 * @param p1A/p2A/p1B/p2B  Imposed target points (inferred from stroke ends if omitted)
 */
export function generate(
  strokeA: Vec2[],
  strokeB: Vec2[],
  p1A?: Vec2,
  p2A?: Vec2,
  p1B?: Vec2,
  p2B?: Vec2,
): TrackGeometry {
  const P1A = p1A ?? strokeA[0];
  const P2A = p2A ?? strokeA[strokeA.length - 1];
  const P1B = p1B ?? strokeB[0];
  const P2B = p2B ?? strokeB[strokeB.length - 1];

  const aValid = strokeA.length >= 2 && validate(strokeA, P1A, P2A);
  const bValid = strokeB.length >= 2 && validate(strokeB, P1B, P2B);
  if (!aValid && !bValid) { generationInfo.method = 'preset'; return generatePreset(); }

  const loopA = aValid ? prepareLoop(strokeA, P1A, P2A) : null;
  const loopB = bValid ? prepareLoop(strokeB, P1B, P2B) : null;

  if (loopA && loopB) {
    for (const [wA, wB] of [[0.5, 0.5], [0.4, 0.6]] as const) {
      const geo = singleLoopTrack(mergeLoops(loopA, loopB, wA, wB));
      if (geo) { generationInfo.method = `merge ${wA}/${wB}`; return geo; }
    }
  }
  for (const [name, loop] of [['loop A', loopA], ['loop B', loopB]] as const) {
    if (!loop) continue;
    const geo = singleLoopTrack(loop);
    if (geo) { generationInfo.method = name; return geo; }
  }
  generationInfo.method = 'preset';
  return generatePreset();
}

/** Recompute edges after `widths` were modified (C-07). */
export function rebuildEdges(geo: TrackGeometry): void {
  const { outerEdge, innerEdge } = edgesFromWidths(geo.centerline, geo.widths);
  geo.outerEdge = outerEdge;
  geo.innerEdge = innerEdge;
}

// ─── Named exports for testing ────────────────────────────────────────────────

export {
  validate,
  resample,
  oneEuroFilter,
  autofill,
  makeLoop,
  mergeLoops,
  catmullRom,
  computeGeometry,
  placeFeatures,
  validateGeometry,
};
