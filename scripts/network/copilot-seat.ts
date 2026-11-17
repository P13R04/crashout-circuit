/** Vérifie les droits des copilotes et la pose confirmée par les contacts de la table. */
import assert from 'node:assert/strict';
import { socketFixture } from './socketFixture.js';

const fixture = await socketFixture();
try {
  const { game, client } = fixture;
  const [table, pilot, copilot, other] = await Promise.all(
    [client('table'), client('player'), client('player'), client('player')]);
  for (const [player, seat] of [[pilot, 'A-pilot'], [copilot, 'A-copilot'], [other, 'B-copilot']] as const) {
    player.send({ type: 'Join', seat });
    await player.receive('Joined');
  }
  game.rules.startRace(undefined, false);
  game.rules.setTangiblePlacementMode('touch');
  const state = game.getState();
  pilot.send({ type: 'TangiblePrepare', id: 1 });
  await pilot.flush();
  assert.equal(state.tangiblePlacement, null);
  copilot.send({ type: 'TangiblePrepare', id: 1 });
  await copilot.flush();
  const pending = game.getState().tangiblePlacement!;
  assert.equal(pending.by, 'A-copilot');
  other.send({ type: 'TangiblePrepare', id: 2 });
  other.send({ type: 'TangiblePlacementCancel' });
  await other.flush();
  assert.equal(game.getState().tangiblePlacement?.token, pending.token);
  table.send({ type: 'TangibleTouchPlaced', id: 1, a: { x: 900, y: 530 }, b: { x: 900, y: 610 }, token: pending.token });
  await table.flush();
  assert.equal(state.tangibles[1].status, 'placed');
  assert.equal(state.walls.length, 1);
  assert.equal(state.tangiblePlacement, null);

  state.cars.A.heldItem = 'boost';
  state.cars.B.heldItem = 'slingshot';
  copilot.send({ type: 'Power' });
  await copilot.flush();
  other.send({ type: 'Power' });
  await other.flush();
  assert.equal(state.cars.A.itemArmed, true);
  assert.equal(state.cars.B.itemArmed, false);
  copilot.send({ type: 'TangibleControl', id: 1, action: 'deactivate' });
  await copilot.flush();
  assert.equal(state.tangibles[1].active, false);
  copilot.send({ type: 'TangibleRemoved', id: 1 });
  copilot.send({ type: 'TangiblePrepare', id: 2 });
  await copilot.flush();
  assert.equal(state.tangibles[1].status, 'parked');
  assert.equal(game.getState().tangiblePlacement?.id, 2);
  game.rules.tickTangiblePlacement(game.getState().tangiblePlacement!.expiresAt);
  assert.equal(state.tangiblePlacement, null);
  console.log('✓ Copilote : stock, droits de pose, contacts sur la table et expiration');
} finally {
  await fixture.close();
}
