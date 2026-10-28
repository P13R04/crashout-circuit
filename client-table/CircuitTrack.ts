import type { TrackGeometry } from '../server/types.js';
import { visibleTrackEdges } from '../client-shared/trackVisibility.js';
import { noise } from './neon.js';
import type { CircuitTheme } from './themes.js';

type Ctx = CanvasRenderingContext2D;
/** Three materials, exact shared road geometry. Deck/texture/curbs rebuild only on deformation. */
export class CircuitTrack {
  private layer: HTMLCanvasElement | null = null;
  private version = -1;
  private edges: Path2D[] = [];
  builds = 0;
  constructor(private theme: CircuitTheme) {}

  draw(ctx: Ctx, track: TrackGeometry, version: number, time: number, reduced: boolean): void {
    if (!this.layer || this.layer.width !== ctx.canvas.width || this.layer.height !== ctx.canvas.height || version !== this.version) {
      this.layer ??= document.createElement('canvas');
      this.layer.width = ctx.canvas.width; this.layer.height = ctx.canvas.height;
      const c = this.layer.getContext('2d')!; c.scale(this.layer.width / 1920, this.layer.height / 1080);
      const visible = visibleTrackEdges(track);
      this.edges = [track.outerEdge, track.innerEdge].map((edge, bank) => {
        const path = new Path2D();
        edge.forEach((p, i) => {
          const j = (i + 1) % edge.length;
          if (!visible[bank][i] || !visible[bank][j]) return;
          if (!i || !visible[bank][i - 1]) path.moveTo(p.x, p.y);
          path.lineTo(edge[j].x, edge[j].y);
        });
        return path;
      });
      this.paint(c, track); this.version = version; this.builds++;
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.layer, 0, 0); ctx.restore();
    // Plastic edge reflectors only: F1 paint and mud never become moving neon rails.
    if (this.theme === 'toy') {
      ctx.save(); ctx.strokeStyle = '#fff6bd'; ctx.lineWidth = 2; ctx.globalAlpha = .55;
      ctx.setLineDash([6, 280]); ctx.lineDashOffset = reduced ? 0 : -time * .028;
      this.edges.forEach(p => ctx.stroke(p)); ctx.restore();
    }
  }

  private band(ctx: Ctx, track: TrackGeometry, color: string | CanvasGradient, extra = 0): void {
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    track.centerline.forEach((p, i, c) => {
      const j = (i + 1) % c.length;
      ctx.lineWidth = Math.max(1, (track.widths[i] + track.widths[j]) / 2 + extra);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(c[j].x, c[j].y); ctx.stroke();
    });
  }

  private paint(ctx: Ctx, track: TrackGeometry): void {
    const toy = this.theme === 'toy', mud = this.theme === 'mayhem';
    ctx.save(); ctx.translate(0, toy ? 10 : 5); this.band(ctx, track, '#00000070', toy ? 14 : 24); ctx.restore();
    this.band(ctx, track, toy ? '#b55629' : mud ? '#211b16' : '#b8ada0', toy ? 10 : 18);
    const road = ctx.createLinearGradient(250, 180, 1500, 980);
    const colors = toy ? ['#426888', '#284e70', '#355d7d'] : mud ? ['#6a5541', '#493e30', '#61513d'] : ['#454c4d', '#333c40', '#3c4446'];
    colors.forEach((color, i) => road.addColorStop(i / 2, color)); this.band(ctx, track, road);
    // Each mark is inside its own local ribbon. Deterministic, cached, and aligned with travel.
    track.centerline.forEach((p, i, c) => {
      const q = c[(i + 1) % c.length], dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
      if (len < .01) return;
      const nx = -dy / len, ny = dx / len, half = track.widths[i] / 2;
      if (toy && i % 14 === 0) {
        ctx.strokeStyle = '#b0d2e42e'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x - nx * (half - 9), p.y - ny * (half - 9)); ctx.lineTo(p.x + nx * (half - 9), p.y + ny * (half - 9)); ctx.stroke();
      }
      if (!toy) {
        for (let lane = 0; lane < (mud ? 4 : 2); lane++) {
          const off = (noise(i * 31 + lane * 97) - .5) * Math.max(0, half * 2 - 24);
          ctx.strokeStyle = mud ? (lane % 2 ? '#b0a28c26' : '#241c1660') : '#b8c2c20d'; ctx.lineWidth = mud ? 2 + noise(i * 7) * 3 : .8;
          ctx.beginPath(); ctx.moveTo(p.x + nx * off, p.y + ny * off); ctx.lineTo(q.x + nx * off, q.y + ny * off); ctx.stroke();
        }
        if (mud && i % 29 === 0) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(dy, dx));
          ctx.fillStyle = '#142a2a55'; ctx.beginPath(); ctx.ellipse(0, 0, 13 + noise(i) * 18, Math.max(1, Math.min(half - 12, 9)), 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#b1b5a52c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(-3, -2, 9, 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
      }
    });
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (const edge of this.edges) {
      ctx.setLineDash([]); ctx.lineWidth = toy ? 10 : mud ? 6 : 12;
      ctx.strokeStyle = toy ? '#f7b530' : mud ? '#9f8152' : '#deded4'; ctx.stroke(edge);
      ctx.strokeStyle = toy ? '#f67549' : mud ? '#41392b' : '#c7473f';
      ctx.setLineDash(toy ? [44, 44] : mud ? [16, 60] : [20, 20]); ctx.stroke(edge); ctx.setLineDash([]);
      ctx.lineWidth = toy ? 1.7 : 1.2; ctx.strokeStyle = toy ? '#fff4bd90' : mud ? '#d9c39f40' : '#ffffff90'; ctx.stroke(edge);
    }
    // Quiet centre dots for toys, paired worn wheel ruts for the dirt oval.
    if (toy) {
      ctx.strokeStyle = '#b7deef30'; ctx.lineWidth = 2; ctx.setLineDash([3, 29]);
      ctx.beginPath(); track.centerline.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    }
    this.finish(ctx, track);
  }

  private finish(ctx: Ctx, track: TrackGeometry): void {
    const sl = track.startLine;
    let nearest = 0;
    track.centerline.forEach((p, i) => { if (Math.hypot(p.x - sl.pos.x, p.y - sl.pos.y) < Math.hypot(track.centerline[nearest].x - sl.pos.x, track.centerline[nearest].y - sl.pos.y)) nearest = i; });
    const half = track.widths[nearest] / 2, n = Math.max(2, Math.ceil(half * 2 / 10)), size = half * 2 / n;
    ctx.save(); ctx.translate(sl.pos.x, sl.pos.y); ctx.rotate(Math.atan2(sl.normal.y, sl.normal.x));
    ctx.fillStyle = '#171f23'; ctx.fillRect(-half, -12, half * 2, 24);
    for (let x = 0; x < n; x++) for (let row = 0; row < 2; row++) {
      ctx.fillStyle = (x + row) % 2 ? '#252b2c' : this.theme === 'mayhem' ? '#d3b889' : '#fff5dc';
      ctx.fillRect(-half + x * size, -10 + row * 10, size, 10);
    }
    if (this.theme === 'classic') {
      ctx.strokeStyle = '#eeeece99'; ctx.lineWidth = 1.5;
      for (let row = 1; row < 4; row++) for (const side of [-1, 1]) {
        const x = side * half * .46, y = 30 + row * 36;
        ctx.beginPath(); ctx.moveTo(x - 13, y + 18); ctx.lineTo(x - 13, y); ctx.lineTo(x + 13, y); ctx.lineTo(x + 13, y + 18); ctx.stroke();
      }
    }
    ctx.restore();
  }
}
