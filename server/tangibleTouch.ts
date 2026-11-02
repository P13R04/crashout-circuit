/**
 * Valide la prise à deux doigts d’un tangible et en déduit son centre et l’orientation du mur.
 * Liens : server/layout.ts, server/types.ts, server/tangibles.ts, server/tangibleGeometry.ts.
 * Référencé notamment par client-table/GestureRecognizer.ts, client-table/TangibleTouchPreview.ts,
 * server/GameRules.ts.
 */
import type { GameParams, Tangible, Vec2 } from './types.js';
import { validTangiblePose } from './tangibles.js';
import type { TangiblePose } from './tangibleGeometry.js';

export const TANGIBLE_WAIT_MS = 20_000;
export const TANGIBLE_SETTLE_MS = 90;
export const TANGIBLE_CONTACT_GRACE_MS = 1600;

/** Calcule et valide le centre du tangible et l’orientation du mur à partir des deux contacts. */
export function tangibleTouchPose(kind: Tangible['kind'], a: Vec2, b: Vec2, p: GameParams): TangiblePose | null {
  if (!a || !b || ![a.x,a.y,b.x,b.y].every(Number.isFinite)) return null;
  // Les fenêtres HUD sont dessinées au-dessus de la piste : elles ne doivent pas interdire
  // une pose physique qui les recouvre partiellement. Seules les limites réelles de la table comptent.
  if ([a,b].some(v=>v.x<0||v.y<0||v.x>p.logicalWidth||v.y>p.logicalHeight)) return null;
  const pxPerMm=p.pylonBasePx/32, distance=Math.hypot(b.x-a.x,b.y-a.y);
  // Tolerate grips and fingertip sizes, but reject a palm split or two distant players.
  if(distance<10*pxPerMm||distance>180*pxPerMm)return null;
  const pose={x:(a.x+b.x)/2/p.logicalWidth,y:(a.y+b.y)/2/p.logicalHeight,
    angle:kind==='wall'?((Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI+90)%180+180)%180:0};
  return validTangiblePose(kind,pose,p)?pose:null;
}
