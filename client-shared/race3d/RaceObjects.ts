/** Synchronise les obstacles, bonus et projectiles visibles avec leur état serveur. */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  OctahedronGeometry, RingGeometry, SphereGeometry } from 'three';
import type { RaceViewState } from '../../server/protocol/raceView.js';
import { boostFrame } from '../../server/track/boostGeometry.js';

class Pool<T extends Group | Mesh> {
  private readonly items: T[] = [];
  private used = 0;

  constructor(private readonly root: Group, private readonly make: () => T) {}
  begin(): void { this.used = 0; }
  take(): T {
    let item = this.items[this.used];
    if (!item) {
      item = this.make();
      this.items.push(item);
      this.root.add(item);
    }
    item.visible = true;
    this.used++;
    return item;
  }
  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i].visible = false;
  }
}

export class RaceObjects {
  readonly root = new Group();
  private readonly box = new BoxGeometry(1, 1, 1);
  private readonly orange = new MeshLambertMaterial({ color: 0xe78b4e });
  private readonly inactive = new MeshLambertMaterial({ color: 0x6d7471 });
  private readonly idlePylon = new MeshBasicMaterial({ color: 0x77748a });
  private readonly violet = new MeshBasicMaterial({ color: 0xddb1ff });
  private readonly yellow = new MeshBasicMaterial({ color: 0xffd157 });
  private readonly impact = new MeshBasicMaterial({ color: 0xff7857 });
  private readonly wall = this.pool(() => new Mesh(this.box, this.orange));
  private readonly columnShape = new CylinderGeometry(6, 10, 1, 8);
  private readonly column = this.pool(() => new Mesh(this.columnShape, this.violet));
  private readonly tokenShape = new OctahedronGeometry(11);
  private readonly token = this.pool(() => new Mesh(this.tokenShape, this.yellow));
  private readonly boost = this.pool(() => new Mesh(this.box, this.yellow));
  private readonly arc = this.pool(() => new Mesh(this.box, this.violet));
  private readonly ringShape = new RingGeometry(.88, 1, 32).rotateX(-Math.PI / 2);
  private readonly ring = this.pool(() => new Mesh(this.ringShape, this.impact));
  private readonly stoneShape = new SphereGeometry(7, 8, 5);
  private readonly stone = this.pool(() => new Mesh(this.stoneShape, this.orange));
  private readonly pools = [this.wall, this.column, this.token, this.boost, this.arc, this.ring, this.stone];

  update(state: RaceViewState, now: number, reduced: boolean): void {
    for (const pool of this.pools) pool.begin();
    for (const wall of state.walls) {
      const m = this.wall.take(), active = wall.disabledUntil <= now;
      m.material = active ? this.orange : this.inactive;
      m.scale.set(wall.lengthPx, active ? 18 : 4, wall.widthPx ?? state.params.wallWidthPx);
      m.position.set(wall.pos.x, m.scale.y / 2, wall.pos.y);
      m.rotation.y = -wall.angle * Math.PI / 180;
    }
    for (const item of Object.values(state.tangibles)) {
      if (item.kind !== 'pylon' || item.status !== 'placed') continue;
      const m = this.column.take();
      m.material = item.active ? this.violet : this.idlePylon;
      m.scale.y = 24;
      m.position.set(item.x * state.params.logicalWidth, 12, item.y * state.params.logicalHeight);
    }
    for (const a of state.arcs) {
      if (a.disabledUntil > now) continue;
      this.drawArc(a.pylon1, a.pylon2, now, reduced);
    }
    this.drawBonuses(state, now, reduced);
    for (const pool of this.pools) pool.end();
  }

  private drawArc(a: { x: number; y: number }, b: { x: number; y: number }, now: number, reduced: boolean): void {
    let x = a.x, y = 21, z = a.y;
    for (let i = 1; i <= 6; i++) {
      const nx = a.x + (b.x - a.x) * i / 6, nz = a.y + (b.y - a.y) * i / 6;
      const ny = i === 6 || reduced ? 21 : 21 + Math.sin(now / 75 + i * 2.1) * 6;
      const m = this.arc.take();
      const horizontal = Math.hypot(nx - x, nz - z);
      m.position.set((x + nx) / 2, (y + ny) / 2, (z + nz) / 2);
      m.rotation.set(0, -Math.atan2(nz - z, nx - x), Math.atan2(ny - y, horizontal), 'YXZ');
      m.scale.set(Math.hypot(horizontal, ny - y), 2, 2);
      x = nx; y = ny; z = nz;
    }
  }

  private drawBonuses(state: RaceViewState, now: number, reduced: boolean): void {
    for (const p of state.pickups) {
      if (p.respawnAt > now) continue;
      const m = this.token.take();
      m.material = p.kind === 'boost' ? this.yellow : this.violet;
      m.rotation.y = reduced ? 0 : now * .002;
      m.position.set(p.pos.x, 14 + (reduced ? 0 : 3 * Math.sin(now * .003 + p.id)), p.pos.y);
    }
    for (const gate of state.boostGates) {
      if (gate.expiresAt <= now) continue;
      const { forward, depth, length, across } = boostFrame(gate);
      for (let stripe = 0; stripe < 3; stripe++) {
        const offset = (stripe + .5) * depth / 3;
        const m = this.boost.take();
        m.scale.set(length, .33, Math.min(4, depth / 10));
        m.position.set(gate.a.x + across.x * length / 2 + forward.x * offset, .34,
          gate.a.y + across.y * length / 2 + forward.y * offset);
        m.rotation.y = -Math.atan2(across.y, across.x);
      }
    }
    for (const s of state.stones) {
      const ring = this.ring.take();
      ring.position.set(s.target.x, .6, s.target.y);
      ring.scale.setScalar(state.params.stoneRadiusPx);
      const t = Math.max(0, Math.min(1, (now - s.launchedAt) / Math.max(1, s.impactAt - s.launchedAt)));
      this.stone.take().position.set(s.from.x + (s.target.x - s.from.x) * t,
        7 + Math.sin(Math.PI * t) * 65, s.from.y + (s.target.y - s.from.y) * t);
    }
  }

  private pool<T extends Mesh>(make: () => T): Pool<T> { return new Pool(this.root, make); }
}
