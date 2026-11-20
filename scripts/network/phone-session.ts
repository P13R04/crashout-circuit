/**
 * Vérifie que le code de séance départage quatre téléphones sur le réseau.
 * Liens : scripts/network/socketFixture.ts, server/net/GameServer.ts.
 */
import assert from 'node:assert/strict';
import { SEAT_IDS } from '../../client-shared/seatLabels.js';
import { socketFixture, until } from './socketFixture.js';

const fixture = await socketFixture();
try {
  const { game, client } = fixture;
  assert.match(game.room, /^[A-HJ-NP-Z2-9]{5}$/);
  const [a, b, c, d, extra, table] = await Promise.all([
    client('player'), client('player'), client('player'), client('player'), client('player'), client('table'),
  ]);
  a.send({ type: 'Join', seat: 'A-pilot', room: '00000' });
  assert.equal((await a.receive('JoinRejected')).reason, 'unknown-room');
  assert.equal(game.getState().seats['A-pilot'].taken, false);

  a.send({ type: 'Join', seat: 'A-pilot' });
  b.send({ type: 'Join', seat: 'A-pilot' });
  const compete = (view: typeof a) => until(() => view.messages.find(
    msg => msg.type === 'Joined' || (msg.type === 'JoinRejected' && msg.reason === 'seat-taken'),
  ), 'Résultat du choix concurrent manquant');
  const [resultA, resultB] = await Promise.all([compete(a), compete(b)]);
  assert.notEqual(resultA.type, resultB.type);
  const winner = resultA.type === 'Joined' ? a : b;
  const remaining = resultA.type === 'Joined' ? b : a;

  for (const [player, seat] of [[remaining, 'A-copilot'], [c, 'B-pilot'], [d, 'B-copilot']] as const) {
    player.send({ type: 'Join', seat });
    assert.equal((await player.receive('Joined')).seat, seat);
  }
  await until(() => table.messages.find(
    msg => msg.type === 'State' && SEAT_IDS.every(id => msg.state.seats[id].connected),
  ), 'La table doit voir les quatre postes connectés');
  extra.send({ type: 'Join', seat: 'B-copilot' });
  assert.equal((await extra.receive('JoinRejected')).reason, 'room-full');

  const { token } = await winner.receive('Joined');
  winner.ws.terminate();
  await until(() => game.getState().seats['A-pilot'].connected ? undefined : true, 'Poste hors ligne manquant');
  extra.send({ type: 'Join', token });
  assert.equal((await extra.receive('Joined')).seat, 'A-pilot');
  extra.send({ type: 'Leave' });
  await extra.receive('Left');
  assert.equal(game.getState().seats['A-pilot'].taken, false);

  const since = extra.messages.length;
  extra.send({ type: 'Join', token });
  assert.equal((await extra.receive('JoinRejected', since)).reason, 'bad-token');
  extra.send({ type: 'Join', seat: 'A-pilot' });
  assert.equal((await extra.receive('Joined', since)).seat, 'A-pilot');
  game.rules.startRace(undefined, false);
  extra.send({ type: 'Leave' });
  await extra.flush();
  assert.equal(game.getState().seats['A-pilot'].connected, true);
  console.log('✓ Séance téléphone : code, choix concurrents, quatre postes, reprise et changement de place');
} finally {
  await fixture.close();
}
