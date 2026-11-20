/** Groupe les pièces fixes en une seule instance GPU et anime quelques détails. */
import { BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import type { Matrix4 } from 'three';
import type { TrackGeometry } from '../../../server/types.js';
import { clearance, venuePlots, type Plot } from './layout.js';
import { grandPrixParts, type Part } from './models.js';

type Placed = { plot: Plot; from: number; to: number; blocked: boolean };
type Flag = { index: number; angle: number; plot: Plot; part: Part; visible: boolean };

export class Venue {
  readonly root = new Group();
  private readonly box = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshLambertMaterial();
  private batch: InstancedMesh | null = null;
  private rows: Placed[] = [];
  private matrices: Matrix4[] = [];
  private flags: Flag[] = [];
  private lastTime = -1;
  private readonly pose = new Object3D();
  private readonly zero = new Object3D();
  private readonly color = new Color();

  constructor() { this.zero.scale.setScalar(0); this.zero.updateMatrix(); }

  build(track: TrackGeometry): void {
    this.removeBatch();
    const groups = venuePlots(track).map(plot => ({ plot, parts: grandPrixParts(plot.kind) }));
    const size = groups.reduce((count, group) => count + group.parts.length, 0);
    if (!size) return;
    const batch = this.batch = new InstancedMesh(this.box, this.material, size);
    let index = 0;
    for (const { plot, parts } of groups) {
      const from = index;
      for (const part of parts) {
        this.transform(plot, part, plot.angle);
        this.matrices.push(this.pose.matrix.clone());
        batch.setMatrixAt(index, this.pose.matrix);
        batch.setColorAt(index, this.color.set(part[6]));
        if (part[7]) this.flags.push({ index, plot, part, angle: plot.angle, visible: true });
        index++;
      }
      this.rows.push({ plot, from, to: index, blocked: false });
    }
    batch.computeBoundingSphere();
    this.root.add(batch);
  }

  followRoad(track: TrackGeometry): void {
    if (!this.batch) return;
    for (const row of this.rows) {
      const plot = row.plot;
      const blocked = clearance(plot.x, plot.y, track.centerline, track.widths) < plot.radius + 4;
      if (blocked === row.blocked) continue;
      row.blocked = blocked;
      for (let i = row.from; i < row.to; i++) this.batch.setMatrixAt(i, blocked ? this.zero.matrix : this.matrices[i]);
      for (const flag of this.flags) if (flag.plot === plot) flag.visible = !blocked;
      this.batch.instanceMatrix.needsUpdate = true;
    }
  }

  animate(now: number, reduced: boolean): void {
    if (!this.batch || !this.flags.length || this.lastTime === (reduced ? 0 : now)) return;
    this.lastTime = reduced ? 0 : now;
    for (const flag of this.flags) {
      if (!flag.visible) continue;
      const angle = flag.angle + (reduced ? 0 : .38 * Math.sin(now / 340 + flag.index));
      this.transform(flag.plot, flag.part, angle);
      this.batch.setMatrixAt(flag.index, this.pose.matrix);
    }
    this.batch.instanceMatrix.needsUpdate = true;
  }

  dispose(): void { this.removeBatch(); this.box.dispose(); this.material.dispose(); }

  private removeBatch(): void {
    if (this.batch) { this.root.remove(this.batch); this.batch.dispose(); }
    this.batch = null;
    this.rows = [];
    this.flags = [];
    this.lastTime = -1;
    this.matrices = [];
  }

  private transform(plot: Plot, part: Part, angle: number): void {
    const [x, y, z, width, height, depth] = part;
    const c = Math.cos(plot.angle), s = Math.sin(plot.angle);
    this.pose.position.set(plot.x + c * x - s * z, y, plot.y + s * x + c * z);
    this.pose.rotation.y = -angle;
    this.pose.scale.set(width, height, depth);
    this.pose.updateMatrix();
  }
}
