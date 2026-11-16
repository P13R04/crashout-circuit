/**
 * Calcule la direction normalisée de la manette : filtre, angle, neutre mesuré sur 500 ms, puis courbe du téléphone.
 * Liens : client-wiimote/steering/tiltAngle.ts, client-shared/pilot/steeringCurve.ts (zone morte ±3°, maximum ±35°).
 * Module pur : l'heure est fournie par l'appelant, aucun accès au navigateur.
 */
import type { RawAccel } from '../hid/reportDecoder.js';
import { smoothSteer, steerFromAngle, STEERING } from '../../client-shared/pilot/steeringCurve.js';
import { GravityFilter, tiltAngle, type TiltSettings } from './tiltAngle.js';

export type SteeringStatus = 'waiting' | 'calibrating' | 'ready';

const radians = Math.PI / 180;

export class WiimoteSteering {
  status: SteeringStatus = 'waiting';
  /** Dernier angle mesuré en degrés, ou null si la manette est trop à plat. */
  angle: number | null = null;
  /** Dernière direction lissée, entre -1 et 1, ou null tant que le neutre n'est pas connu. */
  steer: number | null = null;
  shaking = false;
  private readonly filter = new GravityFilter();
  private neutral: number | null = null;
  private samples: number[] = [];
  private calibrationStart = 0;

  constructor(private settings: TiltSettings) {}

  /** Réglages courants de la prise en main. */
  get tilt(): TiltSettings { return this.settings; }

  /** Change la prise en main et redemande un neutre, car l'angle change de repère. */
  configure(settings: TiltSettings): void {
    this.settings = settings;
    this.calibrate();
  }

  /** Efface le neutre : il sera mesuré de nouveau sur les prochains rapports, manette tenue droite. */
  calibrate(): void {
    this.neutral = null;
    this.samples = [];
    this.steer = null;
    this.status = 'waiting';
  }

  /** Oublie le filtre et le neutre, par exemple après une déconnexion. */
  reset(): void {
    this.filter.reset();
    this.angle = null;
    this.shaking = false;
    this.calibrate();
  }

  /** Intègre un rapport d'accélération reçu à l'instant `now` (millisecondes). */
  push(raw: RawAccel, now: number): void {
    const { gravity, shaking } = this.filter.push(raw);
    this.shaking = shaking;
    if (shaking) return;
    this.angle = tiltAngle(gravity, this.settings);
    if (this.angle === null) {
      this.steer = null;
      if (this.neutral === null) this.samples = [];
      this.status = 'waiting'; // Comme le téléphone : le volant est trop à plat, le neutre mesuré est conservé.
      return;
    }
    if (this.neutral === null && !this.learn(this.angle, now)) return;
    this.status = 'ready';
    this.steer = smoothSteer(this.steer ?? 0, steerFromAngle(this.angle, this.neutral!));
  }

  /** Accumule les angles du neutre ; renvoie vrai lorsque la mesure est terminée. */
  private learn(angle: number, now: number): boolean {
    if (!this.samples.length) this.calibrationStart = now;
    this.status = 'calibrating';
    this.samples.push(angle);
    if (now - this.calibrationStart < STEERING.calibrationMs) return false;
    this.neutral = circularMean(this.samples);
    this.samples = [];
    return true;
  }
}

/** Moyenne d'angles, correcte de part et d'autre du passage de +180° à -180°. */
export function circularMean(angles: readonly number[]): number {
  let sin = 0, cos = 0;
  for (const angle of angles) {
    sin += Math.sin(angle * radians);
    cos += Math.cos(angle * radians);
  }
  return Math.atan2(sin, cos) / radians;
}
