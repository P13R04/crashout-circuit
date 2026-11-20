/**
 * Vérifie les droits et l'application des poses à distance sur un vrai WebSocket.
 * Liens : scripts/network/socketFixture.ts, server/rules/gameplay/remotePlacement.ts.
 */
import assert from 'node:assert/strict';
import { socketFixture, until } from '../socketFixture.js';
import { transverseAngle } from '../../../client-phone/copilot/placement/placementInput.js';
import type { RemotePlacementTarget } from '../../../server/types.js';

const fixture = await socketFixture();
const { game, client } = fixture;
type Player = Awaited<ReturnType<typeof client>>;
const state = game.getState();
const wall: RemotePlacementTarget = { kind: 'tangible', id: 1, pos: { x: 900, y: 530 }, angle: 45 };
let requestId = 0;

/** Envoie une pose et récupère sa réponse privée. */
async function place(player: Player, target: RemotePlacementTarget) {
  const since = player.messages.length;
  const id = ++requestId;
  player.send({ type: 'RemotePlacement', requestId: id, target });
  const result = await player.receive('RemotePlacementResult', since);
  assert.equal(result.requestId, id);
  return result.ok ? 'ok' : result.reason;
}

/** Vérifie le mur, les deux piliers, les refus et la réservation physique d'Oz. */
async function checkTangibles(copilot: Player, oz: Player): Promise<void> {
  assert.equal(await place(copilot, wall), 'ok');
  assert.equal(state.tangiblePlacement, null, 'la pose mobile est atomique');
  assert.equal(state.walls.length, 1);
  assert.equal(state.walls[0].lengthPx, state.params.wallLengthPx);
  assert.ok(Math.abs(state.walls[0].angle - 45) < 1e-6);
  assert.equal(await place(copilot, { ...wall, pos: { x: -1, y: 500 } }), 'outside-table');
  assert.equal(state.walls.length, 1, 'un échec conserve le mur déjà posé');
  assert.equal(await place(copilot, { kind: 'tangible', id: 2, pos: { x: 850, y: 630 }, angle: 0 }), 'ok');
  assert.equal(await place(copilot, { kind: 'tangible', id: 3, pos: { x: 1050, y: 630 }, angle: 0 }), 'ok');
  assert.equal(state.arcs.length, 1);

  oz.send({ type: 'TangiblePrepare', id: 2 });
  await oz.flush();
  const token = game.getState().tangiblePlacement?.token;
  assert.ok(token);
  assert.equal(await place(copilot, wall), 'busy');
  assert.equal(game.getState().tangiblePlacement?.token, token);
  oz.send({ type: 'TangiblePlacementCancel' });
  await oz.flush();
}

/** Vérifie l'armement, le stock consommé et les effets appliqués à la place du copilote. */
async function checkBonuses(copilot: Player): Promise<void> {
  const track = state.track!;
  const pos = track.centerline.find(({ x, y }) => x > 310 && x < 1600 && y > 310 && y < 900)!;
  const angle = transverseAngle(track, pos);
  state.cars.A.heldItem = 'boost';
  const boost = { kind: 'boost', pos, angle, width: 140, arm: { team: 'A', version: 1 } } as const;
  assert.equal(await place(copilot, boost), 'not-armed');
  copilot.send({ type: 'Power' });
  await copilot.flush();
  assert.equal(await place(copilot, boost), 'ok');
  assert.equal(state.boostGates[0].team, 'A');
  assert.equal(state.cars.A.heldItem, null);
  assert.equal(await place(copilot, boost), 'not-armed');

  state.cars.A.heldItem = 'slingshot';
  copilot.send({ type: 'Power' });
  await copilot.flush();
  assert.equal(await place(copilot, { kind: 'slingshot', pos: { x: 850, y: 460 }, angle: 0, power: .4,
    arm: { team: 'A', version: 2 } }), 'ok');
  assert.equal(state.stones[0].team, 'A');
  assert.deepEqual(state.stones[0].from, { x: 850, y: 460 });
  assert.ok(state.stones[0].target.x > 1100);
  assert.equal(state.cars.A.heldItem, null);
}

try {
  game.physics.stop();
  const [copilot, pilot, other, table, oz] = await Promise.all(
    [client('player'), client('player'), client('player'), client('table'), client('oz')]);
  copilot.send({ type: 'Join', seat: 'A-copilot' });
  const joined = await copilot.receive('Joined');
  pilot.send({ type: 'Join', seat: 'A-pilot' });
  await pilot.receive('Joined');
  other.send({ type: 'Join', seat: 'B-copilot' });
  await other.receive('Joined');
  game.rules.startRace(undefined, false);
  game.rules.setTangiblePlacementMode('touch');
  state.wideTable = true;

  assert.equal(await place(copilot, wall), 'disabled');
  pilot.send({ type: 'SetAccessibility', on: true });
  await pilot.flush();
  assert.equal(await place(pilot, wall), 'disabled');
  assert.equal(state.seats['A-pilot'].accessible, undefined);
  copilot.send({ type: 'SetAccessibility', on: 'true' });
  await copilot.flush();
  assert.equal(await place(copilot, wall), 'disabled');
  copilot.send({ type: 'SetAccessibility', on: true });
  await copilot.flush();
  assert.equal(state.seats['A-copilot'].accessible, true);
  assert.equal(await place(other, wall), 'disabled');

  await checkTangibles(copilot, oz);
  await checkBonuses(copilot);
  assert.equal(table.messages.some(message => message.type === 'RemotePlacementResult'), false);

  copilot.ws.terminate();
  await until(() => !state.seats['A-copilot'].connected ? true : undefined, 'Copilote encore connecté');
  const resumed = await client('player');
  resumed.send({ type: 'Join', token: joined.token });
  await resumed.receive('Joined');
  assert.equal(await place(resumed, wall), 'ok', 'la reprise conserve l’option du poste');
  resumed.send({ type: 'SetAccessibility', on: false });
  await resumed.flush();
  assert.equal(await place(resumed, wall), 'disabled');
} finally {
  await fixture.close();
}
console.log('✓ Réseau accessibilité : droits du poste, refus privés, pose atomique, boost et lance-pierre');
