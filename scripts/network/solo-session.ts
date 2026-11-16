/** Vérifie le départ, la conduite et la reprise de l'essai solo sur le WebSocket joueur. */
import assert from 'node:assert/strict';
import { socketFixture, until } from './socketFixture.js';

const fixture = await socketFixture({ soloTest: true });
try {
  const { client, game } = fixture;
  const [table, pilot, visitor] = await Promise.all([client('table'), client('player'), client('player')]);
  game.physics.stop();
  const state = game.getState();
  table.send({ type: 'StartGame' });
  visitor.send({ type: 'StartSolo' });
  visitor.send({ type: 'Join', seat: 'B-pilot' });
  assert.equal((await visitor.receive('JoinRejected')).reason, 'solo-seat');
  await table.flush();
  assert.equal(state.phase, 'LOBBY');

  pilot.send({ type: 'Join', seat: 'A-pilot' });
  const { token } = await pilot.receive('Joined');
  const beforeJoin = visitor.messages.length;
  visitor.send({ type: 'Join', seat: 'A-pilot' });
  assert.equal((await visitor.receive('JoinRejected', beforeJoin)).reason, 'seat-taken');
  pilot.send({ type: 'StartSolo' });
  await pilot.flush();
  assert.equal(state.phase, 'RACE');
  assert.equal(state.track?.preset, true);
  assert.equal(state.pickups.length, 0);
  assert.deepEqual(Object.values(state.seats).map(s => s.connected), [true, false, false, false]);

  const t = Date.now();
  state.sessionStartAt = t;
  const initial = { ...state.cars.A.pos }, other = { ...state.cars.B.pos }, heading = state.cars.A.angle;
  pilot.send({ type: 'PilotInput', team: 'B', steer: .5, throttle: 1 });
  await pilot.flush();
  for (let i = 0; i < 12; i++) game.physics.step(t + i * 1000 / 60);
  assert.notDeepEqual(state.cars.A.pos, initial);
  assert.notEqual(state.cars.A.angle, heading);
  assert.deepEqual(state.cars.B.pos, other);
  game.rules.expirePilotInputs(t + 1000);
  assert.deepEqual(game.rules.inputs.A, { throttle: 0, steer: 0 });

  pilot.ws.terminate();
  await until(() => state.seats['A-pilot'].connected ? undefined : true, 'Le poste doit passer hors ligne');
  const resumed = await client('player');
  resumed.send({ type: 'Join', token });
  assert.equal((await resumed.receive('Joined')).seat, 'A-pilot');
  const previousTrack = state.trackVersion;
  resumed.send({ type: 'StartSolo' });
  await resumed.flush();
  assert.equal(state.trackVersion, previousTrack + 1);
  assert.equal(state.phase, 'RACE');
  assert.ok(table.messages.filter(msg => msg.type === 'State').every(msg => !JSON.stringify(msg).includes(token)));
} finally {
  await fixture.close();
}

const normal = await socketFixture();
try {
  const pilot = await normal.client('player');
  pilot.send({ type: 'Join', seat: 'A-pilot' });
  await pilot.receive('Joined');
  pilot.send({ type: 'StartSolo' });
  await pilot.flush();
  assert.equal(normal.game.getState().phase, 'LOBBY');
} finally {
  await normal.close();
}
console.log('✓ Solo : place unique, départ depuis le téléphone, conduite, reprise, relance et mode standard préservé');
