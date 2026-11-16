/**
 * Fusion des deux demi-boucles et interpolation Catmull-Rom de la boucle obtenue.
 * Liens : server/trackGeneration/vectorMath.ts.
 * Réexporté par server/MapGenerator.ts, qui reste la façade de la génération du circuit.
 */
import type { Vec2 } from '../types.js';
import { dist, lerp } from './vectorMath.js';
import { makeLoop } from './strokeCleanup.js';

/**
 * Aligne deux boucles puis mélange leurs points selon les poids demandés.
 * Le décalage de B minimise la distance à A avant la moyenne pondérée C(i) = wA × A(i) + wB × B(i + décalage).
 */
export function mergeLoops(A: Vec2[], B: Vec2[], wA = 0.5, wB = 0.5): Vec2[] {
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


/**
 * Interpole une boucle lissée en conservant un espacement exploitable entre ses points.
 * La spline Catmull–Rom centripète utilise α = 0,5 et conserve les 256 échantillons de la boucle.
 */
export function catmullRom(pts: Vec2[]): Vec2[] {
  const n = pts.length;
  const alpha = 0.5;
  const result: Vec2[] = [];
  const segments = 4; // sub-samples per segment

  /** Calcule le paramètre d’interpolation à partir de la distance entre deux points voisins. */
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
