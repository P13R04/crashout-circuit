/**
 * Calcule la direction normalisée de la manette : angle, neutre mesuré manette immobile, filtre adaptatif, courbe réglable.
 * Liens : client-wiimote/steering/tiltAngle.ts, client-wiimote/steering/oneEuroFilter.ts, client-shared/pilot/steeringCurve.ts.
 * Module pur : l'heure est fournie par l'appelant, aucun accès au navigateur.
 * Réglée après les essais : un poignet tourne moins qu'un téléphone, mais la direction partait trop loin pour un petit
 * mouvement. La zone morte et l'angle de pleine direction sont donc propres à la manette, le second se règle en direct.
 */
import type { RawAccel } from '../hid/reportDecoder.js';
import { steerFromAngle, STEERING, type SteeringCurve } from '../../client-shared/pilot/steeringCurve.js';
import { OneEuroFilter } from './oneEuroFilter.js';
import { ShakeGate, tiltAngle, type TiltSettings } from './tiltAngle.js';

export type SteeringStatus = 'waiting' | 'calibrating' | 'ready';

/** Courbe de la manette : zone morte plus large, pleine direction à 50° au lieu de 35°, progression plus douce. */
export const WIIMOTE_CURVE: SteeringCurve = { deadZone: 4, maxSteer: 50, steerExponent: 1.5 };
/** Bornes de l'angle de pleine direction proposées au réglage. */
export const RANGE_LIMITS = { min: 30, max: 90 } as const;
/** Écart, en degrés, au-delà duquel la mesure du neutre repart de zéro : la manette doit être tenue immobile. */
const CALIBRATION_STILL_DEG = 4;

const radians = Math.PI / 180;

export class WiimoteSteering {
  status: SteeringStatus = 'waiting';
  /** Dernier angle mesuré en degrés, ou null si la manette est trop à plat. */
  angle: number | null = null;
  /** Dernière direction, entre -1 et 1, ou null tant que le neutre n'est pas connu. */
  steer: number | null = null;
  shaking = false;
  private readonly gate = new ShakeGate();
  private readonly filter = new OneEuroFilter(1, .05, 5);
  private curve: SteeringCurve;
  private neutral: number | null = null;
  private samples: number[] = [];
  private calibrationStart = 0;
  private lastPush: number | null = null;

  constructor(private settings: TiltSettings, range: number = WIIMOTE_CURVE.maxSteer) {
    this.curve = curveForRange(range);
  }

  /** Réglages courants de la prise en main. */
  get tilt(): TiltSettings { return this.settings; }

  /** Angle de pleine direction courant, en degrés. */
  get range(): number { return this.curve.maxSteer; }

  /** Règle l'angle de pleine direction : plus il est grand, moins la manette est sensible. */
  setRange(range: number): void {
    this.curve = curveForRange(range);
  }

  /** Change la prise en main et redemande un neutre, car l'angle change de repère. */
  configure(settings: TiltSettings): void {
    this.settings = settings;
    this.calibrate();
  }

  /** Efface le neutre : il sera mesuré de nouveau sur les prochains rapports, manette tenue droite et immobile. */
  calibrate(): void {
    this.neutral = null;
    this.samples = [];
    this.steer = null;
    this.filter.reset();
    this.lastPush = null;
    this.status = 'waiting';
  }

  /** Oublie le filtre et le neutre, par exemple après une déconnexion. */
  reset(): void {
    this.gate.reset();
    this.angle = null;
    this.shaking = false;
    this.calibrate();
  }

  /** Intègre un rapport d'accélération reçu à l'instant `now` (millisecondes). */
  push(raw: RawAccel, now: number): void {
    const { gravity, shaking } = this.gate.push(raw);
    this.shaking = shaking;
    if (shaking) return;
    this.angle = tiltAngle(gravity, this.settings);
    if (this.angle === null) {
      this.steer = null;
      this.filter.reset();
      this.lastPush = null;
      if (this.neutral === null) this.samples = [];
      this.status = 'waiting'; // Comme le téléphone : le volant est trop à plat, le neutre mesuré est conservé.
      return;
    }
    if (this.neutral === null && !this.learn(this.angle, now)) return;
    this.status = 'ready';
    const dt = this.lastPush === null ? .01 : Math.min(.1, Math.max(.001, (now - this.lastPush) / 1000));
    this.lastPush = now;
    const delta = angleDifference(this.angle, this.neutral!);
    this.steer = steerFromAngle(this.filter.filter(delta, dt), 0, this.curve);
  }

  /** Accumule les angles du neutre tant que la manette reste immobile ; renvoie vrai lorsque la mesure est terminée. */
  private learn(angle: number, now: number): boolean {
    if (this.samples.length && Math.abs(angleDifference(angle, this.samples[0])) > CALIBRATION_STILL_DEG) this.samples = [];
    if (!this.samples.length) this.calibrationStart = now;
    this.status = 'calibrating';
    this.samples.push(angle);
    if (now - this.calibrationStart < STEERING.calibrationMs) return false;
    this.neutral = circularMean(this.samples);
    this.samples = [];
    return true;
  }
}

/** Courbe de la manette pour un angle de pleine direction donné, borné entre 30° et 90°. */
function curveForRange(range: number): SteeringCurve {
  const wanted = Number.isFinite(range) ? range : WIIMOTE_CURVE.maxSteer;
  return { ...WIIMOTE_CURVE, maxSteer: Math.min(RANGE_LIMITS.max, Math.max(RANGE_LIMITS.min, wanted)) };
}

/** Écart d'angle `a - b` ramené entre -180° et 180°. */
function angleDifference(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
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
