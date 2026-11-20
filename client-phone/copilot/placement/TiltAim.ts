/**
 * Mesure l'inclinaison latérale du lance-pierre pendant un appui.
 * Liens : client-phone/sensors/orientation.ts, AccessiblePlacement.ts.
 */
import { steerFromAngle } from '../../../client-shared/pilot/steeringCurve.js';
import { orientationSource, screenAngle, screenGravity, type OrientationSource } from '../../sensors/orientation.js';

const FIRST_SAMPLE_TIMEOUT_MS = 2_000;
const AIM_CURVE = { deadZone: 1, maxSteer: 30, steerExponent: 1 };
type TiltSource = 'orientation' | 'motion';
type Reading = { tilt: number; screen: number; source: TiltSource };
type TiltStatus = 'inactive' | 'permission' | 'waiting' | 'ready' | 'denied' | 'unavailable';

/** Mesure le roulis utilisable même lorsque le téléphone est presque à plat. */
export function lateralTilt(beta: number | null, gamma: number | null, orientation: number): number | null {
  const gravity = screenGravity(beta, gamma, orientation);
  return gravity ? Math.asin(Math.max(-1, Math.min(1, -gravity.horizontal))) * 180 / Math.PI : null;
}

/** Retrouve le roulis à partir de la gravité quand le navigateur ne fournit pas les angles d'orientation. */
function motionTilt(gravity: DeviceMotionEventAcceleration | null, orientation: number): number | null {
  if (!gravity) return null;
  const { x, y, z } = gravity;
  if (x === null || y === null || z === null || ![x, y, z].every(Number.isFinite)) return null;
  const length = Math.hypot(x, y, z);
  if (length < 5) return null;
  const radians = orientation * Math.PI / 180;
  const horizontal = x * Math.cos(radians) - y * Math.sin(radians);
  return Math.asin(Math.max(-1, Math.min(1, -horizontal / length))) * 180 / Math.PI;
}

/** Choisit l'API qui peut demander la permission des capteurs dans le geste utilisateur. */
function motionSource(): (typeof DeviceMotionEvent & Pick<OrientationSource, 'requestPermission'>) | null {
  return window.isSecureContext && typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : null;
}

export class TiltAim {
  status: TiltStatus = 'inactive';
  private generation = 0;
  private samples: Partial<Record<TiltSource, Reading>> = {};
  private neutral: Reading | null = null;
  private aimScreen: number | null = null;
  private waitingTimer?: ReturnType<typeof setTimeout>;
  private permissionGranted = false;

  constructor(private readonly refresh: () => void) {}

  /** Démarre le capteur dans le geste qui sélectionne le lance-pierre ou active l'inclinaison. */
  async enable(): Promise<void> {
    if (['permission', 'waiting', 'ready'].includes(this.status)) return;
    const orientation = orientationSource(), motion = motionSource();
    if (!orientation && !motion) { this.setStatus('unavailable'); return; }
    const requestPermission = orientation?.requestPermission?.bind(orientation) ?? motion?.requestPermission?.bind(motion);
    const generation = ++this.generation;
    if (requestPermission && !this.permissionGranted) {
      this.setStatus('permission');
      try {
        const allowed = await requestPermission() === 'granted';
        if (this.generation !== generation) return;
        if (!allowed) { this.setStatus('denied'); return; }
        this.permissionGranted = true;
      } catch {
        if (this.generation === generation) this.setStatus('denied');
        return;
      }
    }
    if (this.generation !== generation) return;
    if (orientation) window.addEventListener('deviceorientation', this.onOrientation);
    if (motion) window.addEventListener('devicemotion', this.onMotion);
    this.waitingTimer = setTimeout(() => this.setStatus('unavailable'), FIRST_SAMPLE_TIMEOUT_MS);
    this.setStatus('waiting');
  }

  /** Calibre le neutre sur la position tenue au début du geste. */
  begin(): void {
    this.aimScreen = screenAngle();
    const { orientation, motion } = this.samples;
    this.neutral = orientation?.screen === this.aimScreen ? orientation
      : motion?.screen === this.aimScreen ? motion : null;
  }

  /** Conserve la dernière direction valide quand le navigateur cesse d'émettre à l'arrêt. */
  offset(): number | null {
    const neutral = this.neutral, sample = neutral && this.samples[neutral.source];
    if (!sample || this.aimScreen !== screenAngle() || sample.screen !== this.aimScreen) return null;
    return steerFromAngle(sample.tilt, neutral.tilt, AIM_CURVE) * 180;
  }

  /** Termine la visée en cours et laisse le capteur prêt pour une autre prise. */
  end(): void { this.neutral = this.aimScreen = null; }

  /** Arrête le capteur et invalide une permission qui arrive après la fermeture. */
  stop(): void {
    if (this.status === 'inactive') return;
    this.generation++;
    clearTimeout(this.waitingTimer);
    window.removeEventListener('deviceorientation', this.onOrientation);
    window.removeEventListener('devicemotion', this.onMotion);
    this.samples = {};
    this.end();
    this.status = 'inactive';
  }

  /** Met à jour le statut annoncé lors d'un changement de disponibilité. */
  private setStatus(status: TiltStatus): void {
    this.status = status;
    this.refresh();
  }

  /** Lit les angles transmis par le navigateur. */
  private onOrientation = (event: DeviceOrientationEvent): void => {
    const screen = screenAngle();
    this.record('orientation', lateralTilt(event.beta, event.gamma, screen), screen);
  };

  /** Lit le vecteur de gravité exposé par l'accéléromètre. */
  private onMotion = (event: DeviceMotionEvent): void => {
    const screen = screenAngle();
    this.record('motion', motionTilt(event.accelerationIncludingGravity, screen), screen);
  };

  /** Calibre si la première mesure arrive pendant le maintien et conserve cette source jusqu'au relâchement. */
  private record(source: TiltSource, tilt: number | null, screen: number): void {
    if (document.hidden || tilt === null) return;
    clearTimeout(this.waitingTimer);
    const sample = this.samples[source] = { tilt, screen, source };
    if (this.aimScreen === screen) this.neutral ??= sample;
    if (this.status !== 'ready' || (this.aimScreen === screen && this.neutral?.source === source)) this.setStatus('ready');
  }
}
