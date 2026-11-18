/**
 * Ouvre une Wiimote par WebHID, règle son mode, ses LED et sa vibration, et transmet les rapports décodés.
 * Liens : client-wiimote/hid/*, client-wiimote/device/hidTypes.ts, tools/wiimote-monitor/index.html (référence).
 * L'API HID est injectée : ce module n'appelle pas navigator lui-même et se teste avec un faux périphérique.
 * requestDevice exige un geste de l'utilisateur ; au rechargement ou après une veille, getDevices() rouvre sans nouvelle autorisation.
 */
import { decodeInputReport, type DecodedReport } from '../hid/reportDecoder.js';
import { dataModeReport, ledReport, rumbleReport, statusRequestReport, type OutputReport } from '../hid/outputReports.js';
import { WIIMOTE_FILTERS } from '../hid/wiimoteProtocol.js';
import type { HidApiLike, HidConnectionEventLike, HidDeviceLike, HidInputReportEventLike } from './hidTypes.js';

export interface WiimoteHandlers {
  onReport(report: DecodedReport, now: number): void;
  onConnected(name: string): void;
  onDisconnected(): void;
  onError(message: string): void;
}

export interface WiimoteOptions {
  /** Demande des rapports en continu (bit 0x04 du mode) au lieu d'un rapport à chaque changement. */
  continuous?: boolean;
  /** Période de la demande d'état qui sert aussi de signe de vie, en millisecondes. */
  heartbeatMs?: number;
  /** Horloge en millisecondes ; performance.now() par défaut. */
  clock?: () => number;
}

export class WebHidWiimote {
  private device: HidDeviceLike | null = null;
  private rumble = false;
  private player: number | null = null;
  private queue: Promise<void> = Promise.resolve();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly continuous: boolean;
  private readonly heartbeatMs: number;
  private readonly clock: () => number;

  constructor(
    private readonly api: HidApiLike | null,
    private readonly handlers: WiimoteHandlers,
    options: WiimoteOptions = {},
  ) {
    this.continuous = options.continuous ?? false;
    this.heartbeatMs = options.heartbeatMs ?? 5000;
    this.clock = options.clock ?? (() => performance.now());
    api?.addEventListener('disconnect', this.onDisconnect);
    api?.addEventListener('connect', this.onConnect);
  }

  /** Indique que le navigateur fournit WebHID en contexte sécurisé. */
  get supported(): boolean { return this.api !== null; }

  /** Indique qu'une manette est ouverte. */
  get connected(): boolean { return this.device !== null; }

  /** Rouvre sans geste une manette déjà autorisée ; renvoie faux si aucune n'est connue. */
  async reopenKnown(): Promise<boolean> {
    const known = this.api ? (await this.api.getDevices()).find(isWiimote) : undefined;
    if (!known) return false;
    await this.attach(known);
    return true;
  }

  /** Ouvre la manette : d'abord une manette déjà autorisée, sinon la fenêtre de choix. À appeler dans un geste utilisateur. */
  async connect(): Promise<void> {
    if (!this.api) throw new Error('WebHID indisponible');
    if (await this.reopenKnown().catch(() => false)) return;
    const [chosen] = await this.api.requestDevice({ filters: WIIMOTE_FILTERS });
    if (chosen) await this.attach(chosen);
  }

  /** Allume la LED du joueur (1 à 4) ; null les éteint. */
  setPlayer(player: number | null): void {
    this.player = player;
    this.send(ledReport(player, this.rumble));
  }

  /** Démarre ou arrête la vibration. */
  setRumble(on: boolean): void {
    if (on === this.rumble) return;
    this.rumble = on;
    this.send(rumbleReport(on));
  }

  /** Demande l'état (batterie) à la manette. */
  requestStatus(): void {
    this.send(statusRequestReport(this.rumble));
  }

  /** Ferme la manette et retire les écouteurs ; la page n'écoute plus aucun rapport. */
  close(): void {
    this.api?.removeEventListener('disconnect', this.onDisconnect);
    this.api?.removeEventListener('connect', this.onConnect);
    this.detach();
  }

  /** Ouvre le périphérique, branche l'écoute et règle mode, LED et état. */
  private async attach(device: HidDeviceLike): Promise<void> {
    if (this.device === device && device.opened) return;
    this.detach();
    if (!device.opened) await device.open();
    this.device = device;
    device.addEventListener('inputreport', this.onInput);
    this.handlers.onConnected(device.productName || 'Wiimote');
    this.send(dataModeReport(this.rumble, this.continuous));
    this.send(statusRequestReport(this.rumble));
    if (this.player !== null) this.send(ledReport(this.player, this.rumble));
    this.heartbeat = setInterval(() => this.send(statusRequestReport(this.rumble)), this.heartbeatMs);
  }

  /** Retire l'écoute du périphérique courant sans le fermer côté système. */
  private detach(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.device?.removeEventListener('inputreport', this.onInput);
    this.device = null;
    this.queue = Promise.resolve();
  }

  /** Envoie les rapports de sortie les uns après les autres ; un échec signale la perte de la manette. */
  private send(report: OutputReport): void {
    const device = this.device;
    if (!device) return;
    this.queue = this.queue.then(() => device.sendReport(report.id, report.data)).catch(error => {
      if (this.device !== device) return;
      this.handlers.onError(`Envoi à la manette impossible : ${error instanceof Error ? error.message : String(error)}`);
      this.lose();
    });
  }

  /** Décode un rapport d'entrée en tenant compte du décalage de la vue. */
  private onInput = (event: HidInputReportEventLike): void => {
    const { buffer, byteOffset, byteLength } = event.data;
    this.handlers.onReport(decodeInputReport(event.reportId, new Uint8Array(buffer, byteOffset, byteLength)), this.clock());
  };

  /** Traite la déconnexion signalée par le navigateur (veille ou piles retirées). */
  private onDisconnect = (event: HidConnectionEventLike): void => {
    if (event.device === this.device) this.lose();
  };

  /** Rouvre automatiquement une manette autorisée qui se reconnecte après un appui sur un bouton. */
  private onConnect = (event: HidConnectionEventLike): void => {
    if (!this.device && isWiimote(event.device)) {
      this.attach(event.device).catch(error => this.handlers.onError(`Réouverture impossible : ${String(error)}`));
    }
  };

  /** Passe à l'état « manette perdue » et prévient l'interface. */
  private lose(): void {
    this.detach();
    this.handlers.onDisconnected();
  }
}

/** Reconnaît une Wiimote ou une Wii Remote Plus parmi les périphériques autorisés. */
function isWiimote(device: HidDeviceLike): boolean {
  return WIIMOTE_FILTERS.some(f => f.vendorId === device.vendorId && f.productId === device.productId);
}
