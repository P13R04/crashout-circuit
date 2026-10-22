import type { GameState, Tangible, Team, Vec2 } from '../server/types.js';
import { wallEndpoints, rotateWall, type TangiblePose } from '../client-shared/tangibleGeometry.js';
import { distToSegment, nearestOnTrack } from '../server/geometry.js';
import { CHARGE_ZONE_LOCAL, localToWorld, panelOf } from '../server/layout.js';

export interface OzMapHandlers {
  onMove(id: number, x: number, y: number, angle: number): boolean;
  onSelect(id: number): void;
  selectedId(): number;
  selectedKind(): Tangible['kind'];
  selectedTeam(): Team;
  enabled(): boolean;
}
interface Drag {
  pointer: number;
  id: number;
  mode: 'move' | 'rotate';
  anchor: Vec2;
  offset: Vec2;
  pose: TangiblePose;
}

/** Local preview avoids waiting for a round trip while manipulating a handle. */
export class OzMap {
  private ctx: CanvasRenderingContext2D;
  private state: GameState | null = null;
  private drag: Drag | null = null;
  private trackVersion = -1;
  private hiddenEdges: boolean[][] = [];
  private pending: { id: number; pose: TangiblePose; at: number } | null = null;

  constructor(private canvas: HTMLCanvasElement, private h: OzMapHandlers) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => {
      if (this.drag?.pointer !== e.pointerId) return;
      this.move(e);
      if (!this.drag) return;
      this.pending = { id: this.drag.id, pose: this.drag.pose, at: performance.now() };
      this.drag = null;
      this.draw();
    });
    canvas.addEventListener('pointercancel', () => this.cancel());
    canvas.addEventListener('lostpointercapture', () => { if (this.drag) this.cancel(); });
  }

  cancel(): void { this.drag = null; this.pending = null; this.draw(); }

  setState(state: GameState): void {
    const preview = this.drag ?? this.pending;
    if (preview && this.state?.tangibles[preview.id]?.status === 'placed'
      && state.tangibles[preview.id]?.status !== 'placed') {
      this.drag = null; this.pending = null;
    }
    this.state = state;
    if (!state.track) this.trackVersion = -1;
    if (!this.h.enabled()) { this.drag = null; this.pending = null; }
    if (this.pending) {
      const t = state.tangibles[this.pending.id], p = this.pending.pose;
      if (performance.now() - this.pending.at > 1000 || (t && Math.abs(t.x - p.x) < 1e-6 && Math.abs(t.y - p.y) < 1e-6 && Math.abs(t.angle - p.angle) < 1e-6)) this.pending = null;
    }
    this.draw();
  }

  private point(e: PointerEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * this.state!.params.logicalWidth,
      y: (e.clientY - r.top) / r.height * this.state!.params.logicalHeight };
  }

  private visibleTangibles(): Array<[number, Tangible]> {
    const s = this.state;
    if (!s) return [];
    const all = new Map(Object.entries(s.tangibles).map(([id, t]) => [Number(id), t]));
    const preview = this.drag ?? this.pending;
    if (preview) {
      const old = all.get(preview.id);
      all.set(preview.id, { kind: old?.kind ?? this.h.selectedKind(), team: old?.team ?? this.h.selectedTeam(),
        active: old?.active ?? false, dockTeam: null, status: 'placed', ...preview.pose });
    }
    return [...all];
  }

  private down(e: PointerEvent): void {
    if (!this.h.enabled() || !this.state || this.drag) return;
    e.preventDefault();
    const s = this.state, p = this.point(e);
    const radius = 16 * s.params.logicalWidth / this.canvas.getBoundingClientRect().width;
    const candidates = this.visibleTangibles().filter(([, t]) => t.status === 'placed')
      .sort(([a], [b]) => Number(b === this.h.selectedId()) - Number(a === this.h.selectedId()));
    let hit: { id: number; t: Tangible; rotate: boolean } | null = null;
    // The rotation handle takes precedence over body picking, including on unselected walls.
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
    const id = hit?.id ?? this.h.selectedId();
    if (hit) this.h.onSelect(id);
    const t = hit?.t ?? s.tangibles[id];
    const center = hit ? { x: t!.x * s.params.logicalWidth, y: t!.y * s.params.logicalHeight } : p;
    const angle = t?.angle ?? 0;
    const anchor = wallEndpoints(center, angle, s.params.wallLengthPx)[0];
    this.pending = null;
    this.drag = { pointer: e.pointerId, id, mode: hit?.rotate ? 'rotate' : 'move', anchor,
      offset: { x: p.x - center.x, y: p.y - center.y },
      pose: { x: center.x / s.params.logicalWidth, y: center.y / s.params.logicalHeight, angle } };
    this.canvas.setPointerCapture(e.pointerId);
    if (!hit && !this.h.onMove(id, this.drag.pose.x, this.drag.pose.y, angle)) this.drag = null;
    this.draw();
  }

  private move(e: PointerEvent): void {
    const d = this.drag, s = this.state;
    if (!d || !s || d.pointer !== e.pointerId) return;
    if (!this.h.enabled()) { this.cancel(); return; }
    const p = this.point(e);
    const logical = d.mode === 'rotate' ? rotateWall(d.anchor, p, s.params.wallLengthPx)
      : { x: p.x - d.offset.x, y: p.y - d.offset.y, angle: d.pose.angle };
    if (!logical) return;
    const pose = { x: logical.x / s.params.logicalWidth, y: logical.y / s.params.logicalHeight, angle: logical.angle };
    if (this.h.onMove(d.id, pose.x, pose.y, pose.angle)) d.pose = pose;
    this.draw();
  }

  draw(): void {
    const ctx = this.ctx, s = this.state;
    ctx.fillStyle = '#04081f'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!s) return;
    const W = s.params.logicalWidth, H = s.params.logicalHeight;
    const unit = W / Math.max(1, this.canvas.getBoundingClientRect().width);
    ctx.save(); ctx.scale(this.canvas.width / W, this.canvas.height / H);
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
      const z = CHARGE_ZONE_LOCAL, at = localToWorld(panelOf(team, 'copilot'), z.x, z.y);
      const docked = Object.entries(s.tangibles).filter(([, t]) => t.dockTeam === team);
      ctx.fillStyle = docked.some(([, t]) => t.active) ? '#3ddc8422' : '#ffffff08';
      ctx.strokeStyle = team === 'A' ? '#00e5ff' : '#ff4081'; ctx.lineWidth = 2 * unit;
      ctx.beginPath(); ctx.roundRect(at.x - z.w / 2, at.y - z.h / 2, z.w, z.h, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#bac7dc'; ctx.font = `${11 * unit}px system-ui`; ctx.textAlign = 'center';
      ctx.fillText(team === 'A' ? 'CYAN' : 'ROSE', at.x, at.y - z.h / 2 - 12 * unit);
      ctx.font = `bold ${11 * unit}px system-ui`;
      ctx.fillText(docked.map(([id]) => `#${id}`).join(' '), at.x, at.y + 4 * unit);
    }
    for (const arc of s.arcs) {
      ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 3 * unit;
      ctx.beginPath(); ctx.moveTo(arc.pylon1.x, arc.pylon1.y); ctx.lineTo(arc.pylon2.x, arc.pylon2.y); ctx.stroke();
    }
    for (const [id, t] of this.visibleTangibles()) {
      if (t.status !== 'placed') continue;
      const center = { x: t.x * W, y: t.y * H }, selected = id === this.h.selectedId();
      const radians = t.angle * Math.PI / 180;
      const label = t.kind === 'wall'
        ? { x: center.x + Math.sin(radians) * 20 * unit, y: center.y - Math.cos(radians) * 20 * unit }
        : { x: center.x, y: center.y - 20 * unit };
      const color = t.team === 'A' ? '#00e5ff' : '#ff4081';
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
            ctx.fillText(String(index + 1), point.x, point.y + 4 * unit);
          }
        }
      } else {
        ctx.beginPath(); ctx.arc(center.x, center.y, (selected ? 12 : 9) * unit, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = color; ctx.font = `bold ${12 * unit}px system-ui`; ctx.textAlign = 'center';
      ctx.fillText(`#${id}`, label.x, label.y + 4 * unit);
    }
    ctx.restore();
  }
}
