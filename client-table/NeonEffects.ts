import { localToWorld, panelOf, POWER_BTN_LOCAL } from '../server/layout.js';
import type { View } from './view.js';
import { TEAM_COLOR } from './view.js';
import { glow, NEON, noise } from './neon.js';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
/** Feedback has a shape per action, bounded by the client pool; no full-screen flashes. */
export class NeonEffects {
  draw(ctx: Ctx, view: View): void {
    const time = view.visualTime, reduced = view.reducedMotion;
    view.effects = view.effects.filter(e => time - e.start < e.dur);
    for (const e of view.effects) {
      const k = Math.max(0, Math.min(1, (time - e.start) / e.dur)), fade = 1 - k;
      const color = TEAM_COLOR[e.team];
      ctx.save(); ctx.translate(e.x, e.y); ctx.globalAlpha = fade;
      switch (e.kind) {
        case 'pickup': {
          ctx.translate(-e.x, -e.y);
          const to = localToWorld(panelOf(e.team, 'copilot'), POWER_BTN_LOCAL.x + 82, -67);
          const p = reduced ? 1 : 1 - (1 - k) ** 2;
          const bow = Math.sin(p * Math.PI) * 90;
          const x = e.x + (to.x - e.x) * p, y = e.y + (to.y - e.y) * p - bow;
          glow(ctx, x, y, 24, NEON.gold, .75);
          ctx.fillStyle = NEON.white; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
          if (!reduced) {
            ctx.strokeStyle = '#ffce6660'; ctx.lineWidth = 1.5; ctx.beginPath();
            for (let i = 0; i < 7; i++) {
              const u = Math.max(0, p - i * .025), px = e.x + (to.x - e.x) * u, py = e.y + (to.y - e.y) * u - Math.sin(u * Math.PI) * 90;
              if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
            }
            ctx.stroke();
          }
          break;
        }
        case 'itemArmed': case 'itemLost': {
          ctx.translate(-e.x, -e.y);
          const at = localToWorld(panelOf(e.team, 'copilot'), POWER_BTN_LOCAL.x, POWER_BTN_LOCAL.y);
          glow(ctx, at.x, at.y, e.kind === 'itemArmed' ? 85 : 55, NEON.gold, .6 * fade);
          if (e.kind === 'itemLost') {
            ctx.fillStyle = NEON.gold;
            for (let i = 0; i < (reduced ? 3 : 7); i++) {
              ctx.fillRect(at.x + (noise(i * 21) - .5) * 50, at.y + (noise(i * 13) - .5) * 30 + (reduced ? 0 : k * 35), 2, 3);
            }
          }
          break;
        }
        case 'stoneImpact': case 'stoneHit': case 'hit': case 'wallDestroyed': {
          const heavy = e.kind === 'stoneImpact' || e.kind === 'stoneHit';
          const count = reduced ? 4 : heavy ? 16 : 7;
          const reach = heavy ? 80 : 36;
          glow(ctx, 0, 0, heavy ? 100 : 48, heavy ? '#ffb579' : NEON.danger, .85 * fade);
          for (let i = 0; i < count; i++) {
            const a = i / count * TAU + noise(i * 13) * .6;
            const d = reduced ? 13 : 6 + reach * (1 - (1 - k) ** 2) * (.5 + noise(i * 19) * .5);
            const length = 3 + (heavy ? 14 : 7) * fade;
            ctx.strokeStyle = i % 3 ? NEON.gold : NEON.white; ctx.lineWidth = i % 4 ? 1.4 : 2.5;
            ctx.beginPath(); ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
            ctx.lineTo(Math.cos(a) * (d + length), Math.sin(a) * (d + length)); ctx.stroke();
          }
          if (heavy && k < .35) { ctx.globalAlpha *= 1 - k / .35; ctx.strokeStyle = NEON.white; ctx.lineWidth = 2; ctx.strokeRect(-8 - k * 20, -8 - k * 20, 16 + k * 40, 16 + k * 40); }
          break;
        }
        case 'repairDone': {
          glow(ctx, 0, 0, 75, NEON.mint, .7 * fade);
          ctx.strokeStyle = NEON.mint; ctx.lineWidth = 2;
          const radius = reduced ? 24 : 14 + 24 * k;
          for (let i = 0; i < 6; i++) {
            const a = i / 6 * TAU; ctx.beginPath(); ctx.arc(0, 0, radius, a + .1, a + .65); ctx.stroke();
            ctx.fillStyle = NEON.white; ctx.fillRect(Math.cos(a) * radius - 1, Math.sin(a) * radius - 1, 2, 2);
          }
          break;
        }
        case 'boostHit': {
          const car = view.state?.cars[e.team]; if (!car) break;
          ctx.rotate(car.angle); ctx.strokeStyle = NEON.gold; ctx.lineWidth = 1.8;
          for (const y of [-18, -10, 10, 18]) {
            const start = reduced ? -20 : -8 - k * 35;
            ctx.beginPath(); ctx.moveTo(start, y); ctx.lineTo(start - 22 - k * 20, y); ctx.stroke();
          }
          glow(ctx, -15, 0, 55, NEON.gold, .5 * fade); break;
        }
        case 'boostGate': {
          ctx.strokeStyle = NEON.gold; ctx.lineWidth = 1.2;
          for (const side of [-1, 1]) { const x = side * (reduced ? 18 : 10 + k * 50); ctx.beginPath(); ctx.moveTo(x, -20); ctx.lineTo(x, 20); ctx.stroke(); }
          break;
        }
        case 'fall': {
          ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha *= .5;
          ctx.beginPath(); ctx.ellipse(0, 5, 22 * fade, 10 * fade, 0, 0, TAU); ctx.stroke();
          if (!reduced) for (let i = 0; i < 5; i++) { ctx.fillStyle = color; ctx.fillRect((noise(i * 23) - .5) * 30, 5 + k * 45 + i * 3, 1.5, 4); }
          break;
        }
        case 'carDisabled': {
          glow(ctx, 0, 0, 42, NEON.danger, .5 * fade); break;
        }
        case 'trackDeformed': {
          ctx.strokeStyle = '#a4e8f290'; ctx.lineWidth = 1.2;
          const d = reduced ? 15 : 12 + k * 34;
          for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * d, -13); ctx.lineTo(side * (d + 5), 0); ctx.lineTo(side * d, 13); ctx.stroke(); }
          break;
        }
        case 'checkpoint': {
          const sl = view.state?.track?.startLine;
          if (sl && Math.hypot(sl.pos.x - e.x, sl.pos.y - e.y) < 35) {
            glow(ctx, 0, 0, 100, NEON.ice, .35 * fade);
            ctx.strokeStyle = '#d5f9ff80'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-25, 0); ctx.lineTo(25, 0); ctx.stroke();
          }
          break;
        }
      }
      ctx.restore();
    }
  }
}
