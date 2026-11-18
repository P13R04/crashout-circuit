/**
 * Vérifie les manettes Wii branchées à la table : reprise sans geste, numéro par ordre de connexion, deux manettes distinctes, perte et reprise, libération.
 * Liens : client-table/wiimote/TableWiimotes.ts, client-wiimote/device/webHidWiimote.ts.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import { createInitialState } from '../../server/rules/GameRules.js';
import type { HidApiLike, HidConnectionEventLike, HidDeviceLike, HidInputReportEventLike } from '../../client-wiimote/device/hidTypes.js';
import { TableWiimotes } from '../../client-table/wiimote/TableWiimotes.js';
import { noWiimote, wiimoteConnected } from '../../client-table/wiimote/wiimoteView.js';

/** Laisse les promesses de reprise et la file de sortie se résoudre. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 20));

class FakeDevice implements HidDeviceLike {
  opened = false;
  readonly sent: (readonly number[])[] = [];
  readonly vendorId = 0x057e;
  readonly productId = 0x0330;
  readonly productName = 'Nintendo RVL-CNT-01-TR';
  async open(): Promise<void> { this.opened = true; }
  async close(): Promise<void> { this.opened = false; }
  async sendReport(id: number, data: Uint8Array): Promise<void> { this.sent.push([id, ...data]); }
  addEventListener(_: 'inputreport', __: (event: HidInputReportEventLike) => void): void {}
  removeEventListener(_: 'inputreport', __: (event: HidInputReportEventLike) => void): void {}
  /** Dernière LED demandée à la manette (octet de rapport 0x11 sans le bit de vibration), ou null. */
  get led(): number | null {
    const report = [...this.sent].reverse().find(sent => sent[0] === 0x11);
    return report ? report[1] & 0xf0 : null;
  }
}

class FakeHid implements HidApiLike {
  granted: HidDeviceLike[] = [];
  chosen: HidDeviceLike[] = [];
  requests = 0;
  private listeners = { connect: new Set<(e: HidConnectionEventLike) => void>(), disconnect: new Set<(e: HidConnectionEventLike) => void>() };
  async requestDevice(): Promise<HidDeviceLike[]> { this.requests++; this.granted.push(...this.chosen); return this.chosen; }
  async getDevices(): Promise<HidDeviceLike[]> { return this.granted; }
  addEventListener(type: 'connect' | 'disconnect', listener: (e: HidConnectionEventLike) => void): void { this.listeners[type].add(listener); }
  removeEventListener(type: 'connect' | 'disconnect', listener: (e: HidConnectionEventLike) => void): void { this.listeners[type].delete(listener); }
  fire(type: 'connect' | 'disconnect', device: HidDeviceLike): void { for (const l of this.listeners[type]) l({ device }); }
}

/** Monte une table avec ses deux manettes autorisées ; `reports` collecte ce que le serveur apprend. */
function table(api: HidApiLike | null) {
  const state = createInitialState();
  const sent: Array<Record<string, unknown>> = [];
  const views = { A: noWiimote(), B: noWiimote() };
  const wiimotes = new TableWiimotes(api, { state: () => state, now: () => Date.now(), send: m => sent.push(m) }, views, () => undefined);
  const wiimoteMessages = () => sent.filter(m => m.type === 'SetWiimote');
  return { state, sent, views, wiimotes, wiimoteMessages };
}

// 1 — Deux manettes déjà autorisées : chaque pilote prend la sienne, numérotée dans l'ordre de connexion.
const first = new FakeDevice(), second = new FakeDevice();
const api = new FakeHid();
api.granted = [first, second];
const { state, views, wiimotes, wiimoteMessages } = table(api);
state.seatDevices['A-pilot'] = 'wiimote';
wiimotes.sync(state);
await settle();
assert.equal(views.A.number, 1, 'la première manette connectée porte le numéro 1');
assert.ok(wiimoteConnected(views.A));
assert.equal(first.led, 0x10, 'sa LED 1 s’allume : le joueur la reconnaît dans la main');
assert.equal(second.sent.length, 0, 'l’autre manette n’est pas touchée');
state.seatDevices['B-pilot'] = 'wiimote';
wiimotes.sync(state);
await settle();
assert.equal(views.B.number, 2, 'la deuxième porte le numéro 2');
assert.equal(second.led, 0x20);
assert.equal(first.led, 0x10, 'jamais la même manette pour les deux pilotes');
assert.deepEqual(wiimoteMessages().map(m => [m.team, m.number]), [['A', 1], ['B', 2]]);
assert.ok(wiimoteMessages().length === 2, 'rien n’est renvoyé tant que le serveur n’a pas à corriger');

// 2 — Le serveur répète le dernier numéro connu : la table n'insiste pas.
state.wiimotes = { A: 1, B: 2 };
wiimotes.sync(state);
assert.equal(wiimoteMessages().length, 2);

// 3 — Perte puis retour de la manette 1 : la table le sait, le numéro libre est repris.
api.fire('disconnect', first);
assert.equal(views.A.number, null);
assert.ok(!wiimoteConnected(views.A));
assert.deepEqual(wiimoteMessages().at(-1), { type: 'SetWiimote', team: 'A', number: null });
api.fire('connect', first);
await settle();
assert.equal(views.A.number, 1, 'la manette retrouve le premier numéro libre');
assert.equal(views.B.number, 2, 'l’autre manette garde le sien');

// 4 — Le poste repasse sur la table : la manette est relâchée, sa LED éteinte, le serveur prévenu.
state.seatDevices['A-pilot'] = 'table';
wiimotes.sync(state);
await settle();
assert.equal(first.led, 0, 'LED éteinte');
assert.deepEqual(views.A, noWiimote());
assert.deepEqual(wiimoteMessages().at(-1), { type: 'SetWiimote', team: 'A', number: null });

// 5 — Aucune manette autorisée : la fenêtre de choix s'ouvre au toucher du bouton, sans erreur si on la ferme.
const third = new FakeDevice();
const bare = new FakeHid();
const second_table = table(bare);
second_table.state.seatDevices['A-pilot'] = 'wiimote';
second_table.wiimotes.sync(second_table.state);
await settle();
assert.equal(second_table.views.A.status, 'absent');
await second_table.wiimotes.connect('A');
assert.equal(bare.requests, 1);
assert.equal(second_table.views.A.notice, '', 'fermer la fenêtre de choix n’est pas une erreur');
bare.chosen = [third];
await second_table.wiimotes.connect('A');
assert.equal(second_table.views.A.number, 1);
await second_table.wiimotes.connect('A');
assert.equal(bare.requests, 2, 'déjà connectée : pas de nouvelle fenêtre de choix');

// 6 — Navigateur sans WebHID : le poste l'explique.
const unsupported = table(null);
unsupported.state.seatDevices['B-pilot'] = 'wiimote';
unsupported.wiimotes.sync(unsupported.state);
assert.equal(unsupported.views.B.status, 'unsupported');
assert.match(unsupported.views.B.notice, /Chrome ou Edge/);
console.log('✓ Manettes Wii de la table : reprise sans geste, numéros par ordre de connexion, deux manettes distinctes, perte, retour et libération');
process.exit(0);
