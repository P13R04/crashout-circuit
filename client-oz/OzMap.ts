/**
 * OzMap — clickable miniature of the track (REQ-7.1). A click places the selected
 * pylon, a drag moves it; coordinates are sent normalized (0–1) so the result is
 * identical to what a real TUIO table would report (T-10).
 */
import type { GameState } from '../server/types.js';

export const PYLON_COLOR: Record<number, string> = { 1: '#00e5ff', 2: '#00e5ff', 3: '#ff4081', 4: '#ff4081' };

export interface OzMapHandlers {
  /** Pylon placed or moved (normalized 0–1 coordinates). */
  onMove(id: number, x: number, y: number): void;
  /** A pylon was picked on the map. */
  onSelect(id: number): void;
  selectedId(): number;
}

const MOVE_THROTTLE_MS = 40;

export class OzMap {
  private ctx: CanvasRenderingContext2D;
  private state: GameState | null = null;
  private dragging = false;
  private lastSent = 0;

  constructor(private canvas: HTMLCanvasElement, private h: OzMapHandlers) {
    this.ctx = canvas.getContext('2d')!;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
  }

  setState(state: GameState): void {
    this.state = state;
    this.draw();
  }

  private norm(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.norm(e);
    // Picking an existing pylon selects it; otherwise the selected id is (re)placed here.
    const tangibles = this.state?.tangibles ?? {};
    const r = this.canvas.getBoundingClientRect();
    for (const [id, t] of Object.entries(tangibles)) {
      if (Math.hypot((t.x - p.x) * r.width, (t.y - p.y) * r.height) < 14) {
        this.h.onSelect(Number(id));
        break;
      }
    }
    this.dragging = true;
    this.lastSent = performance.now();
    this.h.onMove(this.h.selectedId(), p.x, p.y);
  }

  private move(e: PointerEvent): void {
    if (!this.dragging) return;
    const now = performance.now();
    if (now - this.lastSent < MOVE_THROTTLE_MS) return;
    this.lastSent = now;
    const p = this.norm(e);
    this.h.onMove(this.h.selectedId(), p.x, p.y);
  }

  private up(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    const p = this.norm(e);
    this.h.onMove(this.h.selectedId(), p.x, p.y); // final position
  }

  draw(): void {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#04081f';
    ctx.fillRect(0, 0, W, H);
    const s = this.state;
    if (!s) return;
    const k = W / s.params.logicalWidth;

    if (s.track) {
      const path = (pts: { x: number; y: number }[]): void => {
        ctx.moveTo(pts[0].x * k, pts[0].y * k);
        for (const p of pts) ctx.lineTo(p.x * k, p.y * k);
        ctx.closePath();
      };
      ctx.beginPath();
      path(s.track.outerEdge);
      ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath();
      path(s.track.innerEdge);
      ctx.strokeStyle = '#00e5ff'; ctx.stroke();
      const sl = s.track.startLine;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo((sl.pos.x + sl.normal.x * 60) * k, (sl.pos.y + sl.normal.y * 60) * k);
      ctx.lineTo((sl.pos.x - sl.normal.x * 60) * k, (sl.pos.y - sl.normal.y * 60) * k);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#555';
      ctx.font = '12px monospace';
      ctx.fillText('(pas de piste — phase ' + s.phase + ')', 10, 20);
    }

    // Cars
    for (const t of ['A', 'B'] as const) {
      const c = s.cars[t];
      ctx.fillStyle = t === 'A' ? '#00e5ff' : '#ff4081';
      ctx.beginPath();
      ctx.arc(c.pos.x * k, c.pos.y * k, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Arcs and walls
    ctx.lineWidth = 2;
    for (const a of s.arcs) {
      ctx.strokeStyle = '#ffe14a';
      ctx.beginPath(); ctx.moveTo(a.pylon1.x * k, a.pylon1.y * k); ctx.lineTo(a.pylon2.x * k, a.pylon2.y * k); ctx.stroke();
    }
    // Pylons, with their angle
    const sel = this.h.selectedId();
    for (const [idStr, t] of Object.entries(s.tangibles)) {
      const id = Number(idStr);
      const x = t.x * W, y = t.y * H;
      const a = (t.angle * Math.PI) / 180;
      ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3;
      const half = (120 * k) / 2;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * half, y - Math.sin(a) * half);
      ctx.lineTo(x + Math.cos(a) * half, y + Math.sin(a) * half);
      ctx.stroke();
      ctx.fillStyle = PYLON_COLOR[id];
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      if (id === sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#04081f'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(id), x, y + 4);
    }
    ctx.textAlign = 'left';
  }
}
