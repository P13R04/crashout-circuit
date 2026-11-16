/** Dessine une monoplace et son ombre à partir de pièces simples réutilisables. */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, CircleGeometry } from 'three';
import type { ThemeId } from '../../server/protocol/theme.js';
import type { Team } from '../../server/types.js';
import { CAR_COLORS } from '../raceMap/objects2d.js';

export class CarModel {
  readonly root = new Group();
  readonly body = new Group();
  private readonly paint;
  private readonly tires: Group[] = [];
  private readonly designs: Record<ThemeId, Group> = {
    classic: new Group(), scrap: new Group(), neon: new Group(), toy: new Group(), mayhem: new Group(),
  };
  private readonly color;

  constructor(team: Team) {
    this.color = CAR_COLORS[team];
    this.paint = new MeshLambertMaterial({ color: this.color });
    const alloy = new MeshLambertMaterial({ color: 0x9caaad });
    const carbon = new MeshLambertMaterial({ color: 0x20272c });
    const tire = new MeshLambertMaterial({ color: 0x181c20 });
    const shadow = new Mesh(new CircleGeometry(1, 20),
      new MeshBasicMaterial({ color: 0x12191c, transparent: true, opacity: .37, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = .36;
    shadow.scale.set(24, 14, 1);
    this.root.add(shadow, this.body);
    const classic = this.designs.classic;
    this.body.add(...Object.values(this.designs));
    const part = (x: number, y: number, z: number, sx: number, sy: number, sz: number, material = this.paint) => {
      const piece = new Mesh(new BoxGeometry(sx, sy, sz), material);
      piece.position.set(x, y, z);
      classic.add(piece);
    };
    part(-3, 5.5, 0, 26, 5, 12);
    part(10, 6, 0, 17, 3, 5);
    part(18, 3, 0, 6, 2, 22);
    part(-15, 11, 0, 6, 2, 22);
    part(-15, 7, 7, 2, 7, 2, carbon);
    part(-15, 7, -7, 2, 7, 2, carbon);
    part(-1, 8.5, 0, 7, 3, 6, carbon);
    part(-4, 11, 0, 4, 4, 4, alloy);
    for (const x of [-11, 12]) for (const z of [-9.5, 9.5]) {
      const axle = new Group();
      axle.position.set(x, 5, z);
      const wheel = new Mesh(new CylinderGeometry(5, 5, 4, 10), tire);
      const hub = new Mesh(new CylinderGeometry(2, 2, 4.3, 5), alloy);
      wheel.rotation.x = hub.rotation.x = Math.PI / 2;
      axle.add(wheel, hub);
      this.tires.push(axle);
      this.body.add(axle);
    }
    this.buildVariants(carbon, alloy);
    this.setTheme('classic');
  }

  /** Réutilise les trains roulants et adapte les volumes de carrosserie. */
  private buildVariants(carbon: MeshLambertMaterial, alloy: MeshLambertMaterial): void {
    let design = this.designs.scrap;
    const part = (x: number, y: number, z: number, sx: number, sy: number, sz: number, material = this.paint) => {
      const shape = new Mesh(new BoxGeometry(sx, sy, sz), material);
      shape.position.set(x, y, z);
      design.add(shape);
    };
    part(0, 6, 0, 38, 7, 15);
    part(-5, 11, 0, 15, 5, 10, carbon);
    part(16, 7, 0, 6, 7, 19, alloy);
    part(-14, 9, 5, 10, 4, 3, alloy);
    part(-14, 9, -5, 10, 4, 3, alloy);

    design = this.designs.neon;
    part(1, 5.5, 0, 37, 5, 14, carbon);
    part(1, 6, -6, 35, 2, 2);
    part(1, 6, 6, 35, 2, 2);
    part(-1, 9, 0, 15, 4, 8);
    part(16, 6, 0, 5, 2, 10, alloy);

    design = this.designs.toy;
    part(0, 6, 0, 32, 8, 15);
    part(-4, 11, 0, 15, 6, 11, alloy);
    part(-4, 14, 0, 14, 2, 12);
    part(15, 5, 0, 4, 3, 15, alloy);

    design = this.designs.mayhem;
    part(0, 7, 0, 37, 8, 14);
    part(2, 13, 0, 20, 6, 11, carbon);
    part(2, 16, 0, 21, 2, 12);
    part(18, 5, 0, 6, 5, 20, alloy);
    part(-18, 5, 0, 6, 5, 20, alloy);
  }

  setTheme(theme: ThemeId): void {
    for (const [id, group] of Object.entries(this.designs)) group.visible = id === theme;
  }

  animate(speed: number, disabled: boolean, delta: number): void {
    this.paint.color.set(disabled ? 0xa4a8a4 : this.color);
    for (const axle of this.tires) axle.rotation.z -= speed * delta / 5;
  }
}
