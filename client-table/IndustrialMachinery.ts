import { indexedRotation, pressStroke } from './IndustrialMotion.js';
import { glow, noise } from './neon.js';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
export interface Machine { x: number; y: number; size: number; kind: 'gear' | 'press' | 'turbine'; phase: number; depth: number; angle: number; }
/** Deliberately composed around the arena. All silhouettes and motion lie in the table plane. */
export const MACHINES: readonly Machine[] = [
  { x: 270, y: 430, size: 108, kind: 'gear', phase: .17, depth: 1, angle: -.3 },
  { x: 1540, y: 370, size: 124, kind: 'turbine', phase: .56, depth: 0, angle: .12 },
  { x: 1170, y: 860, size: 94, kind: 'gear', phase: .63, depth: 1, angle: .4 },
  { x: 1120, y: 540, size: 85, kind: 'press', phase: .31, depth: 0, angle: -.18 },
  { x: 1570, y: 770, size: 90, kind: 'press', phase: .8, depth: 1, angle: -.35 },
  { x: 745, y: 490, size: 76, kind: 'turbine', phase: .34, depth: 0, angle: -.2 },
];

/** These are raster parts, rotated/transformed each frame, not redrawn gear geometry. */
export class IndustrialMachinery {
  private parts = new Map<string, HTMLCanvasElement>();
  private part(kind: 'gear' | 'pinion' | 'turbine' | 'frame' | 'ram' | 'housing'): HTMLCanvasElement {
    const cached = this.parts.get(kind); if (cached) return cached;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 320;
    const c = canvas.getContext('2d')!; c.translate(160, 160);
    if (kind === 'gear' || kind === 'pinion' || kind === 'turbine') {
      if (kind !== 'turbine') {
        const teeth = kind === 'pinion' ? 12 : 24;
        c.beginPath();
        for (let i = 0; i < teeth * 4; i++) {
          const a = i / (teeth * 4) * TAU, r = i % 4 === 1 || i % 4 === 2 ? 139 : 128;
          if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r); else c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath();
        const metal = c.createLinearGradient(-100, -100, 100, 100);
        metal.addColorStop(0, '#566366'); metal.addColorStop(.5, '#29393e'); metal.addColorStop(1, '#15242a');
        c.fillStyle = metal; c.fill(); c.strokeStyle = '#77858266'; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = '#0a161b'; c.beginPath(); c.arc(0, 0, 106, 0, TAU); c.fill();
      }
      for (let i = 0; i < (kind !== 'turbine' ? 6 : 11); i++) {
        c.save(); c.rotate(i / (kind !== 'turbine' ? 6 : 11) * TAU);
        const metal = c.createLinearGradient(10, -10, 110, 20);
        metal.addColorStop(0, '#4c5c60'); metal.addColorStop(1, '#1d3038'); c.fillStyle = metal;
        c.beginPath(); c.moveTo(16, -10);
        if (kind !== 'turbine') { c.lineTo(115, -13); c.lineTo(115, 10); c.lineTo(16, 10); }
        else { c.quadraticCurveTo(100, -64, 130, 2); c.lineTo(83, 18); c.quadraticCurveTo(50, -2, 16, 10); }
        c.closePath(); c.fill(); c.strokeStyle = '#a0aaa33a'; c.lineWidth = 1; c.stroke();
        c.restore();
      }
      c.fillStyle = '#33454c'; c.beginPath(); c.arc(0, 0, 27, 0, TAU); c.fill();
      c.fillStyle = '#86918a'; c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill();
      c.strokeStyle = '#17262b'; c.lineWidth = 3; c.beginPath(); c.moveTo(-7, -3); c.lineTo(7, 3); c.stroke();
      // Oil staining, scratches and a few exposed brass teeth, baked once into the part.
      for (let i = 0; i < 160; i++) {
        const a = noise(i * 7) * TAU, r = 30 + noise(i * 11) * 82;
        c.strokeStyle = i % 9 ? '#d6d4ba10' : '#a17c4955'; c.lineWidth = .5 + noise(i) * 1.2;
        c.beginPath(); c.moveTo(Math.cos(a) * r, Math.sin(a) * r); c.lineTo(Math.cos(a + .03) * (r + 3), Math.sin(a + .03) * (r + 3)); c.stroke();
      }
    } else if (kind === 'housing') {
      c.fillStyle = '#030b10'; c.beginPath(); c.arc(0, 0, 148, 0, TAU); c.fill();
      const rim = c.createLinearGradient(-140, -140, 140, 140);
      rim.addColorStop(0, '#66757266'); rim.addColorStop(.4, '#253e4566'); rim.addColorStop(1, '#0d212a');
      c.strokeStyle = rim; c.lineWidth = 9; c.beginPath(); c.arc(0, 0, 141, 0, TAU); c.stroke();
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU, x = Math.cos(a) * 141, y = Math.sin(a) * 141;
        c.fillStyle = '#020b10'; c.beginPath(); c.arc(x, y, 3.4, 0, TAU); c.fill();
        c.fillStyle = '#7d898044'; c.fillRect(x - 1, y - 1, 2, 2);
      }
    } else if (kind === 'frame') {
      c.fillStyle = '#02090d'; c.fillRect(-114, -75, 228, 150);
      const metal = c.createLinearGradient(-120, -80, 120, 80);
      metal.addColorStop(0, '#38494e'); metal.addColorStop(.4, '#182b32'); metal.addColorStop(1, '#3d4d4e');
      c.fillStyle = metal; c.fillRect(-113, -73, 226, 20); c.fillRect(-113, 53, 226, 20);
      c.fillStyle = '#66716d'; c.fillRect(-109, -52, 9, 105); c.fillRect(100, -52, 9, 105);
      c.fillStyle = '#293e45'; c.fillRect(-116, -24, 35, 48); c.fillRect(81, -24, 35, 48);
      c.strokeStyle = '#bdc0a32b'; c.lineWidth = 1; c.strokeRect(-111, -72, 222, 144);
      for (let x = -96; x <= 96; x += 32) {
        c.fillStyle = '#727970'; c.fillRect(x, -67, 3, 3); c.fillRect(x, 62, 3, 3);
      }
      c.strokeStyle = '#826c4955'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(-112, 37); c.lineTo(-140, 37); c.lineTo(-140, -99); c.lineTo(130, -99); c.stroke();
    } else {
      const metal = c.createLinearGradient(0, -40, 0, 40);
      metal.addColorStop(0, '#74827b'); metal.addColorStop(.18, '#384d53'); metal.addColorStop(.7, '#1c3039'); metal.addColorStop(1, '#566365');
      c.fillStyle = metal; c.fillRect(-56, -46, 112, 92);
      c.fillStyle = '#0c1b23'; c.fillRect(-52, -39, 104, 78);
      c.fillStyle = '#40555a'; c.fillRect(-46, -34, 92, 68);
      c.strokeStyle = '#8c806955'; c.lineWidth = 3;
      for (let i = -30; i <= 30; i += 10) { c.beginPath(); c.moveTo(-38, i); c.lineTo(38, i - 5); c.stroke(); }
    }
    this.parts.set(kind, canvas); return canvas;
  }

  draw(ctx: Ctx, time: number, depth: number, quiet: boolean): void {
    for (const machine of MACHINES) {
      if (machine.depth !== depth) continue;
      const m = machine, r = m.size;
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.angle);
      ctx.globalAlpha *= quiet ? .38 : .7;
      if (m.kind === 'press') {
        ctx.drawImage(this.part('frame'), -r * 1.5, -r * 1.5, r * 3, r * 3);
        const stroke = pressStroke(time, 6100 + m.phase * 900, m.phase), gap = 65 - stroke * 42;
        // Polished piston rods, opposed jaws and a brief cyan pressure indicator.
        for (const side of [-1, 1]) {
          ctx.fillStyle = '#717e79'; ctx.fillRect(side < 0 ? -r : gap * r / 140, -5, (140 - gap) * r / 140, 10);
          ctx.save(); ctx.translate(side * gap * r / 140, 0); ctx.scale(side, 1);
          ctx.drawImage(this.part('ram'), -r * .6, -r, r * 2, r * 2); ctx.restore();
        }
        const pulse = .16 + stroke * .65;
        ctx.strokeStyle = '#71d3d4'; ctx.lineWidth = 1.5; ctx.globalAlpha *= pulse;
        ctx.beginPath(); ctx.moveTo(-r * .7, -r * .77); ctx.lineTo(r * .7, -r * .77); ctx.stroke();
        glow(ctx, 0, -r * .77, 50, '#68cbd2', stroke * .35);
      } else {
        ctx.drawImage(this.part('housing'), -r * 1.18, -r * 1.18, r * 2.36, r * 2.36);
        ctx.save();
        const angle = m.kind === 'gear' ? indexedRotation(time, 3700 + m.phase * 1600, m.phase) : time * .00014 * (m.phase > .4 ? -1 : 1);
        ctx.rotate(angle); ctx.drawImage(this.part(m.kind), -r, -r, r * 2, r * 2); ctx.restore();
        if (m.kind === 'gear') {
          // Smaller meshed wheel counter-rotates, preserving the tooth velocity ratio.
          ctx.save(); ctx.translate(r * 1.24, r * .4); ctx.rotate(-angle * 2 + .14);
          ctx.drawImage(this.part('pinion'), -r * .5, -r * .5, r, r); ctx.restore();
        }
        // Stationary braces in front of the moving rotor establish real mechanical layers.
        ctx.strokeStyle = '#1b3038'; ctx.lineWidth = 5;
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-r * .8, side * r * .77); ctx.lineTo(r * .8, side * r * .77); ctx.stroke(); }
        const pulse = .35 + .2 * Math.sin(time / 1900 + m.phase * TAU);
        glow(ctx, -r * .7, -r * .73, 32, '#69d6dc', pulse * .4);
        ctx.fillStyle = '#70c5c9'; ctx.fillRect(-r * .74, -r * .76, 7, 2);
      }
      ctx.restore();
    }
  }
}
