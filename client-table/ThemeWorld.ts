import type { CircuitTheme } from './themes.js';
import { noise, plate } from './neon.js';
import { indexedRotation } from './IndustrialMotion.js';
type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** Top-down worlds. Raster scenery, reusable props and a fixed count of live details. */
export class ThemeWorld {
  private layer: HTMLCanvasElement | null = null;
  private rotor: HTMLCanvasElement | null = null;
  private vapour: HTMLCanvasElement | null = null;
  constructor(private theme: CircuitTheme) {}

  draw(ctx: Ctx, time: number, reduced: boolean, mapping: boolean): void {
    if (!this.layer) this.prepare();
    ctx.drawImage(this.layer!, 0, 0, 1920, 1080);
    const t = reduced ? 0 : time;
    ctx.save(); ctx.globalAlpha = mapping ? .27 : .68;
    if (this.theme === 'toy') this.toys(ctx, t);
    else if (this.theme === 'classic') this.paddock(ctx, t);
    else this.scrapyard(ctx, t);
    ctx.restore();
    if (mapping) { ctx.fillStyle = '#07141b66'; ctx.fillRect(0, 0, 1920, 1080); }
  }

  private prepare(): void {
    const toy = this.theme === 'toy', f1 = this.theme === 'classic';
    this.layer = document.createElement('canvas'); this.layer.width = 960; this.layer.height = 540;
    const c = this.layer.getContext('2d')!; c.scale(.5, .5);
    const base = c.createLinearGradient(0, 0, 1700, 1080);
    base.addColorStop(0, toy ? '#1b6269' : f1 ? '#324c3c' : '#2d2923');
    base.addColorStop(1, toy ? '#103f51' : f1 ? '#203d33' : '#151d1c');
    c.fillStyle = base; c.fillRect(0, 0, 1920, 1080);
    if (toy) {
      // A moulded play mat, with scattered construction pieces instead of a neon grid.
      for (let i = 0; i < 34; i++) {
        const x = noise(i * 43) * 1920, y = noise(i * 67 + 2) * 1080;
        c.save(); c.translate(x, y); c.rotate(noise(i * 11) * TAU);
        const w = 28 + noise(i * 17) * 70;
        plate(c, -w / 2 + 2, -14 + 5, w, 28, 7, '#001f2d80');
        plate(c, -w / 2, -14, w, 28, 7, ['#368c91', '#9b6940', '#756a87', '#376f97'][i % 4], '#ffffff15');
        for (let x = -w / 2 + 12; x < w / 2 - 5; x += 19) {
          c.fillStyle = '#000f2330'; c.beginPath(); c.arc(x, 1, 5, 0, TAU); c.fill();
          c.strokeStyle = '#ffffff20'; c.beginPath(); c.arc(x, -1, 5, Math.PI, TAU); c.stroke();
        }
        c.restore();
      }
      for (let i = 0; i < 100; i++) { c.fillStyle = '#b0f6e507'; c.fillRect(noise(i * 37) * 1920, noise(i * 73) * 1080, 2, 2); }
    } else if (f1) {
      c.save(); c.rotate(-.25); c.fillStyle = '#9aae7710';
      for (let x = -400; x < 2300; x += 120) c.fillRect(x, 0, 60, 1600); c.restore();
      for (let i = 0; i < 140; i++) {
        c.fillStyle = i % 2 ? '#9ead7c12' : '#071c1d20';
        c.fillRect(noise(i * 29) * 1920, noise(i * 53) * 1080, 2 + noise(i) * 5, 2);
      }
      for (const [x, y, rot] of [[660, 250, 0], [1200, 840, Math.PI], [1570, 480, Math.PI / 2]]) {
        c.save(); c.translate(x, y); c.rotate(rot);
        plate(c, -150, -32, 300, 64, 3, '#1b2d30', '#72878555');
        for (let row = 0; row < 4; row++) for (let col = 0; col < 24; col++) {
          c.fillStyle = ['#a7a48755', '#ae5d5550', '#7496a350'][col % 3]; c.fillRect(-143 + col * 12, -25 + row * 13, 7, 5);
        }
        plate(c, -155, -37, 310, 7, 2, '#8b9a8d'); c.restore();
      }
    } else {
      for (let i = 0; i < 65; i++) {
        const x = noise(i * 19) * 1920, y = noise(i * 59) * 1080;
        c.save(); c.translate(x, y); c.rotate(noise(i * 17) * TAU);
        if (i % 3) {
          plate(c, -35, -17, 70, 34, 1, ['#4c4637', '#583d2e', '#33403c'][i % 3], '#98806525');
          c.strokeStyle = '#00000035'; c.lineWidth = 2;
          for (let x = -30; x < 35; x += 8) { c.beginPath(); c.moveTo(x, -15); c.lineTo(x, 15); c.stroke(); }
        } else {
          c.strokeStyle = '#080f10'; c.lineWidth = 7; c.beginPath(); c.arc(0, 0, 18, 0, TAU); c.stroke();
          c.strokeStyle = '#6c64503b'; c.lineWidth = 1.5; c.stroke();
        }
        c.restore();
      }
      for (let i = 0; i < 12; i++) {
        c.fillStyle = '#0b292c45'; c.beginPath(); c.ellipse(noise(i * 47) * 1920, noise(i * 13) * 1080, 30 + noise(i) * 80, 15 + noise(i + 1) * 30, i, 0, TAU); c.fill();
      }
    }
    this.rotor = document.createElement('canvas'); this.rotor.width = this.rotor.height = 160;
    const r = this.rotor.getContext('2d')!; r.translate(80, 80);
    r.strokeStyle = toy ? '#d2b66c' : f1 ? '#809593' : '#695440'; r.fillStyle = toy ? '#bd783f' : '#253331'; r.lineWidth = 6;
    r.beginPath(); r.arc(0, 0, 55, 0, TAU); r.fill(); r.stroke();
    for (let i = 0; i < (toy ? 10 : 6); i++) {
      r.save(); r.rotate(i / (toy ? 10 : 6) * TAU);
      if (toy) plate(r, 46, -8, 19, 16, 3, '#c98b43', '#f4ce7d');
      else { r.fillStyle = f1 ? '#647f7c' : '#8f6b47'; r.beginPath(); r.moveTo(10, -5); r.lineTo(48, -12); r.lineTo(38, 17); r.lineTo(12, 8); r.closePath(); r.fill(); }
      r.restore();
    }
    r.fillStyle = toy ? '#ffe4a0' : '#9d9e83'; r.beginPath(); r.arc(0, 0, 10, 0, TAU); r.fill();
    this.vapour = document.createElement('canvas'); this.vapour.width = this.vapour.height = 128;
    const v = this.vapour.getContext('2d')!, fog = v.createRadialGradient(64, 64, 2, 64, 64, 64);
    fog.addColorStop(0, f1 ? '#061b19' : '#b1aa94'); fog.addColorStop(1, f1 ? '#061b1900' : '#b1aa9400');
    v.fillStyle = fog; v.fillRect(0, 0, 128, 128);
  }

  private spinning(ctx: Ctx, x: number, y: number, angle: number, size: number): void {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.drawImage(this.rotor!, -size / 2, -size / 2, size, size); ctx.restore();
  }

  private toys(ctx: Ctx, t: number): void {
    for (let i = 0; i < 8; i++) this.spinning(ctx, 300 + noise(i * 31) * 1300, 220 + noise(i * 43) * 640, (i % 2 ? -1 : 1) * t / (2600 + i * 200), 45 + noise(i) * 50);
    for (let i = 0; i < 22; i++) {
      const x = noise(i * 71) * 1920 + Math.sin(t / 3600 + i) * 14, y = noise(i * 29) * 1080 + Math.cos(t / 4100 + i) * 10;
      ctx.save(); ctx.translate(x, y); ctx.rotate(i + t / (2100 + i * 100));
      ctx.fillStyle = ['#df8c57', '#e1c459', '#71bda8', '#8d9dcc'][i % 4]; ctx.fillRect(-3, -2, 6, 4); ctx.restore();
    }
    // Three wind-up plungers bob in their housings, fully viewed from above.
    for (let i = 0; i < 3; i++) {
      const x = 450 + i * 470, y = 225 + i % 2 * 610, shift = 8 * Math.sin(t / 900 + i * 2);
      plate(ctx, x - 34, y - 13, 68, 26, 8, '#245260', '#7bb6ad');
      plate(ctx, x - 15 + shift, y - 9, 30, 18, 6, '#d69046', '#f4c76b');
    }
  }

  private paddock(ctx: Ctx, t: number): void {
    // Flag cloth changes shape rather than sliding like a light; shadows drift slowly.
    for (let i = 0; i < 8; i++) {
      const x = 550 + i * 115, y = i % 2 ? 805 : 270, wave = Math.sin(t / 380 + i) * 5;
      ctx.strokeStyle = '#adc0a6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30, y); ctx.stroke();
      ctx.fillStyle = i % 2 ? '#a2b7ab' : '#b35244'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 21, y + wave); ctx.lineTo(x + 20, y + 18 + wave); ctx.lineTo(x, y + 15); ctx.closePath(); ctx.fill();
      if (i % 2) { ctx.fillStyle = '#293d37'; for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) if ((a + b) % 2) ctx.fillRect(x + a * 6, y + b * 7 + wave * a / 3, 6, 7); }
    }
    this.spinning(ctx, 1510, 820, t / 750, 54); this.spinning(ctx, 410, 270, -t / 900, 54);
    const opacity = ctx.globalAlpha;
    ctx.globalAlpha *= .12;
    for (let i = 0; i < 4; i++) { const x = (t * .006 + i * 570) % 2500 - 300, y = 220 + noise(i * 17) * 650; ctx.drawImage(this.vapour!, x - 210, y - 100, 420, 200); }
    ctx.globalAlpha = opacity;
  }

  private scrapyard(ctx: Ctx, t: number): void {
    const opacity=ctx.globalAlpha;
    for (let i = 0; i < 5; i++) {
      const x = 380 + noise(i * 37) * 1180, y = 240 + noise(i * 61) * 620;
      this.spinning(ctx, x, y, indexedRotation(t + i * 1320) * (i % 2 ? -1 : 1), 60 + i * 8);
      // A weld fires intermittently. Six ballistic sparks, no growing particle pool.
      const cycle = (t + i * 730) % 4200;
      if (cycle < 500) {
        const f = cycle / 500; ctx.strokeStyle = '#ffc47b'; ctx.lineWidth = 1.5;
        for (let j = 0; j < 6; j++) {
          const a = j * 2.1 + i, d = 6 + f * (22 + j * 5);
          ctx.globalAlpha = opacity * (1 - f); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d + f * f * 16); ctx.lineTo(x + Math.cos(a) * (d + 6), y + Math.sin(a) * (d + 6) + f * f * 16); ctx.stroke();
        }
        ctx.globalAlpha = opacity;
      }
      // Slow expansion follows the table plane; no vertical code rain.
      const f = ((t / 6100 + i * .21) % 1), size = 60 + f * 100;
      ctx.globalAlpha = opacity * .19 * Math.sin(f * Math.PI);
      ctx.drawImage(this.vapour!, x - size / 2 + f * 32, y - size / 2 - f * 15, size * 1.5, size);
      ctx.globalAlpha = opacity;
    }
    for (let i = 0; i < 4; i++) {
      const f = ((t / 3500 + i * .27) % 1); ctx.globalAlpha = opacity * (1 - f) * .18;
      ctx.strokeStyle = '#a8b3a4'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(420 + noise(i * 41) * 1080, 270 + noise(i * 23) * 540, 8 + f * 26, 4 + f * 13, i, 0, TAU); ctx.stroke();
    }
  }
}
