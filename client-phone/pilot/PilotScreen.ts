/** Relie le volant et la réparation à la place du pilote. */
import { createControls } from '../../client-shared/controls.js';
import type { GameState, Team } from '../../server/types.js';
import type { PhoneSession } from '../session.js';
import { actionButton, holdButton } from '../ui/press.js';
import { driveSample, shouldSendInput, WHEEL, type SentInput } from './gyro.js';
import { PilotViewport } from './views/PilotViewport.js';
import { WheelSensor, type WheelStatus } from './wheelSensor.js';

type LandscapeLock = ScreenOrientation & { lock?: (mode: 'landscape') => Promise<void> };

const wheelHints: Record<WheelStatus, string> = {
  inactive: 'Active le volant pour conduire.',
  permission: 'Autorise le capteur dans le navigateur.',
  waiting: 'Tiens le téléphone comme un volant.',
  calibrating: 'Garde le volant droit pendant la calibration.',
  ready: 'Incline le téléphone pour tourner.',
  missing: 'Capteur indisponible. Réessaie en tenant le téléphone comme un volant.',
  denied: 'Autorise le capteur dans le navigateur pour reprendre la conduite.',
  http: 'Ouvre le lien HTTPS de la séance pour activer le volant.',
};

export class PilotScreen {
  readonly root = document.createElement('section');
  private readonly landscape = matchMedia('(orientation: landscape)');
  private readonly wheel = new WheelSensor(() => this.landscape.matches);
  private readonly viewport: PilotViewport;
  private readonly steer;
  private readonly sensor;
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
  private last: SentInput = { time: -Infinity, steer: 0, throttle: 0 };

  constructor(private readonly session: PhoneSession, private readonly team: Team, private readonly solo: boolean) {
    this.root.className = 'pilot-screen';
    this.viewport = new PilotViewport(team, () => session.sync.now());
    this.steer = createControls(msg => this.session.send(msg)).steer;
    this.sensor = actionButton('Activer le volant', this.activate, 'primary');
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
    settings.append(this.sensor, this.fullscreen, this.calibrate, this.mode);
    this.root.append(this.phase, this.hint, this.viewport.root, settings, this.pedal.button, this.repair.button, this.start);
    this.wheel.start();
    this.timer = window.setInterval(this.tick, WHEEL.pollMs);
    this.landscape.addEventListener('change', this.onRotation);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.release);
    void this.keepAwake();
  }

  /** Actualise la phase et les commandes sans remplacer les boutons maintenus. */
  update(state: GameState): void {
    this.state = state;
    this.viewport.root.hidden = !state.track || !this.landscape.matches;
    this.viewport.update(state, this.session.stateTime);
    const car = state.cars[this.team];
    const remaining = Math.max(0, Math.ceil((state.sessionStartAt - this.session.sync.now()) / 1000));
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
    this.tick();
  }

  /** Libère le volant et les ressources du navigateur en quittant ce poste. */
  close(): void {
    this.release();
    this.closed = true;
    clearInterval(this.timer);
    this.landscape.removeEventListener('change', this.onRotation);
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
    const sensor = this.wheel.read(now);
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

  /** Présente le blocage en portrait ou sans capteur et les commandes disponibles en paysage. */
  private refreshControls(ready: boolean, racing: boolean): void {
    const status = this.wheel.status;
    const landscape = this.landscape.matches;
    const calibrating = status === 'calibrating' || status === 'waiting';
    const pedal = this.state?.driveMode[this.team] === 'pedal';
    const hint = !landscape && status !== 'http'
      ? 'Tourne le téléphone en paysage. Désactive le verrouillage de la rotation si nécessaire.'
      : wheelHints[status];
    const sensorLabel = status === 'inactive' ? 'Activer le volant' : 'Réessayer le capteur';
    const modeLabel = pedal ? 'Mode pédale' : 'Avance auto';
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    if (this.sensor.textContent !== sensorLabel) this.sensor.textContent = sensorLabel;
    if (this.mode.textContent !== modeLabel) this.mode.textContent = modeLabel;
    this.sensor.hidden = status === 'ready' || status === 'http' || calibrating;
    this.sensor.disabled = status === 'permission';
    this.fullscreen.hidden = landscape || status === 'http' || !document.fullscreenEnabled
      || !(screen.orientation as LandscapeLock | undefined)?.lock;
    this.calibrate.hidden = !landscape || status !== 'ready';
    this.start.hidden = !this.solo;
    this.start.disabled = !ready;
    this.mode.disabled = !racing;
    if (!racing) this.repair.release();
    this.repair.button.disabled = !racing;
    this.repair.button.hidden = this.solo;
    if (!pedal) this.pedal.release();
    this.pedal.button.hidden = !pedal || !this.driving;
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
