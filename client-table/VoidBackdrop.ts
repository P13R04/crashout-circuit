import { LOGICAL_W as W, LOGICAL_H as H } from '../server/layout.js';
import { glow, noise } from './neon.js';

/** Deep digital void. Fog and code are rasterised once; only their planes drift. */
export class VoidBackdrop {
  private fog: HTMLCanvasElement | null = null;
  private rain: HTMLCanvasElement[] = [];

  private prepare(): void {
    this.fog = document.createElement('canvas'); this.fog.width = 960; this.fog.height = 540;
    const c = this.fog.getContext('2d')!;
    c.fillStyle = '#030611'; c.fillRect(0, 0, 960, 540);
    for (const [x, y, r, color] of [[130, 300, 410, '#123440'], [780, 170, 370, '#25214b'], [500, 460, 270, '#142645']] as const) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color); g.addColorStop(1, '#03061100'); c.fillStyle = g; c.fillRect(0, 0, 960, 540);
    }
    // Abstract code columns, already faint and soft at their native resolution.
    for (let layer = 0; layer < 2; layer++) {
      const sheet = document.createElement('canvas'); sheet.width = 640; sheet.height = 768;
      const s = sheet.getContext('2d')!; s.font = `${layer ? 12 : 10}px monospace`;
      for (let col = 0; col < 22; col++) {
        const x = col * 30 + noise(col + 20) * 8;
        const top = noise(col * 5 + layer) * 690;
        const length = 5 + Math.floor(noise(col * 3) * 20);
        for (let row = 0; row < length; row++) {
          const y = (top + row * 18) % 768;
          s.globalAlpha = (.1 + row / length * .28) * (layer ? .8 : 1);
          s.fillStyle = layer ? '#8d7bc7' : '#58bdb7';
          const chars = '01:¦+−⋮⌁';
          s.fillText(chars[Math.floor(noise(col * 33 + row * 9) * chars.length)], x, y);
          if (row === length - 1) { s.globalAlpha = .45; s.fillStyle = '#9de7de'; s.fillRect(x, y + 5, 3, 1); }
        }
      }
      this.rain.push(sheet);
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number, reducedMotion: boolean, quiet: boolean): void {
    if (!this.fog) this.prepare();
    const t = reducedMotion ? 0 : time / 1000;
    ctx.drawImage(this.fog!, 0, 0, W, H);
    ctx.save(); ctx.globalAlpha = quiet ? .24 : .38;
    for (let layer = 0; layer < 2; layer++) {
      const scale = layer ? 1.45 : 1.05, tw = 640 * scale, th = 768 * scale;
      const dx = Math.sin(t / (17 + layer * 8)) * (layer ? 22 : 7);
      const dy = (t * (layer ? -13 : 7) % th + th) % th;
      for (let x = -tw + dx; x < W; x += tw) for (let y = -th + dy; y < H; y += th) {
        ctx.drawImage(this.rain[layer], x, y, tw, th);
      }
    }
    ctx.restore();
    // Rare near-plane fragments move faster than the distant code: parallax, no camera motion.
    ctx.save();
    for (let i = 0; i < 36; i++) {
      const depth = .25 + noise(i * 3) * .75;
      const x = (noise(i * 13) * (W + 100) + Math.sin(t / 16) * depth * 28 + W + 100) % (W + 100) - 50;
      const y = ((noise(i * 17) * (H + 80) - t * depth * 9) % (H + 80) + H + 80) % (H + 80) - 40;
      ctx.globalAlpha = (quiet ? .08 : .15) * depth;
      ctx.fillStyle = i % 3 ? '#8ad9d5' : '#aa8fff';
      ctx.fillRect(x, y, 2, 4 + depth * 11);
      if (i % 9 === 0) { ctx.strokeStyle = '#658baf'; ctx.lineWidth = 1; ctx.strokeRect(x + 8, y - 5, 14 + depth * 15, 8 + depth * 10); }
    }
    ctx.restore();
    // Slow pools of light belong to the void, never to the playable surface.
    glow(ctx, 350 + Math.sin(t / 13) * 90, 480 + Math.cos(t / 17) * 70, 270, '#258a9e', .12, 1.4);
    glow(ctx, 1460 + Math.cos(t / 19) * 110, 540 + Math.sin(t / 15) * 90, 330, '#7051bc', .11, .9);
  }
}
