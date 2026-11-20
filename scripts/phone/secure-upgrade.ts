/** Vérifie qu'un pilote ou un copilote peut reprendre son poste en passant du QR HTTP au capteur HTTPS. */
import assert from 'node:assert/strict';
import { PhoneSession } from '../../client-shared/playerSession.js';

const globals = globalThis as unknown as Record<string, unknown>;
const sockets: TestSocket[] = [];
const stored = new Map<string, string>();
class TestSocket extends EventTarget {
  static OPEN = 1;
  readyState = 1;
  readonly sent: Record<string, unknown>[] = [];
  constructor(readonly url: string) {
    super();
    sockets.push(this);
    queueMicrotask(() => this.dispatchEvent(new Event('open')));
  }
  send(raw: string): void { this.sent.push(JSON.parse(raw)); }
  close(): void { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  receive(message: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}
globals.WebSocket = TestSocket;
globals.history = { replaceState: (_state: unknown, _title: string, url: string) => {
  globals.location = new URL(url, globals.location as URL);
} };
globals.sessionStorage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, value),
  removeItem: (key: string) => stored.delete(key),
};
globals.fetch = async () => new Response(JSON.stringify({
  room: 'ABCDE', baseUrls: ['http://192.168.1.5:3001'], localNetwork: true,
  secureBaseUrls: ['https://192.168.1.5:3444'], spectators: false,
}));

const token = '4d6b34d0-ce98-4ba0-a038-73bfa74f935d';
for (const seat of ['A-pilot', 'A-copilot'] as const) {
  stored.clear();
  globals.location = new URL(`http://192.168.1.5:3001/play?room=ABCDE&seat=${seat}`);
  const http = new PhoneSession(() => {}, seat);
  await http.open('ABCDE');
  const first = sockets.at(-1)!;
  assert.equal(first.sent.at(-1)?.seat, seat, 'le QR de poste prend la place annoncée');
  first.receive({ type: 'Joined', seat, token });
  const secure = new URL(http.secureJoinUrl);
  assert.equal(secure.protocol, 'https:');
  assert.equal(secure.searchParams.get('seat'), seat);
  assert.equal(secure.searchParams.get('input'), 'gyro');
  assert.ok(!secure.search.includes(token), 'le jeton reste hors de la requête HTTP');
  assert.equal(new URLSearchParams(secure.hash.slice(1)).get('resume'), token);
  http.suspend();

  // Les deux origines n'ont aucun stockage en commun : seul le lien doit permettre la reprise.
  stored.clear();
  globals.location = secure;
  const https = new PhoneSession(() => {}, seat);
  await https.open('ABCDE');
  const second = sockets.at(-1)!;
  assert.equal(new URL(second.url).protocol, 'wss:');
  assert.equal(second.sent.at(-1)?.token, token, 'reprendre le même poste, sans redemander une place déjà prise');
  assert.equal((globals.location as URL).hash, '', 'effacer le jeton de la barre d’adresse');
  second.receive({ type: 'Joined', seat, token });
  assert.equal(https.canPlay, true);
  https.suspend();
}
console.log('✓ Passage HTTP → HTTPS : réservations pilote et copilote reprises, WebSocket sécurisé et jeton effacé');
