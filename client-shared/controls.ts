/** Hardware adapters emit game intentions. No DOM, sensor or network dependency here. */
import type { Team, Vec2, ItemKind } from '../server/types.js';

type Send = (message: { type: string } & Record<string, unknown>) => void;

/** Table gestures and keyboard use this API; a later mobile adapter can use it too. */
export function createControls(send: Send) {
  return {
    steer(team: Team, value: number, throttle = 1): void {
      if (!Number.isFinite(value) || !Number.isFinite(throttle)) return;
      send({ type: 'PilotInput', team, throttle: Math.max(0, Math.min(1, throttle)), steer: Math.max(-1, Math.min(1, value)) });
    },
    power(team: Team): void { send({ type: 'Power', team, role: 'copilot' }); },
    gesture(kind: ItemKind, team: Team, a: Vec2, b?: Vec2): void {
      if (kind === 'slingshot' && b) send({ type: 'Slingshot', team, anchor: a, pouch: b });
      else if (b) send({ type: 'BoostGate', team, a, b });
    },
  };
}
