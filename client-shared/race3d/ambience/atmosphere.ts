/** Fournit des particules en nombre borné et les couches du vide matriciel. */
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Group, LineBasicMaterial, LineSegments,
  Points, PointsMaterial, Sprite, SpriteMaterial } from 'three';
import type { Plot } from '../venue/layout.js';
import type { ThemeId } from '../../../server/protocol/theme.js';

function rand(i: number): number {
  return ((Math.imul(i ^ 0xcaff, 0x45d9f3b) >>> 8) & 0xffff) / 65536;
}

export function matrixVoid(): Group {
  const root = new Group();
  for (let layer = 0; layer < 3; layer++) {
    const vertices: number[] = [];
    const down = -26 - layer * 73;
    for (let i = 0; i < 280; i++) {
      const x = -310 + rand(i * 17 + layer * 67) * 2570;
      const z = -360 + rand(i * 41 + layer * 19) * 1840;
      const y = down - rand(i * 303) * 27;
      for (let j = 0; j <= (i % 3); j++) {
        const start = y - j * 11;
        vertices.push(x, start, z, x, start - (3 + i % 7), z);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    const material = new LineBasicMaterial({ color: [0x7970dc, 0x5843a3, 0x3072a9][layer],
      transparent: true, opacity: [.82, .63, .42][layer], blending: AdditiveBlending, depthWrite: false });
    root.add(new LineSegments(geometry, material));
  }
  return root;
}

export class Atmosphere {
  readonly root = new Group();
  private readonly smoke: Sprite[] = [];
  private readonly positions = new Float32Array(84 * 3);
  private readonly sparks: Points<BufferGeometry, PointsMaterial>;

  constructor(private readonly theme: ThemeId, private readonly emitters: Plot[]) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.sparks = new Points(geometry, new PointsMaterial({ size: theme === 'scrap' ? 2.6 : 2.9,
      color: theme === 'scrap' ? 0x68f2f1 : 0xffae4f, blending: AdditiveBlending, transparent: true, depthWrite: false }));
    this.sparks.frustumCulled = false;
    this.root.add(this.sparks);
    if (theme === 'scrap') this.makeSmoke();
  }

  update(time: number, reduced: boolean): void {
    const enabled = !reduced && this.emitters.length > 0;
    this.root.visible = enabled;
    if (!enabled) return;
    for (let i = 0; i < 84; i++) {
      const e = this.emitters[i % this.emitters.length];
      const age = (((time / 1100) + rand(i + 5)) % 1);
      const phase = rand(i) * 6.28;
      const reach = age * (16 + rand(i * 11) * 35);
      this.positions[i * 3] = e.x + Math.cos(phase) * reach;
      this.positions[i * 3 + 1] = 5 + Math.sin(age * Math.PI) * (12 + rand(i * 7) * 34);
      this.positions[i * 3 + 2] = e.y + Math.sin(phase) * reach;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    for (const [i, smoke] of this.smoke.entries()) {
      const e = this.emitters[i % this.emitters.length], age = (time / 3000 + i * .27) % 1;
      smoke.position.set(e.x + i % 3 * 12 + age * 23, 14 + age * 48, e.y - 14 + age * 16);
      smoke.scale.setScalar(12 + age * 36);
      smoke.material.opacity = Math.sin(age * Math.PI) * .35;
    }
  }

  private makeSmoke(): void {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    const plume = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
    plume.addColorStop(0, '#b6d0d5b8'); plume.addColorStop(.55, '#869e984e'); plume.addColorStop(1, '#8198a600');
    ctx.fillStyle = plume; ctx.fillRect(0, 0, 48, 48);
    const map = new CanvasTexture(canvas);
    for (let i = 0; i < Math.min(10, this.emitters.length * 2); i++) {
      const s = new Sprite(new SpriteMaterial({ map, depthWrite: false, transparent: true }));
      this.root.add(s);
      this.smoke.push(s);
    }
    if (!this.smoke.length) map.dispose();
  }
}
