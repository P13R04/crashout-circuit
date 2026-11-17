/** Vérifie la répartition physique des rôles et la surface stable du circuit. */
import assert from 'node:assert/strict';
import { SEAT_IDS } from '../../client-shared/seatLabels.js';
import { PLAY_AREA, checkDivider } from '../../server/layout.js';
import { playAreaFor, tablePanels, WIDE_PLAY_AREA } from '../../server/tableStations.js';
import { generatePreset } from '../../server/track/MapGenerator.js';
import { socketFixture, until } from './socketFixture.js';

const fixture = await socketFixture();
try {
  const { game, client } = fixture;
  const table = await client('table');
  const players = await Promise.all(SEAT_IDS.map(() => client('player')));
  const state = game.getState();
  players[0].send({ type: 'Join', seat: SEAT_IDS[0] });
  await players[0].receive('Joined');
  assert.deepEqual(tablePanels(state).map(p => `${p.team}-${p.role}`).sort(), ['A-copilot', 'B-copilot', 'B-pilot']);
  table.send({ type: 'StartGame' });
  await table.flush();
  assert.equal(playAreaFor(state), PLAY_AREA);
  table.send({ type: 'PadHold', team: 'B', role: 'pilot', on: true });
  table.send({ type: 'PadHold', team: 'A', role: 'pilot', on: true });
  await table.flush();
  assert.equal(state.repairPads['B-pilot'].held, true);
  assert.equal(state.repairPads['A-pilot'].held, false);
  players[0].send({ type: 'PadHold', on: true });
  await players[0].flush();
  assert.equal(state.repairPads['A-pilot'].held, true);
  table.send({ type: 'Reset' });
  await table.flush();
  for (const [index, player] of players.entries()) {
    if (index === 0) continue;
    player.send({ type: 'Join', seat: SEAT_IDS[index] });
    await player.receive('Joined');
  }
  table.send({ type: 'StartGame' });
  await table.flush();
  assert.equal(playAreaFor(state), WIDE_PLAY_AREA);
  assert.equal(tablePanels(state).length, 0);
  const a = { x: 500, y: 895 }, b = { x: 1400, y: 700 };
  assert.equal(checkDivider(a, b), 'outOfZone');
  table.send({ type: 'MapDivider', a, b });
  await table.flush();
  assert.deepEqual(state.mapDivider, [a, b]);

  const wide = generatePreset(WIDE_PLAY_AREA), standard = generatePreset();
  assert.ok(Math.max(...wide.outerEdge.map(p => p.y)) > Math.max(...standard.outerEdge.map(p => p.y)) + 120);
  for (const point of [...wide.outerEdge, ...wide.innerEdge]) {
    assert.ok(point.x >= 0 && point.x <= 1920 && point.y >= 0 && point.y <= 1080);
  }
  players[0].ws.terminate();
  await until(() => state.seats['A-pilot'].connected ? undefined : true, 'Déconnexion manquante');
  assert.equal(state.wideTable, true);
  assert.equal(tablePanels(state).length, 0);
  table.send({ type: 'Reset' });
  await table.flush();
  assert.equal(state.wideTable, false);
  assert.equal(tablePanels(state).length, 1);
  console.log('✓ Table mixte : droits locaux, quatre postes sur téléphone et piste élargie');
} finally {
  await fixture.close();
}
