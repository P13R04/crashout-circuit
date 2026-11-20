/** Vérifie les droits, les données publiques et la reprise du flux de course spectateur. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import { WebSocket } from 'ws';
import type { RaceViewState } from '../../server/protocol/raceView.js';

const server = spawn(process.execPath, ['dist/server/index.js'], { env: {
  ...process.env, PORT: '0', CRASHOUT_SOLO_TEST: '1', CRASHOUT_SPECTATORS: '1',
  CRASHOUT_TLS_KEY: undefined, CRASHOUT_TLS_CERT: undefined, CRASHOUT_PUBLIC_URL: undefined,
} });
const exit = once(server, 'exit');
let output = '';
server.stdout.on('data', chunk => { output += chunk; });

async function* watch(url: URL, signal: AbortSignal): AsyncGenerator<RaceViewState> {
  const response = await fetch(url, { signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      pending += value;
      let next: number;
      while ((next = pending.indexOf('\n\n')) >= 0) {
        const event = pending.slice(0, next);
        pending = pending.slice(next + 2);
        if (event.startsWith('event: race\ndata: ')) yield JSON.parse(event.slice(18)).state as RaceViewState;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function rejected(url: URL): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url.href.replace('http:', 'ws:'), { handshakeTimeout: 1500 });
    ws.on('unexpected-response', (_request, response) => {
      resolve(response.statusCode ?? 0);
      response.destroy();
    });
    ws.on('error', reject);
    ws.on('open', () => { ws.terminate(); reject(new Error('La connexion non autorisée a abouti.')); });
  });
}

async function frame(feed: AsyncGenerator<RaceViewState>, phase: RaceViewState['phase']): Promise<RaceViewState> {
  for await (const item of { [Symbol.asyncIterator]: () => ({
    next: () => feed.next(),
  }) }) if (item.phase === phase) return item;
  throw new Error('Phase attendue : ' + phase);
}

let pilot: WebSocket | undefined;
let table: WebSocket | undefined;
const abort = new AbortController();
try {
  for (let i = 0; i < 120 && !output.includes('/watch?room='); i++) await wait(25);
  const host = new URL(output.match(/Local:\s+(http:\/\/localhost:\d+\/\?host=[a-f0-9]+)/)![1]);
  const { room } = await (await fetch(new URL('/api/session', host))).json();
  const events = new URL('/api/spectator?room=' + room, host);
  const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(6000)]);
  const a = watch(events, signal), b = watch(events, signal);
  assert.equal((await fetch(new URL('/watch?room=' + room, host))).status, 200);
  assert.equal((await fetch(new URL('/api/spectator?room=XXXXX', host))).status, 404);
  assert.equal((await fetch(events, { method: 'POST' })).status, 405);
  assert.equal(await rejected(new URL('/ws/spectator', host)), 401);
  assert.equal(await rejected(new URL('/ws/table', host)), 401);
  assert.equal(await rejected(new URL('/ws/oz', host)), 401);
  const authorized = await fetch(host, { redirect: 'manual' });
  assert.equal(authorized.status, 303);
  const cookie = authorized.headers.get('set-cookie')!.split(';')[0];
  table = new WebSocket(new URL('/ws/table', host).href.replace('http:', 'ws:'), { headers: { Cookie: cookie } });
  await once(table, 'open', { signal });
  assert.deepEqual((await Promise.all([frame(a, 'LOBBY'), frame(b, 'LOBBY')])).map(s => s.track), [null, null]);
  await b.return(undefined);

  pilot = new WebSocket(new URL('/ws/player', host).href.replace('http:', 'ws:'));
  const send = (ws: WebSocket, msg: object) => ws.send(JSON.stringify({ ...msg, t: Date.now() }));
  const joined = once(pilot, 'joined', { signal });
  pilot.on('message', bytes => {
    if (JSON.parse(bytes.toString()).type === 'Joined') pilot?.emit('joined');
  });
  await once(pilot, 'open', { signal });
  send(pilot, { type: 'Join', room, seat: 'A-pilot' });
  await joined;
  send(pilot, { type: 'StartSolo' });
  const race = await frame(a, 'RACE');
  assert.ok(race.track?.outerEdge.length);
  assert.equal(race.theme, 'classic');
  assert.equal(race.soloTest, true);
  for (const privateKey of ['seats', 'tangiblePlacement', 'driveMode']) assert.ok(!(privateKey in race));
  for (const privateKey of ['heldItem', 'itemArmed', 'itemArmVersion']) assert.ok(!(privateKey in race.cars.A));
  const next = await a.next();
  assert.equal(next.value?.track, null);
  send(pilot, { type: 'SetTheme', theme: 'neon' });
  assert.equal((await a.next()).value?.theme, 'classic');
  send(table, { type: 'SetTheme', theme: 'neon' });
  await a.return(undefined);
  await wait(100);
  const reconnect = watch(events, signal);
  const current = await frame(reconnect, 'RACE');
  assert.ok(current.track?.outerEdge.length);
  assert.equal(current.trackVersion, race.trackVersion);
  assert.equal(current.theme, 'neon');
  await reconnect.return(undefined);
  console.log('✓ Spectateur : page, flux en lecture seule, accès hôte, thème et piste complète après reconnexion');
} finally {
  abort.abort();
  pilot?.terminate();
  table?.terminate();
  server.kill();
  await exit;
}
