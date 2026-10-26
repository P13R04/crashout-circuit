import type { Car, Team, TrackGeometry, Vec2 } from './types.js';
import { closestOnSegment, dist, wrapAngle } from './geometry.js';
import { config } from './config.js';

export interface PilotCommand { throttle: number; steer: number }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Centre-line follower: it produces controls, never positions, and cannot see obstacles. */
export class AutomaticPilot {
  private track: TrackGeometry | null = null;
  private version = -1;
  private cumulative: number[] = [];
  private length = 0;
  private indices: Partial<Record<Team, number>> = {};

  reset(): void {
    this.track = null; this.version = -1; this.indices = {};
  }

  forget(team: Team): void { delete this.indices[team]; }

  command(car: Car, track: TrackGeometry, version: number): PilotCommand {
    if (this.track !== track || this.version !== version) {
      if (this.track !== track) this.indices = {};
      this.track = track; this.version = version;
      this.cumulative = [0];
      const points = track.centerline;
      for (let i = 0; i < points.length; i++) {
        this.cumulative.push(this.cumulative[i] + dist(points[i], points[(i + 1) % points.length]));
      }
      this.length = this.cumulative.at(-1)!;
    }
    if (this.length < 1 || car.disabled) return { throttle: 0, steer: 0 };
    const points = track.centerline, n = points.length;
    const hint = this.indices[car.team];
    const nearest = (local: boolean) => {
      let best = { index: 0, point: points[0], distance: Infinity };
      for (let i = 0; i < n; i++) {
        if (local && hint !== undefined) {
          const gap = Math.abs(this.cumulative[i] - this.cumulative[hint]);
          if (Math.min(gap, this.length - gap) > 180) continue;
        }
        const point = closestOnSegment(car.pos, points[i], points[(i + 1) % n]);
        const distance = dist(car.pos, point);
        if (distance < best.distance) best = { index: i, point, distance };
      }
      return best;
    };
    // Keeping a local progress window prevents branch changes at a figure-eight crossing.
    // A repair can teleport to a checkpoint, in which case reacquire the nearest segment.
    let hit = nearest(hint !== undefined);
    if (hit.distance > 220) hit = nearest(false);
    this.indices[car.team] = hit.index;
    const progress = this.cumulative[hit.index] + dist(points[hit.index], hit.point);
    const lookAhead = Math.min(110, 55 + car.speed * .22);
    const target = this.at(progress + lookAhead);
    const error = wrapAngle(Math.atan2(target.point.y - car.pos.y, target.point.x - car.pos.x) - car.angle);
    const heading = Math.atan2(points[(hit.index + 1) % n].y - points[hit.index].y,
      points[(hit.index + 1) % n].x - points[hit.index].x);
    const curvature = Math.abs(wrapAngle(target.heading - heading)) / lookAhead;
    let speed = Math.min(200, config.vMaxFwd, .7 * config.turnRate / Math.max(.001, curvature));
    // Slow a tight bend or a large post-impact heading error, without looking at the obstacle.
    if (Math.abs(error) > .9) speed = Math.min(speed, 80);
    if (Math.abs(error) > 1.6) speed = Math.min(speed, 45);
    const yaw = Math.abs(error) > Math.PI / 2 ? Math.sign(error) * config.turnRate
      : 2 * Math.max(60, car.speed) * Math.sin(error) / Math.max(1, dist(car.pos, target.point));
    const grip = Math.max(.2, Math.min(1, car.speed / 100));
    return { throttle: clamp(speed / config.vMaxFwd, 0, 1), steer: clamp(yaw / (config.turnRate * grip), -1, 1) };
  }

  private at(distance: number): { point: Vec2; heading: number } {
    const along = ((distance % this.length) + this.length) % this.length;
    let lo = 0, hi = this.cumulative.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid] <= along) lo = mid; else hi = mid;
    }
    const points = this.track!.centerline, a = points[lo], b = points[(lo + 1) % points.length];
    const f = (along - this.cumulative[lo]) / Math.max(1e-9, this.cumulative[lo + 1] - this.cumulative[lo]);
    return { point: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, heading: Math.atan2(b.y - a.y, b.x - a.x) };
  }
}
