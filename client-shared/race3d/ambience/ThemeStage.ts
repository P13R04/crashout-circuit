/** Installe l'environnement du thème en dehors de la surface jouable. */
import { Group, type BufferGeometry, type Material, type Texture } from 'three';
import type { ThemeId } from '../../../server/protocol/theme.js';
import type { TrackGeometry } from '../../../server/types.js';
import { clearance, venuePlots, type Plot } from '../venue/layout.js';
import { Atmosphere, matrixVoid } from './atmosphere.js';
import { mayhemProp, scrapProp, toyProp, type Prop } from './props.js';

export class ThemeStage {
  readonly root = new Group();
  private actors: { plot: Plot; prop: Prop }[] = [];
  private particles: Atmosphere | null = null;
  private matrix: Group | null = null;
  private lastTime = -1;

  build(track: TrackGeometry, theme: ThemeId): void {
    this.dispose();
    if (theme === 'classic') return;
    if (theme === 'neon') {
      this.matrix = matrixVoid();
      this.root.add(this.matrix);
      return;
    }
    const plots = venuePlots(track).filter(location => location.kind !== 'small').slice(0, 7);
    const factory = theme === 'scrap' ? scrapProp : theme === 'toy' ? toyProp : mayhemProp;
    this.actors = plots.map((plot, index) => {
      const prop = factory(plot.kind, index);
      prop.root.position.set(plot.x, theme === 'scrap' ? -12 : theme === 'toy' ? -6 : 0, plot.y);
      prop.root.rotation.y = -plot.angle;
      this.root.add(prop.root);
      return { plot, prop };
    });
    if (theme === 'scrap' || theme === 'mayhem') {
      this.particles = new Atmosphere(theme, plots.slice(0, 4));
      this.root.add(this.particles.root);
    }
  }

  followRoad(track: TrackGeometry): void {
    for (const { plot, prop } of this.actors) {
      prop.root.visible = clearance(plot.x, plot.y, track.centerline, track.widths) > plot.radius + 4;
    }
  }

  animate(time: number, reduced: boolean): void {
    const tick = reduced ? 0 : time;
    if (this.lastTime === tick) return;
    this.lastTime = tick;
    this.particles?.update(time, reduced);
    for (const { prop } of this.actors) prop.animate(tick);
    if (this.matrix) {
      for (let i = 0; i < this.matrix.children.length; i++) {
        this.matrix.children[i].position.y = Math.sin(tick * .0009 + i) * (reduced ? 0 : 11);
      }
    }
  }

  dispose(): void {
    const shapes = new Set<BufferGeometry>(), paints = new Set<Material>(), textures = new Set<Texture>();
    this.root.traverse(node => {
      if ('geometry' in node) shapes.add(node.geometry as BufferGeometry);
      if ('material' in node) paints.add(node.material as Material);
    });
    for (const shape of shapes) shape.dispose();
    for (const paint of paints) {
      if ('map' in paint && paint.map) textures.add(paint.map as Texture);
      paint.dispose();
    }
    for (const texture of textures) texture.dispose();
    this.root.clear();
    this.actors = [];
    this.particles = null;
    this.matrix = null;
    this.lastTime = -1;
  }
}
