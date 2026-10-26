import type { GameState, Team, Vec2 } from '../server/types.js';
import type { ThemeId } from './themes.js';
import { drawItemIcon } from './HUD.js';
import { TEAM_COLOR } from './view.js';
import { glow, noise, NEON, plate } from './neon.js';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
function ownerAlpha(state: GameState, team: Team | null, p: Vec2): number {
  if (team === null) return 1;
  const own = state.cars[team].pos;
  return Math.hypot(own.x - p.x, own.y - p.y) < 90 ? .35 : 1;
}
export class NeonObjects {
  constructor(private theme: ThemeId = 'neon') {}
  private get electric(): string { return this.theme === 'scrap' ? '#79e3ef' : NEON.gold; }
  drawPickups(ctx: Ctx, state: GameState, time: number, reduced: boolean): void {
    for (const p of state.pickups) {
      const available = p.respawnAt === 0, color = p.kind === 'slingshot' ? '#ffb08a' : NEON.gold;
      const lift = reduced ? 0 : Math.sin(time / 650 + p.id * 1.7) * 2.5;
      ctx.save(); ctx.globalAlpha = available ? 1 : .16;
      ctx.fillStyle = '#00000050'; ctx.beginPath(); ctx.ellipse(p.pos.x, p.pos.y + 5, 12, 5, 0, 0, TAU); ctx.fill();
      if (available) glow(ctx, p.pos.x, p.pos.y, 34, color, .3, .7);
      ctx.translate(p.pos.x, p.pos.y - 3 + lift);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const x = Math.cos(a) * 16, y = Math.sin(a) * 16; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fillStyle = '#111b2e'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
      drawItemIcon(ctx, p.kind, 0, 0, 9, color);
      if (available) { ctx.fillStyle = NEON.white; ctx.fillRect(-3, -18, 6, 1); }
      ctx.restore();
    }
  }

  drawGates(ctx: Ctx, state: GameState, now: number, time: number, reduced: boolean): void {
    for (const g of state.boostGates) {
      const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, length = Math.hypot(dx, dy) || 1;
      const sign = g.dir && (-dy * g.dir.x + dx * g.dir.y) < 0 ? -1 : 1, depth = g.depth ?? 60;
      const birth = Math.min(1, Math.max(.3, (now - (g.createdAt ?? now - 400)) / 300));
      ctx.save(); ctx.translate(g.a.x, g.a.y); ctx.rotate(Math.atan2(dy, dx));
      ctx.globalAlpha = birth * Math.min(1, Math.max(0, (g.expiresAt - now) / 900));
      const wash = ctx.createLinearGradient(0, 0, 0, sign * depth);
      wash.addColorStop(0, '#ffce6635'); wash.addColorStop(.65, '#ffce6616'); wash.addColorStop(1, '#ffce6605');
      ctx.fillStyle = wash; ctx.fillRect(0, Math.min(0, sign * depth), length, depth);
      ctx.strokeStyle = '#ffce664a'; ctx.lineWidth = 1; ctx.strokeRect(0, Math.min(0, sign * depth), length, depth);
      ctx.strokeStyle = NEON.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length, 0); ctx.stroke();
      const flow = reduced ? .45 : (time / 900) % 1;
      ctx.strokeStyle = '#ffe8af'; ctx.lineWidth = 1.6;
      for (let x = 16; x < length - 8; x += 28) for (let row = 0; row < 2; row++) {
        const f = (flow + row * .5) % 1, y = sign * (7 + f * (depth - 14));
        ctx.globalAlpha *= 1 - f * .35;
        ctx.beginPath(); ctx.moveTo(x - 4, y - sign * 4); ctx.lineTo(x, y + sign * 2); ctx.lineTo(x + 4, y - sign * 4); ctx.stroke();
        ctx.globalAlpha /= 1 - f * .35;
      }
      for (const x of [0, length]) {
        glow(ctx, x, 0, 30, NEON.gold, .5);
        ctx.fillStyle = '#102030'; ctx.strokeStyle = (g.team === null ? this.electric : TEAM_COLOR[g.team]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, 0, 10, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = NEON.gold; ctx.beginPath(); ctx.arc(x, 0, 4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  drawWalls(ctx: Ctx, state: GameState, now: number, time: number, reduced: boolean): void {
    for (const w of state.walls) {
      const disabled = w.disabledUntil > now, length = w.lengthPx;
      ctx.save(); ctx.globalAlpha = ownerAlpha(state, w.team, w.pos); ctx.translate(w.pos.x, w.pos.y); ctx.rotate(w.angle * Math.PI / 180);
      if (disabled) {
        ctx.strokeStyle = '#708194'; ctx.setLineDash([5, 6]); ctx.lineWidth = 2; ctx.strokeRect(-length / 2, -(w.widthPx ?? 12)/2, length, w.widthPx ?? 12); ctx.restore(); continue;
      }
      const width = w.widthPx ?? 12, fringe = w.tolerancePx ?? 0;
      if (fringe) {
        ctx.fillStyle = this.electric + '09'; ctx.strokeStyle = this.electric + '36'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(-length/2-fringe, -width/2-fringe, length+fringe*2, width+fringe*2, fringe); ctx.fill(); ctx.stroke();
      }
      plate(ctx, -length/2, -width/2+4, length, width, 3, '#01060c');
      plate(ctx, -length/2, -width/2, length, width, 3, this.theme === 'scrap' ? '#45565b' : '#26364c', '#829799');
      ctx.save(); ctx.beginPath(); ctx.rect(-length/2+5, -width/2+4, length-10, width-8); ctx.clip();
      ctx.strokeStyle = this.electric + '45'; ctx.lineWidth = 4;
      for(let x=-length/2-width;x<length/2;x+=16){ctx.beginPath();ctx.moveTo(x,-width/2);ctx.lineTo(x+width,width/2);ctx.stroke();}
      ctx.restore();
      if(this.theme === 'scrap'){
        ctx.strokeStyle='#0b171e';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-length/2+7,-3);ctx.quadraticCurveTo(0,12,length/2-7,-3);ctx.stroke();
        ctx.strokeStyle='#b6c5c2';ctx.lineWidth=1.5;ctx.setLineDash([3,3]);ctx.stroke();ctx.setLineDash([]);
      }
      const pulse = reduced ? .8 : .75+.12*Math.sin(time/450);
      ctx.strokeStyle = this.electric;ctx.globalAlpha*=pulse;ctx.lineWidth=2;
      ctx.strokeRect(-length/2+2,-width/2+2,length-4,width-4);
      for(const x of [-length/2+5,length/2-5]){
        plate(ctx,x-3,-width/2+4,6,width-8,1,'#172a36','#aabdbb');
        glow(ctx,x,0,25,this.electric,.4);
        ctx.fillStyle=this.electric;ctx.fillRect(x-1,-width/2+8,2,width-16);
      }
      ctx.restore();
    }
  }

  drawArcs(ctx: Ctx, state: GameState, now: number, time: number, reduced: boolean): void {
    for (const arc of state.arcs) {
      const a = arc.pylon1, b = arc.pylon2, dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ctx.save(); ctx.globalAlpha = ownerAlpha(state, arc.team, mid);
      if (arc.disabledUntil > now) {
        ctx.setLineDash([4, 10]); ctx.lineWidth = 2; ctx.strokeStyle = '#7b8e9d';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore(); continue;
      }
      const tick = reduced ? 0 : time / 90, seed = Math.floor(tick), f = tick - seed, smooth = f * f * (3 - 2 * f);
      const segs = Math.min(42, Math.max(8, Math.ceil(len / 14)));
      ctx.save(); ctx.translate(mid.x, mid.y); ctx.rotate(Math.atan2(dy, dx));
      glow(ctx, 0, 0, len * .6, this.electric, .22, Math.min(.3, 22 / len)); ctx.restore();
      for (let branch = 0; branch < 3; branch++) {
        ctx.beginPath(); ctx.moveTo(a.x, a.y);
        for (let i = 1; i < segs; i++) {
          const u = i / segs, salt = i * 17 + branch * 151 + a.x * .13;
          const n = noise(salt + seed * 11) * (1 - smooth) + noise(salt + (seed + 1) * 11) * smooth;
          const jitter = (n - .5) * (branch ? 42 : 24) * Math.sin(u * Math.PI);
          ctx.lineTo(a.x + dx * u + nx * jitter, a.y + dy * u + ny * jitter);
        }
        ctx.lineTo(b.x, b.y);
        if (!branch) {
          const alpha = ctx.globalAlpha;
          ctx.lineWidth = 16; ctx.strokeStyle = this.electric + '13'; ctx.stroke();
          ctx.lineWidth = 6; ctx.strokeStyle = this.electric + '30'; ctx.stroke();
          ctx.lineWidth = 2.4; ctx.strokeStyle = this.electric; ctx.stroke();
          ctx.lineWidth = .9; ctx.strokeStyle = this.theme === 'scrap' ? '#e9ffff' : '#fff8de'; ctx.globalAlpha = alpha * .9; ctx.stroke(); ctx.globalAlpha = alpha;
        } else { ctx.lineWidth = .8; ctx.strokeStyle = this.electric + '70'; ctx.stroke(); }
      }
      // A charge packet slides along the link; its halo is a small cached texture.
      const u = reduced ? .5 : (time / 1200) % 1;
      glow(ctx, a.x + dx * u, a.y + dy * u, 25, this.electric, .45);
      for (const p of [a, b]) glow(ctx, p.x, p.y, 30, this.electric, .5);
      ctx.restore();
    }
  }

  drawPylons(ctx: Ctx, state: GameState, time: number, reduced: boolean): void {
    for (const t of Object.values(state.tangibles)) {
      if (t.status !== 'placed' || !t.active || t.kind !== 'pylon') continue;
      const x = t.x * state.params.logicalWidth, y = t.y * state.params.logicalHeight;
      ctx.save(); ctx.translate(x, y); const color = this.electric;
      const radius = state.params.pylonFieldRadiusPx, base = state.params.pylonBasePx;
      glow(ctx, 0, 0, radius, color, .24);
      ctx.fillStyle = color+'09'; ctx.strokeStyle = color+'65'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.arc(0,0,radius,0,TAU);ctx.fill();ctx.stroke();
      // Three bounded, deterministic discharges crawl around the ground field.
      const phase = reduced ? 0 : time/1700;
      for(let branch=0;branch<3;branch++){
        const start = phase+branch*TAU/3;ctx.strokeStyle=color+'90';ctx.lineWidth=1.5;ctx.beginPath();
        for(let i=0;i<=9;i++){
          const angle=start+i*.055,r=radius*(.68+.12*noise(branch*43+i*7+Math.floor(reduced?0:time/120)));
          const px=Math.cos(angle)*r,py=Math.sin(angle)*r;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
        }ctx.stroke();
      }
      ctx.rotate(t.angle*Math.PI/180);
      plate(ctx,-base/2,-base/2,base,base,2,'#20353e','#83b2ba');
      ctx.scale(base/40,base/40);
      if (this.theme === 'scrap') {
        // Concentric coils and four terminals have no privileged direction.
        ctx.fillStyle = '#010609bb'; ctx.beginPath(); ctx.arc(2, 3, 20, 0, TAU); ctx.fill();
        glow(ctx, 0, 0, 38, this.electric, .35);
        for (const [r, fill, stroke] of [[18, '#33484e', color], [13, '#839693', '#c8d8d2'], [9, '#11252d', '#496770']] as const) {
          ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
        }
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * TAU; ctx.save(); ctx.rotate(a);
          plate(ctx, 10, -3, 8, 6, 1, '#172d36', '#9bafae');
          ctx.fillStyle = this.electric; ctx.fillRect(12, -1.2, 4, 2.4); ctx.restore();
        }
        glow(ctx, 0, 0, 25, this.electric, reduced ? .5 : .48 + Math.sin(time / 220) * .07);
        ctx.fillStyle = '#b9f8ff'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
        ctx.restore(); continue;
      }
      ctx.fillStyle = '#01050ba0'; ctx.beginPath(); ctx.ellipse(1, 7, 19, 12, 0, 0, TAU); ctx.fill();
      glow(ctx, 0, 0, 34, color, .3);
      ctx.fillStyle = '#17283e'; ctx.strokeStyle = color; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(0, 1, 15, 0, TAU); ctx.fill(); ctx.stroke();
      plate(ctx, -10, -8, 20, 16, 4, '#253b51', '#7195a6');
      ctx.fillStyle = '#0b1b2c'; ctx.strokeStyle = '#a0c0c7'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(0, -7, 10, 7, 0, 0, TAU); ctx.fill(); ctx.stroke();
      glow(ctx, 0, -7, 25, NEON.gold, reduced ? .4 : .4 + .06 * Math.sin(time / 240));
      ctx.fillStyle = NEON.gold; ctx.beginPath(); ctx.arc(0, -7, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff4cf'; ctx.fillRect(-1, -9, 2, 4);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(8, 6); ctx.stroke();
      ctx.restore();
    }
  }
}
