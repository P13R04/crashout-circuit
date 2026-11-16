/**
 * Vérifie la couche réseau du pilote Wii : cadence, boutons, perte de la manette et neutralisation de la voiture.
 * Liens : client-shared/pilot/pilotLink.ts, client-wiimote/control/wiimoteCommandSource.ts, config.json (pilotInputTimeoutMs).
 */
import assert from 'node:assert/strict';
import { PilotLink, type PilotSessionPort } from '../../client-shared/pilot/pilotLink.js';
import type { PilotCommandSource, PilotSnapshot } from '../../client-shared/pilot/pilotCommandSource.js';
import { NO_BUTTONS, type DecodedReport, type RawAccel } from '../../client-wiimote/hid/reportDecoder.js';
import { ACCEL_PER_G, ACCEL_REST } from '../../client-wiimote/hid/wiimoteProtocol.js';
import { WiimoteCommandSource } from '../../client-wiimote/control/wiimoteCommandSource.js';
import { config } from '../../server/config.js';
import type { DriveMode, Phase } from '../../server/types.js';

type Sent = { type: string } & Record<string, unknown>;

/** Séance factice : consigne ce qui part vers le serveur. */
class FakeSession implements PilotSessionPort {
  canPlay = true;
  sent: Sent[] = [];
  phase: Phase = 'RACE';
  driveMode: DriveMode = 'auto';
  disabled = false;
  sync = { now: () => 10_000 };
  get state() {
    return {
      phase: this.phase,
      sessionStartAt: 0,
      driveMode: { A: this.driveMode, B: 'auto' as DriveMode },
      cars: { A: { disabled: this.disabled }, B: { disabled: false } },
    } as unknown as NonNullable<PilotSessionPort['state']>;
  }
  /** Comme PhoneSession.send : rien ne part tant que la place n'est pas confirmée. */
  send(message: Sent): void { if (this.canPlay) this.sent.push(message); }
  take(type: string): Sent[] { return this.sent.filter(m => m.type === type); }
}

/** Source scriptée : renvoie la commande qu'on lui donne, ou null (manette perdue). */
class ScriptedSource implements PilotCommandSource {
  snapshot: PilotSnapshot | null = { steer: .5, accelerate: false, repair: false, toggleDriveMode: false };
  read(): PilotSnapshot | null { return this.snapshot; }
}

const session = new FakeSession();
const source = new ScriptedSource();
const link = new PilotLink(session, 'A', source);

// Mode AUTO : la direction part, l'accélérateur est à fond quel que soit B.
link.tick(1000);
assert.deepEqual(session.take('PilotInput').map(m => [m.team, m.steer, m.throttle]), [['A', .5, 1]]);
assert.equal(link.isDriving, true);
// Moins de 33 ms plus tard : rien ne part ; une commande immobile est renouvelée avant le délai du serveur.
link.tick(1010);
assert.equal(session.take('PilotInput').length, 1);
link.tick(1100);
assert.equal(session.take('PilotInput').length, 2);
assert.ok(100 < config.pilotInputTimeoutMs, 'le renouvellement tient dans le délai du serveur');
// Une direction qui change repart tout de suite.
source.snapshot = { ...source.snapshot!, steer: -.3 };
link.tick(1140);
assert.equal(session.take('PilotInput').at(-1)!.steer, -.3);

// Mode PÉDALE : B commande l'accélérateur.
session.driveMode = 'pedal';
source.snapshot = { ...source.snapshot!, accelerate: true };
link.tick(1300);
assert.equal(session.take('PilotInput').at(-1)!.throttle, 1);
source.snapshot = { ...source.snapshot!, accelerate: false };
link.tick(1400);
assert.equal(session.take('PilotInput').at(-1)!.throttle, 0);

// Réparation : A tenu envoie PadHold une fois, relâché une fois (rôle pilote).
source.snapshot = { ...source.snapshot!, repair: true };
link.tick(1500);
link.tick(1510);
assert.deepEqual(session.take('PadHold').map(m => [m.team, m.role, m.on]), [['A', 'pilot', true]]);
source.snapshot = { ...source.snapshot!, repair: false };
link.tick(1520);
assert.deepEqual(session.take('PadHold').map(m => m.on), [true, false]);

// Bascule AUTO / PÉDALE : une pression = un message.
source.snapshot = { ...source.snapshot!, toggleDriveMode: true };
link.tick(1600);
link.tick(1610);
assert.equal(session.take('ToggleDriveMode').length, 1);
source.snapshot = { ...source.snapshot!, toggleDriveMode: false };
link.tick(1620);
source.snapshot = { ...source.snapshot!, toggleDriveMode: true };
link.tick(1630);
assert.equal(session.take('ToggleDriveMode').length, 2);
source.snapshot = { ...source.snapshot!, toggleDriveMode: false };

// Perte de la manette : une direction neutre part une fois, le lien arrête d'envoyer, la réparation est relâchée.
source.snapshot = { ...source.snapshot!, repair: true };
link.tick(1700);
source.snapshot = null;
const before = session.sent.length;
link.tick(1710);
const after = session.sent.slice(before);
assert.deepEqual(after.filter(m => m.type === 'PilotInput').map(m => [m.steer, m.throttle]), [[0, 0]]);
assert.equal(after.filter(m => m.type === 'PadHold').at(-1)!.on, false);
assert.equal(link.isDriving, false);
const silent = session.sent.length;
for (let t = 1720; t < 3000; t += 10) link.tick(t);
assert.equal(session.sent.length, silent, 'plus aucune commande tant que la manette est perdue');

// Retour de la manette : la conduite reprend.
source.snapshot = { steer: .2, accelerate: false, repair: false, toggleDriveMode: false };
link.tick(3100);
assert.equal(session.take('PilotInput').at(-1)!.steer, .2);

// Hors course, voiture en panne ou connexion absente : rien ne part et une commande neutre libère la voiture.
for (const [label, change] of [
  ['voiture en panne', () => { session.disabled = true; }],
  ['pause', () => { session.disabled = false; session.phase = 'PAUSED'; }],
] as const) {
  change();
  const n = session.sent.length;
  link.tick(4000);
  assert.deepEqual(session.sent.slice(n).filter(m => m.type === 'PilotInput').map(m => [m.steer, m.throttle]), [[0, 0]], label);
  const first = session.sent.length;
  link.tick(4100);
  assert.equal(session.sent.length, first, `${label} : une seule commande neutre`);
  session.phase = 'RACE';
  session.disabled = false;
  link.tick(4200);
}
session.canPlay = false;
const offline = session.sent.length;
link.tick(5000);
assert.equal(session.sent.length, offline, 'sans place confirmée, aucune commande ne part');
session.canPlay = true;

// release() neutralise immédiatement (onglet masqué ou page fermée).
link.tick(6000);
const beforeRelease = session.sent.length;
link.release();
assert.deepEqual(session.sent.slice(beforeRelease).filter(m => m.type === 'PilotInput').map(m => [m.steer, m.throttle]), [[0, 0]]);

// Chaîne complète : rapports de la vraie source jusqu'au réseau, puis déconnexion de la manette.
const real = new WiimoteCommandSource({ grip: 'face', flip: false });
const wire = new FakeSession();
const chain = new PilotLink(wire, 'A', real);
const rest: RawAccel = { x: ACCEL_REST + ACCEL_PER_G, y: ACCEL_REST, z: ACCEL_REST };
const report = (buttons: Partial<typeof NO_BUTTONS> = {}): DecodedReport => ({ kind: 'motion', buttons: { ...NO_BUTTONS, ...buttons }, accel: rest });
real.connect(0);
let now = 0;
for (; now < 700; now += 10) { real.feed(report(), now); chain.tick(now); }
assert.ok(wire.take('PilotInput').length >= 2, 'la conduite part une fois le neutre mesuré, renouvelée toutes les 100 ms');
assert.ok(wire.take('PilotInput').every(m => Math.abs(m.steer as number) < 1e-3));
real.feed(report({ a: true }), now);
chain.tick(now += 10);
assert.equal(wire.take('PadHold').at(-1)!.on, true);
real.disconnect();
const beforeLoss = wire.sent.length;
chain.tick(now += 10);
const lossMessages = wire.sent.slice(beforeLoss);
assert.deepEqual(lossMessages.filter(m => m.type === 'PilotInput').map(m => [m.steer, m.throttle]), [[0, 0]], 'direction neutre à la déconnexion');
assert.equal(lossMessages.find(m => m.type === 'PadHold')!.on, false, 'réparation relâchée à la déconnexion');
const afterLoss = wire.sent.length;
for (let t = 0; t < 1000; t += 10) chain.tick(now += 10);
assert.equal(wire.sent.length, afterLoss);

console.log('✓ Pilote Wii : cadence, boutons, perte de la manette et neutralisation de la voiture');
