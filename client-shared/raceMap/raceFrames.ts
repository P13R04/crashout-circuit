/** Interpole les voitures entre les deux derniers états synchronisés. */
import type { RaceViewState } from '../../server/protocol/raceView.js';
import type { Team } from '../../server/types.js';
import type { CarPose } from './objects2d.js';

type Frame = { state: RaceViewState; t: number };

/** Interpole le cap par le chemin le plus court. */
export function shorterAngle(start: number, target: number): number {
  return Math.atan2(Math.sin(target - start), Math.cos(target - start));
}

/** Interpole un déplacement continu et conserve les sauts de réapparition. */
export function interpolateCar(before: CarPose, after: CarPose, t: number): CarPose {
  if (Math.hypot(after.pos.x - before.pos.x, after.pos.y - before.pos.y) > 110) return after;
  return {
    pos: { x: before.pos.x + (after.pos.x - before.pos.x) * t, y: before.pos.y + (after.pos.y - before.pos.y) * t },
    angle: before.angle + shorterAngle(before.angle, after.angle) * t,
  };
}

export class RaceFrames {
  constructor(private readonly delay = 50) {}
  private previous: Frame | null = null;
  private current: Frame | null = null;

  /** Enregistre un nouvel état serveur et garde le précédent pour l'interpolation. */
  update(state: RaceViewState, t: number): void {
    if (this.current?.state === state) return;
    this.previous = this.current;
    this.current = { state, t };
  }

  /** Donne une pose de chaque voiture à l'heure de rendu. */
  poses(now: number): Record<Team, CarPose> {
    const frame = this.current!;
    const before = this.previous;
    if (!before || frame.state.phase !== 'RACE' || before.state.phase !== 'RACE' || frame.t <= before.t) {
      return frame.state.cars;
    }
    const ratio = Math.max(0, Math.min(1, (now - this.delay - before.t) / (frame.t - before.t)));
    return {
      A: interpolateCar(before.state.cars.A, frame.state.cars.A, ratio),
      B: interpolateCar(before.state.cars.B, frame.state.cars.B, ratio),
    };
  }
}
