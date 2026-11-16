/**
 * Nettoyage des tracés : validation, rééchantillonnage, filtre 1 €, complétion par reflet et mise en boucle.
 * Liens : server/trackGeneration/vectorMath.ts, generationLimits.ts.
 * Réexporté par server/MapGenerator.ts, qui reste la façade de la génération du circuit.
 */
import type { Vec2 } from '../types.js';
import { LOOP_N, TOUCH_RADIUS, MIN_STROKE_LENGTH } from './generationLimits.js';
import { dist, sub, normalize, lerp, strokeLength, mirrorAboutLine, signedArea } from './vectorMath.js';

/** Vérifie la longueur du tracé et la présence de ses extrémités dans les zones de raccord. */
export function validate(stroke: Vec2[], P1: Vec2, P2: Vec2): boolean {
  if (stroke.length < 2) return false;
  const len = strokeLength(stroke);
  if (len < MIN_STROKE_LENGTH) return false;

  // The beginning and end must land in their own generous target ring.
  // Supports strokes drawn in either direction (P1→P2 or P2→P1).
  const head = stroke.slice(0, Math.min(10, stroke.length));
  const tail = stroke.slice(Math.max(0, stroke.length - 10));
  const fwd = head.some(/* Repère un point initial suffisamment proche du premier raccord. */ pt => dist(pt, P1) <= TOUCH_RADIUS) && tail.some(/* Repère un point final suffisamment proche du second raccord. */ pt => dist(pt, P2) <= TOUCH_RADIUS);
  const rev = head.some(/* Reconnaît le premier raccord lorsque le joueur dessine dans le sens inverse. */ pt => dist(pt, P2) <= TOUCH_RADIUS) && tail.some(/* Reconnaît le raccord final lorsque le joueur dessine dans le sens inverse. */ pt => dist(pt, P1) <= TOUCH_RADIUS);
  return fwd || rev;
}


/** Redistribue les points d’un tracé à intervalles réguliers. */
export function resample(pts: Vec2[], step: number): Vec2[] {
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


/**
 * Lisse les irrégularités du dessin en adaptant le filtrage à la vitesse du tracé.
 * Le filtre 1 € travaille séparément sur chaque axe avec β = 0,007, fCmin = 1, dCutoff = 1 et un pas supposé de 1/60 s.
 */
export function oneEuroFilter(pts: Vec2[]): Vec2[] {
  const fCmin = 1.0;
  const beta = 0.007;
  const dCutoff = 1.0;
  const dt = 1 / 60;

  /** Calcule le coefficient de filtrage correspondant à la fréquence de coupure. */
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


/**
 * Referme un demi-tracé avec son reflet pour les solutions de génération de secours.
 * Le reflet autour de P1–P2 est redimensionné depuis leur milieu par κ entre 0,6 et 1, puis joint au tracé initial.
 */
export function autofill(stroke: Vec2[], P1: Vec2, P2: Vec2, kappa?: number): Vec2[] {
  const k = kappa ?? (0.6 + Math.random() * 0.4);

  // Mirror about the P1–P2 axis, then scale the distance to the axis by κ.
  // Scaling only across the axis keeps the loop closed on the imposed points.
  const mirrored: Vec2[] = stroke.map(/* Réfléchit chaque point et ajuste sa distance à l’axe pour fermer le demi-tracé. */ p => {
    const m = mirrorAboutLine(p, P1, P2);
    const proj = projectOnLine(p, P1, P2);
    return { x: proj.x + (m.x - proj.x) * k, y: proj.y + (m.y - proj.y) * k };
  });

  // Concatenate: forward stroke + reversed mirror
  return [...stroke, ...mirrored.reverse()];
}

/** Projette un point sur la ligne des deux raccords. */
function projectOnLine(p: Vec2, p1: Vec2, p2: Vec2): Vec2 {
  const dir = normalize(sub(p2, p1));
  const dot = (p.x - p1.x) * dir.x + (p.y - p1.y) * dir.y;
  return { x: p1.x + dir.x * dot, y: p1.y + dir.y * dot };
}


/** Rééchantillonne une courbe fermée et normalise son sens de parcours. */
export function makeLoop(pts: Vec2[]): Vec2[] {
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
