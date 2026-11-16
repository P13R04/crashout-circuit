/** Relie le volant, les commandes tactiles et la réparation à la place du pilote. */
import { createControls } from '../../client-shared/controls.js';
import type { GameState, Team } from '../../server/types.js';
import type { PhoneSession } from '../session.js';
import { actionButton, holdButton } from '../ui/press.js';
import { driveSample, shouldSendInput, WHEEL, type SentInput } from './gyro.js';
import { WheelSensor, type WheelStatus } from './wheelSensor.js';

const wheelHints: Record<WheelStatus, string> = {
  touch: 'Active le volant ou maintiens une flèche pour tourner.',
  permission: 'Autorise le capteur dans le navigateur.',
  waiting: 'Tiens le téléphone comme un volant.',
  calibrating: 'Garde le volant droit pendant la calibration.',
  ready: 'Incline le téléphone pour tourner.',
  missing: 'Capteur indisponible. Maintiens une flèche pour tourner.',
  denied: 'Accès au capteur refusé. Maintiens une flèche pour tourner.',
  http: 'Le volant nécessite HTTPS. Maintiens une flèche pour tourner.',
};

export class PilotScreen {
  readonly root = document.createElement('section');
  private readonly wheel = new WheelSensor();
  private readonly steer;
  private readonly sensor;
  private readonly calibrate;
  private readonly mode;
  private readonly start;
  private readonly left;
  private readonly right;
  private readonly pedal;
  private readonly repair;
  private readonly steering = document.createElement('div');
  private readonly phase = document.createElement('p');
  private readonly hint = document.createElement('p');
  private readonly timer: number;
  private state: GameState | null = null;
  private driving = false;
  private leftHeld = false;
  private rightHeld = false;
  private pedalHeld = false;
  private closed = false;
  private wakeLock: WakeLockSentinel | null = null;
  private wakePending = false;
  private last: SentInput = { time: -Infinity, steer: 0, throttle: 0 };

  constructor(private readonly session: PhoneSession, private readonly team: Team, private readonly solo: boolean) {
    this.root.className = 'pilot-screen';
    this.steer = createControls(msg => this.session.send(msg)).steer;
    this.sensor = actionButton('Activer le volant', this.activate, 'primary');
    this.calibrate = actionButton('Calibrer', this.wheel.calibrate);
    this.mode = actionButton('AUTO / PÉDALE', () => this.session.send({ type: 'ToggleDriveMode', team }));
    this.start = actionButton('Lancer la course', () => this.session.send({ type: 'StartSolo' }), 'solo-start');
    this.left = holdButton('← Gauche', held => { this.leftHeld = held; });
    this.right = holdButton('Droite →', held => { this.rightHeld = held; });
    this.pedal = holdButton('Accélérer', held => { this.pedalHeld = held; });
    this.repair = holdButton('Réparer', on => this.session.send({ type: 'PadHold', team, role: 'pilot', on }));
    this.steering.className = 'pilot-steering';
    this.steering.append(this.left.button, this.right.button);
    this.phase.setAttribute('role', 'status');
    this.hint.setAttribute('role', 'status');
    const settings = document.createElement('div');
    settings.className = 'pilot-settings';
    settings.append(this.sensor, this.calibrate, this.mode);
    this.root.append(this.phase, this.hint, settings, this.steering, this.pedal.button, this.repair.button, this.start);
    this.wheel.start();
    this.timer = window.setInterval(this.tick, WHEEL.pollMs);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.release);
    void this.keepAwake();
  }

  /** Actualise la phase et les commandes sans remplacer les boutons maintenus. */
  update(state: GameState): void {
    this.state = state;
    const car = state.cars[this.team];
    const remaining = Math.max(0, Math.ceil((state.sessionStartAt - this.session.sync.now()) / 1000));
    const controls = this.session.canPlay && !document.hidden && state.phase === 'RACE';
    const driving = controls && !car.disabled && remaining === 0;
    if (this.driving && !driving) this.releaseDrive();
    if (!controls) this.repair.release();
    this.driving = driving;
    this.mode.disabled = !controls;
    this.repair.button.disabled = !controls;
    this.repair.button.hidden = this.solo || state.phase === 'LOBBY';
    this.start.hidden = !this.solo;
    this.start.disabled = !this.session.canPlay;
    const startLabel = state.phase === 'LOBBY' ? 'Lancer la course' : 'Recommencer';
    if (this.start.textContent !== startLabel) this.start.textContent = startLabel;
    const tutorial = state.tutorial;
    const identifying = tutorial?.steps[tutorial.teams[this.team].step] === 'identify';
    const phase = state.phase === 'PAUSED' ? 'Course en pause sur la table.'
      : state.phase === 'RESULT' ? 'Essai terminé.'
      : state.phase !== 'RACE' ? 'Regarde le circuit sur la table.'
      : identifying ? 'Maintiens Réparer pour confirmer ton poste.'
      : car.disabled ? this.solo ? 'Sortie de piste. Tu peux recommencer.' : 'Voiture en panne. Répare avec ton copilote.'
      : remaining ? `Départ dans ${remaining}…` : '';
    if (this.phase.textContent !== phase) this.phase.textContent = phase;
    this.refreshControls();
  }

  /** Libère le volant et les ressources du navigateur en quittant ce poste. */
  close(): void {
    this.release();
    this.closed = true;
    clearInterval(this.timer);
    this.wheel.close();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.release);
    void this.wakeLock?.release().catch(() => {});
  }

  /** Envoie les changements assez grands et renouvelle régulièrement une commande immobile. */
  private tick = (): void => {
    const now = performance.now();
    const previous = this.wheel.status;
    const sensor = this.wheel.read(now);
    if (previous !== this.wheel.status || this.hint.textContent !== wheelHints[this.wheel.status]) this.refreshControls();
    if (!this.driving || document.hidden) return;
    const touch = Number(this.rightHeld) - Number(this.leftHeld);
    const input = driveSample(sensor, touch, this.state?.driveMode[this.team] === 'pedal', this.pedalHeld);
    if (!shouldSendInput(now, input, this.last)) return;
    this.steer(this.team, input.steer, input.throttle);
    this.last = { ...input, time: now };
  };

  /** Affiche ou masque le repli et les réglages selon le capteur et le mode d'avance. */
  private refreshControls(): void {
    const status = this.wheel.status;
    const calibrating = status === 'calibrating' || status === 'waiting';
    const tactile = status !== 'ready' && !calibrating;
    const pedal = this.state?.driveMode[this.team] === 'pedal';
    const sensorLabel = status === 'touch' ? 'Activer le volant' : 'Réessayer le capteur';
    const modeLabel = pedal ? 'Mode pédale' : 'Avance auto';
    if (this.hint.textContent !== wheelHints[status]) this.hint.textContent = wheelHints[status];
    if (this.sensor.textContent !== sensorLabel) this.sensor.textContent = sensorLabel;
    if (this.mode.textContent !== modeLabel) this.mode.textContent = modeLabel;
    this.sensor.hidden = status === 'ready' || calibrating;
    this.sensor.disabled = status === 'permission';
    this.calibrate.hidden = status !== 'ready';
    this.steering.hidden = !tactile || !this.driving;
    if (!tactile) {
      this.left.release();
      this.right.release();
    }
    if (!pedal) this.pedal.release();
    this.pedal.button.hidden = !pedal || !this.driving;
    this.left.button.disabled = this.right.button.disabled = this.pedal.button.disabled = !this.driving;
  }

  /** Demande l'accès au volant pendant le toucher et essaie de fixer le paysage. */
  private activate = (): void => {
    const orientation = screen.orientation as (ScreenOrientation & { lock?: (mode: string) => Promise<void> }) | undefined;
    void this.wheel.activate().finally(() => { if (!this.closed) this.refreshControls(); });
    void orientation?.lock?.('landscape').catch(() => {});
    void this.keepAwake();
    this.refreshControls();
  };

  /** Neutralise les entrées de conduite même si un bouton était encore maintenu. */
  private releaseDrive(): void {
    const wasDriving = this.driving;
    this.driving = false;
    this.left.release();
    this.right.release();
    this.pedal.release();
    if (wasDriving) this.steer(this.team, 0, 0);
    this.last = { time: -Infinity, steer: 0, throttle: 0 };
  }

  /** Relâche également le bouton de réparation lorsque l'écran quitte le premier plan. */
  private release = (): void => {
    this.releaseDrive();
    this.repair.release();
  };

  /** Recalibre au retour au jeu et renouvelle la demande de maintien de l'écran. */
  private onVisibility = (): void => {
    if (document.hidden) this.release();
    else {
      this.wheel.calibrate();
      void this.keepAwake();
    }
    if (this.state) this.update(this.state);
  };

  /** Garde l'écran allumé si le navigateur l'autorise. */
  private async keepAwake(): Promise<void> {
    if (!navigator.wakeLock || this.closed || document.hidden || this.wakePending || this.wakeLock?.released === false) return;
    this.wakePending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (this.closed || document.hidden) await lock.release();
      else this.wakeLock = lock;
    } catch {
      // La conduite reste disponible avec la veille normale du navigateur.
    } finally {
      this.wakePending = false;
    }
  }
}
