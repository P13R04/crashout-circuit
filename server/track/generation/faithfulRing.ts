/**
 * Boucle fidèle au dessin : repli des demi-tracés, lissage gaussien et arrondi local des virages trop serrés.
 * Liens : server/track/generation/vectorMath.ts, trackValidation.ts.
 * Réexporté par server/track/MapGenerator.ts, qui reste la façade de la génération du circuit.
 */
import type { Vec2 } from '../../types.js';
import { MIN_AMPLITUDE, MIN_CURVATURE_RADIUS } from './generationLimits.js';
import { dist, add, sub, scale, normalize, perpendicular, projectOntoAxis } from './vectorMath.js';
import { resample, makeLoop } from './strokeCleanup.js';
import { radiusAt, MIN_LOOP_PATH, cumulative, selfCrossings } from './trackValidation.js';

/** Énumère les amplitudes essayées lorsque la géométrie initiale du dessin doit être élargie. */
export const AMPLITUDE_BOOSTS: Array<[minAmp: number, boost: number]> = [
  [0, 1],                       // exactly as drawn
  [90, 1], [105, 1], [120, 1], [135, 1],
  [MIN_AMPLITUDE, 1],           // context.md §5.2 step 4: bulge at least 150 px
  [MIN_AMPLITUDE, 1.2], [MIN_AMPLITUDE, 1.45], [MIN_AMPLITUDE, 1.75], [MIN_AMPLITUDE, 2.2],
];
/** Extra Gaussian σ (px), tried only if a bend is still too tight after the corners are rounded. */
export const EXTRA_SMOOTHING = [0, 9, 11, 14, 17, 21, 26, 32, 40];
export const TREMOR_SIGMA = 7; // px — hand jitter
const TARGET_RADIUS = MIN_CURVATURE_RADIUS * 1.08;
/** Safety margins on the minimum radius when rounding a corner: the smallest first (least change). */
export const RADIUS_MARGINS = [1.03, 1.15];

/** A half-stroke dipping further than this across the divider is a deliberate crossing. */
const CROSSING_DEPTH = 70;

/**
 * Projette un demi-tracé dans le repère des raccords en conservant l’amplitude nécessaire.
 *
 * One half-stroke seen from the divider P1→P2 (context.md §5.2 step 4): the lateral
 * offset d becomes |d| (a wobble across the line is folded back) and the largest offset
 * is raised to MIN_AMPLITUDE, times `boost`. A half that dips deeper than CROSSING_DEPTH
 * across the line is a deliberate crossing (a figure of eight) and is not folded.
 * Position along the line is untouched: the half keeps its shape and its two ends stay
 * on P1 and P2.
 */
export function shapeHalf(half: Vec2[], P1: Vec2, P2: Vec2, boost: number, forceFold = false, minAmp = MIN_AMPLITUDE): Vec2[] {
  const u = normalize(sub(P2, P1));
  const nrm = perpendicular(u);
  const lat = half.map(/* Mesure l’écart latéral de chaque point au raccord de référence. */ p => {
    const d = sub(p, P1);
    return d.x * nrm.x + d.y * nrm.y;
  });
  const side = Math.max(...lat) >= -Math.min(...lat) ? 1 : -1;
  const own = lat.map(/* Oriente les écarts du demi-tracé vers le côté attribué à l’équipe. */ l => side * l); // > 0 on the half's own side
  const fold = forceFold || Math.max(...own.map(/* Inverse un écart du mauvais côté pour préparer le repli éventuel du dessin. */ o => -o)) <= CROSSING_DEPTH;
  const amp = Math.max(...own);
  const k = Math.max(1, minAmp / Math.max(amp, 1)) * boost;
  return half.map(/* Reconstruit le point avec son avancement longitudinal et son amplitude latérale. */ (p, i) => {
    const along = projectOntoAxis(p, P1, u);
    const d = fold ? Math.abs(own[i]) : own[i];
    return add(add(P1, scale(u, along)), scale(nrm, side * d * k));
  });
}

/** Oriente les deux tracés pour qu’ils se rejoignent sur les mêmes points. */
export function alignHalves(strokeA: Vec2[], strokeB: Vec2[], P1: Vec2, P2: Vec2): { a: Vec2[]; b: Vec2[] } {
  const a = dist(strokeA[0], P2) < dist(strokeA[0], P1) ? [...strokeA].reverse() : [...strokeA];
  const b = dist(strokeB[0], P1) < dist(strokeB[strokeB.length - 1], P1) ? [...strokeB].reverse() : [...strokeB];
  a[0] = { ...P1 };
  a[a.length - 1] = { ...P2 };
  b[0] = { ...P2 };
  b[b.length - 1] = { ...P1 };
  return { a, b };
}

/**
 * Lisse une boucle fermée avec un noyau gaussien sans créer de rupture au raccord.
 * Le filtre gaussien sans décalage réduit les tremblements ; un virage de rayon R rétrécit d’environ σ²/2R et une pointe reste mal arrondie, avec un rayon proche de σ/2,7.
 */
export function gaussianClosed(ring: Vec2[], sigma: number): Vec2[] {
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
  return ring.map(/* Fait la moyenne pondérée des voisins du point en bouclant aux extrémités. */ (_, i) => {
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

/** Redistribue régulièrement les points d’une boucle fermée. */
export function evenRing(ring: Vec2[]): Vec2[] {
  return makeLoop([...ring, ring[0]]);
}

/**
 * Arrondit localement la courbe autour du sommet demandé.
 * Les k points de chaque côté sont remplacés par une Bézier cubique tangente aux deux branches, qui restent sur le dessin.
 */
function filletAround(ring: Vec2[], i: number, k: number, handle: number): Vec2[] {
  const n = ring.length;
  /** Retrouve un point voisin de la boucle en bouclant correctement les indices. */
  const at = (j: number) => ring[((j % n) + n) % n];
  const a = at(i - k);
  const b = at(i + k);
  const c1 = add(a, scale(normalize(sub(at(i - k + 1), at(i - k - 1))), handle));
  const c2 = sub(b, scale(normalize(sub(at(i + k + 1), at(i + k - 1))), handle));
  const out = ring.map(/* Copie les points avant d’arrondir localement le sommet choisi. */ p => ({ x: p.x, y: p.y }));
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
 * Répète l’arrondi des angles trop serrés jusqu’à obtenir une chaussée praticable.
 * Au pire virage, la plus petite fenêtre et la poignée la plus douce atteignant TARGET_RADIUS limitent la modification du dessin.
 */
export function roundCorners(loop: Vec2[], target = TARGET_RADIUS): Vec2[] {
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
 * Éloigne les portions trop resserrées de la boucle pour réduire les nœuds.
 * Une vraie petite boucle est agrandie autour de son croisement immobile ; un simple accroc du tracé est supprimé.
 */
export function inflateKnots(loop: Vec2[]): Vec2[] {
  let cur = loop;
  for (let pass = 0; pass < 4; pass++) {
    const n = cur.length;
    const cum = cumulative(cur);
    const knot = selfCrossings(cur, cum)
      .filter(/* Retient les nœuds correspondant à une boucle trop courte pour être jouable. */ x => x.along < MIN_LOOP_PATH)
      .sort(/* Traite d’abord les nœuds dont la boucle est la plus resserrée. */ (p, q) => p.along - q.along)[0];
    if (!knot) break;
    // the shorter arc between the two passes is the loop
    const inner = cum[knot.j] - cum[knot.i] <= cum[n] / 2;
    const first = inner ? knot.i + 1 : knot.j + 1;
    const last = inner ? knot.j : knot.i + n;
    const arc: number[] = [];
    for (let k = first; k <= last; k++) arc.push(k % n);
    const inArc = new Set(arc);
    if (knot.along < 100) { // a kink: cut it out
      cur = evenRing(cur.filter(/* Isole les points situés hors de la petite boucle à élargir. */ (_, k) => !inArc.has(k)));
      continue;
    }
    // big enough to be a loop (path length) and for its tightest bend to be drivable
    let tight = Infinity;
    for (const k of arc) tight = Math.min(tight, radiusAt(cur, k));
    const f = Math.min(5, Math.max((MIN_LOOP_PATH * 1.15) / knot.along, (TARGET_RADIUS * 1.05) / Math.max(tight, 1)));
    cur = evenRing(cur.map(/* Éloigne les points du nœud sans déplacer le reste de la piste. */ (p, k) => (inArc.has(k)
      ? { x: knot.at.x + (p.x - knot.at.x) * f, y: knot.at.y + (p.y - knot.at.y) * f }
      : p)));
  }
  return cur;
}

/** Assemble les deux demi-tracés en une boucle dense prête à être lissée. */
export function denseRing(a: Vec2[], b: Vec2[], P1: Vec2, P2: Vec2, boost: number, forceFold = false, minAmp = MIN_AMPLITUDE): Vec2[] {
  const ring = [...shapeHalf(a, P1, P2, boost, forceFold, minAmp), ...shapeHalf(b, P2, P1, boost, forceFold, minAmp).slice(1, -1)];
  const dense = resample([...ring, ring[0]], 4);
  if (dense.length > 3 && dist(dense[0], dense[dense.length - 1]) < 3) dense.pop();
  return dense;
}
