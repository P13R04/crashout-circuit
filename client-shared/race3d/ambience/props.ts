/** Construit les objets de décor animés hors chaussée. */
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshLambertMaterial,
  Path, Shape, TorusGeometry } from 'three';
import type { MeshLambertMaterial as Paint } from 'three';
import type { Plot } from '../venue/layout.js';

export type Animation = (time: number) => void;
export type Prop = { root: Group; animate: Animation };
type XYZ = [number, number, number];

function color(value: number): Paint { return new MeshLambertMaterial({ color: value }); }

function box(root: Group, material: Paint, size: XYZ, pos: XYZ): Mesh {
  const mesh = new Mesh(new BoxGeometry(...size), material);
  mesh.position.set(...pos);
  root.add(mesh);
  return mesh;
}

function tube(root: Group, material: Paint, r: number, length: number, pos: XYZ, horizontal = false): Mesh {
  const mesh = new Mesh(new CylinderGeometry(r, r, length, 10), material);
  mesh.position.set(...pos);
  if (horizontal) mesh.rotation.z = Math.PI / 2;
  root.add(mesh);
  return mesh;
}

function gear(radius: number, teeth: number, material: Paint): Mesh {
  const shape = new Shape();
  for (let i = 0; i < teeth * 4; i++) {
    const angle = i / (teeth * 4) * Math.PI * 2;
    const r = radius - (i % 4 < 2 ? 0 : 4);
    if (i === 0) shape.moveTo(r * Math.cos(angle), r * Math.sin(angle));
    else shape.lineTo(r * Math.cos(angle), r * Math.sin(angle));
  }
  shape.closePath();
  const hole = new Path();
  hole.absarc(0, 0, radius * .30, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new Mesh(new ExtrudeGeometry(shape, { depth: 5, bevelEnabled: false, curveSegments: 5 }), material);
}

function press(): Prop {
  const root = new Group(), copper = color(0xa66446), alloy = color(0x536669), ink = color(0x2e393e), lamp = color(0x59ebe3);
  box(root, alloy, [76, 7, 46], [0, 4, 0]);
  box(root, copper, [74, 12, 42], [0, 59, 0]);
  for (const x of [-28, 28]) {
    tube(root, ink, 5, 56, [x, 31, 13]);
    tube(root, alloy, 4, 56, [x, 31, -15]);
  }
  const piston = new Group();
  box(piston, ink, [46, 8, 34], [0, -4, 0]);
  tube(piston, copper, 9, 25, [0, 9, 0]);
  box(root, lamp, [54, 2, 2], [0, 54, -22]);
  tube(root, copper, 3.5, 67, [0, 12, -23], true);
  root.add(piston);
  return { root, animate: time => {
    const cycle = (time % 4300) / 4300;
    piston.position.y = 35 + 11 * Math.cos(Math.min(1, cycle * 1.4) * Math.PI * 2);
  } };
}

export function scrapProp(kind: Plot['kind'], index: number): Prop {
  if (kind === 'landmark' || index % 3 === 0) return press();
  const root = new Group(), copper = color(0xad724f), alloy = color(0x647878), ink = color(0x2b4147);
  const a = gear(25, 11, index % 2 ? copper : alloy), b = gear(15, 7, index % 2 ? alloy : copper);
  box(root, ink, [81, 5, 28], [0, 3, 0]);
  box(root, alloy, [7, 41, 8], [-17, 22, 6]);
  box(root, ink, [6, 28, 8], [20, 16, 6]);
  a.position.set(-17, 30, 0); b.position.set(20, 20, 0);
  root.add(a, b);
  tube(root, copper, 2.3, 79, [0, 9, -16], true);
  return { root, animate: time => { a.rotation.z = time * .00065; b.rotation.z = .14 - a.rotation.z * 11 / 7; } };
}

export function toyProp(kind: Plot['kind'], index: number): Prop {
  const root = new Group(), paint = color(index % 2 ? 0xed5e42 : 0xffb038), wood = color(0xdcaa64);
  const glass = color(0x61a4b8), cream = color(0xf8dea4), black = color(0x273b49);
  if (kind === 'landmark') {
    box(root, wood, [132, 5, 76], [0, 2, 0]);
    box(root, cream, [99, 31, 46], [0, 17, 10]);
    box(root, paint, [112, 6, 56], [0, 35, 10]);
    for (const x of [-26, 26]) {
      box(root, black, [38, 24, 2], [x, 14, -14]);
      box(root, glass, [29, 5, 4], [x, 26, -15]);
    }
    for (let x = -50; x <= 52; x += 12) box(root, cream, [3, 1.4, 56], [x, 38, 10]);
    return { root, animate: () => {} };
  }
  const plane = new Group();
  root.add(plane);
  box(root, wood, [67, 3, 46], [0, 2, 0]);
  box(plane, paint, [43, 7, 8], [0, 10, 0]);
  box(plane, cream, [13, 2, 58], [1, 9, 0]);
  box(plane, cream, [9, 2, 23], [-18, 13, 0]);
  box(plane, paint, [9, 10, 2.5], [-18, 15, 0]);
  box(plane, glass, [11, 5, 7], [-4, 15, 0]);
  for (const z of [-7, 7]) {
    const wheel = tube(plane, black, 3.3, 2.6, [1, 5, z]);
    wheel.rotation.x = Math.PI / 2;
  }
  const propeller = new Group();
  propeller.position.set(23, 10, 0);
  box(propeller, black, [1.4, 22, 2], [0, 0, 0]);
  box(propeller, cream, [2, 3, 4], [1, 0, 0]);
  plane.add(propeller);
  return { root, animate: time => { propeller.rotation.x = time * .013; } };
}

export function mayhemProp(kind: Plot['kind'], index: number): Prop {
  const root = new Group(), tire = color(0x282725), cover = color(0xd8783f), iron = color(0x413a34);
  if (kind === 'landmark') {
    box(root, iron, [128, 10, 60], [0, 5, 0]);
    box(root, cover, [118, 4, 54], [0, 44, 0]);
    box(root, cover, [114, 12, 2], [0, 37, -26]);
    for (const x of [-54, 54]) {
      box(root, iron, [4, 41, 4], [x, 22, -23]);
      box(root, tire, [17, 26, 16], [x - Math.sign(x) * 13, 20, -18]);
    }
  }
  const geometry = new TorusGeometry(7.3, 2.9, 5, 11);
  for (let i = 0; i < 3; i++) {
    for (let layer = 0; layer < 2 + (index + i) % 3; layer++) {
      const wheel = new Mesh(geometry, tire);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set((i - 1) * 19 + layer % 2 * 2, 3.2 + 5.2 * layer, kind === 'landmark' ? -32 : i % 2 * 12);
      root.add(wheel);
    }
  }
  return { root, animate: () => {} };
}
