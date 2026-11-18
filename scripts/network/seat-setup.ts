/**
 * Vérifie l'écran de préparation côté serveur : appareil par poste, départ conditionné, refus des postes de la table, libération et conservation des choix.
 * Liens : server/rules/session/seatSetup.ts, server/net/GameServer.ts, scripts/network/socketFixture.ts.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import { socketFixture, until } from './socketFixture.js';

const fixture = await socketFixture();
try {
  const { game, client } = fixture;
  const [table, oz, early, pilotA, pilotB, copilotA] = await Promise.all([
    client('table'), client('oz'), client('player'), client('player'), client('player'), client('player'),
  ]);
  game.physics.stop(); // Les changements sont diffusés sans attendre un tick.
  const state = game.getState();

  // 1 — Un joueur déjà connecté à l'accueil garde son poste hors de la table à l'ouverture de la préparation.
  early.send({ type: 'Join', seat: 'B-copilot' });
  await early.receive('Joined');
  table.send({ type: 'SetSeatDevice', seat: 'A-pilot', device: 'phone' });
  await table.flush();
  assert.equal(state.phase, 'LOBBY');
  assert.equal(state.seatDevices['A-pilot'], 'table', 'le choix n’existe qu’en préparation');
  table.send({ type: 'StartGame' });
  await table.flush();
  assert.equal(state.phase, 'SETUP');
  assert.equal(state.seatDevices['B-copilot'], 'phone', 'le joueur déjà connecté est conservé');
  assert.deepEqual(Object.values(state.seatDevices).filter(device => device !== 'table'), ['phone']);

  // 2 — Seule la table choisit ; la manette Wii est réservée aux pilotes.
  for (const view of [oz, pilotA]) {
    view.send({ type: 'SetSeatDevice', seat: 'A-pilot', device: 'phone' });
    await view.flush();
  }
  assert.equal(state.seatDevices['A-pilot'], 'table', 'ni Oz ni un joueur ne choisissent à la place de la table');
  table.send({ type: 'SetSeatDevice', seat: 'A-copilot', device: 'wiimote' });
  table.send({ type: 'SetSeatDevice', seat: 'A-pilot', device: 'bluetooth' });
  table.send({ type: 'SetSeatDevice', seat: 'C-pilot', device: 'phone' });
  await table.flush();
  assert.deepEqual(Object.values(state.seatDevices), ['table', 'table', 'table', 'phone'], 'choix invalides ignorés');
  table.send({ type: 'SetSeatDevice', seat: 'A-pilot', device: 'wiimote' });
  table.send({ type: 'SetSeatDevice', seat: 'B-pilot', device: 'phone' });
  await table.flush();
  assert.equal(state.seatDevices['A-pilot'], 'wiimote');

  // 3 — Un poste qui reste sur la table, ou confié à une manette Wii de la table, ne se prend pas avec un QR code.
  copilotA.send({ type: 'Join', seat: 'A-copilot' });
  assert.equal((await copilotA.receive('JoinRejected')).reason, 'seat-on-table');
  assert.equal(state.seats['A-copilot'].taken, false);
  pilotA.send({ type: 'Join', seat: 'A-pilot' });
  assert.equal((await pilotA.receive('JoinRejected')).reason, 'seat-wiimote');
  assert.equal(state.seats['A-pilot'].taken, false);

  // 4 — Le départ attend les joueurs annoncés ; la table l'ignore tant qu'il en manque.
  table.send({ type: 'ConfirmSetup' });
  await table.flush();
  assert.equal(state.phase, 'SETUP', 'le pilote Wii et le pilote rose sont absents');
  // La manette Wii est vérifiée par la table : seule la table peut l'annoncer, avec un numéro de 1 à 4.
  for (const view of [oz, pilotA]) {
    view.send({ type: 'SetWiimote', team: 'A', number: 1 });
    await view.flush();
  }
  assert.equal(state.wiimotes.A, null, 'ni Oz ni un joueur n’annoncent une manette');
  for (const number of [0, 5, 1.5, '2', undefined]) table.send({ type: 'SetWiimote', team: 'A', number });
  table.send({ type: 'SetWiimote', team: 'C', number: 1 });
  await table.flush();
  assert.deepEqual(state.wiimotes, { A: null, B: null }, 'numéros et équipes invalides ignorés');
  table.send({ type: 'SetWiimote', team: 'A', number: 1 });
  table.send({ type: 'ConfirmSetup' });
  await table.flush();
  assert.equal(state.wiimotes.A, 1);
  assert.equal(state.phase, 'SETUP', 'il manque encore le pilote rose, sur téléphone');
  pilotB.send({ type: 'Join', seat: 'B-pilot' });
  await pilotB.receive('Joined');

  // 5 — Reprendre un poste sur la table renvoie son joueur à l'écran de choix.
  table.send({ type: 'SetSeatDevice', seat: 'B-copilot', device: 'table' });
  await early.receive('Left');
  assert.deepEqual(state.seats['B-copilot'], { taken: false, connected: false });
  early.send({ type: 'Join', seat: 'B-copilot' });
  assert.equal((await early.receive('JoinRejected')).reason, 'seat-on-table');

  // 6 — Retour à l'accueil : les choix restent, puis départ une fois tout le monde connecté.
  table.send({ type: 'Reset' });
  await table.flush();
  assert.equal(state.phase, 'LOBBY');
  assert.deepEqual(Object.values(state.seatDevices), ['wiimote', 'table', 'phone', 'table']);
  assert.equal(state.wiimotes.A, 1, 'la manette vérifiée reste connue au retour à l’accueil');
  table.send({ type: 'StartGame' });
  table.send({ type: 'ConfirmSetup' });
  await until(() => state.phase === 'MAP' ? true : undefined, 'la création du circuit doit s’ouvrir');
  table.send({ type: 'SetSeatDevice', seat: 'A-pilot', device: 'table' });
  await table.flush();
  assert.equal(state.seatDevices['A-pilot'], 'wiimote', 'plus de choix une fois le circuit en création');
  table.ws.terminate();
  await until(() => state.wiimotes.A === null ? true : undefined, 'la table partie, ses manettes ne sont plus vérifiées');
  console.log('✓ Préparation des postes : appareil par poste, départ conditionné, refus sur la table, libération et choix conservés');
} finally {
  await fixture.close();
}
