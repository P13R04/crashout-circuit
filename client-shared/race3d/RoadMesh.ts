/** Construit les bandes 3D depuis les deux limites de chaussée diffusées par le serveur. */
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, Group, Mesh } from 'three';
import type { Material } from 'three';
import type { TrackGeometry, Vec2 } from '../../server/types.js';
import { visibleTrackEdges } from '../trackVisibility.js';

type RoadMaterials = { road: Material; verge: Material; curb: Material; white: Material; dark: Material };

class Strip {
  private readonly vertices: Float32BufferAttribute;
  private readonly uv: Float32BufferAttribute;
  private count = 0;
  readonly mesh: Mesh<BufferGeometry, Material>;

  constructor(capacity: number, material: Material) {
    this.vertices = new Float32BufferAttribute(new Float32Array(capacity * 12), 3).setUsage(DynamicDrawUsage);
    this.uv = new Float32BufferAttribute(new Float32Array(capacity * 8), 2).setUsage(DynamicDrawUsage);
    const indices = new Uint16Array(capacity * 6);
    for (let i = 0; i < capacity; i++) {
      const v = i * 4;
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', this.vertices);
    geometry.setAttribute('uv', this.uv);
    geometry.setIndex(new BufferAttribute(indices, 1));
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  reset(): void { this.count = 0; }

  quad(a: Vec2, b: Vec2, c: Vec2, d: Vec2, height: number): void {
    const base = this.count++ * 4;
    this.put(base, a, height);
    this.put(base + 1, b, height);
    this.put(base + 2, c, height);
    this.put(base + 3, d, height);
  }

  private put(index: number, p: Vec2, height: number): void {
    this.vertices.setXYZ(index, p.x, height, p.y);
    this.uv.setXY(index, p.x / 72, p.y / 72);
  }

  upload(): void {
    this.mesh.geometry.setDrawRange(0, this.count * 6);
    this.vertices.needsUpdate = true;
    this.uv.needsUpdate = true;
  }
}

function offset(point: Vec2, opposite: Vec2, distance: number): Vec2 {
  const x = point.x - opposite.x, y = point.y - opposite.y, length = Math.hypot(x, y) || 1;
  return { x: point.x + x * distance / length, y: point.y + y * distance / length };
}

export class RoadMesh {
  readonly group = new Group();
  private version = -1;
  private size = 0;
  private strips: Strip[] = [];

  constructor(private materials: RoadMaterials) {}

  /** Réutilise les tampons et les indices quand seul le tracé a été déformé. */
  update(track: TrackGeometry, version: number): void {
    if (version === this.version) return;
    this.version = version;
    const { outerEdge: outer, innerEdge: inner } = track;
    const n = outer.length;
    if (n < 3) { this.group.visible = false; return; }
    this.group.visible = true;
    if (n !== this.size) this.allocate(n);
    const [road, verge, curb, white, dark] = this.strips;
    this.strips.forEach(strip => strip.reset());
    const visible = visibleTrackEdges(track);
    let distance = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      road.quad(outer[i], outer[j], inner[j], inner[i], .15);
      const paint = Math.floor(distance / 15) % 2 ? curb : white;
      if (visible[0][i] && visible[0][j]) this.drawEdge(verge, paint, outer, inner, i, j);
      if (visible[1][i] && visible[1][j]) this.drawEdge(verge, paint, inner, outer, i, j);
      const a = track.centerline[i], b = track.centerline[j];
      distance += Math.hypot(b.x - a.x, b.y - a.y);
    }
    this.startLine(track, white, dark);
    this.strips.forEach(strip => strip.upload());
  }

  repaint(materials: RoadMaterials): void {
    this.materials = materials;
    const { road, verge, curb, white, dark } = materials;
    this.strips.forEach((strip, index) => { strip.mesh.material = [road, verge, curb, white, dark][index]; });
  }

  dispose(): void {
    for (const { mesh } of this.strips) mesh.geometry.dispose();
    this.group.clear();
    this.size = 0;
  }

  private allocate(n: number): void {
    this.dispose();
    this.size = n;
    const { road, verge, curb, white, dark } = this.materials;
    this.strips = [new Strip(n, road), new Strip(2 * n, verge), new Strip(2 * n, curb),
      new Strip(2 * n + 24, white), new Strip(24, dark)];
    for (const { mesh } of this.strips) this.group.add(mesh);
  }

  private drawEdge(verge: Strip, paint: Strip, edge: Vec2[], inside: Vec2[], i: number, j: number): void {
    const a = edge[i], b = edge[j];
    const borderA = offset(a, inside[i], 3), borderB = offset(b, inside[j], 3);
    verge.quad(borderA, borderB, offset(b, inside[j], 15), offset(a, inside[i], 15), .09);
    paint.quad(offset(a, inside[i], -2), offset(b, inside[j], -2), borderB, borderA, .24);
  }

  private startLine(track: TrackGeometry, white: Strip, dark: Strip): void {
    const i = track.featureIndices.start;
    const a = track.outerEdge[i], b = track.innerEdge[i];
    if (!a || !b) return;
    const x = b.x - a.x, y = b.y - a.y, width = Math.hypot(x, y) || 1;
    const cell = (col: number, row: number): Vec2 =>
      ({ x: a.x + x * col / 16 - y / width * row * 3.8, y: a.y + y * col / 16 + x / width * row * 3.8 });
    for (let col = 0; col < 16; col++) {
      for (let row = 0; row < 2; row++) {
        const paint = (col + row) % 2 ? dark : white;
        paint.quad(cell(col, row), cell(col + 1, row), cell(col + 1, row + 1), cell(col, row + 1), .32);
      }
    }
  }
}
