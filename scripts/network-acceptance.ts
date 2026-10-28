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

  // Touch placement splits authority: Oz announces; only table contacts supply the pose.
  table.send({type:'TangiblePlacementMode',mode:'touch'});await table.flush();
  assert.equal(game.getState().tangiblePlacementMode,'manual','table cannot change the Oz input mode');
  oz.send({type:'TangiblePlacementMode',mode:'touch'});await table.until(s=>s.tangiblePlacementMode==='touch');
  table.send({type:'TangiblePrepare',id:1});await table.flush();assert.equal(game.getState().tangiblePlacement,null);
  oz.send({type:'TangiblePrepare',id:1});const waiting=await table.until(s=>s.tangiblePlacement?.id===1);
  const grant=waiting.tangiblePlacement!;
  const observer=await client('table');assert.equal(observer.snapshots[0].tangiblePlacement?.token,grant.token,'new table gets the same single-use grant');observer.ws.terminate();
  const placement={type:'TangibleTouchPlaced',id:1,token:grant.token,a:{x:900,y:500},b:{x:900,y:580}};
  oz.send(placement);await oz.flush();assert.equal(game.getState().walls.length,0,'Oz cannot impersonate table contacts');
  table.send({type:'TangiblePlacementCancel'});await table.flush();assert.equal(game.getState().tangiblePlacement?.token,grant.token,'table cannot cancel Oz’s grant');
  table.send(placement);await oz.until(s=>s.tangibles[1]?.status==='placed');
  assert.equal(game.getState().tangibles[1].angle,0,'vertical grip produces a horizontal wall');
  assert.equal(game.getState().tangiblePlacement,null);
  table.send({type:'TangibleRemoved',id:1});table.send({type:'TangibleControl',id:1,action:'deactivate'});await table.flush();
  assert.equal(game.getState().tangibles[1].active,true,'only Oz controls removal and activation');
  oz.send({type:'TangibleRemoved',id:1});oz.send({type:'TangiblePlacementMode',mode:'manual'});
  await table.until(s=>s.tangiblePlacementMode==='manual'&&!s.tangibles[1]);

  // Only Oz can atomically place and activate the fixed neutral objects.
  table.send({ type: 'TangibleMoved', id: 1, x: .5, y: .5, angle: 90, active: true });
  await table.flush(); assert.equal(game.getState().tangibles[1], undefined);
  oz.send({ type: 'TangibleMoved', id: 1, x: .5, y: .5, angle: 90, active: true });
  await oz.flush(); assert.equal(game.getState().tangibles[1], undefined, 'uncharged direct placement is refused');
  table.send({type:'TangibleControl',id:1,action:'dock',team:'A'});
  await table.flush();assert.equal(game.getState().tangibles[1],undefined);
  oz.send({type:'TangibleControl',id:1,action:'dock',team:'B'});
  oz.send({type:'TangibleControl',id:1,action:'activate'});
  oz.send({ type: 'TangibleMoved', id: 1, x: .5, y: .5, angle: 90, active: true });
  await table.until(s => s.walls.length === 1 && s.walls[0].angle === 90);
  assert.equal(game.getState().walls[0].team, null);
  assert.ok(game.getState().params.wallWidthPx > 50, 'physical wall width is shared with clients');
  oz.send({type:'TangibleMoved',id:1,x:.7,y:.5,angle:90,active:true});
  await oz.flush();assert.equal(game.getState().tangibles[1].x,.5,'distant placement requires recharge');
  oz.send({type:'TangibleControl',id:1,action:'dock',team:'A'});
  await table.until(s=>s.tangibles[1]?.status==='docked'&&!s.tangibles[1].active);
  assert.equal(game.getState().walls.length,0,'dock removes the effect');
  oz.send({type:'TangibleMoved',id:1,x:.5,y:.5,angle:90,active:true});
  await oz.flush();assert.equal(game.getState().tangibles[1].status,'docked','activation flag cannot substitute for charging');
  oz.send({type:'TangibleControl',id:1,action:'activate'});
  oz.send({type:'TangibleMoved',id:1,x:.5,y:.5,angle:90,active:true});
  await table.until(s=>s.tangibles[1]?.status==='placed');
  oz.send({ type: 'TangibleControl', id: 1, action: 'configure', team: 'B', kind: 'pylon' });
  await oz.flush(); assert.equal(game.getState().tangibles[1].kind, 'wall');
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
  // Tick snapshots omit the track; inspect the initial full snapshot separately.
  await reconnected.until(s => s.tangibles[1]?.status === 'placed');
  assert.ok(reconnected.snapshots[0].track, 'reconnect receives full geometry');
  oz.send({ type: 'TangibleControl', id: 1, action: 'deactivate' });
  await table.until(s => s.walls.length === 0 && s.tangibles[1]?.active === false);
  const inactive = { ...game.getState().tangibles[1] };
  table.send({ type: 'Power', team: 'A', role: 'copilot' }); await table.flush();
  assert.deepEqual(game.getState().tangibles[1], inactive, 'POWER leaves inactive tangible untouched');
  oz.send({ type: 'TangibleControl', id: 1, action: 'activate' });
  await table.until(s => s.walls.length === 1);
  assert.equal(game.getState().walls[0].pos.x, 960, 'table cannot move tangible, reactivation keeps its position');
  oz.send({type:'TangiblePlacementMode',mode:'touch'});oz.send({type:'TangiblePrepare',id:2});
  await table.until(s=>s.tangiblePlacement?.id===2);
  oz.ws.terminate(); reconnected.ws.terminate();
  await table.until(s=>s.tangiblePlacement===null);
  assert.equal(game.getState().tangibles[2],undefined,'last Oz disconnect cancels the unplaced grant');
  // Continue pickup + arming with no Oz client connected.
  car.heldItem = null; car.itemArmed = false; pickup.respawnAt = 0;
  game.rules.afterMove('A', car.pos, Date.now());
  table.send({ type: 'Power', team: 'A', role: 'copilot' });
  await table.until(s => s.cars.A.itemArmed);

  // The final relaxation must carry its geometry, even though deformations is now empty.
  // Otherwise StateSync clears the previous version and the road disappears.
  game.physics.stop();
  const state = game.getState(), start = Date.now(), edge = state.track!.outerEdge[20], center = state.track!.centerline[20];
  for (const c of Object.values(state.cars)) c.disabled = true;
  const dx = edge.x - center.x, dy = edge.y - center.y, length = Math.hypot(dx, dy);
  game.rules.onBorderPull({ type: 'BorderPull', t: start, team: 'A', x: edge.x, y: edge.y, dx: dx / length * 50, dy: dy / length * 50 });
  const frame = (now: number) => {
    game.physics.step(now, 0);
    if (state.tick % 2) game.physics.step(now, 0);
  };
  frame(start + 500); await table.flush();
  assert.ok(table.snapshots.at(-1)!.track, 'a changed deck is sent');
  frame(start + 600); await table.flush();
  assert.equal(table.snapshots.at(-1)!.track, null, 'unchanged held geometry is omitted');
  game.rules.updateTrackDeformations(start + 7000);
  frame(start + 9000); await table.flush();
  const finalDeck = table.snapshots.at(-1)!;
  assert.equal(finalDeck.deformations.length, 0);
  assert.ok(finalDeck.track, 'final relaxed geometry is sent despite an empty deformation list');
  assert.deepEqual(finalDeck.track.centerline, state.track!.baseCenterline);

  table.send({ type: 'NewGame' });
  await table.until(s => s.phase === 'LOBBY' && Object.keys(s.tangibles).length === 0);

  game.physics.start(); // Resume the real broadcasts after the deterministic deformation fixture.

  // Guided tutorial: only the table starts it and skips lessons; the state reaches every client
  const ozAgain = await client('oz');
  ozAgain.send({ type: 'StartTutorial', mode: 'table' });
  await ozAgain.flush(); assert.equal(game.getState().phase, 'LOBBY', 'Oz cannot start the tutorial');
  table.send({ type: 'StartTutorial', mode: 'pc' });
  const started = await ozAgain.until(s => s.phase === 'RACE' && s.tutorial !== null);
  assert.equal(started.mapMode, 'pc');
  assert.ok(ozAgain.snapshots.find(s=>s.tutorial&&s.track)?.track?.preset, 'tutorial sends its full preset geometry');
  ozAgain.send({ type: 'TutorialSkip', team: 'A' });
  await ozAgain.flush(); assert.equal(game.getState().tutorial!.teams.A.step, 0, 'Oz cannot skip a lesson');
  table.send({ type: 'TutorialSkip', team: 'A' });
  await ozAgain.until(s => s.tutorial?.teams.A.step === 1);
  assert.equal(game.getState().tutorial!.teams.B.step, 0, 'lessons are independent per team');
  table.send({ type: 'NewGame' });
  await ozAgain.until(s => s.phase === 'LOBBY' && s.tutorial === null);
  // Only the table can start the full-physics autonomous session, which survives reconnect.
  ozAgain.send({type:'StartTangibleTest'});await ozAgain.flush();assert.equal(game.getState().phase,'LOBBY');
  table.send({type:'StartTangibleTest'});
  const automated=await ozAgain.until(s=>s.phase==='READY'&&s.sessionMode==='tangibles-test');
  assert.ok(ozAgain.snapshots.find(s=>s.phase==='READY'&&s.sessionMode==='tangibles-test'&&s.track)?.track?.preset, 'test sends its full preset geometry');assert.deepEqual(automated.testMode,{invincible:false,allItems:false});
  const testReconnect=await client('table');
  await testReconnect.until(s=>s.sessionMode==='tangibles-test');
  assert.ok(testReconnect.snapshots[0].track, 'reconnected test client receives initial geometry');
  table.send({type:'BeginRace'});await ozAgain.until(s=>s.phase==='RACE');
  game.rules.damage(game.getState().cars.A,100,Date.now());
  // Finish the countdown in the fixture; repair itself still uses the server physics loop.
  game.getState().sessionStartAt=Date.now()-10_000;
  await ozAgain.until(s=>s.repairPads['A-pilot'].held&&s.cars.A.disabled);
  ozAgain.send({type:'PadHold',team:'A',role:'copilot',on:true});await ozAgain.flush();
  assert.equal(game.getState().repairPads['A-copilot'].held,false,'Oz cannot repair for a player');
  table.send({type:'PadHold',team:'A',role:'copilot',on:true});
  await ozAgain.until(s=>s.repairProgress.A>.05&&s.repairPads['A-pilot'].held);
  table.send({type:'PadHold',team:'A',role:'copilot',on:false});
  await ozAgain.until(s=>s.repairProgress.A===0);
  assert.equal(game.getState().cars.A.disabled,true,'partial copilot input is not an automatic repair');
  table.send({type:'NewGame'});await ozAgain.until(s=>s.phase==='LOBBY'&&s.sessionMode==='race');
  console.log('✓ Network: role boundaries, copilot POWER, Oz restricted to tangibles, autonomous pickups, theft, reconnect, reset, tutorial and automatic tangible test');
} finally {
  game.physics.stop();
  for (const ws of clients) ws.terminate();
  await new Promise<void>(resolve => wss.close(() => resolve()));
  await new Promise<void>(resolve => httpServer.close(() => resolve()));
}
