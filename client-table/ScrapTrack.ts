import type { TrackGeometry, Vec2 } from '../server/types.js';
import { steelGrain } from './ScrapMaterials.js';
import { visibleTrackEdges } from './NeonTrack.js';
import { glow, noise } from './neon.js';

type Ctx = CanvasRenderingContext2D;
interface DeckSample extends Vec2 { angle: number; width: number; seed: number; span: number; }

/** Cached steel deck. Only the recessed energy strips are animated each frame. */
export class ScrapTrack {
  private layer: HTMLCanvasElement | null = null;
  private surface: HTMLCanvasElement | null = null;
  private paths: Path2D[] = [];
  private version = -1;
  private lamps: Vec2[] = [];
  builds = 0;

  draw(ctx: Ctx, track: TrackGeometry, version: number, time: number, reduced: boolean): void {
    if (!this.layer || this.layer.width !== ctx.canvas.width || this.layer.height !== ctx.canvas.height || this.version !== version) {
      this.layer ??= document.createElement('canvas'); this.surface ??= document.createElement('canvas');
      for (const layer of [this.layer, this.surface]) { layer.width = ctx.canvas.width; layer.height = ctx.canvas.height; }
      const c = this.layer.getContext('2d')!, s = this.surface.getContext('2d')!;
      for (const target of [c, s]) target.scale(this.layer.width / 1920, this.layer.height / 1080);
      this.paint(c, s, track); this.version = version; this.builds++;
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.layer, 0, 0); ctx.restore();
    ctx.save(); ctx.lineCap = 'butt';
    // Small recessed emitters and one passing energy pulse, leaving the bevel readable.
    ctx.strokeStyle = '#67c8ce'; ctx.globalAlpha = .46; ctx.lineWidth = 1.4; ctx.setLineDash([5, 27]);
    ctx.lineDashOffset = reduced ? 0 : -time * .012;
    for (const path of this.paths) ctx.stroke(path);
    ctx.strokeStyle = '#58dde4'; ctx.globalAlpha = .11; ctx.lineWidth = 11; ctx.setLineDash([20, 490]);
    ctx.lineDashOffset = reduced ? 0 : -time * .06;
    for (const path of this.paths) ctx.stroke(path);
    ctx.strokeStyle = '#b7faff'; ctx.globalAlpha = .85; ctx.lineWidth = 2; ctx.setLineDash([10, 500]);
    for (const path of this.paths) ctx.stroke(path);
    ctx.restore();
    for (const p of this.lamps) glow(ctx, p.x, p.y, 27, '#73e4eb', reduced ? .4 : .38 + Math.sin(time / 510) * .06);
  }

  private band(ctx: Ctx, track: TrackGeometry, color: string | CanvasGradient, extra = 0): void {
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < track.centerline.length; i++) {
      const j = (i + 1) % track.centerline.length, p = track.centerline[i], q = track.centerline[j];
      ctx.lineWidth = (track.widths[i] + track.widths[j]) / 2 + extra;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
  }

  private samples(track: TrackGeometry): DeckSample[] {
    const samples: DeckSample[] = []; let travelled = 0, next = 0;
    const c = track.centerline;
    for (let i = 0; i < c.length; i++) {
      const j = (i + 1) % c.length, p = c[i], q = c[j], d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < .001) continue;
      while (next <= travelled + d) {
        const f = (next - travelled) / d;
        samples.push({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f,
          angle: Math.atan2(q.y - p.y, q.x - p.x), width: track.widths[i] * (1 - f) + track.widths[j] * f, seed: samples.length, span: 62 + noise(samples.length * 5) * 46 });
        next += samples[samples.length - 1].span;
      }
      travelled += d;
    }
    return samples;
  }

  private paint(ctx: Ctx, surface: Ctx, track: TrackGeometry): void {
    const visible = visibleTrackEdges(track);
    this.paths = [track.outerEdge, track.innerEdge].map((edge, e) => {
      const path = new Path2D();
      edge.forEach((p, i) => {
        const j = (i + 1) % edge.length;
        if (!visible[e][i] || !visible[e][j]) return;
        if (!i || !visible[e][i - 1]) path.moveTo(p.x, p.y);
        path.lineTo(edge[j].x, edge[j].y);
      }); return path;
    });
    // Recessed coolant vents cast a faint pool below the platform, reinforcing its height.
    for (const [e, edge] of [track.outerEdge, track.innerEdge].entries()) {
      for (let i = 0; i < edge.length; i += 18) {
        if (!visible[e][i]) continue;
        const p = edge[i], q = track.centerline[i], length = Math.hypot(p.x - q.x, p.y - q.y) || 1;
        glow(ctx, p.x + (p.x - q.x) / length * 12, p.y + (p.y - q.y) / length * 12, 54, '#3cb0c3', .22);
      }
    }
    // Broad contact shadow, deep side wall, lower flange, then the exact drivable upper deck.
    ctx.save(); ctx.translate(4, 18); this.band(ctx, track, '#01040766', 24); ctx.restore();
    ctx.save(); ctx.translate(3, 11); this.band(ctx, track, '#010609', 9); ctx.restore();
    ctx.save(); ctx.translate(2, 7); this.band(ctx, track, '#15262d', 7);
    ctx.strokeStyle = '#57707845'; ctx.lineWidth = 2;
    for (const path of this.paths) ctx.stroke(path); ctx.restore();
    this.band(ctx, track, '#080f13', 5);
    const steel = surface.createLinearGradient(400, 180, 1400, 1000);
    steel.addColorStop(0, '#3d4b52'); steel.addColorStop(.28, '#303d44'); steel.addColorStop(.68, '#27333b'); steel.addColorStop(1, '#35434a');
    this.band(surface, track, steel);
    // Every detail is source-atop the true road union: junctions stay open and nothing extends the road.
    surface.globalCompositeOperation = 'source-atop';
    for (const p of this.samples(track)) {
      const half = p.width / 2;
      surface.save(); surface.translate(p.x, p.y); surface.rotate(p.angle);
      const shade = Math.floor(90 + noise(p.seed + 10) * 55);
      surface.fillStyle = `rgba(${shade},${shade + 7},${shade + 10},.055)`;
      surface.fillRect(2, -half, p.span - 4, p.width);
      // Recessed transverse plate joints, lit on the upper lip.
      surface.rotate((noise(p.seed * 7) - .5) * .08);
      surface.fillStyle = '#02090c65'; surface.fillRect(0, -half, 1.8, p.width);
      surface.fillStyle = '#c7d9db1a'; surface.fillRect(2, -half, .7, p.width);
      surface.strokeStyle = '#07121760'; surface.lineWidth = 1;
      for (const side of [-1, 1]) {
        surface.beginPath(); surface.moveTo(8, side * half * .74); surface.lineTo(66, side * half * .74); surface.stroke();
        // Countersunk fasteners: shadow socket, metal head, small highlight.
        surface.fillStyle = '#091217'; surface.beginPath(); surface.arc(12, side * half * .83, 2.5, 0, Math.PI * 2); surface.fill();
        surface.fillStyle = '#9baeb2'; surface.fillRect(11.5, side * half * .83 - 1.2, 1.6, 1.6);
      }
      // Scarred repair patches occur sparsely; their contrast stays below cars/pickups.
      if (p.seed % 5 === 2) {
        const y = (noise(p.seed * 3) - .5) * half;
        surface.fillStyle = '#101d2455'; surface.fillRect(25, y - 10, 31, 19);
        surface.strokeStyle = '#b2c4c132'; surface.lineWidth = .8; surface.strokeRect(25, y - 10, 31, 19);
        surface.strokeStyle = '#c3d5d127';
        for (let j = 0; j < 4; j++) { surface.beginPath(); surface.moveTo(29 + j * 5, y - 6); surface.lineTo(34 + j * 5, y + 5); surface.stroke(); }
      }
      surface.strokeStyle = '#b4c9cd13'; surface.lineWidth = .6;
      for (let j = 0; j < 6; j++) {
        const x = 7 + noise(p.seed * 17 + j) * 62, y = (noise(p.seed * 23 + j * 3) - .5) * p.width;
        surface.beginPath(); surface.moveTo(x, y); surface.lineTo(x + 4 + noise(j + p.seed) * 17, y + 1); surface.stroke();
      }
      surface.restore();
    }
    const grain = surface.createPattern(steelGrain(), 'repeat');
    if (grain) { surface.fillStyle = grain; surface.fillRect(0, 0, 1920, 1080); }
    // Broad oil blooms and discoloured heat marks break the uniform vector-panel appearance.
    for (const p of this.samples(track).filter(p => p.seed % 4 === 0)) {
      const stain = surface.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.width * .7);
      stain.addColorStop(0, '#06101738'); stain.addColorStop(.45, '#74604808'); stain.addColorStop(1, '#14252d00');
      surface.fillStyle = stain; surface.fillRect(p.x - p.width, p.y - p.width, p.width * 2, p.width * 2);
    }
    surface.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.surface!, 0, 0); ctx.restore();
    // A bevel with directional light makes the steel substantial without implying a guardrail.
    for (const [width, color] of [[4, '#080f13'], [2.5, '#566c74'], [.8, '#849b9f']] as const) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      for (const path of this.paths) ctx.stroke(path);
    }
    for (const [e, edge] of [track.outerEdge, track.innerEdge].entries()) {
      for (let i = 0; i < edge.length; i++) {
        const j = (i + 1) % edge.length;
        if (!visible[e][i] || !visible[e][j]) continue;
        const p = edge[i], q = edge[j], c = track.centerline[i], dx = p.x - c.x, dy = p.y - c.y;
        const light = Math.max(0, -(dx + dy) / (Math.hypot(dx, dy) * 1.42 || 1));
        ctx.strokeStyle = `rgba(230,245,241,${light * .38})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    }
    this.finish(ctx, track);
  }

  private finish(ctx: Ctx, track: TrackGeometry): void {
    const sl = track.startLine;
    let index = 0, nearest = Infinity;
    track.centerline.forEach((p, i) => { const d = Math.hypot(p.x - sl.pos.x, p.y - sl.pos.y); if (d < nearest) { nearest = d; index = i; } });
    const half = track.widths[index] / 2, cells = Math.max(2, Math.ceil(half * 2 / 9)), size = half * 2 / cells;
    ctx.save(); ctx.translate(sl.pos.x, sl.pos.y); ctx.rotate(Math.atan2(sl.normal.y, sl.normal.x));
    ctx.fillStyle = '#101a20'; ctx.fillRect(-half, -13, half * 2, 26);
    for (let x = 0; x < cells; x++) for (let row = 0; row < 2; row++) {
      ctx.fillStyle = (x + row) % 2 ? '#18262c' : '#c6d9d5'; ctx.fillRect(-half + x * size, -9 + row * 9, size, 9);
    }
    for (const side of [-1, 1]) {
      const x = side * (half + 6);
      ctx.fillStyle = '#17242b'; ctx.strokeStyle = '#a8b9b7'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x - 4, -19, 8, 38, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9cecf0'; ctx.fillRect(x - 1.5, -11, 3, 22);
    }
    ctx.restore();
    this.lamps = [-1, 1].map(side => ({ x: sl.pos.x + sl.normal.x * (half + 6) * side, y: sl.pos.y + sl.normal.y * (half + 6) * side }));
  }
}
