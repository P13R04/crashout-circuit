/** Dessine une monoplace et son ombre à partir de pièces simples réutilisables. */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, CircleGeometry } from 'three';
import type { Team } from '../../server/types.js';
import { CAR_COLORS } from '../raceMap/objects2d.js';

export class CarModel {
  readonly root = new Group();
  readonly body = new Group();
  private readonly paint;
  private readonly tires: Group[] = [];
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
    const part = (x: number, y: number, z: number, sx: number, sy: number, sz: number, material = this.paint) => {
      const piece = new Mesh(new BoxGeometry(sx, sy, sz), material);
      piece.position.set(x, y, z);
      this.body.add(piece);
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
  }

  animate(speed: number, disabled: boolean, delta: number): void {
    this.paint.color.set(disabled ? 0xa4a8a4 : this.color);
    for (const axle of this.tires) axle.rotation.z -= speed * delta / 5;
  }
}
