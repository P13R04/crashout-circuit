/** Charge le moteur à la demande et rend la vue 2D disponible si WebGL est perdu. */
import type { RaceViewState } from '../../server/protocol/raceView.js';
import type { Team } from '../../server/types.js';
import type { CarPose } from '../raceMap/objects2d.js';
import type { CameraMode } from './cameras.js';
import type { RaceScene } from './RaceScene.js';

export class SceneSlot {
  readonly canvas = document.createElement('canvas');
  private scene: RaceScene | null = null;
  private loading = false;
  private closed = false;
  failed = false;

  constructor(private readonly fallback: () => void) {
    this.canvas.hidden = true;
    this.canvas.setAttribute('aria-label', 'Circuit en 3D');
    this.canvas.addEventListener('webglcontextlost', this.fail);
  }

  draw(state: RaceViewState, poses: Record<Team, CarPose>, mode: CameraMode, team: Team, now: number, reduced: boolean): boolean {
    if (this.failed) return false;
    if (this.scene) {
      this.canvas.hidden = false;
      this.scene.draw(state, poses, mode, team, now, reduced);
      return true;
    }
    if (!this.loading) {
      this.loading = true;
      void import('./RaceScene.js').then(({ RaceScene: Renderer }) => {
        if (!this.closed) this.scene = new Renderer(this.canvas);
      }).catch(this.fail);
    }
    return false;
  }

  hide(): void { this.canvas.hidden = true; }

  close(): void {
    this.closed = true;
    this.canvas.removeEventListener('webglcontextlost', this.fail);
    this.scene?.dispose();
    this.scene = null;
  }

  private fail = (): void => {
    if (this.closed) return;
    this.failed = true;
    this.hide();
    this.scene?.dispose();
    this.scene = null;
    this.fallback();
  };
}
