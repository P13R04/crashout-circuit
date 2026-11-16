/** Dessine une scène vue du dessus dans le cadrage fourni par l'interface. */
import type { GameState, Team } from '../../server/types.js';
import type { MapCamera } from './camera2d.js';
import { TrackLayer, MAP_COLORS, type MapColors } from './TrackLayer.js';
import { drawObjects2d, type CarPose } from './objects2d.js';

export class RaceMap {
  private readonly trackLayer = new TrackLayer();

  /** Dessine la piste en cache et les objets actualisés dans le repère du joueur. */
  draw(ctx: CanvasRenderingContext2D, camera: MapCamera, state: GameState,
    poses: Record<Team, CarPose>, now: number, own?: Team, colors: MapColors = MAP_COLORS): void {
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, 0, camera.width, camera.height);
    ctx.save();
    ctx.translate(camera.width / 2, camera.height / 2);
    ctx.rotate(camera.rotation);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.center.x, -camera.center.y);
    ctx.drawImage(this.trackLayer.get(state, colors), 0, 0);
    drawObjects2d(ctx, state, poses, now, own);
    ctx.restore();
  }
}
