import type { Vec2 } from '../server/types.js';

export interface TrailPoint extends Vec2 { t: number; boosted: boolean }
export const TRAIL_LIMIT = 72;
export const TRAIL_LIFE_MS = 2000;
export function advanceVisualTime(time: number, delta: number, paused: boolean): number {
  return paused || !Number.isFinite(delta) ? time : time + Math.min(50, Math.max(0, delta));
}
/** Bounded visual history. A respawn is a discontinuity, never a line across the map. */
export class TrailBuffer {
  readonly points: TrailPoint[] = [];
  add(pos: Vec2, now: number, boosted: boolean, moving: boolean): void {
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(now)) return;
    while (this.points.length && now - this.points[0].t > TRAIL_LIFE_MS) this.points.shift();
    const last = this.points[this.points.length - 1];
    if (last && (now < last.t || Math.hypot(pos.x - last.x, pos.y - last.y) > 100)) this.clear();
    if (!moving) return;
    const prev = this.points[this.points.length - 1];
    if (prev && (now - prev.t < 30 || Math.hypot(pos.x - prev.x, pos.y - prev.y) < .7)) return;
    this.points.push({ x: pos.x, y: pos.y, t: now, boosted });
    if (this.points.length > TRAIL_LIMIT) this.points.shift();
  }
  clear(): void { this.points.length = 0; }
}
