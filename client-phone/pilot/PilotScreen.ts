/** Relie le volant et la réparation à la place du pilote. */
import { createControls } from '../../client-shared/controls.js';
import type { GameState, Team } from '../../server/types.js';
import type { PhoneSession } from '../session.js';
import { actionButton, holdButton } from '../ui/press.js';
import { driveSample, shouldSendInput, WHEEL, type SentInput } from './gyro.js';
import { KeyboardDrive } from './KeyboardDrive.js';
import { PilotViewport } from './views/PilotViewport.js';
import { SteerStrip } from './SteerStrip.js';
import { WheelSensor, type WheelStatus } from './wheelSensor.js';

type LandscapeLock = ScreenOrientation & { lock?: (mode: 'landscape') => Promise<void> };

const TOUCH_HINT = 'Pose le pouce sur la bande et glisse-le à gauche ou à droite pour tourner.';
/** Explique le volant gyroscopique tant qu'il se prépare ; une fois prêt, il conduit à la place de la bande. */
const wheelHints: Record<WheelStatus, string> = {
  inactive: TOUCH_HINT,
  permission: 'Autorise le capteur dans le navigateur, ou conduis au doigt.',
  waiting: 'Tiens le téléphone comme un volant, ou conduis au doigt.',
  calibrating: 'Garde le volant droit pendant la calibration.',
  ready: 'Incline le téléphone pour tourner.',
  missing: TOUCH_HINT,
  denied: TOUCH_HINT,
  http: TOUCH_HINT,
};
const PRE_RACE_TEXT: Record<string, string> = {
  LOBBY: 'Poste réservé. Essaie la direction : le départ se donne depuis la table.',
  SETUP: 'Poste réservé. Essaie la direction : le départ se donne depuis la table.',
  MAP: 'Les équipes dessinent le circuit sur la table.',
  READY: 'Circuit prêt. Attends le départ sur la table.',
};

export class PilotScreen {
  readonly root = document.createElement('section');
  private readonly landscape = matchMedia('(orientation: landscape)');
  private readonly wheel = new WheelSensor(() => this.landscape.matches);
  private readonly viewport: PilotViewport;
  private readonly keyboard: KeyboardDrive | null;
  private readonly steer;
  private readonly strip = new SteerStrip();
  private readonly joystickChoice;
  private readonly gyroChoice;
  private readonly choice = document.createElement('div');
  private readonly note = document.createElement('p');
  private readonly leave;
  private readonly fullscreen;
  private readonly calibrate;
  private readonly mode;
  private readonly start;
  private readonly pedal;
  private readonly repair;
  private readonly phase = document.createElement('p');
  private readonly hint = document.createElement('p');
  private readonly timer: number;
  private state: GameState | null = null;
  private driving = false;
  private pedalHeld = false;
  private closed = false;
  private wakeLock: WakeLockSentinel | null = null;
  private wakePending = false;
  private orientationLocked = false;
  private ownsFullscreen = false;
  /** Mode de conduite choisi : le joystick (bande tactile) est actif d'emblée, le gyroscope se choisit. */
  private steering: 'joystick' | 'gyro' = 'joystick';
  private last: SentInput = { time: -Infinity, steer: 0, throttle: 0 };

  constructor(private readonly session: PhoneSession, private readonly team: Team, private readonly solo: boolean, keyboard = false) {
    this.root.className = 'pilot-screen';
    this.keyboard = keyboard ? new KeyboardDrive(this.release) : null;
    this.viewport = new PilotViewport(team, () => session.sync.now(), solo);
    this.steer = createControls(msg => this.session.send(msg)).steer;
    this.joystickChoice = actionButton('Joystick', () => this.choose('joystick'));
    this.gyroChoice = actionButton('Volant gyroscope', () => this.choose('gyro'));
    this.choice.className = 'mode-choice';
    this.choice.setAttribute('role', 'group');
    this.choice.setAttribute('aria-label', 'Mode de conduite');
    this.choice.append(this.joystickChoice, this.gyroChoice);
    this.note.className = 'detail';
    this.leave = actionButton('Changer de place', () => this.session.leave());
    this.fullscreen = actionButton('Paysage plein écran', () => { void this.lockLandscape(true); });
    this.calibrate = actionButton('Calibrer', this.wheel.calibrate);
    this.mode = actionButton('AUTO / PÉDALE', () => this.session.send({ type: 'ToggleDriveMode', team }));
    this.start = actionButton('Lancer la course', () => this.session.send({ type: 'StartSolo' }), 'solo-start');
    this.pedal = holdButton('Accélérer', held => { this.pedalHeld = held; });
    this.repair = holdButton('Réparer', on => this.session.send({ type: 'PadHold', team, role: 'pilot', on }));
    this.phase.setAttribute('role', 'status');
    this.hint.setAttribute('role', 'status');
    const settings = document.createElement('div');
    settings.className = 'pilot-settings';
    settings.append(this.fullscreen, this.calibrate, this.mode);
    this.root.append(this.phase, this.hint, this.choice, this.note, this.viewport.root, this.strip.root, this.pedal.button, this.repair.button, settings, this.start, this.leave);
    if (!this.keyboard) this.wheel.start();
    this.timer = window.setInterval(this.tick, WHEEL.pollMs);
    this.landscape.addEventListener('change', this.onRotation);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.release);
    void this.keepAwake();
  }

  /** Actualise la phase et les commandes sans remplacer les boutons maintenus. */
  update(state: GameState): void {
    this.state = state;
    this.viewport.root.hidden = !state.track || (!this.keyboard && !this.landscape.matches && this.gyroListening());
    this.viewport.update(state, this.session.stateTime);
    const car = state.cars[this.team];
    const remaining = Math.max(0, Math.ceil((state.sessionStartAt - this.session.sync.now()) / 1000));
    const startLabel = state.phase === 'LOBBY' ? 'Lancer la course' : 'Recommencer';
    if (this.start.textContent !== startLabel) this.start.textContent = startLabel;
    const tutorial = state.tutorial;
    const identifying = tutorial?.steps[tutorial.teams[this.team].step] === 'identify';
    const phase = state.phase === 'PAUSED' ? 'Course en pause sur la table.'
      : state.phase === 'RESULT' ? 'Essai terminé.'
      : state.phase !== 'RACE' ? PRE_RACE_TEXT[state.phase] ?? ''
      : identifying ? 'Maintiens Réparer pour confirmer ton poste.'
      : car.disabled ? this.solo ? 'Sortie de piste. Tu peux recommencer.' : 'Voiture en panne. Répare avec ton copilote.'
      : remaining ? `Départ dans ${remaining}…` : '';
    if (this.phase.textContent !== phase) this.phase.textContent = phase;
    this.tick();
  }

  /** Libère le volant et les ressources du navigateur en quittant ce poste. */
  close(): void {
    this.release();
    this.closed = true;
    clearInterval(this.timer);
    this.landscape.removeEventListener('change', this.onRotation);
    this.keyboard?.close();
    this.strip.release();
    this.wheel.close();
    this.viewport.close();
    if (this.orientationLocked) screen.orientation?.unlock?.();
    if (this.ownsFullscreen && document.fullscreenElement === document.documentElement) {
      void document.exitFullscreen().catch(() => {});
    }
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.release);
    void this.wakeLock?.release().catch(() => {});
  }

  /** N'envoie des commandes que lorsque le capteur est prêt et le téléphone en paysage. */
  private tick = (): void => {
    const state = this.state;
    if (!state) return;
    const now = performance.now();
    const gyro = this.gyroActive();
    const sensor = this.keyboard ? this.keyboard.read() : gyro ? this.wheel.read(now) : this.strip.read();
    const ready = sensor !== null && this.session.canPlay && !document.hidden;
    const racing = ready && state.phase === 'RACE';
    const driving = racing && !state.cars[this.team].disabled && state.sessionStartAt <= this.session.sync.now();
    if (!driving && this.driving) this.releaseDrive();
    this.driving = driving;
    this.refreshControls(ready, racing);
    if (!driving || !sensor) return;
    const input = driveSample(sensor, state.driveMode[this.team] === 'pedal', this.pedalHeld);
    if (!shouldSendInput(now, input, this.last)) return;
    this.steer(this.team, input.steer, input.throttle);
    this.last = { ...input, time: now };
  };

  /** Le volant gyroscopique conduit seulement une fois choisi, calibré et en paysage ; sinon le joystick reste actif. */
  private gyroActive(): boolean {
    return !this.keyboard && this.steering === 'gyro' && this.landscape.matches && this.wheel.status === 'ready';
  }

  /** Le volant est choisi et son capteur se prépare ou fonctionne : la rotation en paysage est alors utile. */
  private gyroListening(): boolean {
    return this.steering === 'gyro' && ['waiting', 'calibrating', 'ready'].includes(this.wheel.status);
  }

  /** Dit pourquoi le volant gyroscopique ne peut pas être choisi, ou renvoie une chaîne vide. */
  private gyroProblem(): string {
    const status = this.wheel.status;
    if (status === 'http') return 'Le gyroscope n’est autorisé par le navigateur qu’en HTTPS : ouvre la séance par une adresse https:// pour l’utiliser.';
    if (typeof DeviceOrientationEvent === 'undefined') return 'Ce navigateur ne fournit pas le gyroscope.';
    if (status === 'denied') return 'Capteur refusé : autorise-le dans le navigateur, puis choisis de nouveau le volant.';
    return '';
  }

  /** Change de mode de conduite ; l'autorisation du capteur se demande dans ce geste. */
  private choose(mode: 'joystick' | 'gyro'): void {
    if (mode === this.steering && (mode === 'joystick' || this.wheel.status === 'ready')) return;
    this.steering = mode;
    this.releaseDrive();
    if (mode === 'gyro') this.activate();
    if (this.state) this.update(this.state);
  }

  /** Présente le mode actif, le choix joystick / volant et les commandes disponibles. */
  private refreshControls(ready: boolean, racing: boolean): void {
    const status = this.wheel.status;
    const landscape = this.landscape.matches;
    const gyro = this.gyroActive();
    const pedal = this.state?.driveMode[this.team] === 'pedal';
    const problem = this.gyroProblem();
    const hint = this.keyboard ? '← / → pour tourner. ↑ en mode pédale.' : this.steering === 'joystick' ? TOUCH_HINT
      : this.gyroListening() && !landscape ? 'Tourne le téléphone en paysage pour le volant, ou repasse au joystick.'
      : wheelHints[status];
    const modeLabel = pedal ? 'Mode pédale' : 'Avance auto';
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    if (this.note.textContent !== problem) this.note.textContent = problem;
    this.note.hidden = problem === '' || !!this.keyboard;
    if (this.mode.textContent !== modeLabel) this.mode.textContent = modeLabel;
    this.choice.hidden = !!this.keyboard;
    this.joystickChoice.setAttribute('aria-pressed', String(this.steering === 'joystick'));
    this.gyroChoice.setAttribute('aria-pressed', String(this.steering === 'gyro'));
    this.gyroChoice.disabled = status === 'http' || typeof DeviceOrientationEvent === 'undefined' || status === 'permission';
    this.root.classList.toggle('touch', !this.keyboard && !gyro);
    this.strip.root.hidden = !!this.keyboard || gyro;
    this.strip.root.classList.toggle('idle', !racing);
    this.fullscreen.hidden = !!this.keyboard || landscape || !this.gyroListening() || !document.fullscreenEnabled
      || !(screen.orientation as LandscapeLock | undefined)?.lock;
    this.calibrate.hidden = !!this.keyboard || !gyro;
    this.leave.hidden = this.solo || (!!this.state && !['LOBBY', 'SETUP', 'MAP', 'READY'].includes(this.state.phase));
    this.leave.disabled = !this.session.online || this.session.pending !== null;
    this.start.hidden = !this.solo;
    this.start.disabled = !ready;
    this.mode.disabled = !racing;
    if (!racing) this.repair.release();
    this.repair.button.disabled = !racing;
    this.repair.button.hidden = this.solo;
    if (!pedal) this.pedal.release();
    this.pedal.button.hidden = !pedal || !racing;
    this.pedal.button.disabled = !this.driving;
  }

  /** Demande la permission dans le geste utilisateur et tente le verrouillage en paysage. */
  private activate = (): void => {
    void this.wheel.activate();
    void this.lockLandscape();
    void this.keepAwake();
    this.tick();
  };

  /** Profite du verrouillage natif lorsqu'il est disponible. */
  private async lockLandscape(fullscreen = false): Promise<void> {
    const orientation = screen.orientation as LandscapeLock | undefined;
    if (!orientation?.lock) return;
    try {
      if (fullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        if (this.closed) {
          await document.exitFullscreen();
          return;
        }
        this.ownsFullscreen = true;
      }
      await orientation.lock('landscape');
      if (this.closed) orientation.unlock();
      else this.orientationLocked = true;
    } catch {
      // Le navigateur peut demander une rotation manuelle.
    }
  }

  /** Neutralise les commandes et reprend la calibration dans la nouvelle orientation. */
  private onRotation = (): void => {
    this.release();
    this.wheel.calibrate();
    if (this.state) this.update(this.state);
  };

  /** Neutralise les entrées de conduite même si un bouton était encore maintenu. */
  private releaseDrive(): void {
    const wasDriving = this.driving;
    this.driving = false;
    this.pedal.release();
    this.strip.release();
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
