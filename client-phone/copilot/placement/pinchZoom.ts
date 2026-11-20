/**
 * Calcule le zoom autour du point du circuit tenu entre les deux doigts.
 * Liens : PlacementMap.ts, client-shared/raceMap/camera2d.ts.
 */
import type { Vec2 } from '../../../server/types.js';
import { toWorld, type MapCamera } from '../../../client-shared/raceMap/camera2d.js';

export type Pinch = { camera: MapCamera; zoom: number; anchor: Vec2; span: number };
export type MapZoom = { zoom: number; focus: Vec2 | null };

/** Mémorise le centre et l'écartement des deux doigts au début du pincement. */
export function beginPinch(camera: MapCamera, zoom: number, a: Vec2, b: Vec2): Pinch {
  return { camera, zoom, anchor: toWorld(camera, midpoint(a, b)), span: Math.max(1, span(a, b)) };
}

/** Redimensionne la carte en gardant le repère sous le milieu du geste. */
export function resizePinch(pinch: Pinch, a: Vec2, b: Vec2): MapZoom {
  const zoom = Math.max(1, Math.min(3, pinch.zoom * span(a, b) / pinch.span));
  if (zoom === 1) return { zoom, focus: null };
  const camera = { ...pinch.camera, center: { x: 0, y: 0 }, scale: pinch.camera.scale * zoom / pinch.zoom };
  const offset = toWorld(camera, midpoint(a, b));
  return { zoom, focus: { x: pinch.anchor.x - offset.x, y: pinch.anchor.y - offset.y } };
}

/** Limite le déplacement du cadre quand il atteint le bord de la table. */
export function boundedFocus(camera: MapCamera, width: number, height: number): Vec2 {
  const x = Math.min(width / 2, camera.width / (2 * camera.scale));
  const y = Math.min(height / 2, camera.height / (2 * camera.scale));
  return {
    x: Math.max(x, Math.min(width - x, camera.center.x)),
    y: Math.max(y, Math.min(height - y, camera.center.y)),
  };
}

/** Calcule le milieu des deux doigts en pixels du canvas. */
function midpoint(a: Vec2, b: Vec2): Vec2 { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

/** Mesure la distance entre les deux doigts. */
function span(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }
