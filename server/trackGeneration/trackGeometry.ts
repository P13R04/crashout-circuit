/**
 * Géométrie de la chaussée : bordures, largeurs et ligne centrale d'un circuit.
 * Liens : server/types.ts (TrackGeometry).
 * Réexporté par server/MapGenerator.ts, qui reste la façade de la génération du circuit.
 */
import type { Vec2, TrackGeometry } from '../types.js';
import { config } from '../config.js';
import { dist, add, sub, scale, normalize, perpendicular } from './vectorMath.js';

/** Regroupe la ligne centrale, les largeurs et les bordures avant le placement des éléments de course. */
export type BaseGeometry = Omit<TrackGeometry,
  'baseCenterline' | 'checkpoints' | 'startLine' | 'startPositions' | 'pickupPositions' | 'featureIndices'>;

/**
 * Décale la ligne centrale de chaque côté pour calculer les deux bords de la chaussée.
 * La normale gauche pointe vers l’intérieur : le bord extérieur vaut centre − normale × largeur/2, y compris après une déformation.
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
 * Calcule les largeurs locales et les bords à partir de la courbure du circuit.
 * La largeur de base est de 140 px, modulée de ±30 px selon la courbure et bornée à 90 px minimum.
 */
export function computeGeometry(centerline: Vec2[]): BaseGeometry {
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
  const meanK = smoothedK.reduce(/* Additionne les courbures pour calculer leur moyenne de référence. */ (a, b) => a + b, 0) / n;

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
