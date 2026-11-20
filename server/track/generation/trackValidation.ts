/**
 * Validation d'un circuit : rayons de virage, croisements, boucles roulables et largeur minimale.
 * Liens : server/geometry.ts, server/track/generation/generationLimits.ts.
 * Réexporté par server/track/MapGenerator.ts, qui reste la façade de la génération du circuit.
 */
import type { Vec2, TrackGeometry } from '../../types.js';
import { segmentsIntersect } from '../../geometry.js';
import { MIN_CURVATURE_RADIUS, MIN_TRACK_WIDTH } from './generationLimits.js';
import { dist, sub, normalize, signedArea } from './vectorMath.js';

/** Estime le rayon du virage au point étudié. */
export function radiusAt(pts: Vec2[], i: number): number {
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

/** Retrouve le rayon de courbure le plus serré de la boucle. */
export function tightestRadius(pts: Vec2[]): number {
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
export const MIN_LOOP_PATH = 2.5 * 140;

/** Décrit les deux branches et les caractéristiques d’une intersection du circuit. */
interface Crossing {
  i: number;       // segment of one branch
  j: number;       // segment of the other branch
  at: Vec2;        // where they cross
  along: number;   // shortest path length between the two passes
  sin: number;     // sine of the angle between the branches
}

/** Calcule les distances cumulées le long de la boucle. */
export function cumulative(pts: Vec2[]): number[] {
  const n = pts.length;
  const cum: number[] = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i % n]));
  return cum;
}

/** Repère les intersections entre les branches éloignées d’un même circuit. */
export function selfCrossings(c: Vec2[], cum = cumulative(c)): Crossing[] {
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

/** Mesure la plus petite distance parcourue sur la boucle entre deux indices. */
function pathGap(cum: number[], a: number, b: number): number {
  const g = Math.abs(cum[a] - cum[b]);
  return Math.min(g, cum[cum.length - 1] - g);
}

/**
 * Marque les portions proches des croisements pour adapter les validations et les placements.
 * Les deux branches sont protégées sur environ 1,5 largeur de piste autour du croisement, avec au moins 190 px pour les lignes de checkpoint.
 */
export function junctionMask(c: Vec2[], widths: number[], crossings: Crossing[], cum: number[]): boolean[] {
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

/** Vérifie que la largeur, les virages et les rapprochements de branches laissent une piste jouable. */
export function validateGeometry(geo: TrackGeometry): boolean {
  const { centerline, widths } = geo;
  const n = centerline.length;

  if (centerline.some(/* Signale une coordonnée de circuit invalide avant les calculs géométriques. */ p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;

  // Width must clear the vehicle (24×14 px)
  for (const w of widths) {
    if (w < MIN_TRACK_WIDTH) return false;
  }

  // Minimum radius of curvature
  if (tightestRadius(centerline) < MIN_CURVATURE_RADIUS) return false;

  // Self-crossings are allowed when clean: no knot (short loop), no grazing contact
  const cum = cumulative(centerline);
  const crossings = selfCrossings(centerline, cum);
  if (crossings.some(/* Repère les croisements qui créeraient une petite boucle ou un passage trop rasant. */ x => x.along < MIN_LOOP_PATH || x.sin < MIN_CROSSING_SIN)) return false;

  // "No impossible passage": two parts of the track that are far apart along the
  // path must stay at least ~0.8 track widths apart, or the edges would overlap.
  // Inside a junction the two branches overlap on purpose.
  const reach = crossings.map(/* Calcule l’étendue de sécurité de chaque jonction à partir des largeurs voisines. */ x => Math.max(190, 1.5 * Math.max(widths[x.i], widths[x.j])));
  /** Indique si le rapprochement de deux portions appartient à un croisement déjà identifié. */
  const inJunction = (i: number, j: number): boolean => crossings.some(/* Teste si les deux indices appartiennent aux branches d’une même jonction. */ (x, k) =>
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
    const xs = centerline.map(/* Extrait les abscisses pour mesurer l’étendue du circuit. */ p => p.x), ys = centerline.map(/* Extrait les ordonnées pour mesurer l’étendue du circuit. */ p => p.y);
    if (Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 200) return false;
  }

  return true;
}
