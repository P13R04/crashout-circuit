/**
 * Scénarios des aides de test PC et de la déformation locale de la piste au bord.
 * Liens : server/rules/GameRules.ts, server/config.ts.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import type { Team } from '../../../server/types.js';
import { config } from '../../../server/config.js';
import { test, section, type Rig, raceRig, msg, aim } from '../harness.js';
import { placeBlocking } from '../scenarioActions.js';

section('PC test switches');
/** Envoie le réglage d’aide de test que le scénario doit accepter ou ignorer. */
const toggle = (r: Rig, flag: 'invincible' | 'allItems', on: boolean) =>
  r.rules.onTestToggle(msg({ type: 'TestToggle' as const, flag, on }));
/** Vérifie que les aides de test sont ignorées en dehors du mode clavier. */
test('test switches are ignored outside the PC mode', () => {
  const r = raceRig();
  r.state.mapMode = 'table';
  toggle(r, 'invincible', true);
  toggle(r, 'allItems', true);
  assert.deepEqual(r.state.testMode, { invincible: false, allItems: false });
});
/** Vérifie l’invincibilité de test face aux murs, à l’électricité, aux pierres et aux chutes. */
test('invincible: no damage from walls, arcs or stones, and a fall just respawns the car', () => {
  const r = raceRig();
  r.state.mapMode = 'pc';
  toggle(r, 'invincible', true);
  const A = r.state.cars.A;
  placeBlocking(r);
  r.rules.afterMove('A', A.pos, r.clock.now);
  assert.equal(A.hp, config.hpMax, 'wall');
  // stone right on the car
  r.state.cars.B.heldItem = 'slingshot';
  r.rules.onPower('B');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, team: 'B' as Team, ...aim({ ...A.pos }, 120) }));
  r.advance(config.stoneTelegraphS * 1000 + 100);
  assert.equal(A.hp, config.hpMax, 'stone');
  assert.ok(A.stunUntil <= r.clock.now, 'no stun');
  // leaving the ribbon
  A.checkpointIndex = 3;
  r.rules.fallOffTrack('A', r.clock.now);
  assert.equal(A.disabled, false);
  assert.equal(A.hp, config.hpMax);
  const cp = r.state.track!.checkpoints[2];
  assert.ok(Math.hypot(A.pos.x - cp.pos.x, A.pos.y - cp.pos.y) < 5, 'back on the last checkpoint');
  // and switching it off restores the normal rules
  toggle(r, 'invincible', false);
  r.rules.damage(A, 10, r.clock.now);
  assert.equal(A.hp, config.hpMax - 10);
});
/** Vérifie que les stocks libres de test exigent encore POWER et la réservation du geste. */
test('allItems: free stock still needs POWER and respects the shared reservation', () => {
  const r = raceRig();
  r.state.mapMode = 'pc';
  toggle(r, 'allItems', true);
  r.advance(50);
  const A = r.state.cars.A;
  assert.equal(A.itemArmed,false);r.rules.onPower('A');assert.equal(A.itemArmed,true);
  // a boost gate works although the stocked item is a "slingshot"
  assert.equal(A.heldItem, 'slingshot');
  const c = { x: A.pos.x + 60, y: A.pos.y };
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, a: { x: c.x, y: c.y - 100 }, b: { x: c.x, y: c.y + 100 } }));
  assert.equal(r.state.boostGates.length, 1);
  r.advance(50);
  assert.equal(A.itemArmed,false,'refill does not auto-arm');r.rules.onPower('A');assert.equal(A.itemArmed,true);
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 900, y: 700 }, pouch: { x: 900, y: 800 } }));
  assert.equal(r.state.stones.length, 1);
  // abilities have no cooldown
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'ghost' as const }));
  assert.equal(r.state.cooldowns.A.ghost, 0);
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'ghost' as const }));
  assert.ok(A.ghostUntil > r.clock.now);
  // switching off: nothing stays armed for free
  toggle(r, 'allItems', false);
  assert.equal(A.itemArmed, false);
});

section('Border pull');
/** Vérifie une déformation locale temporaire sans modification de largeur de chaussée. */
test('BorderPull shifts a local section, then reforms without changing its width', () => {
  const r = raceRig();
  const track = r.state.track!;
  const i = 40;
  const before = track.widths[i];
  const edge = track.outerEdge[i];
  const center = track.centerline[i];
  const outward = { x: edge.x - center.x, y: edge.y - center.y };
  const len = Math.hypot(outward.x, outward.y);
  /** Transmet la commande construite par le scénario au composant étudié. */
  const send = () => r.rules.onBorderPull(msg({ type: 'BorderPull' as const, x: edge.x, y: edge.y, dx: outward.x / len * 70, dy: outward.y / len * 70, team: 'A' as Team }));
  const base = { ...center };
  send();
  r.advance(config.trackDeformRampS * 1000 + 50);
  assert.equal(track.widths[i], before, 'road width is preserved');
  assert.ok(Math.hypot(track.centerline[i].x - base.x, track.centerline[i].y - base.y) > 40, 'centerline shifts');
  assert.equal(r.state.deformations.length, 1);

  // A fresh gesture is immediately accepted and begins easing the previous one home.
  send();
  assert.ok(r.state.deformations.some(/* Repère une déformation entrée dans sa phase de retour. */ d => d.releaseAt !== null), 'previous deformation reforms');
  r.advance((config.trackDeformRelaxS + config.trackDeformRampS + 0.2) * 1000);
  assert.equal(r.state.deformations.length, 1, 'only the latest deformation remains');
  r.advance((config.trackDeformHoldS + config.trackDeformRelaxS + 0.2) * 1000);
  assert.equal(r.state.deformations.length, 0, 'temporary deformation fully reforms');
  assert.ok(Math.hypot(track.centerline[i].x - base.x, track.centerline[i].y - base.y) < 1, 'reference path is restored');
});
