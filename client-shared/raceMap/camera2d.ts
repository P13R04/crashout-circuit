/** Transforme de façon réversible les coordonnées entre la table et le canvas mobile. */
import type { Vec2 } from '../../server/types.js';

export interface MapCamera { center: Vec2; width: number; height: number; scale: number; rotation: number }

/** Convertit une position logique en pixels du canvas. */
export function toScreen(camera: MapCamera, world: Vec2): Vec2 {
  const dx = (world.x - camera.center.x) * camera.scale, dy = (world.y - camera.center.y) * camera.scale;
  return {
    x: camera.width / 2 + dx * Math.cos(camera.rotation) - dy * Math.sin(camera.rotation),
    y: camera.height / 2 + dx * Math.sin(camera.rotation) + dy * Math.cos(camera.rotation),
  };
}

/** Convertit un point du canvas en coordonnées logiques de la table. */
export function toWorld(camera: MapCamera, screen: Vec2): Vec2 {
  const dx = (screen.x - camera.width / 2) / camera.scale, dy = (screen.y - camera.height / 2) / camera.scale;
  return {
    x: camera.center.x + dx * Math.cos(camera.rotation) + dy * Math.sin(camera.rotation),
    y: camera.center.y - dx * Math.sin(camera.rotation) + dy * Math.cos(camera.rotation),
  };
}
