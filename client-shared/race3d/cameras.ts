/** Calcule le cadrage des caméras de course à partir des poses serveur. */
import type { Vec2 } from '../../server/types.js';

export type CameraMode = 'cockpit' | 'chase' | 'air' | 'broadcast' | 'overview';
export const COCKPIT_FOG = { near: 155, far: 395, clip: 415 } as const;
type Position = [x: number, height: number, z: number];
type Shot = { eye: Position; target: Position; fov: number; far: number; top: boolean };

export function shotFor(mode: CameraMode, pos: Vec2, angle: number, bounds: { center: Vec2; span: number }): Shot {
  const x = Math.cos(angle), z = Math.sin(angle);
  const at = (forward: number, height: number): Position => [pos.x + x * forward, height, pos.y + z * forward];
  switch (mode) {
    case 'cockpit': return { eye: at(4, 19), target: at(100, 16), fov: 49, far: COCKPIT_FOG.clip, top: false };
    case 'chase': return { eye: at(-87, 61), target: at(46, 10), fov: 48, far: 1700, top: false };
    case 'broadcast': return { eye: at(-175, 172), target: at(53, 8), fov: 46, far: 2800, top: false };
    case 'air': return { eye: at(-80, 302), target: at(46, 0), fov: 53, far: 3000, top: false };
    case 'overview': {
      const { center, span } = bounds;
      return { eye: [center.x, span * 1.22, center.y], target: [center.x, 0, center.y], fov: 54,
        far: span * 3 + 100, top: true };
    }
  }
}
