/**
 * Manettes Wii branchées à l'ordinateur de la table : ouverture par WebHID, numéro par ordre de connexion et conduite des pilotes concernés.
 * Liens : client-wiimote/device/webHidWiimote.ts, client-shared/pilot/pilotLink.ts, client-table/wiimote/wiimoteView.ts, server/rules/session/seatSetup.ts.
 * Un pilote dont le poste est réglé sur « Manette Wii » reçoit une manette : celle déjà autorisée est reprise sans geste,
 * sinon la fenêtre de choix du navigateur s'ouvre au toucher du bouton Connecter. Le serveur n'apprend que « manette n° N » par équipe.
 */
import type { GameState, Team } from '../../server/types.js';
import { CADENCE } from '../../client-shared/pilot/inputCadence.js';
import { PilotLink, type PilotSessionPort } from '../../client-shared/pilot/pilotLink.js';
import { WiimoteCommandSource } from '../../client-wiimote/control/wiimoteCommandSource.js';
import type { HidApiLike, HidDeviceLike } from '../../client-wiimote/device/hidTypes.js';
import { WebHidWiimote } from '../../client-wiimote/device/webHidWiimote.js';
import { noWiimote, type WiimoteView } from './wiimoteView.js';

const TEAMS: readonly Team[] = ['A', 'B'];
const MAX_NUMBER = 4;
const RANGE_KEY = 'crashout-wiimote-range';
/** Un pilote reçoit 60 commandes par seconde, comme la page Wii : la physique tourne à 60 Hz. */
const SEND_MS = 1000 / 60;
const RESEND_MS = 500;
const UNSUPPORTED = 'WebHID indisponible : ouvrez la table avec Chrome ou Edge, sur localhost ou en HTTPS.';

/** Ce dont le gestionnaire a besoin de la table. */
export interface TableWiimotePort {
  state(): GameState | null;
  now(): number;
  send(message: { type: string } & Record<string, unknown>): void;
}

interface Slot {
  hid: WebHidWiimote;
  source: WiimoteCommandSource;
  link: PilotLink;
  number: number | null;
  connecting: Promise<void> | null;
  reportedAt: number;
}

export class TableWiimotes {
  private readonly slots = new Map<Team, Slot>();
  private readonly claimed = new Set<HidDeviceLike>();
  private readonly session: PilotSessionPort;

  /** `views` est lu par l'écran de préparation et le poste du pilote ; ce gestionnaire seul l'écrit. */
  constructor(private readonly api: HidApiLike | null, private readonly port: TableWiimotePort,
    private readonly views: Record<Team, WiimoteView>, private readonly savedRange: () => number | undefined = readSavedRange) {
    const { state, now, send } = port;
    this.session = { canPlay: true, get state() { return state(); }, sync: { now }, send };
    setInterval(this.tick, CADENCE.pollMs);
  }

  /** Indique que le navigateur sait ouvrir une manette. */
  get supported(): boolean { return this.api !== null; }

  /** Aligne les manettes ouvertes sur les postes réglés « Manette Wii » et rappelle au serveur leur numéro. */
  sync(state: GameState): void {
    for (const team of TEAMS) {
      const wanted = state.seatDevices[`${team}-pilot`] === 'wiimote';
      const slot = this.slots.get(team);
      if (wanted && !slot) this.open(team);
      else if (!wanted && slot) this.close(team);
      const current = this.slots.get(team);
      if (current && current.number !== state.wiimotes[team] && this.port.now() - current.reportedAt > RESEND_MS) this.report(team, current);
    }
  }

  /** Ouvre la manette du pilote : à appeler depuis un toucher, car le navigateur exige un geste pour choisir une manette. */
  connect(team: Team): Promise<void> {
    const slot = this.slots.get(team) ?? this.open(team);
    if (slot.number !== null) return Promise.resolve();
    if (!slot.connecting) {
      this.views[team] = { ...this.views[team], status: 'connecting', notice: '' };
      slot.connecting = slot.hid.connect().catch(error => this.fail(team, error)).finally(() => { slot.connecting = null; });
    }
    return slot.connecting;
  }

  /** Crée la manette du pilote et reprend sans geste une manette déjà autorisée. */
  private open(team: Team): Slot {
    const source = new WiimoteCommandSource({ grip: 'face', flip: false }, this.savedRange());
    const link = new PilotLink(this.session, team, source, { minSendMs: SEND_MS });
    const slot: Slot = { hid: null as never, source, link, number: null, connecting: null, reportedAt: -Infinity };
    slot.hid = new WebHidWiimote(this.api, {
      onReport: (report, now) => {
        source.feed(report, now);
        link.tick(now);
      },
      onConnected: () => this.connected(team, slot),
      onDisconnected: () => this.lost(team, slot),
      onError: message => { this.views[team] = { ...this.views[team], notice: message }; },
    }, { claimed: this.claimed });
    this.slots.set(team, slot);
    if (!this.supported) {
      this.views[team] = { ...noWiimote(), status: 'unsupported', notice: UNSUPPORTED };
    } else {
      this.views[team] = { ...noWiimote(), status: 'connecting' };
      slot.connecting = slot.hid.reopenKnown().then(found => {
        if (!found) this.views[team] = { ...this.views[team], status: 'absent' };
      }).catch(() => { this.views[team] = { ...this.views[team], status: 'absent' }; }).finally(() => { slot.connecting = null; });
    }
    return slot;
  }

  /** Numérote la manette dans l'ordre de connexion et allume la LED correspondante. */
  private connected(team: Team, slot: Slot): void {
    const used = new Set([...this.slots.values()].map(other => other.number));
    let number = 1;
    while (used.has(number) && number < MAX_NUMBER) number++;
    slot.number = number;
    slot.source.connect(this.port.now());
    slot.hid.setPlayer(number);
    this.views[team] = { ...noWiimote(), status: 'calibrating', number };
    this.report(team, slot);
  }

  /** Marque la manette perdue : la voiture est relâchée et le poste reprend ses commandes tactiles. */
  private lost(team: Team, slot: Slot): void {
    slot.source.disconnect();
    slot.link.release();
    slot.number = null;
    this.views[team] = { ...noWiimote(), notice: 'Manette perdue. Appuie sur un de ses boutons, ou touche Connecter.' };
    this.report(team, slot);
  }

  /** Libère la manette quand le poste n'est plus réglé sur la manette Wii. */
  private close(team: Team): void {
    const slot = this.slots.get(team);
    if (!slot) return;
    slot.link.release();
    if (slot.number !== null) slot.hid.setPlayer(null);
    slot.hid.close();
    this.slots.delete(team);
    this.views[team] = noWiimote();
    this.port.send({ type: 'SetWiimote', team, number: null });
  }

  /** Dit au serveur quelle manette est ouverte pour cette équipe. */
  private report(team: Team, slot: Slot): void {
    slot.reportedAt = this.port.now();
    this.port.send({ type: 'SetWiimote', team, number: slot.number });
  }

  /** Affiche l'échec d'ouverture ; fermer la fenêtre de choix n'en est pas un. */
  private fail(team: Team, error: unknown): void {
    const cancelled = error instanceof DOMException && error.name === 'NotFoundError';
    this.views[team] = { ...this.views[team], status: 'absent', notice: cancelled ? '' : `Connexion impossible : ${error instanceof Error ? error.message : String(error)}` };
  }

  /** Conduit les pilotes concernés et tient à jour l'état affiché. */
  private tick = (): void => {
    const now = performance.now();
    for (const [team, slot] of this.slots) {
      slot.link.tick(now);
      if (slot.number === null) continue;
      const status = slot.source.steering.status === 'ready' ? 'ready' : 'calibrating';
      const view = this.views[team];
      if (view.status !== status || view.battery !== slot.source.battery || view.lowBattery !== slot.source.lowBattery) {
        this.views[team] = { ...view, status, battery: slot.source.battery, lowBattery: slot.source.lowBattery };
      }
    }
  };
}

/** Reprend la sensibilité réglée sur la page Wii, si le navigateur la conserve. */
function readSavedRange(): number | undefined {
  try {
    const saved = Number(localStorage.getItem(RANGE_KEY));
    return saved > 0 ? saved : undefined;
  } catch {
    return undefined;
  }
}
