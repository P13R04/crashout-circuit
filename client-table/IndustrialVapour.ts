import { steamSample } from './IndustrialMotion.js';
import { noise } from './neon.js';

type Ctx = CanvasRenderingContext2D;
/** One mottled sprite, reused for both broad fog banks and the bounded vent emissions. */
export class IndustrialVapour {
  private texture: HTMLCanvasElement | null = null;
  private prepare(): HTMLCanvasElement {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d')!;
    for (let i = 0; i < 90; i++) {
      const a = noise(i * 7) * Math.PI * 2, d = Math.sqrt(noise(i * 11)) * 78;
      const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d * .65, r = 12 + noise(i * 13) * 35;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, i % 4 ? '#b6c4bc12' : '#84b1bb12'); g.addColorStop(.5, '#91a8a509'); g.addColorStop(1, '#718e9600');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return canvas;
  }
  draw(ctx: Ctx, time: number, quiet: boolean): void {
    this.texture ??= this.prepare();
    const t = time / 1000;
    ctx.save(); ctx.globalAlpha *= quiet ? .35 : .7;
    // Wide, slow, uneven sheets pass over the mechanisms, but stay below the game surface.
    for (let i = 0; i < 3; i++) {
      const x = 350 + i * 600 + Math.sin(t / (27 + i * 5) + i) * 100;
      const y = 360 + (i % 2) * 310 + Math.cos(t / (33 + i * 3)) * 65;
      ctx.save(); ctx.translate(x, y); ctx.rotate(-.4 + Math.sin(t / 43 + i) * .15);
      ctx.globalAlpha *= .35 + .12 * Math.sin(t / 13 + i);
      ctx.drawImage(this.texture, -470, -230, 940, 460); ctx.restore();
    }
    for (const [x, y, phase, direction] of [[1575, 755, .17, -1], [1120, 555, .61, 1], [1575, 465, .82, -1], [700, 520, .38, 1]]) {
      for (let i = 0; i < 4; i++) {
        const puff = steamSample(time, i, phase);
        const size = 115 * puff.scale, drift = direction * puff.age * 95;
        ctx.save(); ctx.translate(x + drift, y + Math.sin(puff.age * 3 + i) * 22);
        ctx.rotate(direction * puff.age * .5 + i * .7);
        ctx.globalAlpha *= puff.alpha * 2;
        ctx.drawImage(this.texture, -size * .6, -size * .45, size * 1.2, size * .9); ctx.restore();
      }
    }
    ctx.restore();
  }
}
