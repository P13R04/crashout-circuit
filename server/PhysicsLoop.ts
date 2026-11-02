/**
 * Fait avancer la simulation des voitures et appelle les règles de collision, de réparation et de fin de
 * course.
 * Liens : server/GameRules.ts, server/geometry.ts, server/types.ts, server/config.ts,
 * server/raceSettings.ts.
 * Référencé notamment par server/GameServer.ts, scripts/acceptance.ts, scripts/autopilot.ts.
 */
import type { GameState, Team, Car } from './types.js';
import { config } from './config.js';
import { speedScale } from './raceSettings.js';
import { nearestOnTrack } from './geometry.js';
import { GameRules, CAR_RADIUS } from './GameRules.js';

const TEAMS: Team[] = ['A', 'B'];

/** Fait avancer la simulation des voitures et appelle les règles de collision, de réparation et de fin de course. */
export class PhysicsLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTime = 0;

  /** Conserve l’état, les règles, l’horloge et la diffusion utilisés par les pas de simulation. */
  constructor(
    private state: GameState,
    private rules: GameRules,
    private broadcast: () => void,
    private clock: () => number = Date.now,
  ) {}

  /** Démarre la simulation à pas fixe et limite le rattrapage après un blocage de la boucle Node. */
  start(): void {
    if (this.timer) return;
    this.lastTime = this.clock();
    this.timer = setInterval(/* Rattrape quelques pas fixes après une attente sans laisser la simulation accumuler un retard illimité. */ () => {
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

  /** Arrête le minuteur de simulation sans conserver de mise à jour programmée. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Actualise les échéances, les voitures et les règles puis diffuse un état à la fréquence réseau prévue. */
  step(now: number, dt = 1 / config.physicsHz): void {
    const s = this.state;
    s.tick++;

    this.rules.tickMap(now);
    this.rules.tickTangiblePlacement(now);

    if (s.phase === 'RACE' && s.track) {
      this.rules.expire(now);
      this.rules.expirePilotInputs(now);
      this.rules.updateTrackDeformations(now);
      if (now >= s.sessionStartAt) {
        this.rules.updateAutomaticPilots(now);
        for (const team of TEAMS) {
          const car = s.cars[team];
          const prev = { x: car.pos.x, y: car.pos.y };
          this.integrate(car, this.rules.inputs[team], now, dt);
          this.checkTrackFall(team, car, now);
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

  /** Met à jour la vitesse, l’orientation et la position de la voiture à partir des commandes et des effets actifs. */
  private integrate(car: Car, input: { throttle: number; steer: number }, now: number, dt: number): void {
    const stunned = now < car.stunUntil;
    const tutorial = this.state.tutorial;
    const identifying = tutorial && (['A', 'B'] as const).some(/* Repère une équipe encore à l’identification pour immobiliser les voitures du tutoriel. */ t => tutorial.steps[tutorial.teams[t].step] === 'identify');
    const lesson = tutorial?.steps[tutorial.teams[car.team].step];
    const lessonDone = tutorial && (!lesson || lesson === 'depot');
    if (identifying || lessonDone || car.disabled || car.respawnUntil>now) {
      car.speed = 0;
      car.velocity = { x: 0, y: 0 };
      return;
    }
    // Auto mode drives continuously; pedal mode accelerates only while held.
    const automatic = this.state.sessionMode === 'tangibles-test';
    const isPedal = !automatic && this.state.driveMode[car.team] === 'pedal';
    const throttle = stunned ? 0 : (automatic || isPedal) ? input.throttle : 1;
    const steer = stunned ? 0 : input.steer;

    const boost = now < car.boostUntil ? 1 + config.boostGain * car.boostK : 1;
    const slow = now < car.slowUntil ? config.arcSlowFactor : 1;
    const baseMaxFwd = (isPedal ? config.vMaxPedal : config.vMaxFwd)*speedScale(this.state.params.difficulty);
    const maxFwd = baseMaxFwd * boost * slow;

    const target = throttle * maxFwd;
    const rate = throttle < car.speed / Math.max(maxFwd, 1) ? config.coastDecel : config.accel;
    const diff = target - car.speed;
    const stepV = rate * dt;
    car.speed += Math.abs(diff) <= stepV ? diff : Math.sign(diff) * stepV;
    // Boost and slow-down also act as a hard cap on the current speed
    car.speed = Math.max(0, Math.min(maxFwd, car.speed));

    // Steering scales with speed so the car cannot spin on the spot.
    const grip = Math.max(-1, Math.min(1, car.speed / 100));
    car.angle += steer * config.turnRate * grip * dt;

    const hx = Math.cos(car.angle), hy = Math.sin(car.angle);
    car.pos = { x: car.pos.x + hx * car.speed * dt, y: car.pos.y + hy * car.speed * dt };
    car.velocity = { x: hx * car.speed, y: hy * car.speed };
  }

  /** Détecte une sortie de chaussée puis laisse GameRules traiter la chute. */
  private checkTrackFall(team: Team, car: Car, now: number): void {
    const track = this.state.track;
    if (!track || car.disabled || car.respawnUntil>now) return;
    const hit = nearestOnTrack(car.pos, track);
    const limit = hit.halfWidth - CAR_RADIUS;
    const reformGrace = this.rules.isTrackReforming() ? config.trackDeformSafetyPx : 0;
    if (hit.distance <= limit + reformGrace) return;

    this.rules.fallOffTrack(team, now);
  }
}
