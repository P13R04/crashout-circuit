import type { Car, GameState, Team } from '../server/types.js';
import type { Effect } from './view.js';
import { TEAM_COLOR } from './view.js';
import { glow, NEON, plate } from './neon.js';
import type { ThemeId, CircuitTheme } from './themes.js';
import { TrailBuffer, TRAIL_LIFE_MS } from './VisualMotion.js';

type Ctx = CanvasRenderingContext2D;

/** Bodies are cached at 3×; dynamic light and trails stay in world coordinates. */
export class NeonVehicles {
  constructor(private theme: ThemeId = 'neon', private fallen = new Set<Team>()) {}
  private bodies = new Map<Team, HTMLCanvasElement>();
  private trails = { A: new TrailBuffer(), B: new TrailBuffer() };
  get trailPoints(): number { return this.trails.A.points.length + this.trails.B.points.length; }
  clearTrails(): void { this.trails.A.clear(); this.trails.B.clear(); }
  clear(): void { this.clearTrails(); this.fallen.clear(); }

  drawTrails(ctx: Ctx, state: GameState, time: number, serverNow: number, reduced: boolean): void {
    for (const team of ['A', 'B'] as const) {
      const car = state.cars[team], trail = this.trails[team];
      if (reduced) { trail.clear(); continue; }
      const boosted = car.boostUntil > serverNow;
      const rear = { x: car.pos.x - Math.cos(car.angle) * 11, y: car.pos.y - Math.sin(car.angle) * 11 };
      trail.add(rear, time, boosted, state.phase === 'RACE' && !car.disabled && Math.abs(car.speed) > 12);
      const pts = trail.points;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // Six age bands, two strokes each: no blur and no gradient per segment.
      for (let band = 0; band < 6; band++) {
        const alpha = (1 - band / 6) ** 1.5;
        ctx.beginPath();
        let energy = false;
        for (let i = 1; i < pts.length; i++) {
          const age = time - pts[i].t;
          if (Math.min(5, Math.floor(age / TRAIL_LIFE_MS * 6)) !== band) continue;
          energy ||= pts[i].boosted;
          const a=pts[i-1],b=pts[i];
          if(this.theme==='classic'||this.theme==='mayhem'){
            const size=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/size,ny=(b.x-a.x)/size;
            for(const side of [-1,1]){ctx.moveTo(a.x+nx*6*side,a.y+ny*6*side);ctx.lineTo(b.x+nx*6*side,b.y+ny*6*side);}
          }else{ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
        }
        ctx.strokeStyle = this.theme==='mayhem'?'#211a14':this.theme==='classic'?'#101a1a':TEAM_COLOR[team];
        ctx.globalAlpha = alpha * (energy ? .12 : .045); ctx.lineWidth = energy ? 12 : 6; ctx.stroke();
        ctx.globalAlpha = alpha * (energy ? .7 : .27); ctx.lineWidth = energy ? 3 : this.theme==='mayhem'?4:1.5; ctx.stroke();
        if(energy&&(this.theme==='classic'||this.theme==='mayhem')){ctx.strokeStyle=TEAM_COLOR[team];ctx.globalAlpha=alpha*.35;ctx.lineWidth=1.5;ctx.stroke();}
      }
      ctx.restore();
    }
  }

  private body(team: Team): HTMLCanvasElement {
    let canvas = this.bodies.get(team);
    if (canvas) return canvas;
    canvas = document.createElement('canvas'); canvas.width = canvas.height = 192;
    const c = canvas.getContext('2d')!; c.scale(3, 3); c.translate(32, 32);
    const color = TEAM_COLOR[team];
    c.lineWidth = 1; c.lineJoin = 'round';
    if (this.theme === 'scrap') {
      // Armoured salvage racer, seen from above. Same nose/width envelope as the neon chassis.
      for (const y of [-8, 4]) {
        plate(c, -10, y, 7, 4, 1, '#060c10', '#526469');
        plate(c, 5, y, 6, 4, 1, '#060c10', '#526469');
        c.strokeStyle = '#899c9d'; c.lineWidth = .5;
        for (const x of [-9, -6, 6, 9]) { c.beginPath(); c.moveTo(x, y + 1); c.lineTo(x, y + 3); c.stroke(); }
      }
      const armour = c.createLinearGradient(-10, -6, 12, 7);
      armour.addColorStop(0, '#7c8c8b'); armour.addColorStop(.3, '#50636b'); armour.addColorStop(1, '#263a44');
      c.fillStyle = armour; c.strokeStyle = '#9aaead88'; c.lineWidth = .55;
      c.beginPath(); c.moveTo(14, 0); c.lineTo(9, -5.5); c.lineTo(-10, -6); c.lineTo(-12, -3);
      c.lineTo(-12, 4); c.lineTo(6, 6); c.closePath(); c.fill(); c.stroke();
      plate(c, -10, -5, 8, 10, 1, '#34434b');
      plate(c, -4, -4, 8, 8, 1, '#14262c', '#94b2b9');
      c.fillStyle = '#75c7d4'; c.fillRect(-2, -3, 5, 1.2);
      c.fillStyle = color; c.fillRect(-9, -1.5, 21, 3);
      c.beginPath(); c.moveTo(6, -4.5); c.lineTo(13, 0); c.lineTo(6, 4.5); c.closePath(); c.fill();
      for (const y of [-4.5, 3.2]) plate(c, -14, y, 4, 2, .6, '#b3e5e5', color);
      c.fillStyle = '#edffff'; c.fillRect(9, -4, 2.5, 1.3); c.fillRect(9, 2.7, 2.5, 1.3);
      c.fillStyle = '#e2eeeb'; for (const x of [-8, 5]) for (const y of [-4.4, 4]) c.fillRect(x, y, .8, .8);
      // A bolted spare plate on one side makes the salvage construction deliberate.
      plate(c, -6, 2, 7, 3, .4, '#53656b');
      this.bodies.set(team, canvas); return canvas;
    }
    if(this.theme!=='neon'){this.racerBody(c,team,this.theme);this.bodies.set(team,canvas);return canvas;}
    // A compact twin-reactor chassis; its visible nose retains the original 14 px reach.
    c.beginPath(); c.moveTo(14, 0); c.lineTo(8, -6); c.lineTo(-8, -6); c.lineTo(-13, -3);
    c.lineTo(-11, 0); c.lineTo(-13, 3); c.lineTo(-8, 6); c.lineTo(8, 6); c.closePath();
    c.fillStyle = '#14283c'; c.fill(); c.strokeStyle = color; c.stroke();
    for (const y of [-8, 5]) {
      plate(c, -10, y, 17, 3, 1, '#24394f', color);
      plate(c, -13, y, 4, 3, .6, color);
    }
    plate(c, -5, -3.5, 10, 7, 2, '#071423', '#81b0c2');
    c.fillStyle = color; c.beginPath(); c.moveTo(6, -3); c.lineTo(12, 0); c.lineTo(6, 3); c.closePath(); c.fill();
    c.strokeStyle = '#e8fcff'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(8, -4); c.lineTo(11, -2); c.moveTo(8, 4); c.lineTo(11, 2); c.stroke();
    c.fillStyle = '#e8fcff';
    if (team === 'A') { c.beginPath(); c.moveTo(-7, -1.8); c.lineTo(-5, 0); c.lineTo(-7, 1.8); c.lineTo(-9, 0); c.closePath(); c.fill(); }
    else { c.fillRect(-9, -2, 1, 4); c.fillRect(-6.5, -2, 1, 4); }
    this.bodies.set(team, canvas); return canvas;
  }

  private racerBody(c:Ctx,team:Team,theme:CircuitTheme):void {
    const color=TEAM_COLOR[team],toy=theme==='toy',classic=theme==='classic';
    // All silhouettes retain the same collision envelope and a readable forward nose.
    for(const x of [-8,6])for(const y of [-9,5]){
      plate(c,x-3,y,6,4,toy?1.8:.6,'#081318',toy?'#425161':'#727973');
      c.fillStyle='#182529';c.fillRect(x-2,y+1,4,1);
    }
    if(classic){
      plate(c,-12,-8,3,16,.3,color,'#c6edf0'); // rear wing
      plate(c,9,-8,3,16,.3,'#cdd7d4',color); // front wing
      c.strokeStyle='#9aadaa';c.lineWidth=.8;
      c.beginPath();for(const x of [-7,6]){c.moveTo(x,-7);c.lineTo(x,7);}c.stroke();
      c.fillStyle=color;c.strokeStyle='#d1ffffaa';c.lineWidth=.5;
      c.beginPath();c.moveTo(14,0);c.lineTo(5,-2.5);c.lineTo(1,-5);c.lineTo(-9,-5);c.lineTo(-11,0);c.lineTo(-9,5);c.lineTo(1,5);c.lineTo(5,2.5);c.closePath();c.fill();c.stroke();
      plate(c,-7,-3.2,8,6.4,2.5,'#071317','#7d9f9f');
      c.fillStyle='#f3e6be';c.beginPath();c.arc(-3,0,2,0,Math.PI*2);c.fill();
      c.strokeStyle='#dcf8ee';c.lineWidth=.7;c.beginPath();c.moveTo(-3,-3);c.lineTo(2,0);c.lineTo(-3,3);c.stroke(); // halo
      c.fillStyle='#f7f4dc';c.fillRect(5,-.7,7,1.4);
    }else if(toy){
      const plastic=c.createLinearGradient(0,-6,0,6);plastic.addColorStop(0,'#ddf9ed');plastic.addColorStop(.18,color);plastic.addColorStop(1,'#23707b');
      plate(c,-12,-6.5,25,13,4,plastic,color);
      plate(c,-5,-5,9,10,3,'#163e55','#c0ebe8');
      c.fillStyle='#91c7ce';c.fillRect(-3,-3,5,1.7);c.fillRect(-3,2,5,1.3);
      c.fillStyle='#fff2c6';c.fillRect(5,-1.3,7,2.6);c.fillRect(-11,-1.3,5,2.6);
      plate(c,-12,-8,3,16,1.4,color,'#edffff');
      c.fillStyle='#fff5ca';for(const y of [-4,3])c.fillRect(10,y,3,1);
      c.strokeStyle='#ffffff77';c.lineWidth=.6;c.beginPath();c.moveTo(-10,-5);c.lineTo(8,-5);c.stroke();
    }else{
      plate(c,-13,-6.5,26,13,1.6,'#73604a','#ae8b60');
      c.fillStyle=color;c.fillRect(-11,-5.8,20,3.2);c.fillRect(-11,3,20,2.8);
      plate(c,-6,-4.5,10,9,1,'#151e20','#9c9880');
      c.strokeStyle='#baa883';c.lineWidth=.8;
      for(const d of [-1,1]){c.beginPath();c.moveTo(-5,d*3.5);c.lineTo(3,-d*3.5);c.stroke();}
      plate(c,5,-4,7,8,.2,'#967455','#bd976d');
      c.strokeStyle='#3c3024';c.lineWidth=1;for(let i=0;i<3;i++){c.beginPath();c.moveTo(7+i,-3);c.lineTo(7+i,2);c.stroke();}
      plate(c,12,-7,2,14,.5,'#c4ae89','#4e493b'); // welded bullbar
      plate(c,-13,-6,2,12,.5,'#252e2b','#9b8b69');
      c.fillStyle='#d8cbad';for(const x of [-10,10])for(const y of [-5,4])c.fillRect(x,y,.8,.8);
    }
    // One diamond / two bars encode the team even when colour perception differs.
    c.fillStyle='#ffffff';if(team==='A'){c.beginPath();c.moveTo(-9,-1.5);c.lineTo(-7,0);c.lineTo(-9,1.5);c.lineTo(-11,0);c.closePath();c.fill();}
    else{c.fillRect(-10,-1.5,1,3);c.fillRect(-8,-1.5,1,3);}
  }

  draw(ctx: Ctx, car: Car, time: number, serverNow: number, reduced: boolean, effects: Effect[]): void {
    const color = TEAM_COLOR[car.team], boost = car.boostUntil > serverNow;
    const fall = effects.find(e => e.kind === 'fall' && e.team === car.team && car.disabled);
    if (!car.disabled) this.fallen.delete(car.team);
    if (fall) this.fallen.add(car.team);
    let scale = 1, alpha = car.disabled ? .35 : 1, drop = 0;
    if (fall && !reduced) {
      const k = Math.max(0, Math.min(1, (time - fall.start) / fall.dur));
      scale = Math.max(.03, 1 - k * .97); alpha = (1 - k) ** 1.5; drop = k * 32;
    } else if (car.disabled && this.fallen.has(car.team)) return;
    const speed = Math.min(1.7, Math.abs(car.speed) / 260);
    ctx.save(); ctx.translate(car.pos.x, car.pos.y + drop); ctx.rotate(car.angle); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
    ctx.fillStyle = '#00000070'; ctx.beginPath(); ctx.ellipse(1, 4, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
    if (!car.disabled) {
      glow(ctx, 0, 0, 30 + speed * 8, color, boost ? .8 : (this.theme==='neon'||this.theme==='scrap')?.3:.08, .65);
      // Light ahead of the nose makes its heading legible from every edge of the table.
      ctx.fillStyle = '#b8f5ff0a'; ctx.beginPath(); ctx.moveTo(12, -3); ctx.lineTo(43, -14); ctx.lineTo(43, 14); ctx.lineTo(12, 3); ctx.closePath(); ctx.fill();
      const pulse = reduced ? 1 : 1 + .09 * Math.sin(time / 37 + (car.team === 'A' ? 0 : 2));
      const exhaust = (boost ? 18 + speed * 10 : 3 + speed * 9) * pulse;
      if(this.theme==='neon'||this.theme==='scrap')for (const y of [-6.5, 6.5]) {
        glow(ctx, -13 - exhaust * .35, y, exhaust * 1.3 + 6, color, boost ? .6 : .3, .3);
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-12, y - 1.7); ctx.lineTo(-14 - exhaust, y); ctx.lineTo(-12, y + 1.7); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = NEON.white; ctx.lineWidth = boost ? 1.8 : 1;
        ctx.beginPath(); ctx.moveTo(-12, y); ctx.lineTo(-13 - exhaust * .55, y); ctx.stroke();
      }
    }
    if(!car.disabled&&!reduced&&speed>.12&&this.theme!=='neon'&&this.theme!=='scrap'){
      const mud=this.theme==='mayhem',classic=this.theme==='classic';
      for(let i=0;i<6;i++){
        const age=(time/(boost?220:410)+i/6)%1,side=i%2?-1:1;
        ctx.globalAlpha=alpha*(1-age)*(mud?.45:classic?.15:.28);
        ctx.fillStyle=mud?'#b09264':classic?'#e3e9df':color;
        const x=-11-age*(boost?42:23),y=side*(6+age*(mud?12:4));
        ctx.beginPath();ctx.ellipse(x,y,mud?1+age*2:1+age*3,mud?1.3:1+age*1.5,0,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=alpha;
      if(boost&&this.theme!=='classic'){
        ctx.fillStyle=this.theme==='mayhem'?'#ffbe62':color;
        ctx.beginPath();ctx.moveTo(-12,-2);ctx.lineTo(-22-4*Math.sin(time/45),0);ctx.lineTo(-12,2);ctx.fill();
      }
    }
    if (this.theme === 'scrap' && !car.disabled && !reduced && speed > .3) {
      // Short, bounded exhaust wisps. No persistent particle system or full-screen blur.
      for (let i = 0; i < 4; i++) {
        const age = ((time / (boost ? 160 : 250) + i / 4) % 1);
        ctx.fillStyle = `rgba(140,167,176,${(1 - age) * .11})`;
        ctx.beginPath(); ctx.arc(-15 - age * (boost ? 40 : 25), Math.sin(i * 7) * (2 + age * 4), 1 + age * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (car.invulnUntil > serverNow && !car.disabled) {
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha *= .65;
      ctx.beginPath(); ctx.ellipse(0, 0, 20, 13, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.drawImage(this.body(car.team), -32, -32, 64, 64);
    if (car.stunUntil > serverNow) {
      ctx.strokeStyle = NEON.gold; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-5, -12); ctx.lineTo(0, -16); ctx.lineTo(3, -12); ctx.lineTo(8, -16); ctx.stroke();
    }
    ctx.restore();
    if (!car.disabled && car.hp < 100) {
      ctx.save(); ctx.fillStyle = '#020611'; ctx.fillRect(car.pos.x - 15, car.pos.y + 16, 30, 3);
      ctx.fillStyle = car.hp > 30 ? NEON.mint : NEON.danger; ctx.fillRect(car.pos.x - 15, car.pos.y + 16, 30 * car.hp / 100, 3); ctx.restore();
    }
  }
}
