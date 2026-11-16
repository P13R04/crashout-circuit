/**
 * Stratégies de génération à partir du dessin : piste fidèle, puis piste la plus lissée en dernier recours.
 * Liens : server/track/generation/faithfulRing.ts, trackFitting.ts.
 * Réexporté par server/track/MapGenerator.ts, qui reste la façade de la génération du circuit.
 */
import type { Vec2, TrackGeometry } from '../../types.js';
import { LOOP_N, MIN_AMPLITUDE, MIN_CURVATURE_RADIUS } from './generationLimits.js';
import { signedArea } from './vectorMath.js';
import { computeGeometry } from './trackGeometry.js';
import { placeFeatures } from './trackFeatures.js';
import { tightestRadius, validateGeometry } from './trackValidation.js';
import { fitToPlayArea, stretchMinorAxis } from './trackFitting.js';
import { AMPLITUDE_BOOSTS, EXTRA_SMOOTHING, TREMOR_SIGMA, RADIUS_MARGINS, gaussianClosed, evenRing, roundCorners, inflateKnots, denseRing } from './faithfulRing.js';

/**
 * Construit en priorité une piste qui conserve la forme dessinée par les joueurs.
 *
 * Circuit built on the drawing itself: the two halves hooked on P1 and P2 form the
 * loop, which is only denoised and rounded where it is too sharp to drive. If it is
 * still not a valid circuit (halves pinching, a bean thinner than a lane) the halves
 * are bulged further; null when even that fails.
 */
export function faithfulTrack(a: Vec2[], b: Vec2[], P1: Vec2, P2: Vec2): TrackGeometry | null {
  // First the drawing as it is (a deep dip across the divider is a deliberate crossing),
  // then with every dip folded back (the classic bean).
  // Preserve the drawn shape; fit only when it overflows the safe table area.
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
 * Cherche un lissage plus fort du dessin lorsque sa première géométrie ne convient pas.
 *
 * Last resort that still uses the drawing: when it cannot be driven as drawn (loops
 * crossing themselves, halves pinched together) it is smoothed harder and harder, back
 * to its drawn size, until the loop is simple and drivable. The result is the drawing
 * with its details ironed out rather than a predefined circuit.
 */
export function smoothestTrack(a: Vec2[], b: Vec2[], P1: Vec2, P2: Vec2): TrackGeometry | null {
  for (const minAmp of [0, MIN_AMPLITUDE]) {
    const dense = denseRing(a, b, P1, P2, 1, false, minAmp);
    const area0 = Math.abs(signedArea(dense));
    for (const sigma of HEAVY_SIGMAS) {
      let loop = evenRing(gaussianClosed(dense, sigma));
      // smoothing shrinks a shape towards its centre: give it back its drawn size
      const area = Math.abs(signedArea(loop));
      if (area > 1) {
        const k = Math.min(1.6, Math.max(1, Math.sqrt(area0 / area)));
        const cx = loop.reduce(/* Additionne les abscisses de la boucle pour en retrouver le centre. */ (s, p) => s + p.x, 0) / loop.length;
        const cy = loop.reduce(/* Additionne les ordonnées de la boucle pour en retrouver le centre. */ (s, p) => s + p.y, 0) / loop.length;
        loop = loop.map(/* Élargit la boucle autour de son centre dans la tentative de lissage courante. */ p => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
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
  const cx = dense.reduce(/* Additionne les abscisses de la boucle dense pour son ajustement de secours. */ (q, p) => q + p.x, 0) / n;
  const cy = dense.reduce(/* Additionne les ordonnées de la boucle dense pour son ajustement de secours. */ (q, p) => q + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of dense) { sxx += (p.x - cx) ** 2; syy += (p.y - cy) ** 2; sxy += (p.x - cx) * (p.y - cy); }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const mx = Math.cos(theta), my = Math.sin(theta);
  const lam1 = (sxx + syy) / (2 * n) + Math.hypot((sxx - syy) / (2 * n), sxy / n);
  const lam2 = Math.max(0, (sxx + syy) / n - lam1);
  const semiMajor = Math.max(Math.SQRT2 * Math.sqrt(lam1), 200);
  const semiMinor = Math.max(Math.SQRT2 * Math.sqrt(lam2), Math.sqrt(60 * semiMajor), 110);
  const ellipse = Array.from({ length: LOOP_N }, /* Construit les points de l’ellipse de dernier recours dans le repère du dessin. */ (_, i) => {
    const t = (i / LOOP_N) * 2 * Math.PI;
    const u = semiMajor * Math.cos(t), v = semiMinor * Math.sin(t);
    return { x: cx + u * mx - v * my, y: cy + u * my + v * mx };
  });
  const geo = placeFeatures(computeGeometry(fitToPlayArea(signedArea(ellipse) < 0 ? ellipse.reverse() : ellipse)), false, P1);
  return validateGeometry(geo) ? geo : null;
}
