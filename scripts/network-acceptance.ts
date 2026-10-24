/** Real WebSocket checks: roles, shared state and reconnect snapshots. */
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { GameServer } from '../server/GameServer.js';
import type { GameState, ServerMessage } from '../server/types.js';

const httpServer = http.createServer();
const wss = new WebSocketServer({ server: httpServer });
const game = new GameServer(wss);
httpServer.listen(0, '127.0.0.1');
await once(httpServer, 'listening');
const port = (httpServer.address() as { port: number }).port;
const clients: WebSocket[] = [];
async function client(role: 'table' | 'oz') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${role}`);
  clients.push(ws);
  let latest: GameState | null = null;
  const snapshots: GameState[] = [];
  ws.on('message', data => {
    const msg = JSON.parse(data.toString()) as ServerMessage;
    if (msg.type === 'State') { latest = msg.state; snapshots.push(msg.state); }
  });
  await once(ws, 'open');
  const send = (message: Record<string, unknown>) => ws.send(JSON.stringify({ t: Date.now(), ...message }));
  const until = async (predicate: (s: GameState) => boolean) => {
    const deadline = Date.now() + 2000;
    while (!latest || !predicate(latest)) {
      if (Date.now() > deadline) throw new Error('shared state timed out');
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    return latest;
  };
  // Ping is a delivery barrier: previous messages on this socket have been handled.
  const flush = async () => {
    const pong = new Promise<void>(resolve => {
      const listener = (data: Buffer) => {
        if (JSON.parse(data.toString()).type === 'Pong') { ws.off('message', listener); resolve(); }
      };
      ws.on('message', listener);
    });
    send({ type: 'Ping' }); await pong;
  };
  return { ws, send, until, flush, snapshots };
}

try {
  const table = await client('table'), oz = await client('oz');
  table.send({ type: 'StartGame', mode: 'table' });
  await oz.until(s => s.phase === 'MAP');
  game.rules.startRace(undefined, true); // fixture: table track generation is covered by rule tests
  await table.until(s => s.phase === 'READY');
  assert.ok(game.getState().track);

  // Only Oz can simulate a tangible or mark a station as activated.
  table.send({ type: 'TangibleControl', id: 1, action: 'dock', team: 'A', kind: 'wall' });
  await table.flush(); assert.equal(game.getState().tangibles[1], undefined);
  oz.send({ type: 'TangibleControl', id: 1, action: 'dock', team: 'A', kind: 'wall' });
  await table.until(s => s.tangibles[1]?.status === 'docked');
  oz.send({ type: 'TangibleControl', id: 1, action: 'activate', team: 'A' });
  await table.until(s => s.tangibles[1]?.active === true);
  oz.send({ type: 'TangibleMoved', id: 1, x: .5, y: .5, angle: 90 });
  await table.until(s => s.walls.length === 1 && s.walls[0].angle === 90);
  for (const type of ['BeginRace', 'Pause', 'NewGame', 'Reset', 'StartGame']) oz.send({ type });
  oz.send({ type: 'OzTrigger', kind: 'fallbackTrack', params: {} });
  await oz.flush(); assert.equal(game.getState().phase, 'READY', 'Oz cannot change game phase');
  table.send({ type: 'BeginRace' });
  await table.until(s => s.phase === 'RACE');

  // Real pickup rule supplies the bonus, with no operator grant.
  const pickup = game.getState().pickups[0]; pickup.kind = 'boost';
  const car = game.getState().cars.A; car.pos = { ...pickup.pos };
  game.rules.afterMove('A', car.pos, Date.now());
  await table.until(s => s.cars.A.heldItem === 'boost');
  table.send({ type: 'UseItem', team: 'A' });
  table.send({ type: 'Power', team: 'A', role: 'pilot' });
  oz.send({ type: 'Power', team: 'A', role: 'copilot' });
  for (const kind of ['giveItem', 'boost', 'breakdown', 'widen', 'gestureTeam']) oz.send({ type: 'OzTrigger', kind, params: { team: 'A', item: 'slingshot' } });
  await table.flush(); await oz.flush();
  assert.equal(game.getState().cars.A.heldItem, 'boost', 'Oz cannot alter bonus stock');
  assert.equal(game.getState().cars.A.hp, 100, 'Oz cannot cause a breakdown');
  assert.equal(game.getState().deformations.length, 0);
  assert.equal(game.getState().boostGates.length, 0);
  assert.equal(game.getState().cars.A.itemArmed, false, 'old pilot command and wrong client cannot arm');
  table.send({ type: 'TangibleControl', id: 1, action: 'deactivate' });
  table.send({ type: 'TangibleRemoved', id: 1 });
  table.send({ type: 'TangibleMoved', id: 1, x: .8, y: .5, angle: 0 });
  table.send({ type: 'Power', team: 'B', role: 'copilot' });
  await table.flush(); assert.equal(game.getState().cars.A.itemArmed, false, 'enemy POWER cannot arm owner stock');
  table.send({ type: 'Power', team: 'A', role: 'copilot' });
  await oz.until(s => s.cars.A.itemArmed);
  table.send({ type: 'BoostGate', team: 'B', a: { x: 800, y: 500 }, b: { x: 1000, y: 500 } });
  await oz.until(s => s.boostGates[0]?.team === 'B' && s.cars.A.heldItem === null);

  const reconnected = await client('oz');
  await reconnected.until(s => s.track !== null && s.tangibles[1]?.status === 'placed');
  assert.ok(reconnected.snapshots[0].track, 'reconnect receives full geometry');
  oz.send({ type: 'TangibleControl', id: 1, action: 'deactivate' });
  await table.until(s => s.walls.length === 0 && s.tangibles[1]?.active === false);
  const inactive = { ...game.getState().tangibles[1] };
  table.send({ type: 'Power', team: 'A', role: 'copilot' }); await table.flush();
  assert.deepEqual(game.getState().tangibles[1], inactive, 'POWER leaves inactive tangible untouched');
  oz.send({ type: 'TangibleControl', id: 1, action: 'activate' });
  await table.until(s => s.walls.length === 1);
  assert.equal(game.getState().walls[0].pos.x, 960, 'table cannot move tangible, reactivation keeps its position');
  oz.ws.terminate(); reconnected.ws.terminate();
  // Continue pickup + arming with no Oz client connected.
  car.heldItem = null; car.itemArmed = false; pickup.respawnAt = 0;
  game.rules.afterMove('A', car.pos, Date.now());
  table.send({ type: 'Power', team: 'A', role: 'copilot' });
  await table.until(s => s.cars.A.itemArmed);
  table.send({ type: 'NewGame' });
  await table.until(s => s.phase === 'LOBBY' && Object.keys(s.tangibles).length === 0);

  // Guided tutorial: only the table starts it and skips lessons; the state reaches every client
  const ozAgain = await client('oz');
  ozAgain.send({ type: 'StartTutorial', mode: 'table' });
  await ozAgain.flush(); assert.equal(game.getState().phase, 'LOBBY', 'Oz cannot start the tutorial');
  table.send({ type: 'StartTutorial', mode: 'pc' });
  const started = await ozAgain.until(s => s.phase === 'RACE' && s.tutorial !== null);
  assert.equal(started.mapMode, 'pc');
  assert.ok(started.track?.preset);
  ozAgain.send({ type: 'TutorialSkip', team: 'A' });
  await ozAgain.flush(); assert.equal(game.getState().tutorial!.teams.A.step, 0, 'Oz cannot skip a lesson');
  table.send({ type: 'TutorialSkip', team: 'A' });
  await ozAgain.until(s => s.tutorial?.teams.A.step === 1);
  assert.equal(game.getState().tutorial!.teams.B.step, 0, 'lessons are independent per team');
  table.send({ type: 'NewGame' });
  await ozAgain.until(s => s.phase === 'LOBBY' && s.tutorial === null);
  console.log('✓ Network: role boundaries, copilot POWER, Oz restricted to tangibles, autonomous pickups, theft, reconnect, reset and tutorial');
} finally {
  game.physics.stop();
  for (const ws of clients) ws.terminate();
  await new Promise<void>(resolve => wss.close(() => resolve()));
  await new Promise<void>(resolve => httpServer.close(() => resolve()));
}
