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
  assert.equal(state.driveMode.A, 'auto');
  assert.equal(game.rules.inputs.A.throttle, 0);
  pilot.send({ type: 'ToggleDriveMode', team: 'B' });
  await pilot.flush();
  assert.equal(state.driveMode.A, 'pedal');
  assert.equal(state.driveMode.B, 'auto');
  pilot.send({ type: 'ToggleDriveMode', team: 'B' });
  await pilot.flush();
  assert.equal(state.driveMode.A, 'auto');
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
  resumed.send({ type: 'Join', seat: 'A-pilot' });
  assert.equal((await resumed.receive('Joined')).seat, 'A-pilot');
  assert.equal(state.phase, 'LOBBY');
  assert.equal(state.seats['A-pilot'].connected, true);
  const previousTrack = state.trackVersion;
  resumed.send({ type: 'StartSolo' });
  await resumed.flush();
  assert.equal(state.trackVersion, previousTrack + 1);
  assert.equal(state.phase, 'RACE');
  assert.ok(table.messages.filter(msg => msg.type === 'State').every(msg => !JSON.stringify(msg).includes(token)));
} finally {
  await fixture.close();
}

// Sans CRASHOUT_SOLO_TEST : un pilote seul à l'accueil peut lancer le solo, qui s'arrête au retour à l'accueil.
const normal = await socketFixture();
try {
  const state = normal.game.getState();
  assert.equal(state.soloTest, false);
  const [table, copilot, pilot] = await Promise.all([normal.client('table'), normal.client('player'), normal.client('player')]);
  normal.game.physics.stop();
  copilot.send({ type: 'Join', seat: 'B-copilot' });
  await copilot.receive('Joined');
  pilot.send({ type: 'Join', seat: 'A-pilot' });
  await pilot.receive('Joined');
  // Une autre place prise : le solo ne prend pas la table de quelqu'un d'autre.
  pilot.send({ type: 'StartSolo' });
  await pilot.flush();
  assert.equal(state.phase, 'LOBBY');
  assert.equal(state.soloTest, false);
  copilot.send({ type: 'Leave' });
  await copilot.receive('Left');
  // Le copilote ne peut pas lancer le solo, le pilote A seul le peut.
  const other = await normal.client('player');
  other.send({ type: 'Join', seat: 'A-copilot' });
  await other.receive('Joined');
  other.send({ type: 'StartSolo' });
  await other.flush();
  assert.equal(state.phase, 'LOBBY');
  other.send({ type: 'Leave' });
  await other.receive('Left');
  pilot.send({ type: 'StartSolo' });
  await pilot.flush();
  assert.equal(state.soloTest, true);
  assert.equal(state.phase, 'RACE');
  assert.equal(state.pickups.length, 0);
  // Pendant le solo, une autre place est refusée.
  const late = await normal.client('player');
  late.send({ type: 'Join', seat: 'B-pilot' });
  assert.equal((await late.receive('JoinRejected')).reason, 'solo-seat');
  // Retour à l'accueil depuis la table : le mode normal revient, le pilote garde sa place.
  table.send({ type: 'Reset' });
  await table.flush();
  assert.equal(state.phase, 'LOBBY');
  assert.equal(state.soloTest, false);
  assert.equal(state.seats['A-pilot'].connected, true);
  late.send({ type: 'Join', seat: 'B-pilot' });
  assert.equal((await late.receive('Joined')).seat, 'B-pilot');
} finally {
  await normal.close();
}

// En cours de partie normale, StartSolo est ignoré.
const running = await socketFixture();
try {
  const pilot = await running.client('player');
  pilot.send({ type: 'Join', seat: 'A-pilot' });
  await pilot.receive('Joined');
  running.game.rules.state.phase = 'MAP';
  pilot.send({ type: 'StartSolo' });
  await pilot.flush();
  assert.equal(running.game.getState().soloTest, false);
  assert.equal(running.game.getState().phase, 'MAP');
} finally {
  await running.close();
}
console.log('✓ Solo : place unique, départ depuis le téléphone, conduite, reprise, relance, solo sans variable d’environnement et retour à l’accueil');
