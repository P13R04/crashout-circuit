import type { Vec2 } from './types.js';

export interface TangiblePose { x: number; y: number; angle: number }

/** Logical coordinates; the protocol still stores a centre and angle. */
export function wallEndpoints(center: Vec2, angle: number, length: number): [Vec2, Vec2] {
  const radians = angle * Math.PI / 180;
  const dx = Math.cos(radians) * length / 2, dy = Math.sin(radians) * length / 2;
  return [{ x: center.x - dx, y: center.y - dy }, { x: center.x + dx, y: center.y + dy }];
}

/** Move endpoint 2 around endpoint 1 without changing the wall length or anchor. */
export function rotateWall(anchor: Vec2, pointer: Vec2, length: number): TangiblePose | null {
  const dx = pointer.x - anchor.x, dy = pointer.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 1) return null;
  return { x: anchor.x + dx / distance * length / 2, y: anchor.y + dy / distance * length / 2,
    angle: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360 };
}
