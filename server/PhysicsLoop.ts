/**
 * PhysicsLoop — authoritative 60 Hz vehicle simulation.
 *
 * Per tick (Δt = 1/physicsHz): housekeeping, vehicle integration, track-edge
 * collision (rebound ×0.6, no damage), then game rules (pickups, gates, hostile
 * elements, checkpoints, stones, repair, victory). The state is broadcast every
 * `physicsHz / broadcastHz` ticks (30 Hz).
 */
import type { GameState, Team, Car } from './types.js';
import { config } from './config.js';
import { nearestOnTrack } from './geometry.js';
import { GameRules, CAR_RADIUS } from './GameRules.js';

const TEAMS: Team[] = ['A', 'B'];
const DRAG_DECEL = 300; // px/s² when the pedal is released

export class PhysicsLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTime = 0;

  constructor(
    private state: GameState,
    private rules: GameRules,
    private broadcast: () => void,
    private clock: () => number = Date.now,
  ) {}

  start(): void {
    if (this.timer) return;
    this.lastTime = this.clock();
    this.timer = setInterval(() => {
      const now = this.clock();
      // Fixed step; if the event loop stalled, catch up at most 3 steps.
      const dt = 1 / config.physicsHz;
      let steps = 0;
      while (this.lastTime + dt * 1000 <= now && steps < 3) {
        this.lastTime += dt * 1000;
        this.step(this.lastTime, dt);
        steps++;
      }
      if (steps === 3) this.lastTime = now;
    }, 1000 / config.physicsHz);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One simulation step at simulated time `now` (ms). Exposed for tests. */
  step(now: number, dt = 1 / config.physicsHz): void {
    const s = this.state;
    s.tick++;

    this.rules.tickMap(now);

    if (s.phase === 'RACE' && s.track) {
      this.rules.expire(now);
      if (now >= s.sessionStartAt) {
        for (const team of TEAMS) {
          const car = s.cars[team];
          const prev = { x: car.pos.x, y: car.pos.y };
          this.integrate(car, this.rules.inputs[team], now, dt);
          this.collideTrack(car);
          this.rules.afterMove(team, prev, now);
        }
        this.rules.updateStones(now);
        this.rules.updateRepair(dt, now);
        this.rules.checkEnd(now);
      }
    }

    const every = Math.max(1, Math.round(config.physicsHz / config.broadcastHz));
    if (s.tick % every === 0) this.broadcast();
  }

  private integrate(car: Car, input: { throttle: number; steer: number }, now: number, dt: number): void {
    const stunned = now < car.stunUntil;
    if (car.disabled) {
      car.speed = 0;
      car.velocity = { x: 0, y: 0 };
      return;
    }
    const throttle = stunned ? 0 : input.throttle;
    const steer = stunned ? 0 : input.steer;

    const boost = now < car.boostUntil ? 1 + config.boostGain * car.boostK : 1;
    const slow = now < car.slowUntil ? config.arcSlowFactor : 1;
    const maxFwd = config.vMaxFwd * boost * slow;
    const maxRev = config.vMaxRev * slow;

    const target = throttle >= 0 ? throttle * maxFwd : throttle * maxRev;
    const rate = throttle === 0 || stunned ? DRAG_DECEL : config.accel;
    const diff = target - car.speed;
    const stepV = rate * dt;
    car.speed += Math.abs(diff) <= stepV ? diff : Math.sign(diff) * stepV;
    // Boost and slow-down also act as a hard cap on the current speed
    car.speed = Math.max(-maxRev, Math.min(maxFwd, car.speed));

    // Steering scales with speed so the car cannot spin on the spot; reversing flips it
    const grip = Math.max(-1, Math.min(1, car.speed / 100));
    car.angle += steer * config.turnRate * grip * dt;

    const hx = Math.cos(car.angle), hy = Math.sin(car.angle);
    car.pos = { x: car.pos.x + hx * car.speed * dt, y: car.pos.y + hy * car.speed * dt };
    car.velocity = { x: hx * car.speed, y: hy * car.speed };
  }

  /** The drivable area is the band of local half-width around the centerline. */
  private collideTrack(car: Car): void {
    const track = this.state.track;
    if (!track || car.disabled) return;
    const hit = nearestOnTrack(car.pos, track);
    const limit = hit.halfWidth - CAR_RADIUS;
    if (hit.distance <= limit) return;

    // Push back inside and reflect about the edge (normal points to the centerline)
    const nx = (hit.closest.x - car.pos.x) / (hit.distance || 1);
    const ny = (hit.closest.y - car.pos.y) / (hit.distance || 1);
    car.pos = { x: hit.closest.x - nx * limit, y: hit.closest.y - ny * limit };
    this.rules.reflect(car, nx, ny);
    car.velocity = { x: Math.cos(car.angle) * car.speed, y: Math.sin(car.angle) * car.speed };
  }
}
