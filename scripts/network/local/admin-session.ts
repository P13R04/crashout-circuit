/** Vérifie les droits de l’hôte et le parcours d’un salon à quatre téléphones. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import { WebSocket } from 'ws';
import type { SeatId, ServerMessage } from '../../../server/types.js';

const child = spawn(process.execPath, ['dist/server/index.js'], { env: {
  ...process.env, PORT: '0', CRASHOUT_SOLO_TEST: '0', CRASHOUT_DEV_TOOLS: '0', CRASHOUT_SPECTATORS: '1',
  CRASHOUT_TLS_CERT: undefined, CRASHOUT_TLS_KEY: undefined, CRASHOUT_PUBLIC_URL: undefined,
} });
const exit = once(child, 'exit'), signal = AbortSignal.timeout(8000);
const sockets: WebSocket[] = [];
let output = '';
child.stdout.on('data', chunk => { output += chunk; });

try {
  for (let i = 0; i < 100 && !output.includes('/admin?host='); i++) await wait(25);
  const privateLink = new URL(output.match(/http:\/\/localhost:\d+\/admin\?host=[a-f0-9]+/)![0]);
  const url = (pathname: string) => new URL(pathname, privateLink);
  assert.equal((await fetch(url('/admin'), { signal })).status, 401);
  const api = url('/api/admin');
  assert.equal((await fetch(api, { signal })).status, 401);
  assert.equal((await fetch(api, { method: 'POST', signal })).status, 401);
  const access = await fetch(privateLink, { redirect: 'manual', signal });
  assert.equal(access.status, 303);
  assert.equal(access.headers.get('location'), '/admin');
  const cookie = access.headers.get('set-cookie')!.split(';')[0];
  const read = async () => (await fetch(api, { headers: { Cookie: cookie }, signal })).json();
  const { room } = await read();
  const post = (action: string, payload: Record<string, unknown> = {}) => fetch(api, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, room, ...payload }), signal,
  });
  const ids: SeatId[] = ['A-pilot', 'A-copilot', 'B-pilot', 'B-copilot'];
  const joins = await Promise.all(ids.map(async seat => {
    const socket = new WebSocket(url('/ws/player').href.replace('http:', 'ws:'));
    sockets.push(socket);
    const joined = once(socket, 'joined', { signal });
    socket.on('message', raw => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      if (message.type === 'Joined') socket.emit('joined', message.token);
    });
    await once(socket, 'open', { signal });
    socket.send(JSON.stringify({ type: 'Join', room, seat, t: Date.now() }));
    await joined;
    return socket;
  }));
  const settings = { difficulty: 'medium', theme: 'classic', lapsToWin: 2, sessionMaxSeconds: 120 };
  assert.equal((await post('settings', settings)).status, 200);
  assert.equal((await post('settings', { ...settings, lapsToWin: 0 })).status, 400);
  assert.equal((await read()).lapsToWin, 2);
  assert.equal((await post('quickRace')).status, 200);
  let state = await read();
  assert.equal(state.phase, 'RACE');
  assert.equal(state.wideTable, true);
  assert.equal((await post('home')).status, 200);
  state = await read();
  assert.equal(state.phase, 'LOBBY');
  assert.equal(state.seats['A-pilot'].connected, true);
  const closed = once(joins[0], 'close', { signal });
  assert.equal((await post('kick', { seat: 'A-pilot' })).status, 200);
  await closed;
  assert.equal((await read()).seats['A-pilot'].taken, false);
  assert.equal((await post('tutorial')).status, 200);
  assert.equal((await read()).phase, 'RACE');
  assert.equal((await post('reset')).status, 200);
  state = await read();
  assert.equal(state.phase, 'LOBBY');
  assert.equal(ids.every(seat => !state.seats[seat].taken), true);
  console.log('✓ Administration : accès privé, réglages, quatre mobiles, course, tutoriel, déconnexion et remise à zéro');
} finally {
  for (const socket of sockets) socket.terminate();
  child.kill();
  await exit;
}
