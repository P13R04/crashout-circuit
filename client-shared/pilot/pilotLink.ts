/**
 * Couche réseau du pilote : transforme une source de commandes en PilotInput, PadHold et ToggleDriveMode.
 * Liens : client-shared/playerSession.ts (place et WebSocket), client-shared/controls.ts, config.json (pilotInputTimeoutMs).
 * Reprend la règle de client-phone/pilot/PilotScreen.ts : on n'envoie que pendant la course, voiture valide, feu vert passé.
 * Perte de la source : une commande neutre part une fois, puis le serveur relâche la voiture après pilotInputTimeoutMs.
 */
import type { GameState, Team } from '../../server/types.js';
import { createControls } from '../controls.js';
import { driveSample, shouldSendInput, type SentInput } from './inputCadence.js';
import type { PilotCommandSource } from './pilotCommandSource.js';

/** Partie de la séance dont le lien a besoin ; PhoneSession la fournit telle quelle. */
export interface PilotSessionPort {
  readonly canPlay: boolean;
  readonly state: Pick<GameState, 'phase' | 'cars' | 'driveMode' | 'sessionStartAt'> | null;
  readonly sync: { now(): number };
  send(message: { type: string } & Record<string, unknown>): void;
}

const NEVER: SentInput = { time: -Infinity, steer: 0, throttle: 0 };

export class PilotLink {
  private readonly steer;
  private driving = false;
  private repairing = false;
  private togglePressed = false;
  private last: SentInput = NEVER;

  constructor(
    private readonly session: PilotSessionPort,
    private readonly team: Team,
    private readonly source: PilotCommandSource,
    private readonly options: { minSendMs?: number } = {},
  ) {
    this.steer = createControls(msg => this.session.send(msg)).steer;
  }

  /** Indique si des commandes de conduite partent actuellement vers le serveur. */
  get isDriving(): boolean { return this.driving; }

  /** Lit la source et envoie, si besoin, la direction, la réparation et la bascule de mode. */
  tick(now: number): void {
    const state = this.session.state;
    if (!state) return;
    const command = this.source.read(now);
    const ready = command !== null && this.session.canPlay;
    const racing = ready && state.phase === 'RACE';
    const driving = racing && !state.cars[this.team].disabled && state.sessionStartAt <= this.session.sync.now();
    if (!driving && this.driving) this.releaseDrive();
    this.driving = driving;
    this.syncRepair(racing && command!.repair);
    this.syncToggle(racing && command!.toggleDriveMode);
    if (!driving || !command) return;
    const input = driveSample({ steer: command.steer, throttle: 0 }, state.driveMode[this.team] === 'pedal', command.accelerate);
    if (!shouldSendInput(now, input, this.last, this.options.minSendMs)) return;
    this.steer(this.team, input.steer, input.throttle);
    this.last = { ...input, time: now };
  }

  /** Neutralise la conduite et relâche la réparation, par exemple lorsque l'onglet quitte le premier plan. */
  release(): void {
    this.releaseDrive();
    this.driving = false;
    this.syncRepair(false);
    this.togglePressed = false;
  }

  /** Envoie une direction neutre une seule fois, puis laisse le serveur relâcher la voiture. */
  private releaseDrive(): void {
    if (this.driving) this.steer(this.team, 0, 0);
    this.last = NEVER;
  }

  /** Transmet les seuls changements d'état du bouton de réparation. */
  private syncRepair(held: boolean): void {
    if (held === this.repairing) return;
    this.repairing = held;
    this.session.send({ type: 'PadHold', team: this.team, role: 'pilot', on: held });
  }

  /** Bascule AUTO / PÉDALE une fois par pression. */
  private syncToggle(pressed: boolean): void {
    if (pressed && !this.togglePressed) this.session.send({ type: 'ToggleDriveMode', team: this.team });
    this.togglePressed = pressed;
  }
}
