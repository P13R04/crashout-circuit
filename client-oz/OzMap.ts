import type { GameState, Tangible, Vec2, Team } from '../server/types.js';
import { wallEndpoints, rotateWall, wallCorners, type TangiblePose } from '../client-shared/tangibleGeometry.js';
import { tangibleDefinition, validTangiblePose, type TangibleId } from '../server/tangibles.js';
import { distToSegment, nearestOnTrack } from '../server/geometry.js';
import { visibleTrackEdges } from '../client-shared/trackVisibility.js';
import { viewTransform, viewToWorld } from './ozView.js';
import { PANELS, PANEL_H, panelWidth, localToWorld, TANGIBLE_DEPOT, NEUTRAL_RIGHT } from '../server/layout.js';

export type OzTool = 'arc' | 'wall' | null;

export interface OzMapHandlers {
  onRemove?(id: TangibleId): void;
  onMove(id: TangibleId, x: number, y: number, angle: number): boolean;
  onDock(team: Team): void;
  onPlace(pose: TangiblePose): boolean;
  onSelect(id: TangibleId): void;
  selectedId(): number;
  selectedKind(): Tangible['kind'];
  preparing(): boolean;
  draftAngle(): number;
  enabled(): boolean;
  onDragStart(): void;
  onDragEnd(): void;
  onPlaceArc?(p1: Vec2, p2: Vec2): void;
  onPlaceWall?(center: Vec2, angle: number): void;
  onToolStep?(tool: OzTool, step: number, p1: Vec2 | null): void;
  onRelocateTangible?(id: TangibleId, pos: Vec2, angle?: number): void;
  onMovingTangibleChange?(id: TangibleId | null, step?: number): void;
}

interface Drag {
  pointer: number;
  id: TangibleId;
  mode: 'move' | 'rotate' | 'place';
  anchor: Vec2;
  offset: Vec2;
  pose: TangiblePose;
}

/** Drawing and pointer geometry; operator commands live in OzController / toolbar. */
export class OzMap {
  private ctx: CanvasRenderingContext2D;
  private state: GameState | null = null;
  private drag: Drag | null = null;
  private hover: Vec2 | null = null;
  private quarter = 0;
  private trackVersion = -1;
  private hiddenEdges: boolean[][] = [];

  // 2-click interactive tool state (Arc / Wall placement)
  private tool: OzTool = null;
  private toolStep = 0; // 0 = waiting for click 1, 1 = waiting for click 2
  private firstPoint: Vec2 | null = null;

  // Pick & Drop tangible relocation state
  private movingTangibleId: TangibleId | null = null;
  private movingWallStep = 0; // 0 = waiting for 1st click, 1 = waiting for 2nd click to orient
  private movingWallFirstPoint: Vec2 | null = null;
  private movingWallDraftAngle: number | null = null;
  private downClientPos = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement, private h: OzMapHandlers) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('wheel', e => {
      if (!this.state || !this.h.enabled()) return;
      if (this.movingTangibleId === 1) {
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * 15;
        const current = this.movingWallDraftAngle ?? this.state.tangibles[1]?.angle ?? 0;
        this.movingWallDraftAngle = ((current + delta) % 360 + 360) % 360;
        this.draw();
      }
    }, { passive: false });
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    canvas.addEventListener('pointerup', e => {
      if (this.drag?.pointer !== e.pointerId) return;
      this.move(e);
      const distMoved = Math.hypot(e.clientX - this.downClientPos.x, e.clientY - this.downClientPos.y);
      if (this.drag.mode === 'place') {
        this.h.onPlace(this.drag.pose);
      } else if (distMoved <= 3) {
        // Pure click on placed tangible: activate pick & drop mode!
        this.movingTangibleId = this.drag.id;
        this.movingWallStep = 0;
        this.movingWallFirstPoint = null;
        this.movingWallDraftAngle = this.state?.tangibles[this.drag.id]?.angle ?? 0;
        this.h.onMovingTangibleChange?.(this.movingTangibleId, 0);
      } else {
        // Dragged to a new spot
        const s = this.state;
        if (s) {
          this.h.onRelocateTangible?.(this.drag.id, {
            x: this.drag.pose.x * s.params.logicalWidth,
            y: this.drag.pose.y * s.params.logicalHeight
          }, this.drag.pose.angle);
        }
      }
      this.drag = null;
      this.h.onDragEnd();
      this.draw();
    });
    canvas.addEventListener('pointercancel', () => this.cancel());
    canvas.addEventListener('lostpointercapture', () => { if (this.drag) this.cancel(); });
  }

  setTool(tool: OzTool): void {
    this.movingTangibleId = null;
    this.movingWallStep = 0;
    this.movingWallFirstPoint = null;
    this.movingWallDraftAngle = null;
    this.h.onMovingTangibleChange?.(null, 0);
    this.tool = tool;
    this.toolStep = 0;
    this.firstPoint = null;
    this.h.onToolStep?.(tool, 0, null);
    this.draw();
  }

  getTool(): OzTool {
    return this.tool;
  }

  cancel(): void {
    this.drag = null;
    this.hover = null;
    this.tool = null;
    this.toolStep = 0;
    this.firstPoint = null;
    this.movingTangibleId = null;
    this.movingWallStep = 0;
    this.movingWallFirstPoint = null;
    this.movingWallDraftAngle = null;
    this.h.onMovingTangibleChange?.(null, 0);
    this.h.onToolStep?.(null, 0, null);
    this.h.onDragEnd();
    this.draw();
  }

  setQuarter(quarter: number): void {
    this.cancel();
    this.quarter = ((quarter % 4) + 4) % 4;
    this.draw();
  }

  setState(state: GameState): void {
    if(this.state && this.state.tangiblePlacementMode!==state.tangiblePlacementMode)this.cancel();
    if (this.drag && (!state.tangibles[this.drag.id] || !this.h.enabled() || (this.drag.mode !== 'place' && (state.tangibles[this.drag.id].status !== 'placed' || this.state?.tangibles[this.drag.id]?.active !== state.tangibles[this.drag.id].active)))) this.cancel();
    if (this.movingTangibleId && (!state.tangibles[this.movingTangibleId] || !state.tangibles[this.movingTangibleId].active)) {
      this.cancel();
    }
    this.state = state;
    if (!state.track) this.trackVersion = -1;
    if (!this.h.enabled()) { this.drag = null; this.hover = null; }
    this.draw();
  }

  private point(e: PointerEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return viewToWorld({
      x: (e.clientX - r.left) / r.width * this.canvas.width,
      y: (e.clientY - r.top) / r.height * this.canvas.height
    }, viewTransform(this.canvas.width, this.canvas.height, this.state!.params.logicalWidth, this.state!.params.logicalHeight, this.quarter));
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
    if (!this.h.enabled() || !this.state || (e.button !== undefined && e.button !== 0)) return;
    e.preventDefault();
    const s = this.state, p = this.point(e);
    if(s.tangiblePlacementMode==='touch'){
      const hit=this.tangibleAt(p);
      if(hit)this.h.onRemove?.(hit);
      return;
    }
    this.hover = p;
    this.downClientPos = { x: e.clientX, y: e.clientY };

    // ── Pick & Drop: Second click drops the moving tangible ──
    if (this.movingTangibleId) {
      const id = this.movingTangibleId;
      if (id === 1) {
        // Wall relocation with orientation handling
        if (this.movingWallStep === 0) {
          // Check if clicking another tangible to switch to it
          const candidates = this.visibleTangibles().filter(([tid, t]) => t.status === 'placed' && tid !== 1);
          let switched = false;
          const transform = viewTransform(this.canvas.width, this.canvas.height, s.params.logicalWidth, s.params.logicalHeight, this.quarter);
          const radius = 24 * this.canvas.width / Math.max(1, this.canvas.getBoundingClientRect().width) / transform.scale;
          for (const [tid, t] of candidates) {
            const center = { x: t.x * s.params.logicalWidth, y: t.y * s.params.logicalHeight };
            if (Math.hypot(p.x - center.x, p.y - center.y) <= radius) {
              this.movingTangibleId = tid as TangibleId;
              this.movingWallStep = 0;
              this.movingWallFirstPoint = null;
              this.movingWallDraftAngle = null;
              this.h.onMovingTangibleChange?.(this.movingTangibleId, 0);
              this.draw();
              switched = true;
              break;
            }
          }
          if (switched) return;

          // 1st click on destination: set first anchor point
          this.movingWallFirstPoint = p;
          this.movingWallStep = 1;
          this.h.onMovingTangibleChange?.(1, 1);
          this.draw();
          return;
        } else if (this.movingWallStep === 1) {
          // 2nd click on destination: compute angle & center, then drop
          const p1 = this.movingWallFirstPoint!;
          const p2 = p;
          const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const wall = s.tangibles[1];
          const angle = d >= 5
            ? (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI + 360) % 360
            : (this.movingWallDraftAngle ?? wall?.angle ?? 0);
          const center = d >= 5 ? { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } : p1;

          this.movingTangibleId = null;
          this.movingWallStep = 0;
          this.movingWallFirstPoint = null;
          this.movingWallDraftAngle = null;
          this.h.onMovingTangibleChange?.(null, 0);
          this.h.onRelocateTangible?.(1, center, angle);
          this.draw();
          return;
        }
      } else {
        // Pylons (id 2 or 3) - instant drop
        this.movingTangibleId = null;
        this.h.onMovingTangibleChange?.(null, 0);
        this.h.onRelocateTangible?.(id, p);
        this.draw();
        return;
      }
    }

    // ── 2-Click Interactive Tool (Arc / Wall) ──
    if (this.tool === 'arc') {
      if (this.toolStep === 0) {
        this.firstPoint = p;
        this.toolStep = 1;
        this.h.onToolStep?.('arc', 1, p);
        this.draw();
        return;
      } else if (this.toolStep === 1) {
        const p1 = this.firstPoint!;
        const p2 = p;
        this.h.onPlaceArc?.(p1, p2);
        this.tool = null;
        this.toolStep = 0;
        this.firstPoint = null;
        this.h.onToolStep?.(null, 0, null);
        this.draw();
        return;
      }
    }

    if (this.tool === 'wall') {
      if (this.toolStep === 0) {
        this.firstPoint = p;
        this.toolStep = 1;
        this.h.onToolStep?.('wall', 1, p);
        this.draw();
        return;
      } else if (this.toolStep === 1) {
        const p1 = this.firstPoint!;
        const p2 = p;
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const angle = d >= 5 ? (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI + 360) % 360 : 0;
        const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        this.h.onPlaceWall?.(center, angle);
        this.tool = null;
        this.toolStep = 0;
        this.firstPoint = null;
        this.h.onToolStep?.(null, 0, null);
        this.draw();
        return;
      }
    }

    // ── Legacy handlers / direct dragging (kept for unit test compatibility) ──
    if (this.h.preparing() && this.h.selectedKind() === 'wall') {
      const angle = this.h.draftAngle();
      this.drag = {
        pointer: e.pointerId, id: this.h.selectedId() as TangibleId, mode: 'place',
        anchor: wallEndpoints(p, angle, s.params.wallLengthPx)[0], offset: { x: 0, y: 0 },
        pose: { x: p.x / s.params.logicalWidth, y: p.y / s.params.logicalHeight, angle }
      };
      this.canvas.setPointerCapture(e.pointerId);
      this.draw();
      return;
    }
    if (this.h.preparing()) {
      this.h.onPlace({ x: p.x / s.params.logicalWidth, y: p.y / s.params.logicalHeight, angle: this.h.draftAngle() });
      this.draw();
      return;
    }

    const transform = viewTransform(this.canvas.width, this.canvas.height, s.params.logicalWidth, s.params.logicalHeight, this.quarter);
    const radius = 24 * this.canvas.width / this.canvas.getBoundingClientRect().width / transform.scale;
    const candidates = this.visibleTangibles().filter(([, t]) => t.status === 'placed')
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
    this.drag = {
      pointer: e.pointerId, id, mode: hit.rotate ? 'rotate' : 'move',
      anchor: wallEndpoints(center, t.angle, s.params.wallLengthPx)[0],
      offset: { x: p.x - center.x, y: p.y - center.y }, pose: { x: t.x, y: t.y, angle: t.angle }
    };
    this.canvas.setPointerCapture(e.pointerId);
    this.draw();
  }

  private move(e: PointerEvent): void {
    if (!this.state || !this.h.enabled()) return;
    const p = this.point(e);
    if(this.state.tangiblePlacementMode==='touch'){
      this.canvas.style.cursor=this.tangibleAt(p)?'pointer':'default';
      return;
    }
    this.hover = p;
    const s = this.state;
    const W = s.params.logicalWidth, H = s.params.logicalHeight;
    const transform = viewTransform(this.canvas.width, this.canvas.height, W, H, this.quarter);
    const unit = this.canvas.width / Math.max(1, this.canvas.getBoundingClientRect().width) / transform.scale;

    // Dynamic cursor feedback
    if (this.canvas?.style) {
      if (this.movingTangibleId || this.tool) {
        this.canvas.style.cursor = 'crosshair';
      } else {
        const candidates = this.visibleTangibles().filter(([, t]) => t.status === 'placed');
        let over = false;
        for (const [, t] of candidates) {
          const center = { x: t.x * W, y: t.y * H };
          const ends = wallEndpoints(center, t.angle, s.params.wallLengthPx);
          const distance = t.kind === 'wall' ? distToSegment(p, ...ends) : Math.hypot(p.x - center.x, p.y - center.y);
          if (distance <= 24 * unit) { over = true; break; }
        }
        this.canvas.style.cursor = over ? 'pointer' : 'default';
      }
    }

    const d = this.drag;
    if (!d || d.pointer !== e.pointerId) { this.draw(); return; }
    const logical = d.mode !== 'move' ? rotateWall(d.anchor, p, s.params.wallLengthPx)
      : { x: p.x - d.offset.x, y: p.y - d.offset.y, angle: d.pose.angle };
    if (!logical) return;
    const pose = { x: logical.x / s.params.logicalWidth, y: logical.y / s.params.logicalHeight, angle: logical.angle };
    if (Math.abs(pose.x - d.pose.x) + Math.abs(pose.y - d.pose.y) + Math.abs(pose.angle - d.pose.angle) < 1e-10) return;
    if (d.mode === 'place' || this.h.onMove(d.id, pose.x, pose.y, pose.angle)) d.pose = pose;
    this.draw();
  }

  private tangibleAt(p: Vec2): TangibleId | null {
    const s=this.state;if(!s)return null;
    const transform=viewTransform(this.canvas.width,this.canvas.height,s.params.logicalWidth,s.params.logicalHeight,this.quarter);
    const radius=20*this.canvas.width/Math.max(1,this.canvas.getBoundingClientRect().width)/transform.scale;
    let hit: TangibleId|null=null,best=Infinity;
    for(const [id,t] of this.visibleTangibles())if(t.status==='placed'||t.status==='parked'){
      const center={x:t.x*s.params.logicalWidth,y:t.y*s.params.logicalHeight};
      const distance=t.kind==='wall'?distToSegment(p,...wallEndpoints(center,t.angle,s.params.wallLengthPx)):Math.hypot(p.x-center.x,p.y-center.y);
      if(distance<=Math.max(radius,s.params.pylonBasePx/2)&&distance<best){hit=id as TangibleId;best=distance;}
    }
    return hit;
  }

  draw(): void {
    const ctx = this.ctx, s = this.state;
    ctx.fillStyle = '#04081f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!s) return;
    const W = s.params.logicalWidth, H = s.params.logicalHeight;
    const transform = viewTransform(this.canvas.width, this.canvas.height, W, H, this.quarter);
    const unit = this.canvas.width / Math.max(1, this.canvas.getBoundingClientRect().width) / transform.scale;

    ctx.save();
    ctx.translate(transform.cx, transform.cy);
    ctx.rotate(transform.angle);
    ctx.scale(transform.scale, transform.scale);
    ctx.translate(-W / 2, -H / 2);

    const textAt = (text: string, x: number, y: number, size: number, color: string, offsetY = 0) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-transform.angle);
      ctx.fillStyle = color;
      ctx.font = `bold ${size * unit}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(text, 0, offsetY * unit);
      ctx.restore();
    };

    // Table boundary
    ctx.strokeStyle = '#33405a';
    ctx.lineWidth = unit;
    ctx.strokeRect(0, 0, W, H);

    ctx.strokeStyle='#78929a66';ctx.lineWidth=unit;
    for(const r of [TANGIBLE_DEPOT,NEUTRAL_RIGHT])ctx.strokeRect(r.x,r.y,r.w,r.h);

    // Player HUD stations in corners
    for (const panel of PANELS) {
      ctx.save();
      ctx.translate(panel.cx, panel.cy);
      ctx.rotate(panel.rot);
      ctx.fillStyle = '#ffffff06';
      ctx.fillRect(-panelWidth(panel.role) / 2, -PANEL_H / 2, panelWidth(panel.role), PANEL_H);
      ctx.fillStyle = panel.team === 'A' ? '#00e5ff88' : '#ff408188';
      ctx.font = `${10 * unit}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(`${panel.team === 'A' ? 'CYAN' : 'ROSE'} · ${panel.role === 'pilot' ? 'PILOTE' : 'COPILOTE'}`, 0, -PANEL_H / 2 + 18 * unit);
      ctx.restore();
    }

    // Track rendering
    if (s.track) {
      const track = s.track, c = track.centerline, n = c.length;
      ctx.strokeStyle = '#182238';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        ctx.lineWidth = (track.widths[i] + track.widths[j]) / 2;
        ctx.beginPath();
        ctx.moveTo(c[i].x, c[i].y);
        ctx.lineTo(c[j].x, c[j].y);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      if (this.trackVersion !== s.trackVersion) {
        this.hiddenEdges = visibleTrackEdges(track).map(edge => edge.map(visible => !visible));
        this.trackVersion = s.trackVersion;
      }
      ctx.lineWidth = 2 * unit;
      for (const [edge, pts] of [track.outerEdge, track.innerEdge].entries()) {
        ctx.strokeStyle = edge === 0 ? '#ff4081' : '#00e5ff';
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          if (this.hiddenEdges[edge][i] || this.hiddenEdges[edge][j]) continue;
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
        }
        ctx.stroke();
      }
      const sl = track.startLine, half = nearestOnTrack(sl.pos, track).halfWidth;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3 * unit;
      ctx.beginPath();
      ctx.moveTo(sl.pos.x + sl.normal.x * half, sl.pos.y + sl.normal.y * half);
      ctx.lineTo(sl.pos.x - sl.normal.x * half, sl.pos.y - sl.normal.y * half);
      ctx.stroke();
    }

    // ── Real-time Pilot Cars ──
    for (const team of ['A', 'B'] as const) {
      const car = s.cars[team];
      const teamColor = team === 'A' ? '#00e5ff' : '#ff4081';
      ctx.save();
      ctx.translate(car.pos.x, car.pos.y);
      ctx.rotate(car.angle);

      // Glow behind moving car
      ctx.shadowColor = teamColor;
      ctx.shadowBlur = 12 * unit;

      // Racing car arrowhead
      ctx.fillStyle = car.disabled ? '#64748b' : teamColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      ctx.moveTo(14 * unit, 0);
      ctx.lineTo(-10 * unit, -8 * unit);
      ctx.lineTo(-5 * unit, 0);
      ctx.lineTo(-10 * unit, 8 * unit);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Boost trail
      if (car.boostUntil > (s.phase === 'PAUSED' ? s.pausedAt : performance.now())) {
        ctx.strokeStyle = '#ffd400';
        ctx.lineWidth = 3 * unit;
        ctx.beginPath();
        ctx.moveTo(-10 * unit, 0);
        ctx.lineTo(-24 * unit, 0);
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.restore();

      // Pilot label above vehicle
      textAt(`Pilote ${team}`, car.pos.x, car.pos.y, 11, teamColor, -18);
    }

    // ── Active Arcs ──
    for (const arc of s.arcs) {
      ctx.strokeStyle = '#ffe14a';
      ctx.shadowColor = '#ffe14a';
      ctx.shadowBlur = 14 * unit;
      ctx.lineWidth = 4 * unit;
      ctx.beginPath();
      ctx.moveTo(arc.pylon1.x, arc.pylon1.y);
      ctx.lineTo(arc.pylon2.x, arc.pylon2.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ── Active Tangibles (Walls & Pylons) ──
    for (const [id, t] of this.visibleTangibles()) {
      if (t.status !== 'placed' && t.status !== 'parked') continue;
      const center = { x: t.x * W, y: t.y * H };
      const selected = id === this.h.selectedId();
      const isBeingMoved = id === this.movingTangibleId;

      ctx.save();
      if (isBeingMoved) {
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([6 * unit, 6 * unit]);
      }

      if (t.kind === 'wall') {
        const [a, b] = wallEndpoints(center, t.angle, s.params.wallLengthPx);
        const points = wallCorners(center, t.angle, s.params.wallLengthPx, s.params.wallWidthPx);
        ctx.strokeStyle = t.active ? '#ff3b3b' : '#7a8498';
        ctx.shadowColor = t.active ? '#ff3b3b' : '#000000';
        ctx.shadowBlur = t.active ? 12 * unit : 0;
        ctx.fillStyle = t.active ? 'rgba(255, 59, 59, 0.35)' : 'rgba(122, 132, 152, 0.15)';
        ctx.lineWidth = (selected ? 4 : 3) * unit;
        ctx.beginPath();
        points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Endpoints
        for (const pt of s.tangiblePlacementMode==='touch'?[]:[a, b]) {
          ctx.fillStyle = '#ff6a6a';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 6 * unit, 0, Math.PI * 2);
          ctx.fill();
        }
        textAt('MUR', center.x, center.y, 11, '#ffffff');
      } else {
        // Pylon
        ctx.fillStyle = t.active ? '#ffe14a33' : '#7a849814';
        ctx.strokeStyle = t.active ? '#ffe14a' : '#7a8498';
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(center.x, center.y, s.params.pylonFieldRadiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const base = s.params.pylonBasePx;
        ctx.fillStyle = t.active ? '#ffe14a' : '#7a8498';
        ctx.fillRect(center.x - base / 2, center.y - base / 2, base, base);
        textAt(s.tangiblePlacementMode==='touch'?`P${id-1}`:'PYLÔNE', center.x, center.y, 10, '#ffe14a', -22);
      }
      ctx.restore();

      if (isBeingMoved) {
        textAt('(En déplacement…)', center.x, center.y + 18 * unit, 10, '#00e5ff');
      }
    }

    // ── 2-Click Live Preview: ARC ÉLECTRIQUE ──
    const arcRange = s.params.arcMaxDistPx ?? 350;
    if (this.tool === 'arc') {
      if (this.toolStep === 0 && this.hover) {
        // Step 0 hover: Preview first pylon
        ctx.strokeStyle = '#ffe14a';
        ctx.fillStyle = 'rgba(255, 225, 74, 0.25)';
        ctx.lineWidth = 3 * unit;
        ctx.beginPath();
        ctx.arc(this.hover.x, this.hover.y, 18 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        textAt('⚡ 1er Pylône (cliquez)', this.hover.x, this.hover.y, 12, '#ffe14a', -28);
      } else if (this.toolStep === 1 && this.firstPoint) {
        const p1 = this.firstPoint;
        // Pylon 1 placed
        ctx.fillStyle = '#ffe14a';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 14 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        textAt('Pylône 1', p1.x, p1.y, 11, '#ffffff', -24);

        // Max reach radius
        ctx.strokeStyle = 'rgba(255, 225, 74, 0.22)';
        ctx.setLineDash([8 * unit, 8 * unit]);
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, arcRange, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        if (this.hover) {
          const p2 = this.hover;
          const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const inRange = d <= arcRange;

          if (inRange) {
            // Electric lightning tether preview
            ctx.strokeStyle = '#ffe14a';
            ctx.shadowColor = '#ffe14a';
            ctx.shadowBlur = 12 * unit;
            ctx.lineWidth = 4 * unit;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Pylon 2 preview (in range)
            ctx.fillStyle = '#ffe14a';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2 * unit;
            ctx.beginPath();
            ctx.arc(p2.x, p2.y, 14 * unit, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            textAt(`⚡ Arc lié (${Math.round(d)} px ≤ ${arcRange} px)`, p2.x, p2.y, 12, '#ffe14a', -26);
          } else {
            // Out of range line (dashed red/gray, no electric arc)
            ctx.strokeStyle = 'rgba(255, 110, 110, 0.55)';
            ctx.setLineDash([6 * unit, 6 * unit]);
            ctx.lineWidth = 2 * unit;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Pylon 2 preview (solitary pylon)
            ctx.fillStyle = '#94a3b8';
            ctx.strokeStyle = '#ff6b6b';
            ctx.lineWidth = 2 * unit;
            ctx.beginPath();
            ctx.arc(p2.x, p2.y, 14 * unit, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            textAt(`⚠ Hors portée (${Math.round(d)} px > ${arcRange} px) — Pylône seul`, p2.x, p2.y, 12, '#f87171', -26);
          }
        }
      }
    }

    // ── 2-Click Live Preview: MUR ──
    if (this.tool === 'wall') {
      if (this.toolStep === 0 && this.hover) {
        // Step 0 hover
        ctx.strokeStyle = '#ff3b3b';
        ctx.fillStyle = 'rgba(255, 59, 59, 0.25)';
        ctx.lineWidth = 3 * unit;
        ctx.beginPath();
        ctx.arc(this.hover.x, this.hover.y, 14 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        textAt('🧱 1er point du mur (cliquez)', this.hover.x, this.hover.y, 12, '#ff6a6a', -24);
      } else if (this.toolStep === 1 && this.firstPoint) {
        const p1 = this.firstPoint;
        // Anchor 1
        ctx.fillStyle = '#ff3b3b';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 8 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (this.hover) {
          const p2 = this.hover;
          const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const angle = d >= 5 ? (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI + 360) % 360 : 0;
          const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

          // Guide vector line from p1 to p2
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.setLineDash([6 * unit, 6 * unit]);
          ctx.lineWidth = unit;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Wall preview rectangle (120 px length)
          const corners = wallCorners(center, angle, s.params.wallLengthPx, s.params.wallWidthPx);
          const isValid = validTangiblePose('wall', { x: center.x / s.params.logicalWidth, y: center.y / s.params.logicalHeight, angle }, s.params);
          const wallStroke = isValid ? '#ff3b3b' : '#f59e0b';
          const wallFill = isValid ? 'rgba(255, 59, 59, 0.45)' : 'rgba(245, 158, 11, 0.35)';

          ctx.strokeStyle = wallStroke;
          ctx.shadowColor = wallStroke;
          ctx.shadowBlur = 14 * unit;
          ctx.fillStyle = wallFill;
          ctx.lineWidth = 3 * unit;
          ctx.beginPath();
          corners.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Endpoints of the wall
          const [wa, wb] = wallEndpoints(center, angle, s.params.wallLengthPx);
          for (const endPt of [wa, wb]) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(endPt.x, endPt.y, 6 * unit, 0, Math.PI * 2);
            ctx.fill();
          }

          const label = isValid
            ? `🧱 Mur orienté (${Math.round(angle)}°) — Cliquez pour poser`
            : `⚠️ Emplacement sur commandes joueur — Déplacez le mur`;
          const labelColor = isValid ? '#ff6a6a' : '#fbbf24';
          textAt(label, center.x, center.y, 12, labelColor, -26);
        }
      }
    }

    // ── Live Preview: DÉPLACEMENT D'OBSTACLE (Pick & Drop) ──
    if (this.movingTangibleId && this.hover) {
      const id = this.movingTangibleId;
      const t = s.tangibles[id];
      const p = this.hover;
      if (t?.kind === 'wall') {
        if (this.movingWallStep === 0) {
          const angle = this.movingWallDraftAngle ?? t.angle;
          const corners = wallCorners(p, angle, s.params.wallLengthPx, s.params.wallWidthPx);
          const isValid = validTangiblePose('wall', { x: p.x / W, y: p.y / H, angle }, s.params);
          const strokeColor = isValid ? '#00e5ff' : '#f59e0b';
          const fillColor = isValid ? 'rgba(0, 229, 255, 0.35)' : 'rgba(245, 158, 11, 0.35)';

          ctx.strokeStyle = strokeColor;
          ctx.shadowColor = strokeColor;
          ctx.shadowBlur = 14 * unit;
          ctx.fillStyle = fillColor;
          ctx.lineWidth = 3 * unit;
          ctx.beginPath();
          corners.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;

          const [wa, wb] = wallEndpoints(p, angle, s.params.wallLengthPx);
          for (const pt of [wa, wb]) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 6 * unit, 0, Math.PI * 2);
            ctx.fill();
          }

          const label = isValid
            ? `🧱 Cliquez pour poser le 1er point (ou molette pour tourner)`
            : `⚠️ Emplacement sur commandes joueur — Déplacez le mur`;
          textAt(label, p.x, p.y, 12, isValid ? '#00e5ff' : '#fbbf24', -26);
        } else if (this.movingWallStep === 1 && this.movingWallFirstPoint) {
          const p1 = this.movingWallFirstPoint;
          // Anchor 1
          ctx.fillStyle = '#00e5ff';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 * unit;
          ctx.beginPath();
          ctx.arc(p1.x, p1.y, 8 * unit, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          const p2 = this.hover;
          const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const angle = d >= 5
            ? (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI + 360) % 360
            : (this.movingWallDraftAngle ?? t.angle);
          const center = d >= 5 ? { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } : p1;

          // Guide vector line from p1 to p2
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
          ctx.setLineDash([6 * unit, 6 * unit]);
          ctx.lineWidth = unit;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Wall preview rectangle (120 px length)
          const corners = wallCorners(center, angle, s.params.wallLengthPx, s.params.wallWidthPx);
          const isValid = validTangiblePose('wall', { x: center.x / W, y: center.y / H, angle }, s.params);
          const wallStroke = isValid ? '#00e5ff' : '#f59e0b';
          const wallFill = isValid ? 'rgba(0, 229, 255, 0.45)' : 'rgba(245, 158, 11, 0.35)';

          ctx.strokeStyle = wallStroke;
          ctx.shadowColor = wallStroke;
          ctx.shadowBlur = 14 * unit;
          ctx.fillStyle = wallFill;
          ctx.lineWidth = 3 * unit;
          ctx.beginPath();
          corners.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Endpoints of the wall
          const [wa, wb] = wallEndpoints(center, angle, s.params.wallLengthPx);
          for (const endPt of [wa, wb]) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(endPt.x, endPt.y, 6 * unit, 0, Math.PI * 2);
            ctx.fill();
          }

          const label = isValid
            ? `🧱 Mur orienté (${Math.round(angle)}°) — Cliquez pour déposer`
            : `⚠️ Emplacement sur commandes joueur — Déplacez le mur`;
          const labelColor = isValid ? '#00e5ff' : '#fbbf24';
          textAt(label, center.x, center.y, 12, labelColor, -26);
        }
      } else if (t?.kind === 'pylon') {
        const otherId = id === 2 ? 3 : 2;
        const other = s.tangibles[otherId];

        // Reach circle around cursor
        ctx.strokeStyle = 'rgba(255, 225, 74, 0.22)';
        ctx.setLineDash([8 * unit, 8 * unit]);
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(p.x, p.y, arcRange, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        if (other?.status === 'placed') {
          const op = { x: other.x * W, y: other.y * H };
          const d = Math.hypot(p.x - op.x, p.y - op.y);
          if (d <= arcRange) {
            // In range electric tether
            ctx.strokeStyle = '#ffe14a';
            ctx.shadowColor = '#ffe14a';
            ctx.shadowBlur = 12 * unit;
            ctx.lineWidth = 4 * unit;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(op.x, op.y);
            ctx.stroke();
            ctx.shadowBlur = 0;
            textAt(`⚡ Arc lié (${Math.round(d)} px ≤ ${arcRange} px) — Cliquez pour déposer`, p.x, p.y, 12, '#ffe14a', -26);
          } else {
            // Out of range
            ctx.strokeStyle = 'rgba(255, 110, 110, 0.55)';
            ctx.setLineDash([6 * unit, 6 * unit]);
            ctx.lineWidth = 2 * unit;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(op.x, op.y);
            ctx.stroke();
            ctx.setLineDash([]);
            textAt(`⚠ Hors portée (${Math.round(d)} px > ${arcRange} px) — Cliquez pour déposer`, p.x, p.y, 12, '#f87171', -26);
          }
        } else {
          textAt(`⚡ Pylône ${id === 2 ? '1' : '2'} — Cliquez pour déposer`, p.x, p.y, 12, '#ffe14a', -26);
        }

        // Pylon preview circle
        ctx.fillStyle = '#ffe14a';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Legacy preparing preview (for tests)
    if (this.h.preparing() && this.hover && !this.tool) {
      const p = this.drag?.mode === 'place' ? { x: this.drag.pose.x * W, y: this.drag.pose.y * H } : this.hover;
      const angle = this.drag?.mode === 'place' ? this.drag.pose.angle : this.h.draftAngle();
      const pose = { x: p.x / W, y: p.y / H, angle };
      const kind = this.h.selectedKind();
      ctx.strokeStyle = validTangiblePose(kind, pose, s.params) ? '#9be5bb' : '#ff6f7b';
      ctx.lineWidth = 3 * unit;
      ctx.setLineDash([7 * unit, 5 * unit]);
      ctx.beginPath();
      if (kind === 'wall') {
        const corners = wallCorners(p, angle, s.params.wallLengthPx, s.params.wallWidthPx);
        corners.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y));
        ctx.closePath();
      } else ctx.arc(p.x, p.y, 12 * unit, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (this.drag?.mode === 'place') {
        const anchor = this.drag.anchor;
        ctx.fillStyle = '#e9f8ff';
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, 5 * unit, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = `bold ${12 * unit}px system-ui`;
      ctx.textAlign = 'center';
      textAt(this.drag?.mode === 'place' ? '↻' : '＋', p.x, p.y, 12, ctx.strokeStyle as string, -28);
    }

    ctx.restore();
  }
}
