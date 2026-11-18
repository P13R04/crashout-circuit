/**
 * Vérifie le lancement d'une partie solo depuis la page Wii : manette vérifiée, séance ouverte, place prise, StartSolo envoyé.
 * Liens : client-wiimote/launch/soloLaunch.ts.
 */
import assert from 'node:assert/strict';
import { launchSolo, SOLO_LAUNCH_NOTICE, type SoloSessionPort } from '../../client-wiimote/launch/soloLaunch.js';
import type { SeatId } from '../../server/types.js';

type Sent = { type: string } & Record<string, unknown>;
const timing = { connectMs: 300, resumeMs: 60, seatMs: 300, confirmMs: 150 };
const later = (ms: number, action: () => void) => setTimeout(action, ms);

/** Séance factice : le serveur répond après un court délai. */
class FakeSession implements SoloSessionPort {
  room = '';
  online = false;
  canPlay = false;
  seat: SeatId | null = null;
  state: { soloTest: boolean; phase: string; trackVersion: number } | null = null;
  sent: Sent[] = [];
  opened: string[] = [];
  joins: SeatId[] = [];
  constructor(private readonly options: { accepts?: boolean; reachable?: boolean; seatFree?: boolean; resumes?: boolean } = {}) {}
  async open(code: string): Promise<void> {
    this.opened.push(code);
    if (this.options.reachable === false) return;
    this.room = code;
    later(20, () => {
      this.online = true;
      this.state = { soloTest: false, phase: 'LOBBY', trackVersion: 3 };
      if (this.options.resumes) later(10, () => { this.seat = 'A-pilot'; this.canPlay = true; });
    });
  }
  join(seat: SeatId): void {
    this.joins.push(seat);
    if (this.options.seatFree === false) return;
    later(20, () => { this.seat = seat; this.canPlay = true; });
  }
  send(message: Sent): void {
    this.sent.push(message);
    // Le serveur démarre le solo si l'accueil est libre ; sinon il ignore la demande.
    if (message.type === 'StartSolo' && this.options.accepts !== false) {
      later(20, () => { this.state = { soloTest: true, phase: 'RACE', trackVersion: (this.state?.trackVersion ?? 0) + 1 }; });
    }
  }
}

/** Lance avec une manette connectée ou non et la séance donnée. */
const run = (session: FakeSession, connected = true) => launchSolo({
  session, controllerConnected: () => connected, readRoom: async () => 'ABCDE', timing,
});

// Manette absente : rien n'est ouvert ni envoyé.
const none = new FakeSession();
assert.equal(await run(none, false), 'no-controller');
assert.deepEqual([none.opened, none.joins, none.sent], [[], [], []]);

// Cas nominal : le code est relevé tout seul, la place A-pilot prise, StartSolo envoyé une fois.
const nominal = new FakeSession();
assert.equal(await run(nominal), 'started');
assert.deepEqual(nominal.opened, ['ABCDE']);
assert.deepEqual(nominal.joins, ['A-pilot']);
assert.deepEqual(nominal.sent, [{ type: 'StartSolo' }]);

// Séance déjà ouverte et place déjà tenue : on relance sans rouvrir ni redemander de place.
const again = new FakeSession();
again.room = 'ABCDE'; again.online = true; again.canPlay = true; again.seat = 'A-pilot'; again.state = { soloTest: true, phase: 'RESULT', trackVersion: 7 };
assert.equal(await run(again), 'started');
assert.deepEqual([again.opened, again.joins], [[], []]);
assert.equal(again.sent.length, 1);

// Réservation reprise à l'ouverture : pas de seconde demande de place qui l'annulerait.
const resumed = new FakeSession({ resumes: true });
assert.equal(await run(resumed), 'started');
assert.deepEqual(resumed.joins, []);

// Serveur qui refuse (autre joueur assis, partie en cours) : la partie n'est pas annoncée comme démarrée.
const refused = new FakeSession({ accepts: false });
assert.equal(await run(refused), 'refused');
assert.deepEqual(refused.sent, [{ type: 'StartSolo' }]);
assert.doesNotMatch(SOLO_LAUNCH_NOTICE.refused, /CRASHOUT_SOLO_TEST/);

// Serveur injoignable : lecture du code ou connexion qui échoue.
const down = new FakeSession({ reachable: false });
assert.equal(await run(down), 'offline');
const unreadable = await launchSolo({
  session: new FakeSession(), controllerConnected: () => true, readRoom: async () => { throw new Error('hors ligne'); }, timing,
});
assert.equal(unreadable, 'offline');

// Place refusée ou jamais confirmée : aucune course n'est lancée.
const taken = new FakeSession({ seatFree: false });
assert.equal(await run(taken), 'seat-unavailable');
assert.deepEqual(taken.sent, []);

// Manette perdue pendant l'attente de la place : pas de StartSolo.
let connected = true;
const lost = new FakeSession();
lost.join = (seat: SeatId) => { connected = false; later(20, () => { lost.seat = seat; lost.canPlay = true; }); };
assert.equal(await launchSolo({ session: lost, controllerConnected: () => connected, readRoom: async () => 'ABCDE', timing }), 'no-controller');
assert.deepEqual(lost.sent, []);

console.log('✓ Pilote Wii : lancement d’une partie solo après vérification de la manette');
