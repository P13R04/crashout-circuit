import type { GameState, Tangible, Vec2 } from '../server/types.js';
import { wallEndpoints, rotateWall, type TangiblePose } from '../client-shared/tangibleGeometry.js';
import { tangibleDefinition, validTangiblePose, type TangibleId } from '../server/tangibles.js';
import { distToSegment, nearestOnTrack } from '../server/geometry.js';
import { viewTransform, viewToWorld } from './ozView.js';
import { PANELS, PANEL_H, panelWidth } from '../server/layout.js';

export interface OzMapHandlers {
  onMove(id: TangibleId, x: number, y: number, angle: number): boolean;
  onPlace(pose: TangiblePose): boolean;
  onSelect(id: TangibleId): void;
  selectedId(): number;
  selectedKind(): Tangible['kind'];
  preparing(): boolean;
  draftAngle(): number;
  enabled(): boolean;
  onDragStart(): void;
  onDragEnd(): void;
}
interface Drag {
  pointer: number;
  id: TangibleId;
  mode: 'move' | 'rotate';
  anchor: Vec2;
  offset: Vec2;
  pose: TangiblePose;
}

/** Drawing and pointer geometry; operator commands live in OzController. */
export class OzMap {
  private ctx: CanvasRenderingContext2D;
  private state: GameState | null = null;
  private drag: Drag | null = null;
  private hover: Vec2 | null = null;
  private quarter = 0;
  private trackVersion = -1;
  private hiddenEdges: boolean[][] = [];

  constructor(private canvas: HTMLCanvasElement, private h: OzMapHandlers) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    canvas.addEventListener('pointerup', e => {
      if (this.drag?.pointer !== e.pointerId) return;
      this.move(e); this.drag = null; this.h.onDragEnd(); this.draw();
    });
    canvas.addEventListener('pointercancel', () => this.cancel());
    canvas.addEventListener('lostpointercapture', () => { if (this.drag) this.cancel(); });
  }

  cancel(): void { this.drag = null; this.hover = null; this.h.onDragEnd(); this.draw(); }
  setQuarter(quarter: number): void { this.cancel(); this.quarter = ((quarter % 4) + 4) % 4; this.draw(); }

  setState(state: GameState): void {
    if (this.drag && (!state.tangibles[this.drag.id]?.active || !this.h.enabled())) this.cancel();
    this.state = state;
    if (!state.track) this.trackVersion = -1;
    if (!this.h.enabled()) { this.drag = null; this.hover = null; }
    this.draw();
  }

  private point(e: PointerEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return viewToWorld({ x: (e.clientX - r.left) / r.width * this.canvas.width,
      y: (e.clientY - r.top) / r.height * this.canvas.height },
      viewTransform(this.canvas.width, this.canvas.height, this.state!.params.logicalWidth, this.state!.params.logicalHeight, this.quarter));
  }

  private visibleTangibles(): Array<[number, Tangible]> {
    if (!this.state) return [];
    const all = new Map(Object.entries(this.state.tangibles).map(([id, t]) => [Number(id), t]));
    if (this.drag) {
      const old = all.get(this.drag.id);
      if (old) all.set(this.drag.id, { ...old, ...this.drag.pose });
    }
    return [...all];
  }

  private down(e: PointerEvent): void {
    if (!this.h.enabled() || !this.state || this.drag || (e.button !== undefined && e.button !== 0)) return;
    e.preventDefault();
    const s = this.state, p = this.point(e);
    this.hover = p;
    if (this.h.preparing()) {
      this.h.onPlace({ x: p.x / s.params.logicalWidth, y: p.y / s.params.logicalHeight, angle: this.h.draftAngle() });
      this.draw(); return;
    }
    const transform = viewTransform(this.canvas.width, this.canvas.height, s.params.logicalWidth, s.params.logicalHeight, this.quarter);
    const radius = 16 * this.canvas.width / this.canvas.getBoundingClientRect().width / transform.scale;
    const candidates = this.visibleTangibles().filter(([, t]) => t.active)
      .sort(([a], [b]) => Number(b === this.h.selectedId()) - Number(a === this.h.selectedId()));
    let hit: { id: number; t: Tangible; rotate: boolean } | null = null;
    for (const [id, t] of candidates) {
      if (t.kind !== 'wall') continue;
      const [, b] = wallEndpoints({ x: t.x * s.params.logicalWidth, y: t.y * s.params.logicalHeight }, t.angle, s.params.wallLengthPx);
      if (Math.hypot(p.x - b.x, p.y - b.y) <= radius) { hit = { id, t, rotate: true }; break; }
    }
    if (!hit) for (const [id, t] of candidates) {
      const center = { x: t.x * s.params.logicalWidth, y: t.y * s.params.logicalHeight };
      const ends = wallEndpoints(center, t.angle, s.params.wallLengthPx);
      const distance = t.kind === 'wall' ? distToSegment(p, ...ends) : Math.hypot(p.x - center.x, p.y - center.y);
      if (distance <= radius) { hit = { id, t, rotate: false }; break; }
    }
    if (!hit) return;
    const id = hit.id as TangibleId, t = hit.t;
    this.h.onSelect(id);
    const center = { x: t.x * s.params.logicalWidth, y: t.y * s.params.logicalHeight };
    this.h.onDragStart();
    this.drag = { pointer: e.pointerId, id, mode: hit.rotate ? 'rotate' : 'move',
      anchor: wallEndpoints(center, t.angle, s.params.wallLengthPx)[0],
      offset: { x: p.x - center.x, y: p.y - center.y }, pose: { x: t.x, y: t.y, angle: t.angle } };
    this.canvas.setPointerCapture(e.pointerId); this.draw();
  }

  private move(e: PointerEvent): void {
    if (!this.state || !this.h.enabled()) return;
    const p = this.point(e); this.hover = p;
    const d = this.drag, s = this.state;
    if (!d || d.pointer !== e.pointerId) { this.draw(); return; }
    const logical = d.mode === 'rotate' ? rotateWall(d.anchor, p, s.params.wallLengthPx)
      : { x: p.x - d.offset.x, y: p.y - d.offset.y, angle: d.pose.angle };
    if (!logical) return;
    const pose = { x: logical.x / s.params.logicalWidth, y: logical.y / s.params.logicalHeight, angle: logical.angle };
    if (Math.abs(pose.x - d.pose.x) + Math.abs(pose.y - d.pose.y) + Math.abs(pose.angle - d.pose.angle) < 1e-10) return;
    if (this.h.onMove(d.id, pose.x, pose.y, pose.angle)) d.pose = pose;
    this.draw();
  }

  draw(): void {
    const ctx = this.ctx, s = this.state;
    ctx.fillStyle = '#04081f'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!s) return;
    const W = s.params.logicalWidth, H = s.params.logicalHeight;
    const transform = viewTransform(this.canvas.width, this.canvas.height, W, H, this.quarter);
    const unit = this.canvas.width / Math.max(1, this.canvas.getBoundingClientRect().width) / transform.scale;
    ctx.save(); ctx.translate(transform.cx, transform.cy); ctx.rotate(transform.angle);
    ctx.scale(transform.scale, transform.scale); ctx.translate(-W / 2, -H / 2);
    const textAt = (text: string, x: number, y: number, size: number, color: string, offsetY = 0) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-transform.angle);
      ctx.fillStyle = color; ctx.font = `bold ${size * unit}px system-ui`; ctx.textAlign = 'center';
      ctx.fillText(text, 0, (offsetY + 4) * unit); ctx.restore();
    };
    ctx.strokeStyle = '#33405a'; ctx.lineWidth = unit;
    ctx.strokeRect(0, 0, W, H);
    for (const panel of PANELS) {
      ctx.save(); ctx.translate(panel.cx, panel.cy); ctx.rotate(panel.rot);
      ctx.fillStyle = '#ffffff06'; ctx.fillRect(-panelWidth(panel.role) / 2, -PANEL_H / 2, panelWidth(panel.role), PANEL_H);
      ctx.fillStyle = panel.team === 'A' ? '#6da8b4' : '#b47891';
      ctx.font = `${10 * unit}px system-ui`; ctx.textAlign = 'center';
      ctx.fillText(`${panel.team === 'A' ? 'CYAN' : 'ROSE'} · ${panel.role === 'pilot' ? 'PILOTE' : 'COPILOTE'}`, 0, 4 * unit);
      ctx.restore();
    }
    if (s.track) {
      const track = s.track, c = track.centerline, n = c.length;
      // Same union of lane-width segments as the table and physics: crossings are open road.
      ctx.strokeStyle = '#182238'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        ctx.lineWidth = (track.widths[i] + track.widths[j]) / 2;
        ctx.beginPath(); ctx.moveTo(c[i].x, c[i].y); ctx.lineTo(c[j].x, c[j].y); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      if (this.trackVersion !== s.trackVersion) {
        const cum = [0];
        for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(c[i % n].x - c[i - 1].x, c[i % n].y - c[i - 1].y));
        this.hiddenEdges = [track.outerEdge, track.innerEdge].map(pts => pts.map((p, k) => c.some((at, m) => {
          const gap = Math.abs(cum[m] - cum[k]);
          return Math.min(gap, cum[n] - gap) >= 200 && Math.hypot(p.x - at.x, p.y - at.y) < track.widths[m] / 2 - 1;
        })));
        this.trackVersion = s.trackVersion;
      }
      ctx.lineWidth = 2 * unit;
      for (const [edge, pts] of [track.outerEdge, track.innerEdge].entries()) {
        ctx.strokeStyle = edge === 0 ? '#ff4081' : '#00e5ff'; ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          if (this.hiddenEdges[edge][i] || this.hiddenEdges[edge][j]) continue;
          ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
        }
        ctx.stroke();
      }
      const sl = track.startLine, half = nearestOnTrack(sl.pos, track).halfWidth;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * unit;
      ctx.beginPath(); ctx.moveTo(sl.pos.x + sl.normal.x * half, sl.pos.y + sl.normal.y * half);
      ctx.lineTo(sl.pos.x - sl.normal.x * half, sl.pos.y - sl.normal.y * half); ctx.stroke();
    }
    for (const team of ['A', 'B'] as const) {
      const c = s.cars[team];
      ctx.fillStyle = team === 'A' ? '#00e5ff' : '#ff4081';
      ctx.beginPath(); ctx.arc(c.pos.x, c.pos.y, 4 * unit, 0, Math.PI * 2); ctx.fill();
    }
    for (const arc of s.arcs) {
      ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 3 * unit;
      ctx.beginPath(); ctx.moveTo(arc.pylon1.x, arc.pylon1.y); ctx.lineTo(arc.pylon2.x, arc.pylon2.y); ctx.stroke();
    }
    for (const [id, t] of this.visibleTangibles()) {
      if (t.status !== 'placed' || !t.active) continue;
      const center = { x: t.x * W, y: t.y * H }, selected = id === this.h.selectedId();
      const radians = t.angle * Math.PI / 180;
      const label = t.kind === 'wall'
        ? { x: center.x + Math.sin(radians) * 20 * unit, y: center.y - Math.cos(radians) * 20 * unit }
        : { x: center.x, y: center.y - 20 * unit };
      const color = '#f4c678';
      ctx.strokeStyle = t.active ? '#ff8e65' : '#7a8498'; ctx.lineWidth = (selected ? 5 : 4) * unit;
      ctx.setLineDash(t.active ? [] : [5 * unit, 4 * unit]);
      if (t.kind === 'wall') {
        const [a, b] = wallEndpoints(center, t.angle, s.params.wallLengthPx);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
        if (selected) {
          for (const [index, point] of [a, b].entries()) {
            ctx.fillStyle = index === 0 ? '#0b1528' : '#ffe14a'; ctx.strokeStyle = index === 0 ? '#fff' : '#ffe14a'; ctx.lineWidth = 2 * unit;
            ctx.beginPath(); ctx.arc(point.x, point.y, 10 * unit, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = index === 0 ? '#fff' : '#101728'; ctx.textAlign = 'center'; ctx.font = `bold ${11 * unit}px system-ui`;
            textAt(String(index + 1), point.x, point.y, 11, index === 0 ? '#fff' : '#101728');
          }
        }
      } else {
        ctx.beginPath(); ctx.arc(center.x, center.y, (selected ? 12 : 9) * unit, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = color; ctx.font = `bold ${12 * unit}px system-ui`; ctx.textAlign = 'center';
      if (t.kind === 'pylon') textAt(tangibleDefinition(id)?.name ?? '', center.x, center.y, 12, color, -26);
      else textAt(tangibleDefinition(id)?.name ?? '', label.x, label.y, 12, color);
    }
    if (this.h.preparing() && this.hover) {
      const p = this.hover, angle = this.h.draftAngle();
      const pose = { x: p.x / W, y: p.y / H, angle };
      const kind = this.h.selectedKind();
      ctx.strokeStyle = validTangiblePose(kind, pose, s.params) ? '#9be5bb' : '#ff6f7b';
      ctx.lineWidth = 3 * unit; ctx.setLineDash([7 * unit, 5 * unit]);
      ctx.beginPath();
      if (kind === 'wall') {
        const [a, b] = wallEndpoints(p, angle, s.params.wallLengthPx);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      } else ctx.arc(p.x, p.y, 12 * unit, 0, Math.PI * 2);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle; ctx.font = `bold ${12 * unit}px system-ui`; ctx.textAlign = 'center';
      textAt('Placer ' + tangibleDefinition(this.h.selectedId())?.name, p.x, p.y, 12, ctx.strokeStyle as string, -28);
    }
    ctx.restore();
  }
}
