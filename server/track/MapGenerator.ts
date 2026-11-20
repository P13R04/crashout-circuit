/**
 * Construit la géométrie du circuit à partir des tracés et place le départ, les checkpoints et les
 * ramassables.
 * Liens : server/layout.ts, server/geometry.ts, server/types.ts, server/config.ts.
 * Référencé notamment par server/rules/GameRules.ts, scripts/acceptance.ts, scripts/rendering/audio.ts.
 * Découpé par responsabilité dans server/track/generation/ : ce fichier garde l'API publique (generate, validateStroke, rebuildEdges, generationInfo) et réexporte les autres noms publics.
 */
import type { Vec2, TrackGeometry } from '../types.js';
import { PLAY_AREA } from '../layout.js';
import { RESAMPLE_STEP } from './generation/generationLimits.js';
import { validate, resample, oneEuroFilter, autofill, makeLoop } from './generation/strokeCleanup.js';
import { mergeLoops } from './generation/loopMerge.js';
import { edgesFromWidths } from './generation/trackGeometry.js';
import { alignHalves } from './generation/faithfulRing.js';
import { faithfulTrack, smoothestTrack } from './generation/trackStrategies.js';
import { generatePreset, singleLoopTrack } from './generation/trackFallbacks.js';

// Réexports : les noms publics gardent leur chemin d’import.
export { edgesFromWidths, computeGeometry } from './generation/trackGeometry.js';
export { randomizeRaceStart, randomizePickups, placeFeatures } from './generation/trackFeatures.js';
export { generatePreset } from './generation/trackFallbacks.js';
export { validate, resample, oneEuroFilter, autofill, makeLoop } from './generation/strokeCleanup.js';
export { shapeHalf, inflateKnots, gaussianClosed, roundCorners } from './generation/faithfulRing.js';
export { faithfulTrack, smoothestTrack } from './generation/trackStrategies.js';
export { selfCrossings, tightestRadius, validateGeometry } from './generation/trackValidation.js';
export { mergeLoops, catmullRom } from './generation/loopMerge.js';

/** Which strategy produced the last circuit (for logs and tests). */
export const generationInfo = { method: '' };

/** Expose la validation d’un demi-tracé aux règles de création. */
export function validateStroke(stroke: Vec2[], p1: Vec2, p2: Vec2): boolean {
  return validate(stroke, p1, p2);
}

/** Prépare une boucle de secours à partir d’un seul demi-tracé. */
function prepareLoop(stroke: Vec2[], P1: Vec2, P2: Vec2): Vec2[] {
  const resampled = resample(stroke, RESAMPLE_STEP);
  const filtered = oneEuroFilter(resampled.length >= 2 ? resampled : stroke);
  return makeLoop(autofill(filtered, P1, P2));
}

/** Choisit d’abord le circuit fidèle aux deux tracés puis les solutions de secours si nécessaire.

 * @param p1A/p2A/p1B/p2B  Imposed target points (inferred from stroke ends if omitted)

 */
export function generate(
  strokeA: Vec2[],
  strokeB: Vec2[],
  p1A?: Vec2,
  p2A?: Vec2,
  p1B?: Vec2,
  p2B?: Vec2,
  area = PLAY_AREA,
): TrackGeometry {
  const P1A = p1A ?? strokeA[0];
  const P2A = p2A ?? strokeA[strokeA.length - 1];
  const P1B = p1B ?? strokeB[0];
  const P2B = p2B ?? strokeB[strokeB.length - 1];

  const aValid = strokeA.length >= 2 && validate(strokeA, P1A, P2A);
  const bValid = strokeB.length >= 2 && validate(strokeB, P1B, P2B);
  if (!aValid && !bValid) { generationInfo.method = 'preset'; return generatePreset(area); }

  // 1. The circuit is the drawing: stroke A (P1→P2) and stroke B (P2→P1) joined at
  // the two shared anchors form the closed loop (see faithfulTrack).
  if (aValid && bValid) {
    const { a, b } = alignHalves(strokeA, strokeB, P1A, P2A);
    const geo = faithfulTrack(a, b, P1A, P2A, area);
    if (geo) {
      generationInfo.method = 'closed loop union';
      return geo;
    }
    // Still the drawing, but ironed out as much as it takes (never the preset first)
    const smooth = smoothestTrack(a, b, P1A, P2A, area);
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
      const geo = singleLoopTrack(mergeLoops(loopA, loopB, wA, wB), P1A, area);
      if (geo) { generationInfo.method = `merge ${wA}/${wB}`; return geo; }
    }
  }
  for (const [name, loop] of [['loop A', loopA], ['loop B', loopB]] as const) {
    if (!loop) continue;
    const geo = singleLoopTrack(loop, P1A, area);
    if (geo) { generationInfo.method = name; return geo; }
  }
  generationInfo.method = 'preset';
  return generatePreset(area);
}

/** Recalcule les bordures après une modification de la ligne centrale ou de ses largeurs. */
export function rebuildEdges(geo: TrackGeometry): void {
  const { outerEdge, innerEdge } = edgesFromWidths(geo.centerline, geo.widths);
  geo.outerEdge = outerEdge;
  geo.innerEdge = innerEdge;
}
