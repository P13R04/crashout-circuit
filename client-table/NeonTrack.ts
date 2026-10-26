import type { TrackGeometry, Vec2 } from '../server/types.js';
import { glow, NEON } from './neon.js';

import { visibleTrackEdges } from '../client-shared/trackVisibility.js';
export { visibleTrackEdges } from '../client-shared/trackVisibility.js';

type Ctx = CanvasRenderingContext2D;

/** Static deck and open edges are cached; live LEDs only stroke two reusable paths. */
export class NeonTrack {
  private layer: HTMLCanvasElement | null = null;
  private version = -1;
  private paths: Path2D[] = [];
  private endLights: Vec2[] = [];
  builds = 0;

  draw(ctx: Ctx, track: TrackGeometry, version: number, time: number, reduced: boolean): void {
    const canvas = ctx.canvas;
    const resize = !this.layer || this.layer.width !== canvas.width || this.layer.height !== canvas.height;
    // The server increments trackVersion for every geometry change, including final relaxation.
    if (resize || this.version !== version) {
      this.layer ??= document.createElement('canvas');
      if (resize) { this.layer.width = canvas.width; this.layer.height = canvas.height; }
      const c = this.layer.getContext('2d')!;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.layer.width, this.layer.height);
      c.scale(this.layer.width / 1920, this.layer.height / 1080);
      this.prepareEdges(track); this.paint(c, track);
      this.version = version; this.builds++;
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.layer!, 0, 0); ctx.restore();
    // The base edge is always visible; travelling light carries no collision/ownership meaning.
    ctx.save(); ctx.lineWidth = 2; ctx.lineCap = 'butt'; ctx.strokeStyle = '#83d5e4';
    ctx.globalAlpha = .65; ctx.setLineDash([3, 24]); ctx.lineDashOffset = reduced ? 0 : -time * .018;
    for (const path of this.paths) ctx.stroke(path);
    ctx.lineWidth = 12; ctx.globalAlpha = .13; ctx.strokeStyle = '#63d9ed';
    ctx.setLineDash([26, 412]); ctx.lineDashOffset = reduced ? 0 : -time * .075;
    for (const path of this.paths) ctx.stroke(path);
    ctx.lineWidth = 2.5; ctx.globalAlpha = .85; ctx.strokeStyle = NEON.white;
    ctx.setLineDash([18, 420]); ctx.lineDashOffset = reduced ? 0 : -time * .075;
    for (const path of this.paths) ctx.stroke(path);
    ctx.restore();
    for (const p of this.endLights) glow(ctx, p.x, p.y, 22, NEON.ice, reduced ? .25 : .23 + .07 * Math.sin(time / 650));
  }

  private prepareEdges(track: TrackGeometry): void {
    const visible = visibleTrackEdges(track);
    this.paths = [track.outerEdge, track.innerEdge].map((edge, e) => {
      const path = new Path2D();
      for (let i = 0; i < edge.length; i++) {
        const j = (i + 1) % edge.length;
        if (!visible[e][i] || !visible[e][j]) continue;
        if (!i || !visible[e][i - 1]) path.moveTo(edge[i].x, edge[i].y);
        path.lineTo(edge[j].x, edge[j].y);
      }
      return path;
    });
  }

  private band(ctx: Ctx, track: TrackGeometry, color: string | CanvasGradient, extra = 0): void {
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const c = track.centerline;
    for (let i = 0; i < c.length; i++) {
      const j = (i + 1) % c.length;
      ctx.lineWidth = (track.widths[i] + track.widths[j]) / 2 + extra;
      ctx.beginPath(); ctx.moveTo(c[i].x, c[i].y); ctx.lineTo(c[j].x, c[j].y); ctx.stroke();
    }
  }

  private paint(ctx: Ctx, track: TrackGeometry): void {
    // The extrusion is dark and below the edge; the upper drivable band stays exact.
    ctx.save(); ctx.translate(0, 9); this.band(ctx, track, '#01030b', 9); ctx.restore();
    this.band(ctx, track, '#080e1b', 5);
    const surface = ctx.createLinearGradient(0, 200, 1920, 900);
    surface.addColorStop(0, '#1c2e47'); surface.addColorStop(.5, '#141f34'); surface.addColorStop(1, '#1b2b42');
    this.band(ctx, track, surface);
    ctx.lineCap = 'round';
    for (const [width, color] of [[10, '#68a9c115'], [5, '#729cb843'], [1.5, '#87b8ca']] as const) {
      ctx.lineWidth = width; ctx.strokeStyle = color;
      for (const path of this.paths) ctx.stroke(path);
    }
    // Quiet centre marks distinguish the road from the code drifting beneath it.
    const center = new Path2D(); track.centerline.forEach((p, i) => i ? center.lineTo(p.x, p.y) : center.moveTo(p.x, p.y)); center.closePath();
    ctx.setLineDash([5, 22]); ctx.strokeStyle = '#c4e4ff16'; ctx.lineWidth = 1; ctx.stroke(center); ctx.setLineDash([]);
    for (const cp of track.checkpoints.slice(1)) {
      ctx.save(); ctx.translate(cp.pos.x, cp.pos.y); ctx.rotate(Math.atan2(cp.normal.y, cp.normal.x) - Math.PI / 2);
      ctx.strokeStyle = '#b5d5e628'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(2, 0); ctx.lineTo(-4, 6); ctx.stroke(); ctx.restore();
    }
    const sl = track.startLine;
    let index = 0, distance = Infinity;
    track.centerline.forEach((p, i) => { const d = Math.hypot(p.x - sl.pos.x, p.y - sl.pos.y); if (d < distance) { distance = d; index = i; } });
    const half = track.widths[index] / 2, cells = Math.max(2, Math.ceil(half * 2 / 9)), cell = half * 2 / cells;
    ctx.save(); ctx.translate(sl.pos.x, sl.pos.y); ctx.rotate(Math.atan2(sl.normal.y, sl.normal.x));
    ctx.fillStyle = '#06101e'; ctx.fillRect(-half, -11, half * 2, 22);
    for (let x = 0; x < cells; x++) for (let row = 0; row < 2; row++) {
      ctx.fillStyle = (x + row) % 2 ? '#24354a' : '#c3edf0'; ctx.fillRect(-half + x * cell, -8 + row * 8, cell, 8);
    }
    ctx.strokeStyle = '#b9eff0'; ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * (half + 4), -14); ctx.lineTo(side * (half + 8), -14); ctx.lineTo(side * (half + 8), 14); ctx.lineTo(side * (half + 4), 14); ctx.stroke();
    }
    ctx.restore();
    this.endLights = [-1, 1].map(s => ({ x: sl.pos.x + sl.normal.x * (half + 7) * s, y: sl.pos.y + sl.normal.y * (half + 7) * s }));
  }
}
