/**
 * Vérifie les droits des copilotes, le ramassage, la réparation et la pose depuis la table.
 * Liens : socketFixture.ts, server/net/playerCommands.ts.
 */
import assert from 'node:assert/strict';
import type { FeedbackMsg, ItemKind, Team } from '../../server/types.js';
import { socketFixture, until } from './socketFixture.js';

const fixture = await socketFixture();
const { game, client } = fixture;
const state = game.getState();
type Player = Awaited<ReturnType<typeof client>>;

/** Place un ramassable sur la trajectoire de la voiture et vérifie le message issu des règles. */
async function collect(player: Player, team: Team, kind: ItemKind): Promise<void> {
  const pos = state.cars[team].pos;
  const pickup = { id: 0, pos, kind, respawnAt: 0 };
  state.pickups = [pickup];
  const since = player.messages.length;
  const now = game.rules.now;
  game.rules.afterMove(team, pos, now);
  const feedback = await until(() => player.messages.slice(since)
    .find((message): message is FeedbackMsg => message.type === 'Feedback' && message.kind === 'pickup'),
  'Signal de ramassage manquant');
  assert.deepEqual([feedback.kind, feedback.team, feedback.itemKind], ['pickup', team, kind]);
  assert.equal(state.cars[team].heldItem, kind);
  assert.deepEqual(state.cars[team].lastPickup, { at: now, kind });
  assert.ok(pickup.respawnAt > now);
  game.broadcastFull();
  await until(() => player.messages.slice(since).find(message => message.type === 'State'
    && message.state.cars[team].lastPickup?.at === now
    && message.state.cars[team].lastPickup?.kind === kind), 'Ramassage absent de l’état envoyé au téléphone');
  game.rules.afterMove(team, pos, now);
  await player.flush();
  assert.equal(player.messages.slice(since).filter(msg => msg.type === 'Feedback' && msg.kind === 'pickup').length, 1);
}

/** Vérifie l'annonce depuis Oz et la confirmation par le rôle table. */
async function checkPlacement(table: Player, oz: Player, pilot: Player, copilot: Player): Promise<void> {
  pilot.send({ type: 'TangiblePrepare', id: 1 });
  await pilot.flush();
  assert.equal(state.tangiblePlacement, null);
  copilot.send({ type: 'TangiblePrepare', id: 1 });
  await copilot.flush();
  assert.equal(state.tangiblePlacement, null, 'le copilote ne peut pas annoncer une pose depuis le téléphone');
  oz.send({ type: 'TangiblePrepare', id: 1 });
  await oz.flush();
  const pending = game.getState().tangiblePlacement!;
  assert.equal(pending.id, 1);
  const contacts = { type: 'TangibleTouchPlaced', id: 1, a: { x: 900, y: 530 }, b: { x: 900, y: 610 }, token: pending.token };
  copilot.send({ type: 'TangiblePrepare', id: 2 });
  copilot.send({ type: 'TangiblePlacementCancel' });
  copilot.send({ type: 'TangibleRemoved', id: 1 });
  copilot.send({ type: 'TangibleRemoved', id: '1' });
  copilot.send(contacts);
  await copilot.flush();
  assert.equal(game.getState().tangiblePlacement?.token, pending.token);

  await collect(copilot, 'A', 'boost');
  copilot.send({ type: 'Power' });
  await copilot.flush();
  assert.equal(state.cars.A.itemArmed, false, 'la pose suspend l’armement');

  table.send(contacts);
  await table.flush();
  assert.equal(state.tangibles[1].status, 'placed');
  assert.equal(state.walls.length, 1);
  assert.equal(state.tangiblePlacement, null);
}

/** Vérifie l'armement unique et l'attribution de la réparation par place. */
async function checkStockAndRepair(pilot: Player, copilot: Player, other: Player): Promise<void> {
  pilot.send({ type: 'Power', team: 'A', role: 'copilot' });
  await pilot.flush();
  assert.equal(state.cars.A.itemArmed, false);
  copilot.send({ type: 'Power', team: 'B', role: 'pilot' });
  await copilot.flush();
  assert.equal(state.cars.A.itemArmed, true, 'POWER est attribué à la place confirmée');
  await collect(other, 'B', 'slingshot');
  other.send({ type: 'Power' });
  await other.flush();
  assert.equal(state.cars.B.itemArmed, false);

  copilot.send({ type: 'PadHold', team: 'B', role: 'pilot', on: true });
  await copilot.flush();
  assert.equal(state.repairPads['A-copilot'].held, true);
  assert.equal(state.repairPads['A-pilot'].held, false);
  assert.equal(state.repairPads['B-pilot'].held, false);
  pilot.send({ type: 'PadHold', team: 'A', role: 'copilot', on: true });
  await pilot.flush();
  state.cars.A.hp = 25;
  game.rules.updateRepair(.1, game.rules.now);
  assert.ok(state.repairProgress.A > 0);
  copilot.send({ type: 'PadHold', on: false });
  await copilot.flush();
  assert.equal(state.repairPads['A-copilot'].held, false);
  assert.equal(state.repairPads['A-pilot'].held, true);
}

try {
  game.physics.stop();
  const [table, oz, pilot, copilot, other] = await Promise.all(
    [client('table'), client('oz'), client('player'), client('player'), client('player')]);
  for (const [player, seat] of [[pilot, 'A-pilot'], [copilot, 'A-copilot'], [other, 'B-copilot']] as const) {
    player.send({ type: 'Join', seat });
    await player.receive('Joined');
  }
  game.rules.startRace(undefined, false);
  game.rules.setTangiblePlacementMode('touch');
  await checkPlacement(table, oz, pilot, copilot);
  await checkStockAndRepair(pilot, copilot, other);

  copilot.send({ type: 'TangibleControl', id: 1, action: 'deactivate' });
  await copilot.flush();
  assert.equal(state.tangibles[1].active, false);
  oz.send({ type: 'TangibleControl', id: 1, action: 'activate' });
  await oz.flush();
  assert.equal(state.tangibles[1].active, true);
  copilot.send({ type: 'TangibleRemoved', id: 1 });
  await copilot.flush();
  assert.equal(state.tangibles[1].status, 'parked');
  oz.send({ type: 'TangiblePrepare', id: 2 });
  await oz.flush();
  assert.equal(game.getState().tangiblePlacement?.id, 2);
  game.rules.tickTangiblePlacement(game.getState().tangiblePlacement!.expiresAt);
  assert.equal(state.tangiblePlacement, null);

  oz.send({ type: 'TangiblePrepare', id: 3 });
  await oz.flush();
  assert.equal(game.getState().tangiblePlacement?.id, 3);
  oz.send({ type: 'TangiblePlacementCancel' });
  await oz.flush();
  assert.equal(state.tangiblePlacement, null);

  copilot.send({ type: 'PadHold', on: true });
  await copilot.flush();
  assert.equal(state.repairPads['A-copilot'].held, true);
  copilot.ws.terminate();
  await until(() => state.seats['A-copilot'].connected ? undefined : true, 'Déconnexion du copilote manquante');
  assert.equal(state.repairPads['A-copilot'].held, false);
  console.log('✓ Copilote : ramassage, armement, réparation par place, pose sur la table et console Oz');
} finally {
  await fixture.close();
}
