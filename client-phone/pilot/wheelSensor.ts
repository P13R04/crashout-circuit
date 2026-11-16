/** Convertit les mesures autorisées du navigateur en commandes de volant calibrées. */
import { WHEEL, wheelAngle, neutralAngle, steerFromAngle, smoothSteer, throttleFromPitch } from './gyro.js';
import type { DriveSample } from './gyro.js';

type Reading = NonNullable<ReturnType<typeof wheelAngle>>;
type OrientationWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

export type WheelStatus = 'inactive' | 'permission' | 'waiting' | 'calibrating' | 'ready' | 'missing' | 'denied' | 'http';

export class WheelSensor {
  status: WheelStatus = 'inactive';
  private started = 0;
  private lastReading = 0;
  private calibration: Reading[] = [];
  private calibrationStart = 0;
  private neutral: Reading | null = null;
  private sample: DriveSample | null = null;
  private stopped = false;
  private listening = false;

  constructor(private readonly landscape: () => boolean) {}

  /** Écoute directement lorsque le navigateur n'exige pas de consentement au toucher. */
  start(): void {
    const sensor = this.supportedSensor();
    if (sensor && !sensor.requestPermission) this.listen();
  }

  /** Demande la permission dans le geste utilisateur et lance la calibration. */
  async activate(): Promise<void> {
    const sensor = this.supportedSensor();
    if (!sensor || this.stopped || this.status === 'permission') return;
    if (sensor.requestPermission && !this.listening) {
      this.status = 'permission';
      try {
        if (await sensor.requestPermission() !== 'granted') {
          this.status = 'denied';
          return;
        }
      } catch {
        this.status = 'denied';
        return;
      }
    }
    if (!this.stopped) this.listen();
  }

  /** Efface le neutre et mesure à nouveau la position du téléphone après une rotation. */
  calibrate = (): void => {
    if (!this.listening) return;
    this.started = performance.now();
    this.lastReading = 0;
    this.calibration = [];
    this.neutral = null;
    this.sample = null;
    this.status = 'waiting';
  };

  /** Supprime l'écoute et interdit une reprise après la fermeture de l'écran. */
  close(): void {
    this.stopped = true;
    window.removeEventListener('deviceorientation', this.onOrientation);
    if (screen.orientation) screen.orientation.removeEventListener('change', this.calibrate);
    else window.removeEventListener('orientationchange', this.calibrate);
    this.listening = false;
  }

  /** Renvoie une mesure seulement lorsque le volant est calibré en paysage. */
  read(now: number): DriveSample | null {
    if (!this.landscape()) return null;
    if ((this.status === 'ready' || this.status === 'waiting' || this.status === 'calibrating')
      && now - (this.lastReading || this.started) >= WHEEL.timeoutMs) this.status = 'missing';
    return this.status === 'ready' ? this.sample : null;
  }

  /** Identifie les navigateurs qui peuvent fournir les mesures. */
  private supportedSensor(): OrientationWithPermission | null {
    if (!window.isSecureContext) { this.status = 'http'; return null; }
    if (typeof DeviceOrientationEvent === 'undefined') { this.status = 'missing'; return null; }
    return DeviceOrientationEvent;
  }

  /** Branche le capteur et un seul événement de changement d'orientation de l'écran. */
  private listen(): void {
    if (!this.listening) {
      window.addEventListener('deviceorientation', this.onOrientation);
      if (screen.orientation) screen.orientation.addEventListener('change', this.calibrate);
      else window.addEventListener('orientationchange', this.calibrate);
      this.listening = true;
    }
    this.calibrate();
  }

  /** Apprend un neutre sur 500 ms, puis applique la courbe et le filtre aux mesures. */
  private onOrientation = (event: DeviceOrientationEvent): void => {
    if (document.hidden || !this.landscape() || this.status === 'missing') return;
    const now = performance.now();
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    const reading = wheelAngle(event.beta, event.gamma, angle);
    if (!reading) {
      this.sample = null;
      if (!this.neutral) this.calibration.length = 0;
      this.status = 'waiting';
      return;
    }
    this.lastReading = now;
    if (!this.neutral) {
      if (!this.calibration.length) this.calibrationStart = now;
      this.status = 'calibrating';
      this.calibration.push(reading);
      if (now - this.calibrationStart < WHEEL.calibrationMs) return;
      this.neutral = neutralAngle(this.calibration);
      this.calibration = [];
    }
    this.status = 'ready';
    this.sample = {
      steer: smoothSteer(this.sample?.steer ?? 0, steerFromAngle(reading.wheel, this.neutral.wheel)),
      throttle: throttleFromPitch(reading.pitch, this.neutral.pitch),
    };
  };
}
