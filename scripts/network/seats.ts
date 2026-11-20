/**
 * Vérifie les réservations, les droits mobiles et la libération des commandes sur le réseau réel.
 * Liens : scripts/network/socketFixture.ts, server/rules/session/playerSeats.ts.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createInitialState } from '../../server/rules/GameRules.js';
import { PlayerSeats } from '../../server/rules/session/playerSeats.js';
import { socketFixture, until } from './socketFixture.js';

/** Vérifie les limites temporelles sans attendre cinq minutes. */
function checkExpiration() {
  const { seats } = createInitialState();
  const reservations = new PlayerSeats(seats, randomUUID);
  const owner = Symbol('joueur');
  for (const [phase, delay] of [['LOBBY', 60_000], ['MAP', 60_000], ['READY', 60_000],
    ['RACE', 300_000], ['PAUSED', 300_000], ['RESULT', 300_000]] as const) {
    const seat = 'A-pilot';
    const join = reservations.claim(owner, { seat, name: 'Camille' }, 0);
    assert.ok('token' in join);
    reservations.disconnect(owner, phase, 1000);
    reservations.expire(1000 + delay - 1);
    assert.deepEqual(seats[seat], { taken: true, connected: false, name: 'Camille' });
    reservations.expire(1000 + delay);
    assert.deepEqual(seats[seat], { taken: false, connected: false });
    assert.deepEqual(reservations.claim(owner, { token: join.token }, 1000 + delay),
      { reason: 'bad-token' });
  }
}

checkExpiration();

const fixture = await socketFixture();
try {
  const { game, client } = fixture;
  const [table, oz, pilot, copilot, observer] = await Promise.all([
    client('table'), client('oz'), client('player'), client('player'), client('player'),
  ]);
  game.physics.stop(); // Les changements de place sont diffusés sans attendre un tick.
  const state = game.getState();
  const initial = game.rules.inputs.A.steer;
  observer.send({ type: 'PilotInput', team: 'A', steer: 1, throttle: 1 });
  observer.send({ type: 'StartGame' });
  await observer.flush();
  assert.equal(state.phase, 'LOBBY');
  assert.equal(game.rules.inputs.A.steer, initial);

  pilot.send({ type: 'Join', seat: 'A-pilot', name: 'Camille' });
  const joined = await pilot.receive('Joined');
  assert.equal(joined.seat, 'A-pilot');
  assert.match(joined.token, /^[\da-f-]{36}$/);
  for (const view of [pilot, table, oz, observer]) {
    const update = await until(() => view.messages.find(
      msg => msg.type === 'State' && msg.state.seats['A-pilot'].connected,
    ), 'La prise de place doit être diffusée');
    assert.equal(JSON.stringify(update).includes(joined.token), false);
  }

  copilot.send({ type: 'Join', seat: 'A-pilot' });
  assert.equal((await copilot.receive('JoinRejected')).reason, 'seat-taken');
  copilot.send({ type: 'Join', seat: 'A-copilot' });
  assert.equal((await copilot.receive('Joined')).seat, 'A-copilot');

  table.send({ type: 'StartGame' });
  await table.flush();
  assert.equal(state.phase, 'SETUP');
  table.send({ type: 'ConfirmSetup' });
  await table.flush();
  assert.equal(state.phase, 'MAP');
  game.rules.startRace(undefined, false);
  state.sessionStartAt = Date.now() - 5000;
  state.cars.A.heldItem = 'boost';
  const steerB = game.rules.inputs.B.steer;
  pilot.send({ type: 'PilotInput', team: 'B', steer: 0.7, throttle: 1 });
  pilot.send({ type: 'PadHold', team: 'B', role: 'copilot', on: true });
  pilot.send({ type: 'Power', team: 'A', role: 'copilot' });
  pilot.send({ type: 'ToggleDriveMode', team: 'B' });
  await pilot.flush();
  const steerA = game.rules.inputs.A.steer;
  assert.ok(steerA > 0);
  assert.equal(game.rules.inputs.B.steer, steerB);
  assert.equal(state.driveMode.A, 'pedal');
  assert.equal(state.driveMode.B, 'auto');
  assert.equal(state.repairPads['A-pilot'].held, true);
  assert.equal(state.repairPads['B-copilot'].held, false);
  assert.equal(state.cars.A.itemArmed, false);

  copilot.send({ type: 'PilotInput', team: 'A', steer: -1, throttle: 1 });
  copilot.send({ type: 'PadHold', team: 'B', role: 'pilot', on: 'false' });
  await copilot.flush();
  assert.equal(state.repairPads['A-copilot'].held, false);
  copilot.send({ type: 'PadHold', team: 'B', role: 'pilot', on: true });
  copilot.send({ type: 'Power', team: 'B', role: 'pilot' });
  copilot.send({ type: 'Pause' });
  await copilot.flush();
  assert.equal(state.repairPads['A-copilot'].held, true);
  assert.equal(state.cars.A.itemArmed, true);
  assert.equal(state.phase, 'RACE');

  table.send({ type: 'PilotInput', team: 'A', steer: -1, throttle: 0 });
  await table.flush();
  assert.equal(game.rules.inputs.A.steer, steerA);
  table.ws.terminate();
  await until(() => state.repairPads['A-copilot'].held && game.rules.inputs.A.steer === steerA
    && game.rules.inputs.B.throttle === 0 ? true : undefined, 'La table ne doit pas relâcher les commandes mobiles');

  pilot.ws.terminate();
  await until(() => !state.seats['A-pilot'].connected ? true : undefined, 'Déconnexion manquante');
  assert.equal(state.seats['A-pilot'].taken, true);
  assert.deepEqual(game.rules.inputs.A, { throttle: 0, steer: 0 });
  assert.equal(state.repairPads['A-pilot'].held, false);
  assert.equal(state.repairPads['A-copilot'].held, true);

  const reconnect = await client('player');
  reconnect.send({ type: 'Join', token: joined.token });
  assert.deepEqual((({ seat, token }) => ({ seat, token }))(await reconnect.receive('Joined')),
    { seat: joined.seat, token: joined.token });
  assert.equal(state.seats['A-pilot'].connected, true);

  observer.send({ type: 'Join', token: joined.token });
  await observer.receive('Joined');
  reconnect.send({ type: 'PilotInput', team: 'A', steer: 1, throttle: 1 });
  await reconnect.flush();
  assert.equal(game.rules.inputs.A.steer, 0);
  reconnect.ws.terminate();

  const host = await client('table');
  for (const type of ['Reset', 'NewGame']) {
    host.send({ type });
    await host.flush();
    assert.equal(state.phase, 'LOBBY');
    assert.deepEqual(state.seats['A-pilot'], { taken: true, connected: true, name: 'Camille' });
  }
  for (const view of [table, oz, copilot, observer, host]) {
    assert.ok(view.messages.every(msg => msg.type !== 'State' || !JSON.stringify(msg).includes(joined.token)));
  }
  console.log('✓ Places mobiles : réservation, reprise, droits, déconnexion, expiration et réinitialisation');
} finally {
  await fixture.close();
}
