/** Affiche le plan en vue rapprochée, avec un cadrage entier à la demande. */
import type { GameState, Team } from '../../../server/types.js';
import { LOGICAL_H, LOGICAL_W } from '../../../server/layout.js';
import { RaceMap } from '../../../client-shared/raceMap/RaceMap.js';
import type { MapCamera } from '../../../client-shared/raceMap/camera2d.js';
import type { CarPose } from '../../../client-shared/raceMap/objects2d.js';

export class PeripheralView {
  whole = false;
  headingUp = false;
  private readonly map = new RaceMap();

  /** Dessine les éléments publics dans le plan choisi par le pilote. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number,
    state: GameState, poses: Record<Team, CarPose>, team: Team, now: number): void {
    const own = poses[team];
    const camera: MapCamera = this.whole ? {
      center: { x: LOGICAL_W / 2, y: LOGICAL_H / 2 }, width: w, height: h,
      scale: Math.min(w / (LOGICAL_W + 80), h / (LOGICAL_H + 80)), rotation: 0,
    } : {
      center: own.pos, width: w, height: h,
      scale: Math.max(w, h) / 1200, rotation: this.headingUp ? -own.angle - Math.PI / 2 : 0,
    };
    this.map.draw(ctx, camera, state, poses, now, team);
  }
}
