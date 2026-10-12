/**
 * MapGenerator — builds TrackGeometry from two freehand strokes.
 *
 * Pipeline (REQ-2.2.x, REQ-2.3.x, T-01):
 *  1. validate(stroke)          — length ≥ 150 px, endpoints inside a target ring
 *  2. closedFromHalves(A, B)    — the two half-strokes, hooked on P1 and P2, ARE the loop
 *  3. shapeHalf(half)           — d' = |d|, amplitude ≥ 150 px (context.md §5.2 step 4)
 *  4. smoothed loop             — zero-lag Gaussian smoothing, σ grows only until the
 *                                 tightest bend is drivable; 256 points
 *  5. fitToPlayArea             — translate (then shrink) into the free area of the table
 *  6. computeGeometry / placeFeatures / validateGeometry
 *     → if invalid: more amplitude, then the old fallbacks (R-06: mirror/merge, preset)
 */

import type { Vec2, TrackGeometry } from './types.js';
import { config } from './config.js';
import { segmentsIntersect } from './geometry.js';
import { PLAY_AREA } from './layout.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LOOP_N = 256;
const RESAMPLE_STEP = 8;           // px — initial resample step
const TOUCH_RADIUS = 140;          // px — generous target ring for a real finger/mouse release
const MIN_STROKE_LENGTH = 150;     // px — relaxed for accessible sketching
const MIN_AMPLITUDE = 150;         // px — each half-stroke bulges at least this far from the divider
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

  // The beginning and end must land in their own generous target ring.
  // Supports strokes drawn in either direction (P1→P2 or P2→P1).
  const head = stroke.slice(0, Math.min(10, stroke.length));
  const tail = stroke.slice(Math.max(0, stroke.length - 10));
  const fwd = head.some(pt => dist(pt, P1) <= TOUCH_RADIUS) && tail.some(pt => dist(pt, P2) <= TOUCH_RADIUS);
  const rev = head.some(pt => dist(pt, P2) <= TOUCH_RADIUS) && tail.some(pt => dist(pt, P1) <= TOUCH_RADIUS);
  return fwd || rev;
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

type BaseGeometry = Omit<TrackGeometry,
  'baseCenterline' | 'checkpoints' | 'startLine' | 'startPositions' | 'pickupPositions' | 'featureIndices'>;

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
function placeFeatures(geo: BaseGeometry, randomStart = true, preferredStart?: Vec2): TrackGeometry {
  const { centerline, widths } = geo;
  const n = centerline.length;

  let startIdx = 0;
  if (preferredStart) {
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = dist(centerline[i], preferredStart);
      if (d < bestDist) {
        bestDist = d;
        startIdx = i;
      }
    }
  } else {
    // A roulette among the safe straight sections → start line. This makes the
    // finishing line uncertain while never placing it in a tight bend.
    const windowSize = 10;
    const candidates: Array<{ idx: number; curv: number }> = [];
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
      candidates.push({ idx: (i + windowSize / 2) % n, curv: totalCurv });
    }
    candidates.sort((a, b) => a.curv - b.curv);
    const safePool = candidates.slice(0, Math.max(1, Math.floor(candidates.length * 0.18)));
    startIdx = (randomStart ? safePool[Math.floor(Math.random() * safePool.length)] : safePool[0]).idx;
  }

  // A figure of eight: a checkpoint (or the start) on a junction would also be crossed
  // by the other branch, so they are moved along the path to the nearest clear spot,
  // keeping the checkpoints in order.
  const cum = cumulative(centerline);
  const junction = junctionMask(centerline, widths, selfCrossings(centerline, cum), cum);
  if (junction[startIdx]) {
    for (let d = 1; d <= 40; d++) {
      const k = [(startIdx + d) % n, (startIdx - d + n) % n].find(q => !junction[q]);
      if (k !== undefined) { startIdx = k; break; }
    }
  }

  const checkpoints: Array<{ pos: Vec2; normal: Vec2 }> = [];
  const checkpointIndices: number[] = [];
  let prevOff = -5;
  for (let c = 0; c < CHECKPOINT_COUNT; c++) {
    const target = c === 0 ? 0 : Math.round((c / CHECKPOINT_COUNT) * n);
    let off = target;
    for (let d = 0; d <= 40; d++) {
      const ok = (o: number) => o > prevOff + 4 && o < n - 4 && !junction[(startIdx + o) % n];
      if (c === 0) break;
      if (ok(target + d)) { off = target + d; break; }
      if (ok(target - d)) { off = target - d; break; }
    }
    prevOff = off;
    const idx = (startIdx + off) % n;
    checkpoints.push({ pos: centerline[idx], normal: perpendicular(tangentAt(centerline, idx)) });
    checkpointIndices.push(idx);
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
  const pickupIndices: number[] = [];
  for (let p = 0; p < PICKUP_COUNT; p++) {
    const idx = (startIdx + Math.round(((p + 0.5) / PICKUP_COUNT) * n)) % n;
    const normal = perpendicular(tangentAt(centerline, idx));
    const halfW = (widths[idx] ?? config.trackWidthBasePx) / 2;
    const lateral = halfW * 0.3 * (p % 2 === 0 ? 1 : -1);
    pickupPositions.push(add(centerline[idx], scale(normal, lateral)));
    pickupIndices.push(idx);
  }

  return {
    ...geo,
    baseCenterline: centerline.map(p => ({ ...p })),
    checkpoints, startLine, startPositions, pickupPositions,
    featureIndices: { checkpoints: checkpointIndices, start: startIdx, starts: [behind, behind], pickups: pickupIndices },
  };
}

// ─── Step 10: validateGeometry ───────────────────────────────────────────────

/** Radius of curvature at vertex i of a closed loop (Infinity when it is straight). */
function radiusAt(pts: Vec2[], i: number): number {
  const n = pts.length;
  const prev = pts[(i - 1 + n) % n];
  const curr = pts[i];
  const next = pts[(i + 1) % n];
  const t1 = normalize(sub(curr, prev));
  const t2 = normalize(sub(next, curr));
  const cross = Math.abs(t1.x * t2.y - t1.y * t2.x);
  const arcLen = (dist(prev, curr) + dist(curr, next)) / 2;
  const curvature = arcLen > 1e-9 ? cross / arcLen : 0;
  return curvature > 1e-4 ? 1 / curvature : Infinity;
}

/** Smallest radius of curvature of a closed loop. */
function tightestRadius(pts: Vec2[]): number {
  let minR = Infinity;
  for (let i = 0; i < pts.length; i++) minR = Math.min(minR, radiusAt(pts, i));
  return minR;
}

/**
 * Two parts of the track may cross (a figure of eight, a loop passing over itself) as
 * a flat junction, provided that the crossing is clean: the branches meet at no less
 * than ~40° and the loop is long enough to be driven.
 */
const MIN_CROSSING_SIN = Math.sin((40 * Math.PI) / 180);
/** Path length (px) a loop needs to be a drivable loop and not a knot. */
const MIN_LOOP_PATH = 2.5 * 140;

interface Crossing {
  i: number;       // segment of one branch
  j: number;       // segment of the other branch
  at: Vec2;        // where they cross
  along: number;   // shortest path length between the two passes
  sin: number;     // sine of the angle between the branches
}

/** Cumulative path length along a closed polyline: cum[n] is the perimeter. */
function cumulative(pts: Vec2[]): number[] {
  const n = pts.length;
  const cum: number[] = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i % n]));
  return cum;
}

/** Every place where the centerline crosses itself. */
function selfCrossings(c: Vec2[], cum = cumulative(c)): Crossing[] {
  const n = c.length;
  const total = cum[n];
  const out: Crossing[] = [];
  for (let i = 0; i < n; i++) {
    const a1 = c[i];
    const a2 = c[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the wrap
      const b1 = c[j];
      const b2 = c[(j + 1) % n];
      if (!segmentsIntersect(a1, a2, b1, b2)) continue;
      const d1 = sub(a2, a1), d2 = sub(b2, b1);
      const cr = d1.x * d2.y - d1.y * d2.x;
      const t = ((b1.x - a1.x) * d2.y - (b1.y - a1.y) * d2.x) / cr;
      const sin = Math.abs(cr) / Math.max(Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y), 1e-9);
      const gap = cum[j] - cum[i];
      out.push({ i, j, at: { x: a1.x + d1.x * t, y: a1.y + d1.y * t }, along: Math.min(gap, total - gap), sin });
    }
  }
  return out;
}

/** Path distance between two vertices of the loop. */
function pathGap(cum: number[], a: number, b: number): number {
  const g = Math.abs(cum[a] - cum[b]);
  return Math.min(g, cum[cum.length - 1] - g);
}

/**
 * Vertices that belong to a junction: within about 1.5 track widths (at least 190 px,
 * the reach of a checkpoint line) of a crossing, on either branch.
 */
function junctionMask(c: Vec2[], widths: number[], crossings: Crossing[], cum: number[]): boolean[] {
  const n = c.length;
  const mask = new Array<boolean>(n).fill(false);
  for (const x of crossings) {
    const reach = Math.max(190, 1.5 * Math.max(widths[x.i], widths[x.j]));
    for (let k = 0; k < n; k++) {
      if (pathGap(cum, k, x.i) <= reach || pathGap(cum, k, x.j) <= reach) mask[k] = true;
    }
  }
  return mask;
}

function validateGeometry(geo: TrackGeometry): boolean {
  const { centerline, widths } = geo;
  const n = centerline.length;

  if (centerline.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;

  // Width must clear the vehicle (24×14 px)
  for (const w of widths) {
    if (w < MIN_TRACK_WIDTH) return false;
  }

  // Minimum radius of curvature
  if (tightestRadius(centerline) < MIN_CURVATURE_RADIUS) return false;

  // Self-crossings are allowed when clean: no knot (short loop), no grazing contact
  const cum = cumulative(centerline);
  const crossings = selfCrossings(centerline, cum);
  if (crossings.some(x => x.along < MIN_LOOP_PATH || x.sin < MIN_CROSSING_SIN)) return false;

  // "No impossible passage": two parts of the track that are far apart along the
  // path must stay at least ~0.8 track widths apart, or the edges would overlap.
  // Inside a junction the two branches overlap on purpose.
  const reach = crossings.map(x => Math.max(190, 1.5 * Math.max(widths[x.i], widths[x.j])));
  const inJunction = (i: number, j: number): boolean => crossings.some((x, k) =>
    (pathGap(cum, i, x.i) <= reach[k] && pathGap(cum, j, x.j) <= reach[k]) ||
    (pathGap(cum, i, x.j) <= reach[k] && pathGap(cum, j, x.i) <= reach[k]));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pathGap(cum, i, j) < MIN_LOOP_PATH) continue;
      if (dist(centerline[i], centerline[j]) >= (widths[i] + widths[j]) / 2 * 0.8) continue;
      if (crossings.length === 0 || !inJunction(i, j)) return false;
    }
  }

  // The loop must enclose a real area (a figure of eight: it must at least be big)
  if (crossings.length === 0) {
    if (Math.abs(signedArea(centerline)) < 20000) return false;
  } else {
    const xs = centerline.map(p => p.x), ys = centerline.map(p => p.y);
    if (Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 200) return false;
  }

  return true;
}

// ─── Play-area fitting ───────────────────────────────────────────────────────

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

function buildFromCenterline(raw: Vec2[], stretch = 1, preferredStart?: Vec2): TrackGeometry {
  let loop = relax(catmullRom(raw), 40);
  if (stretch !== 1) loop = stretchMinorAxis(loop, stretch);
  return placeFeatures(computeGeometry(fitToPlayArea(loop)), false, preferredStart);
}

// ─── The circuit is the drawing ──────────────────────────────────────────────

/** Growth of the half-strokes' amplitude when the loop drawn is still not a valid circuit. */
const AMPLITUDE_BOOSTS: Array<[minAmp: number, boost: number]> = [
  [0, 1],                       // exactly as drawn
  [90, 1], [105, 1], [120, 1], [135, 1],
  [MIN_AMPLITUDE, 1],           // context.md §5.2 step 4: bulge at least 150 px
  [MIN_AMPLITUDE, 1.2], [MIN_AMPLITUDE, 1.45], [MIN_AMPLITUDE, 1.75], [MIN_AMPLITUDE, 2.2],
];
/** Extra Gaussian σ (px), tried only if a bend is still too tight after the corners are rounded. */
const EXTRA_SMOOTHING = [0, 9, 11, 14, 17, 21, 26, 32, 40];
const TREMOR_SIGMA = 7; // px — hand jitter
const TARGET_RADIUS = MIN_CURVATURE_RADIUS * 1.08;
/** Safety margins on the minimum radius when rounding a corner: the smallest first (least change). */
const RADIUS_MARGINS = [1.03, 1.15];

/** A half-stroke dipping further than this across the divider is a deliberate crossing. */
const CROSSING_DEPTH = 70;

/**
 * One half-stroke seen from the divider P1→P2 (context.md §5.2 step 4): the lateral
 * offset d becomes |d| (a wobble across the line is folded back) and the largest offset
 * is raised to MIN_AMPLITUDE, times `boost`. A half that dips deeper than CROSSING_DEPTH
 * across the line is a deliberate crossing (a figure of eight) and is not folded.
 * Position along the line is untouched: the half keeps its shape and its two ends stay
 * on P1 and P2.
 */
function shapeHalf(half: Vec2[], P1: Vec2, P2: Vec2, boost: number, forceFold = false, minAmp = MIN_AMPLITUDE): Vec2[] {
  const u = normalize(sub(P2, P1));
  const nrm = perpendicular(u);
  const lat = half.map(p => {
    const d = sub(p, P1);
    return d.x * nrm.x + d.y * nrm.y;
  });
  const side = Math.max(...lat) >= -Math.min(...lat) ? 1 : -1;
  const own = lat.map(l => side * l); // > 0 on the half's own side
  const fold = forceFold || Math.max(...own.map(o => -o)) <= CROSSING_DEPTH;
  const amp = Math.max(...own);
  const k = Math.max(1, minAmp / Math.max(amp, 1)) * boost;
  return half.map((p, i) => {
    const along = projectOntoAxis(p, P1, u);
    const d = fold ? Math.abs(own[i]) : own[i];
    return add(add(P1, scale(u, along)), scale(nrm, side * d * k));
  });
}

/** A (P1→P2) and B (P2→P1), oriented and snapped on the two shared anchors. */
function alignHalves(strokeA: Vec2[], strokeB: Vec2[], P1: Vec2, P2: Vec2): { a: Vec2[]; b: Vec2[] } {
  const a = dist(strokeA[0], P2) < dist(strokeA[0], P1) ? [...strokeA].reverse() : [...strokeA];
  const b = dist(strokeB[0], P1) < dist(strokeB[strokeB.length - 1], P1) ? [...strokeB].reverse() : [...strokeB];
  a[0] = { ...P1 };
  a[a.length - 1] = { ...P2 };
  b[0] = { ...P2 };
  b[b.length - 1] = { ...P1 };
  return { a, b };
}

/**
 * Zero-lag Gaussian smoothing of a closed, uniformly sampled ring. Unlike the causal
 * 1€ filter it does not shift the drawing, and a bend of radius R shrinks by only
 * σ²/2R. It is meant for tremor: it rounds a sharp tip badly (radius ≈ σ/2.7).
 */
function gaussianClosed(ring: Vec2[], sigma: number): Vec2[] {
  const n = ring.length;
  let perimeter = 0;
  for (let i = 0; i < n; i++) perimeter += dist(ring[i], ring[(i + 1) % n]);
  const h = Math.max(perimeter / n, 1e-6);
  const k = Math.max(1, Math.ceil((3 * sigma) / h));
  const w: number[] = [];
  let sum = 0;
  for (let j = -k; j <= k; j++) {
    const v = Math.exp(-((j * h) ** 2) / (2 * sigma * sigma));
    w.push(v);
    sum += v;
  }
  return ring.map((_, i) => {
    let x = 0, y = 0;
    for (let j = -k; j <= k; j++) {
      const p = ring[(i + j + n * 4) % n];
      const wt = w[j + k] / sum;
      x += p.x * wt;
      y += p.y * wt;
    }
    return { x, y };
  });
}

/** Re-close, re-orient (CCW) and re-sample a ring to 256 evenly spaced points. */
function evenRing(ring: Vec2[]): Vec2[] {
  return makeLoop([...ring, ring[0]]);
}

/**
 * Replace the `k` samples each side of vertex i by a cubic Bézier that leaves and
 * re-joins the ring along its own tangents: a fillet, so only the corner moves and
 * both arms keep exactly the drawn path.
 */
function filletAround(ring: Vec2[], i: number, k: number, handle: number): Vec2[] {
  const n = ring.length;
  const at = (j: number) => ring[((j % n) + n) % n];
  const a = at(i - k);
  const b = at(i + k);
  const c1 = add(a, scale(normalize(sub(at(i - k + 1), at(i - k - 1))), handle));
  const c2 = sub(b, scale(normalize(sub(at(i + k + 1), at(i + k - 1))), handle));
  const out = ring.map(p => ({ x: p.x, y: p.y }));
  for (let s = 1; s < 2 * k; s++) {
    const t = s / (2 * k);
    const u = 1 - t;
    out[(((i - k + s) % n) + n) % n] = {
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    };
  }
  return out;
}

/**
 * Round the corners too sharp to drive (the two anchors where the halves meet, tight
 * hairpins): at the worst bend, the smallest window and the gentlest handle that reach
 * TARGET_RADIUS are used, so the drawing moves as little as it can.
 */
function roundCorners(loop: Vec2[], target = TARGET_RADIUS): Vec2[] {
  const n = loop.length;
  let cur = loop;
  for (let pass = 0; pass < 8; pass++) {
    let worst = -1;
    let worstR = target;
    for (let i = 0; i < n; i++) {
      const r = radiusAt(cur, i);
      if (r < worstR) { worstR = r; worst = i; }
    }
    if (worst < 0) break;
    let perimeter = 0;
    for (let i = 0; i < n; i++) perimeter += dist(cur[i], cur[(i + 1) % n]);
    const h = perimeter / n;
    // Every window/handle that makes the bend drivable is a candidate; the one that
    // moves the drawing least wins.
    let rounded: Vec2[] | null = null;
    let leastMove = Infinity;
    for (const window of [40, 55, 70, 90, 115, 145, 180, 220, 270]) {
      const k = Math.max(3, Math.round(window / h));
      if (4 * k >= n) break;
      for (const handle of [0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1.0, 1.2]) {
        const cand = filletAround(cur, worst, k, handle * window);
        let ok = true;
        let move = 0;
        for (let j = -k - 3; j <= k + 3; j++) {
          const q = (((worst + j) % n) + n) % n;
          if (radiusAt(cand, q) < target * 0.97) { ok = false; break; }
          move = Math.max(move, dist(cand[q], cur[q]));
        }
        if (ok && move < leastMove) { leastMove = move; rounded = cand; }
      }
    }
    if (!rounded) break;
    cur = evenRing(rounded); // uniform spacing again for the next measure
  }
  return cur;
}

/**
 * A loop too small to be driven (a knot) is blown up about its crossing point until it
 * is a real loop, so the player's loop stays a loop; a mere kink of the hand is cut.
 * The crossing point does not move, so the circuit stays continuous.
 */
function inflateKnots(loop: Vec2[]): Vec2[] {
  let cur = loop;
  for (let pass = 0; pass < 4; pass++) {
    const n = cur.length;
    const cum = cumulative(cur);
    const knot = selfCrossings(cur, cum)
      .filter(x => x.along < MIN_LOOP_PATH)
      .sort((p, q) => p.along - q.along)[0];
    if (!knot) break;
    // the shorter arc between the two passes is the loop
    const inner = cum[knot.j] - cum[knot.i] <= cum[n] / 2;
    const first = inner ? knot.i + 1 : knot.j + 1;
    const last = inner ? knot.j : knot.i + n;
    const arc: number[] = [];
    for (let k = first; k <= last; k++) arc.push(k % n);
    const inArc = new Set(arc);
    if (knot.along < 100) { // a kink: cut it out
      cur = evenRing(cur.filter((_, k) => !inArc.has(k)));
      continue;
    }
    // big enough to be a loop (path length) and for its tightest bend to be drivable
    let tight = Infinity;
    for (const k of arc) tight = Math.min(tight, radiusAt(cur, k));
    const f = Math.min(5, Math.max((MIN_LOOP_PATH * 1.15) / knot.along, (TARGET_RADIUS * 1.05) / Math.max(tight, 1)));
    cur = evenRing(cur.map((p, k) => (inArc.has(k)
      ? { x: knot.at.x + (p.x - knot.at.x) * f, y: knot.at.y + (p.y - knot.at.y) * f }
      : p)));
  }
  return cur;
}

/** Dense (4 px) closed ring of the two halves, at `boost` × the minimum amplitude. */
function denseRing(a: Vec2[], b: Vec2[], P1: Vec2, P2: Vec2, boost: number, forceFold = false, minAmp = MIN_AMPLITUDE): Vec2[] {
  const ring = [...shapeHalf(a, P1, P2, boost, forceFold, minAmp), ...shapeHalf(b, P2, P1, boost, forceFold, minAmp).slice(1, -1)];
  const dense = resample([...ring, ring[0]], 4);
  if (dense.length > 3 && dist(dense[0], dense[dense.length - 1]) < 3) dense.pop();
  return dense;
}

/**
 * Circuit built on the drawing itself: the two halves hooked on P1 and P2 form the
 * loop, which is only denoised and rounded where it is too sharp to drive. If it is
 * still not a valid circuit (halves pinching, a bean thinner than a lane) the halves
 * are bulged further; null when even that fails.
 */
function faithfulTrack(a: Vec2[], b: Vec2[], P1: Vec2, P2: Vec2): TrackGeometry | null {
  // First the drawing as it is (a deep dip across the divider is a deliberate crossing),
  // then with every dip folded back (the classic bean)
  for (const forceFold of [false, true]) {
    for (const [minAmp, boost] of AMPLITUDE_BOOSTS) {
      const dense = denseRing(a, b, P1, P2, boost, forceFold, minAmp);
      const tidy = evenRing(gaussianClosed(dense, TREMOR_SIGMA));
      // Keep the players' loops (blown up to a drivable size) before letting the
      // smoothing absorb them
      for (const keepLoops of [true, false]) {
        const tidyLoops = keepLoops ? inflateKnots(tidy) : tidy;
        for (const margin of RADIUS_MARGINS) {
          const rounded = roundCorners(tidyLoops, MIN_CURVATURE_RADIUS * margin);
          for (const sigma of EXTRA_SMOOTHING) {
            const loop = sigma === 0 ? rounded : evenRing(gaussianClosed(rounded, sigma));
            if (tightestRadius(loop) < MIN_CURVATURE_RADIUS) continue;
            const geo = placeFeatures(computeGeometry(fitToPlayArea(loop)), false, P1);
            if (validateGeometry(geo)) return geo;
            break; // drivable bends but invalid loop: more amplitude, not more smoothing
          }
        }
      }
    }
  }
  return null;
}

/** σ (px) of the last-resort smoothing, from "firm" to "almost an ellipse". */
const HEAVY_SIGMAS = [48, 58, 70, 85, 105, 130, 160, 200, 250, 310, 380];
const HEAVY_STRETCH = [1, 1.2, 1.5, 2, 2.8, 3.6];

/**
 * Last resort that still uses the drawing: when it cannot be driven as drawn (loops
 * crossing themselves, halves pinched together) it is smoothed harder and harder, back
 * to its drawn size, until the loop is simple and drivable. The result is the drawing
 * with its details ironed out rather than a predefined circuit.
 */
function smoothestTrack(a: Vec2[], b: Vec2[], P1: Vec2, P2: Vec2): TrackGeometry | null {
  for (const minAmp of [0, MIN_AMPLITUDE]) {
    const dense = denseRing(a, b, P1, P2, 1, false, minAmp);
    const area0 = Math.abs(signedArea(dense));
    for (const sigma of HEAVY_SIGMAS) {
      let loop = evenRing(gaussianClosed(dense, sigma));
      // smoothing shrinks a shape towards its centre: give it back its drawn size
      const area = Math.abs(signedArea(loop));
      if (area > 1) {
        const k = Math.min(1.6, Math.max(1, Math.sqrt(area0 / area)));
        const cx = loop.reduce((s, p) => s + p.x, 0) / loop.length;
        const cy = loop.reduce((s, p) => s + p.y, 0) / loop.length;
        loop = loop.map(p => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
      }
      for (const stretch of HEAVY_STRETCH) {
        const rounded = roundCorners(stretch === 1 ? loop : evenRing(stretchMinorAxis(loop, stretch)));
        if (tightestRadius(rounded) < MIN_CURVATURE_RADIUS) continue;
        const geo = placeFeatures(computeGeometry(fitToPlayArea(rounded)), false, P1);
        if (validateGeometry(geo)) return geo;
      }
    }
  }
  // Degenerate drawings (halves crossing each other, a figure of eight: no area left):
  const dense = denseRing(a, b, P1, P2, 1);
  // the best-fit ellipse of the drawing, at least wide enough to drive
  const n = dense.length;
  const cx = dense.reduce((q, p) => q + p.x, 0) / n;
  const cy = dense.reduce((q, p) => q + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of dense) { sxx += (p.x - cx) ** 2; syy += (p.y - cy) ** 2; sxy += (p.x - cx) * (p.y - cy); }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const mx = Math.cos(theta), my = Math.sin(theta);
  const lam1 = (sxx + syy) / (2 * n) + Math.hypot((sxx - syy) / (2 * n), sxy / n);
  const lam2 = Math.max(0, (sxx + syy) / n - lam1);
  const semiMajor = Math.max(Math.SQRT2 * Math.sqrt(lam1), 200);
  const semiMinor = Math.max(Math.SQRT2 * Math.sqrt(lam2), Math.sqrt(60 * semiMajor), 110);
  const ellipse = Array.from({ length: LOOP_N }, (_, i) => {
    const t = (i / LOOP_N) * 2 * Math.PI;
    const u = semiMajor * Math.cos(t), v = semiMinor * Math.sin(t);
    return { x: cx + u * mx - v * my, y: cy + u * my + v * mx };
  });
  const geo = placeFeatures(computeGeometry(fitToPlayArea(signedArea(ellipse) < 0 ? ellipse.reverse() : ellipse)), false, P1);
  return validateGeometry(geo) ? geo : null;
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
  // `preset` lets the table tell the players that their drawing was not used
  return { ...placeFeatures(computeGeometry(loop), false), preset: true };
}

/** Try the loop as drawn, then progressively fatter ones (thin beans overlap their own edges). */
function singleLoopTrack(loop: Vec2[], preferredStart?: Vec2): TrackGeometry | null {
  for (const stretch of [1, 1.2, 1.5, 2, 2.8]) {
    const geo = buildFromCenterline(loop, stretch, preferredStart);
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
 * Generate a TrackGeometry from two freehand strokes.
 * Prioritises the closed-loop union of stroke A and stroke B connecting at P1 and
 * P2 (the circuit follows the drawing), placing the start line at P1A.
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

  // 1. The circuit is the drawing: stroke A (P1→P2) and stroke B (P2→P1) joined at
  // the two shared anchors form the closed loop (see faithfulTrack).
  if (aValid && bValid) {
    const { a, b } = alignHalves(strokeA, strokeB, P1A, P2A);
    const geo = faithfulTrack(a, b, P1A, P2A);
    if (geo) {
      generationInfo.method = 'closed loop union';
      return geo;
    }
    // Still the drawing, but ironed out as much as it takes (never the preset first)
    const smooth = smoothestTrack(a, b, P1A, P2A);
    if (smooth) {
      generationInfo.method = 'smoothed drawing';
      return smooth;
    }
  }

  // 2. Fallbacks: merge, single loops, preset
  const loopA = aValid ? prepareLoop(strokeA, P1A, P2A) : null;
  const loopB = bValid ? prepareLoop(strokeB, P1B, P2B) : null;

  if (loopA && loopB) {
    for (const [wA, wB] of [[0.5, 0.5], [0.4, 0.6]] as const) {
      const geo = singleLoopTrack(mergeLoops(loopA, loopB, wA, wB), P1A);
      if (geo) { generationInfo.method = `merge ${wA}/${wB}`; return geo; }
    }
  }
  for (const [name, loop] of [['loop A', loopA], ['loop B', loopB]] as const) {
    if (!loop) continue;
    const geo = singleLoopTrack(loop, P1A);
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
  shapeHalf,
  faithfulTrack,
  smoothestTrack,
  selfCrossings,
  inflateKnots,
  gaussianClosed,
  roundCorners,
  tightestRadius,
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
