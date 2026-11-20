/**
 * Constantes de la génération du circuit : tailles de boucle, tolérances de tracé, rayon minimal et nombre d'éléments de course.
 * Liens : server/track/generation/*.ts.
 * Réexporté par server/track/MapGenerator.ts, qui reste la façade de la génération du circuit.
 */


export const LOOP_N = 256;
export const RESAMPLE_STEP = 8;           // px — initial resample step
export const TOUCH_RADIUS = 140;          // px — generous target ring for a real finger/mouse release
export const MIN_STROKE_LENGTH = 150;     // px — relaxed for accessible sketching
export const MIN_AMPLITUDE = 150;         // px — each half-stroke bulges at least this far from the divider
export const MIN_CURVATURE_RADIUS = 50;   // px — below this track is too tight (1.8·R ≥ min width)
export const MIN_TRACK_WIDTH = 24;        // px — vehicle clearance
export const CHECKPOINT_COUNT = 8;
export const PICKUP_COUNT = 4;
export const START_LATERAL_OFFSET = 20;   // px — side-by-side start positions
