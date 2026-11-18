/**
 * Vérifie l'ouverture et la fermeture des spectateurs depuis les paramètres de la table, sans variable d'environnement.
 * Liens : server/net/spectatorSwitch.ts, server/net/hostAccess.ts, server/net/SpectatorStream.ts.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { setTimeout as wait } from 'node:timers/promises';
import { fromServerMachine } from '../../server/net/spectatorSwitch.js';

// 1 — Origine de la requête : seule la machine du serveur peut ouvrir les spectateurs.
const request = (remoteAddress: string) => ({ socket: { remoteAddress } }) as IncomingMessage;
const own = { Wi: [{ address: '192.168.75.9' }] } as never;
assert.equal(fromServerMachine(request('127.0.0.1'), {}), true);
assert.equal(fromServerMachine(request('::1'), {}), true);
assert.equal(fromServerMachine(request('::ffff:127.0.0.1'), {}), true);
assert.equal(fromServerMachine(request('::ffff:192.168.75.9'), own), true, 'la table ouverte par l’adresse réseau de sa propre machine');
assert.equal(fromServerMachine(request('192.168.75.23'), own), false, 'un téléphone du réseau ne peut pas');

// 2 — Sur un vrai serveur lancé sans CRASHOUT_SPECTATORS.
const server = spawn(process.execPath, ['dist/server/index.js'], { env: {
  ...process.env, PORT: '0', CRASHOUT_SPECTATORS: undefined,
  CRASHOUT_TLS_KEY: undefined, CRASHOUT_TLS_CERT: undefined, CRASHOUT_PUBLIC_URL: undefined,
} });
const exit = once(server, 'exit');
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
const post = (base: string, body: unknown, headers: Record<string, string> = {}) => fetch(new URL('/api/spectators', base), {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
try {
  for (let i = 0; i < 120 && !output.includes('Local:'); i++) await wait(25);
  const base = output.match(/Local:\s+(http:\/\/localhost:\d+)/)![1];
  const session = async (headers: Record<string, string> = {}) => (await fetch(new URL('/api/session', base), { headers })).json();
  const { room, spectators } = await session();
  assert.equal(spectators, false);
  assert.equal((await fetch(new URL('/watch?room=' + room, base))).status, 404, 'fermé : pas de page spectateur');
  assert.equal((await fetch(new URL('/api/spectator?room=' + room, base))).status, 404);
  assert.equal((await fetch(base)).status, 200, 'fermé : la table s’ouvre sans lien privé');

  // Requêtes refusées : mauvaise méthode, autre site, corps invalide.
  assert.equal((await fetch(new URL('/api/spectators', base))).status, 405);
  assert.equal((await post(base, { on: true }, { Origin: 'http://autre-site.example' })).status, 400);
  assert.equal((await fetch(new URL('/api/spectators', base), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"on":true}' })).status, 400);
  assert.equal((await post(base, { on: 'oui' })).status, 400);
  assert.equal((await session()).spectators, false);

  // Ouverture depuis la machine du serveur : la table reçoit le cookie hôte.
  const opened = await post(base, { on: true });
  assert.equal(opened.status, 200);
  assert.deepEqual(await opened.json(), { spectators: true });
  const cookie = opened.headers.get('set-cookie')!.split(';')[0];
  assert.match(cookie, /^crashout-host-[a-f0-9]{10}=[a-f0-9]+$/);
  assert.equal((await session()).spectators, true);
  assert.equal((await fetch(new URL('/watch?room=' + room, base))).status, 200);
  assert.equal((await fetch(base)).status, 401, 'ouvert : la table exige le lien privé');
  assert.equal((await fetch(base, { headers: { Cookie: cookie } })).status, 200, 'le cookie reçu suffit à la table');
  assert.equal((await fetch(new URL('/oz', base))).status, 401, 'ouvert : Oz aussi');
  assert.ok(output.includes('Spectateurs ouverts') && output.includes('?host='), 'le terminal rappelle le lien privé');

  // Un spectateur connecté, puis fermeture.
  const stream = await fetch(new URL('/api/spectator?room=' + room, base));
  assert.equal(stream.status, 200);
  const reader = stream.body!.getReader();
  await reader.read();
  assert.equal((await session()).viewers, 1);
  assert.equal((await post(base, { on: false })).status, 403, 'ouvert : sans le lien privé, on ne peut pas refermer');
  const closed = await post(base, { on: false }, { Cookie: cookie });
  assert.equal(closed.status, 200);
  for (let i = 0; i < 80; i++) { const { done } = await reader.read(); if (done) break; }
  const after = await session();
  assert.equal(after.spectators, false);
  assert.equal(after.viewers, 0, 'les spectateurs présents sont déconnectés');
  assert.equal((await fetch(new URL('/watch?room=' + room, base))).status, 404);
  assert.equal((await fetch(base)).status, 200, 'refermé : la table s’ouvre de nouveau sans lien privé');
  console.log('✓ Spectateurs depuis les paramètres : machine du serveur seule, cookie hôte, protection de la table et d’Oz, fermeture');
} finally {
  server.kill();
  await exit;
}
