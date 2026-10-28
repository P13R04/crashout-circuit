import type { GameParams, Tangible, Vec2 } from './types.js';
import { insidePanel } from './layout.js';
import { validTangiblePose } from './tangibles.js';
import type { TangiblePose } from './tangibleGeometry.js';

export const TANGIBLE_WAIT_MS = 20_000;
export const TANGIBLE_SETTLE_MS = 90;

/** Fingers flank the 32 mm base, not the long ends of the wall. Sizes stay physical. */
export function tangibleTouchPose(kind: Tangible['kind'], a: Vec2, b: Vec2, p: GameParams): TangiblePose | null {
  if (!a || !b || ![a.x,a.y,b.x,b.y].every(Number.isFinite)) return null;
  if ([a,b].some(v=>v.x<0||v.y<0||v.x>p.logicalWidth||v.y>p.logicalHeight||insidePanel(v))) return null;
  const pxPerMm=p.pylonBasePx/32, distance=Math.hypot(b.x-a.x,b.y-a.y);
  // Tolerate grips and fingertip sizes, but reject a palm split or two distant players.
  if(distance<20*pxPerMm||distance>140*pxPerMm)return null;
  const pose={x:(a.x+b.x)/2/p.logicalWidth,y:(a.y+b.y)/2/p.logicalHeight,
    angle:kind==='wall'?((Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI+90)%180+180)%180:0};
  return validTangiblePose(kind,pose,p)?pose:null;
}
