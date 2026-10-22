/** Hardware adapters emit game intentions. No DOM, sensor or network dependency here. */
import type { Team, Vec2, ItemKind } from '../server/types.js';

type Send = (message: { type: string } & Record<string, unknown>) => void;

/** Table gestures and keyboard use this API; a later mobile adapter can use it too. */
export function createControls(send: Send) {
  return {
    steer(team: Team, value: number): void {
      if (!Number.isFinite(value)) return;
      send({ type: 'PilotInput', team, throttle: 1, steer: Math.max(-1, Math.min(1, value)) });
    },
    power(team: Team): void { send({ type: 'Power', team, role: 'copilot' }); },
    gesture(kind: ItemKind, team: Team, a: Vec2, b?: Vec2): void {
      if (kind === 'slingshot') send({ type: 'Slingshot', team, x: a.x, y: a.y });
      else if (b) send({ type: 'BoostGate', team, a, b });
    },
  };
}
