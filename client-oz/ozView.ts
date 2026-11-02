/**
 * Convertit les coordonnées entre la carte Oz et la table, y compris lorsque la vue est tournée ou en
 * portrait.
 * Liens : server/types.ts.
 * Référencé par client-oz/OzMap.ts, scripts/acceptance.ts.
 */
import type { Vec2 } from '../server/types.js';

/** Calcule le centrage, l’échelle et la rotation de la carte dans le canvas. */
export function viewTransform(width: number, height: number, W: number, H: number, quarter: number) {
  return { scale: Math.min(width / (quarter % 2 ? H : W), height / (quarter % 2 ? W : H)),
    angle: quarter * Math.PI / 2, cx: width / 2, cy: height / 2, W, H };
}
/** Convertit une position affichée dans la carte en coordonnées logiques de la table. */
export function viewToWorld(p: Vec2, t: ReturnType<typeof viewTransform>): Vec2 {
  const x = (p.x - t.cx) / t.scale, y = (p.y - t.cy) / t.scale;
  return { x: t.W / 2 + x * Math.cos(t.angle) + y * Math.sin(t.angle),
    y: t.H / 2 - x * Math.sin(t.angle) + y * Math.cos(t.angle) };
}
/** Projette une position logique de la table dans la vue tournée de la console. */
export function worldToView(p: Vec2, t: ReturnType<typeof viewTransform>): Vec2 {
  const x = p.x - t.W / 2, y = p.y - t.H / 2;
  return { x: t.cx + t.scale * (x * Math.cos(t.angle) - y * Math.sin(t.angle)),
    y: t.cy + t.scale * (x * Math.sin(t.angle) + y * Math.cos(t.angle)) };
}
