import { IndustrialMachinery } from './IndustrialMachinery.js';
import { IndustrialVapour } from './IndustrialVapour.js';
import { glow, noise } from './neon.js';
import { LOGICAL_W as W, LOGICAL_H as H } from '../server/layout.js';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** Orthographic industrial abyss: horizontal machinery at three depths, never a skyline. */
export class ScrapBackdrop {
  private planes: HTMLCanvasElement[] = [];
  private machinery = new IndustrialMachinery();
  private vapour = new IndustrialVapour();
  private powerPaths: Path2D[] = [];

  private prepare(): void {
    for (const points of [
      [[85, 330], [210, 330], [210, 430], [370, 430], [370, 710], [510, 710], [510, 790]],
      [[1120, 540], [1120, 295], [1070, 295], [1070, 215], [1430, 215], [1430, 370], [1540, 370], [1690, 370], [1690, 510]],
      [[745, 490], [745, 685], [1170, 685], [1170, 860], [1570, 860], [1570, 770]],
    ]) {
      const path = new Path2D(); points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y)); this.powerPaths.push(path);
    }
    for (let depth = 0; depth < 3; depth++) {
      const sheet = document.createElement('canvas'); sheet.width = 1440; sheet.height = 810;
      const c = sheet.getContext('2d')!; c.scale(.75, .75);
      if (!depth) {
        c.fillStyle = '#03090d'; c.fillRect(0, 0, W, H);
        for (const [x, y, r, color] of [[350, 300, 610, '#14252c'], [1520, 790, 650, '#102128'], [1010, 570, 410, '#060b10']] as const) {
          const g = c.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, color); g.addColorStop(1, '#03090d00'); c.fillStyle = g; c.fillRect(0, 0, W, H);
        }
      }
      // Broken service decks. Overlapping rectangles read as roofs and machines seen from above.
      for (let i = 0; i < 14; i++) {
        const seed = i * 19 + depth * 271;
        const x = noise(seed) * 2200 - 140, y = noise(seed + 1) * 1260 - 90;
        const w = 80 + noise(seed + 2) * 190, h = 40 + noise(seed + 3) * 100;
        c.save(); c.translate(x, y); c.rotate((Math.floor(noise(seed + 4) * 4) * Math.PI / 2) + (i % 9 === 0 ? .22 : 0));
        c.fillStyle = '#010508'; c.fillRect(-9, -8, w + 18, h + 16);
        const metal = c.createLinearGradient(0, 0, w, h);
        metal.addColorStop(0, depth === 2 ? '#233237' : '#18282e'); metal.addColorStop(1, '#0b151b');
        c.fillStyle = metal; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#52707822'; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2);
        c.strokeStyle = '#02090da0'; c.lineWidth = 4;
        for (let x = 20; x < w - 5; x += 25) { c.beginPath(); c.moveTo(x, 5); c.lineTo(x, h - 5); c.stroke(); }
        // Mechanical recess and exposed pipes, all lying in the table plane.
        c.fillStyle = '#02080c'; c.fillRect(w * .24, h * .22, w * .52, h * .56);
        c.strokeStyle = '#385058'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-20, h * .6); c.lineTo(w * .16, h * .6); c.lineTo(w * .16, h + 30); c.lineTo(w * .6, h + 30); c.stroke();
        if (i % 3 === 0) {
          c.strokeStyle = '#5ca1a16a'; c.lineWidth = 2;
          c.beginPath(); c.moveTo(w * .28, h * .28); c.lineTo(w * .6, h * .28); c.stroke();
        }
        c.restore();
      }
      this.planes.push(sheet);
    }
  }

  draw(ctx: Ctx, time: number, reduced: boolean, quiet: boolean): void {
    if (!this.planes.length) this.prepare();
    const t = reduced ? 0 : time / 1000;
    ctx.save();
    ctx.fillStyle = '#02080d'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = quiet ? .38 : .57; ctx.drawImage(this.planes[0], 0, 0, W, H);
    ctx.save(); ctx.globalAlpha = quiet ? .16 : .34; this.machinery.draw(ctx, t * 1000, 0, quiet); ctx.restore();
    for (let depth = 1; depth < 3; depth++) {
      const drift = depth === 1 ? 3 : 9;
      ctx.globalAlpha = (quiet ? .09 : .17) * (depth === 1 ? 1 : .8);
      ctx.drawImage(this.planes[depth], -12 + Math.sin(t / 27) * drift, -12 + Math.cos(t / 31) * drift, W + 24, H + 24);
    }
    ctx.save(); ctx.globalAlpha = quiet ? .19 : .43;
    ctx.translate(Math.sin(t / 27) * 5, Math.cos(t / 31) * 5); this.machinery.draw(ctx, t * 1000, 1, quiet); ctx.restore();
    ctx.globalAlpha = 1;
    // Warm pressure pipes coexist with cold electrical packets. No ownership meaning.
    ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = '#101f25';
    for (const path of this.powerPaths) ctx.stroke(path);
    ctx.lineWidth = 1; ctx.strokeStyle = '#8e765844';
    for (const path of this.powerPaths) ctx.stroke(path);
    ctx.setLineDash([16, 380]); ctx.lineDashOffset = -t * 34;
    ctx.strokeStyle = '#76ced08a'; ctx.lineWidth = 1.4;
    for (const path of this.powerPaths) ctx.stroke(path);
    ctx.lineWidth = 7; ctx.strokeStyle = '#66c9d311';
    for (const path of this.powerPaths) ctx.stroke(path);
    ctx.restore();
    this.vapour.draw(ctx, t * 1000, quiet);
    // Fog slides across the shafts in different directions; no falling/vertical code planes.
    glow(ctx, 470 + Math.sin(t / 19) * 100, 430 + Math.cos(t / 23) * 65, 570, '#3a6770', quiet ? .12 : .23, .75);
    glow(ctx, 1420 + Math.cos(t / 29) * 115, 680 + Math.sin(t / 21) * 80, 490, '#294c5d', .24, .85);
    for (let i = 0; i < 34; i++) {
      const depth = .2 + noise(i * 7) * .8;
      const x = noise(i * 23) * W + Math.sin(t / 14 + i) * 16 * depth;
      const y = noise(i * 31) * H + Math.cos(t / 18 + i) * 11 * depth;
      ctx.globalAlpha = (quiet ? .08 : .18) * depth;
      ctx.fillStyle = i % 7 ? '#9bb7ba' : '#83d2d4';
      ctx.beginPath(); ctx.arc(x, y, .7 + depth, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
