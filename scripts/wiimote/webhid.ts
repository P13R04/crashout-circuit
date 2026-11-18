/**
 * Vérifie la couche WebHID de la Wiimote avec un faux périphérique : ouverture, mode, LED, vibration, rapports, déconnexion.
 * Liens : client-wiimote/device/webHidWiimote.ts, client-wiimote/device/hidTypes.ts.
 */
import assert from 'node:assert/strict';
import { WebHidWiimote } from '../../client-wiimote/device/webHidWiimote.js';
import type {
  HidApiLike, HidConnectionEventLike, HidDeviceLike, HidInputReportEventLike,
} from '../../client-wiimote/device/hidTypes.js';
import type { DecodedReport } from '../../client-wiimote/hid/reportDecoder.js';
import { WIIMOTE_FILTERS } from '../../client-wiimote/hid/wiimoteProtocol.js';

/** Laisse les promesses de la file de sortie se résoudre. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 5));

class FakeDevice implements HidDeviceLike {
  opened = false;
  failSend = false;
  readonly sent: (readonly number[])[] = [];
  private listeners = new Set<(event: HidInputReportEventLike) => void>();
  constructor(readonly productId = 0x0330, readonly vendorId = 0x057e, readonly productName = 'Nintendo RVL-CNT-01-TR') {}
  async open(): Promise<void> { this.opened = true; }
  async close(): Promise<void> { this.opened = false; }
  async sendReport(id: number, data: Uint8Array): Promise<void> {
    if (this.failSend) throw new Error('périphérique absent');
    this.sent.push([id, ...data]);
  }
  addEventListener(_: 'inputreport', listener: (event: HidInputReportEventLike) => void): void { this.listeners.add(listener); }
  removeEventListener(_: 'inputreport', listener: (event: HidInputReportEventLike) => void): void { this.listeners.delete(listener); }
  get listening(): number { return this.listeners.size; }
  /** Émet un rapport d'entrée ; `offset` simule une vue sur un tampon plus grand. */
  emit(reportId: number, ...bytes: number[]): void {
    const buffer = new Uint8Array([9, 9, ...bytes, 9]).buffer;
    for (const listener of this.listeners) listener({ reportId, data: new DataView(buffer, 2, bytes.length) });
  }
}

class FakeHid implements HidApiLike {
  granted: HidDeviceLike[] = [];
  requests = 0;
  chosen: HidDeviceLike[] = [];
  private listeners = { connect: new Set<(e: HidConnectionEventLike) => void>(), disconnect: new Set<(e: HidConnectionEventLike) => void>() };
  filters: unknown = null;
  async requestDevice(options: { filters: readonly unknown[] }): Promise<HidDeviceLike[]> {
    this.requests++;
    this.filters = options.filters;
    this.granted.push(...this.chosen);
    return this.chosen;
  }
  async getDevices(): Promise<HidDeviceLike[]> { return this.granted; }
  addEventListener(type: 'connect' | 'disconnect', listener: (e: HidConnectionEventLike) => void): void { this.listeners[type].add(listener); }
  removeEventListener(type: 'connect' | 'disconnect', listener: (e: HidConnectionEventLike) => void): void { this.listeners[type].delete(listener); }
  fire(type: 'connect' | 'disconnect', device: HidDeviceLike): void { for (const l of this.listeners[type]) l({ device }); }
  get count(): number { return this.listeners.connect.size + this.listeners.disconnect.size; }
}

const reports: DecodedReport[] = [];
const events: string[] = [];
let clock = 0;
const api = new FakeHid();
const wii = new WebHidWiimote(api, {
  onReport: (report, now) => { reports.push(report); events.push(`report@${now}`); },
  onConnected: name => events.push(`connected:${name}`),
  onDisconnected: () => events.push('disconnected'),
  onError: message => events.push(`error:${message}`),
}, { heartbeatMs: 20, clock: () => ++clock });

// Pas de WebHID : le module le dit sans planter.
assert.equal(new WebHidWiimote(null, { onReport() {}, onConnected() {}, onDisconnected() {}, onError() {} }).supported, false);
await assert.rejects(() => new WebHidWiimote(null, { onReport() {}, onConnected() {}, onDisconnected() {}, onError() {} }).connect());

// Première connexion : la fenêtre de choix avec les deux filtres, puis mode 0x31, état, et rapports décodés.
const device = new FakeDevice();
api.chosen = [device];
await wii.connect();
await settle();
assert.equal(api.requests, 1);
assert.deepEqual(api.filters, WIIMOTE_FILTERS);
assert.equal(device.opened, true);
assert.deepEqual(device.sent.slice(0, 2), [[0x12, 0x00, 0x31], [0x15, 0x00]]);
assert.equal(events[0], 'connected:Nintendo RVL-CNT-01-TR');
assert.equal(wii.connected, true);

device.emit(0x31, 0x00, 0x04, 130, 128, 153);
const motion = reports.at(-1)!;
assert.equal(motion.kind, 'motion');
if (motion.kind === 'motion') {
  assert.equal(motion.buttons.b, true);
  assert.deepEqual(motion.accel, { x: 130, y: 128, z: 153 }, 'la vue décalée est lue au bon endroit');
}

// LED = numéro de joueur ; la vibration est conservée dans les rapports suivants.
wii.setPlayer(2);
wii.setRumble(true);
wii.setPlayer(1);
await settle();
const commands = () => device.sent.filter(r => r[0] !== 0x15); // hors demandes d'état périodiques
assert.deepEqual(commands().slice(-3), [[0x11, 0x20], [0x10, 0x01], [0x11, 0x11]]);
wii.setRumble(true);
wii.setRumble(false);
await settle();
assert.deepEqual(commands().at(-1), [0x10, 0x00]);

// Signe de vie : une demande d'état part régulièrement.
const statusBefore = device.sent.filter(r => r[0] === 0x15).length;
await new Promise(resolve => setTimeout(resolve, 70));
assert.ok(device.sent.filter(r => r[0] === 0x15).length > statusBefore);

// Déconnexion signalée par le navigateur : l'interface est prévenue, l'écoute est retirée.
api.fire('disconnect', device);
assert.equal(events.at(-1), 'disconnected');
assert.equal(wii.connected, false);
assert.equal(device.listening, 0);
const count = reports.length;
device.emit(0x30, 0x00, 0x08);
assert.equal(reports.length, count, 'plus aucun rapport après la perte');
// Une autre manette qui se déconnecte n'est pas la nôtre.
api.fire('disconnect', new FakeDevice());
assert.equal(events.filter(e => e === 'disconnected').length, 1);

// Reconnexion après un appui sur un bouton : le navigateur annonce « connect », la manette se rouvre sans geste.
device.opened = false;
const sentBefore = device.sent.length;
api.fire('connect', device);
await settle();
assert.equal(wii.connected, true);
assert.equal(events.filter(e => e.startsWith('connected')).length, 2);
assert.deepEqual(device.sent[sentBefore], [0x12, 0x00, 0x31], 'le mode est renvoyé après chaque connexion');
assert.deepEqual(device.sent.find((r, i) => i > sentBefore && r[0] === 0x11), [0x11, 0x10], 'la LED du joueur est renvoyée');

// Bouton « Reconnecter » : une manette déjà autorisée se rouvre sans nouvelle fenêtre de choix.
api.fire('disconnect', device);
device.opened = false;
const requests = api.requests;
await wii.connect();
assert.equal(api.requests, requests, 'getDevices() suffit, requestDevice n’est pas rappelé');
assert.equal(wii.connected, true);

// Échec d'envoi : la manette est tenue pour perdue.
device.failSend = true;
wii.requestStatus();
await settle();
assert.ok(events.some(e => e.startsWith('error:')));
assert.equal(events.at(-1), 'disconnected');
assert.equal(wii.connected, false);

// Fermeture : plus aucun écouteur ni minuteur.
device.failSend = false;
await wii.connect();
wii.close();
assert.equal(api.count, 0);
assert.equal(device.listening, 0);

// Mode continu demandé : le bit 0x04 est envoyé.
const continuous = new WebHidWiimote(api, { onReport() {}, onConnected() {}, onDisconnected() {}, onError() {} }, { continuous: true });
const other = new FakeDevice(0x0306, 0x057e, 'Nintendo RVL-CNT-01');
api.granted = [other];
await continuous.connect();
await settle();
assert.deepEqual(other.sent[0], [0x12, 0x04, 0x31]);
continuous.close();

console.log('✓ WebHID Wiimote : ouverture, mode, LED, vibration, rapports, déconnexion et reconnexion');
