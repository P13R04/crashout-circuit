/**
 * Circuits de secours : circuit prédéfini et boucle unique élargie.
 * Liens : server/trackGeneration/trackFitting.ts.
 * Réexporté par server/MapGenerator.ts, qui reste la façade de la génération du circuit.
 */
import type { Vec2, TrackGeometry } from '../types.js';
import { LOOP_N } from './generationLimits.js';
import { signedArea } from './vectorMath.js';
import { computeGeometry } from './trackGeometry.js';
import { placeFeatures } from './trackFeatures.js';
import { validateGeometry } from './trackValidation.js';
import { buildFromCenterline } from './trackFitting.js';

/** Construit le circuit prédéfini utilisé par le tutoriel et l’essai autonome. */
export function generatePreset(): TrackGeometry {
  const pts: Vec2[] = [];
  const cx = 960, cy = 540;
  for (let i = 0; i < LOOP_N; i++) {
    const a = (i / LOOP_N) * Math.PI * 2;
    // Rounded bean: ellipse with a gentle dent
    const rx = 720, ry = 250 + 15 * Math.cos(2 * a);
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) * (1 - 0.08 * Math.cos(a)) });
  }
  const loop = signedArea(pts) < 0 ? pts.reverse() : pts;
  // `preset` lets the table tell the players that their drawing was not used
  return { ...placeFeatures(computeGeometry(loop), false), preset: true };
}

/** Essaie plusieurs élargissements d’une boucle de secours avant de la retenir. */
export function singleLoopTrack(loop: Vec2[], preferredStart?: Vec2): TrackGeometry | null {
  for (const stretch of [1, 1.2, 1.5, 2, 2.8]) {
    const geo = buildFromCenterline(loop, stretch, preferredStart);
    if (validateGeometry(geo)) return geo;
  }
  return null;
}
