/**
 * Source de commandes du pilote alimentée par les rapports de la Wiimote.
 * Liens : client-shared/pilot/pilotCommandSource.ts (interface), client-wiimote/hid/reportDecoder.ts, client-wiimote/steering/wiimoteSteering.ts.
 * Correspondance : inclinaison = direction, B = accélérateur (mode PÉDALE), A = réparation, 1 = bascule AUTO/PÉDALE, Home = recalibrer.
 * 2, + et − ne font rien : le protocole n'a ni frein ni marche arrière, et POWER appartient au copilote.
 * Module pur : l'heure est fournie par l'appelant.
 */
import type { PilotCommandSource, PilotSnapshot } from '../../client-shared/pilot/pilotCommandSource.js';
import { NO_BUTTONS, type Buttons, type DecodedReport, type RawAccel } from '../hid/reportDecoder.js';
import { WiimoteSteering } from '../steering/wiimoteSteering.js';
import type { TiltSettings } from '../steering/tiltAngle.js';

/** Silence, en millisecondes, au-delà duquel la manette est tenue pour perdue (une demande d'état part toutes les 5 s). */
export const SILENCE_MS = 12_000;

export class WiimoteCommandSource implements PilotCommandSource {
  readonly steering: WiimoteSteering;
  buttons: Buttons = NO_BUTTONS;
  accel: RawAccel | null = null;
  battery: number | null = null;
  lowBattery = false;
  private connected = false;
  private lastSeen = 0;

  constructor(settings: TiltSettings) {
    this.steering = new WiimoteSteering(settings);
  }

  /** Indique que la manette est ouverte et que ses rapports arrivent. */
  get isConnected(): boolean { return this.connected; }

  /** Marque la manette comme présente à l'instant `now`. */
  connect(now: number): void {
    this.connected = true;
    this.lastSeen = now;
    this.steering.reset();
  }

  /** Marque la manette comme perdue : plus aucune commande, boutons relâchés, neutre à remesurer. */
  disconnect(): void {
    this.connected = false;
    this.buttons = NO_BUTTONS;
    this.accel = null;
    this.steering.reset();
  }

  /** Intègre un rapport décodé ; Home recalibre le neutre à chaque pression. */
  feed(report: DecodedReport, now: number): void {
    if (!this.connected || report.kind === 'ignored') return;
    this.lastSeen = now;
    if (report.buttons.home && !this.buttons.home) this.steering.calibrate();
    this.buttons = report.buttons;
    if (report.kind === 'motion') {
      this.accel = report.accel;
      this.steering.push(report.accel, now);
    } else if (report.kind === 'status') {
      this.battery = report.status.battery;
      this.lowBattery = report.status.lowBattery;
    }
  }

  /** Renvoie la commande courante, ou null si la manette est absente, silencieuse ou pas encore calibrée. */
  read(now: number): PilotSnapshot | null {
    if (!this.connected || now - this.lastSeen > SILENCE_MS) return null;
    const steer = this.steering.steer;
    if (steer === null) return null;
    return { steer, accelerate: this.buttons.b, repair: this.buttons.a, toggleDriveMode: this.buttons.one };
  }
}
