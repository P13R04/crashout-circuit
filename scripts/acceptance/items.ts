/**
 * Scénarios des objets ramassés : stock, armement par POWER, lance-pierre, portail de boost et vol.
 * Liens : server/GameRules.ts, server/armedPickup.ts, server/geometry.ts.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import type { Team } from '../../server/types.js';
import { config } from '../../server/config.js';
import { panelOf, localToWorld, chargeZoneTeam, nearestStationTeam, rotationTowardsTeam, CHARGE_ZONE_LOCAL } from '../../server/layout.js';
import { test, section, raceRig, msg, aim } from './harness.js';
import { pilot, place } from './scenarioActions.js';

section('Items');
/** Vérifie le ramassage avec un stock vide puis la réapparition du bonus après son délai. */
test('pickup: grabbed when stock empty, respawns after 15 s', () => {
  const r = raceRig();
  const pk = r.state.pickups[0];
  const car = r.state.cars.A;
  car.pos = { ...pk.pos };
  r.rules.afterMove('A', pk.pos, r.clock.now);
  assert.equal(car.heldItem, pk.kind);
  assert.ok(pk.respawnAt > r.clock.now);
  car.pos = { ...r.state.pickups[1].pos };
  car.heldItem = 'boost';
  r.rules.afterMove('A', car.pos, r.clock.now);
  assert.equal(car.heldItem, 'boost', 'no second pickup while stock is full');
  r.advance(config.pickupRespawnS * 1000 + 100);
  assert.equal(pk.respawnAt, 0);
});
/** Vérifie que le stock armé reste disponible sans limite jusqu’à un geste valide. */
test('armed inventory survives indefinite delay until a valid gesture consumes it', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  car.heldItem = 'slingshot';
  r.rules.onPower('A');
  assert.equal(car.itemArmed, true);
  r.advance(4900);
  assert.equal(car.itemArmed, true);
  r.clock.now+=3_600_000;r.rules.expire(r.clock.now);
  assert.equal(car.heldItem,'slingshot');assert.equal(car.itemArmed,true);
  assert.equal(r.feedback.includes('itemLost'),false);
  r.rules.onSlingshot(msg({type:'Slingshot',team:'A',...aim({x:900,y:500},120)}));assert.equal(car.heldItem,null);
});
/** Vérifie l’avertissement, les dégâts et l’étourdissement d’une vraie pierre sur les deux couleurs. */
test('T-06 slingshot: 0.8 s telegraph, then a full-HP car loses half its HP and is stunned ("stoneHit" feedback), any car inside the impact; a second stone breaks it', () => {
  const r = raceRig();
  const A = r.state.cars.A, B = r.state.cars.B;
  A.heldItem = 'slingshot';
  r.rules.onPower('A');
  const target = { ...B.pos };
  const shot = aim(target, 120);
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, team: 'A' as Team, ...shot }));
  assert.equal(r.state.stones.length, 1);
  assert.ok(Math.hypot(r.state.stones[0].target.x - target.x, r.state.stones[0].target.y - target.y) < 1, 'lands on the aimed point');
  assert.deepEqual(r.state.stones[0].from, shot.pouch, 'flies from the pouch');
  assert.equal(A.heldItem, null, 'item consumed');
  assert.ok(Math.abs(r.state.stones[0].impactAt - r.clock.now - config.stoneTelegraphS * 1000) < 1);
  r.advance(700);
  assert.equal(B.hp, config.hpMax, 'no damage during the warning');
  // Aim is a point in space: put the moving victim inside the impact radius
  // at the scheduled moment, without conflating this rule test with driving.
  B.pos = { ...target };
  r.clock.now += 200;
  r.rules.updateStones(r.clock.now);
  assert.equal(B.hp, Math.max(0, config.hpMax - config.dmgStone));
  assert.ok(config.dmgStone < config.hpMax && 2 * config.dmgStone >= config.hpMax, 'one stone wounds a full-HP car, two break it');
  assert.equal(B.disabled, false);
  assert.ok(r.feedback.includes('stoneHit'), 'hit feedback for the comic effect');
  assert.ok(Math.abs(B.stunUntil - r.clock.now - config.stunStoneS * 1000) < 1, 'stunned for the configured time');
  assert.equal(A.hp, config.hpMax);
  assert.equal(r.state.stones.length, 0);
  // Once the first impact's stun and invulnerability are over, a second stone breaks the car
  r.clock.now += 3000; B.stunUntil = 0; B.invulnUntil = 0;
  A.heldItem = 'slingshot'; r.rules.onPower('A');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, team: 'A' as Team, ...aim({ ...B.pos }, 120) }));
  r.clock.now += config.stoneTelegraphS * 1000; r.rules.updateStones(r.clock.now);
  assert.equal(B.hp, Math.max(0, config.hpMax - 2 * config.dmgStone));
  assert.equal(B.disabled, true, 'the second stone breaks the car');
});
/** Vérifie qu’un tir sans lance-pierre armé est ignoré. */
test('slingshot without armed slingshot is ignored', () => {
  const r = raceRig();
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, ...aim({ x: 900, y: 500 }, 120) }));
  assert.equal(r.state.stones.length, 0);
});
/** Vérifie qu’une traction trop courte ne tire pas et ne consomme pas le stock. */
test('slingshot: a pull shorter than the minimum does nothing and the item stays armed', () => {
  const r = raceRig();
  const A = r.state.cars.A;
  A.heldItem = 'slingshot';
  r.rules.onPower('A');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 900, y: 500 }, pouch: { x: 900, y: 500 + config.slingMinPullPx - 5 } }));
  assert.equal(r.state.stones.length, 0);
  assert.equal(A.itemArmed, true);
  assert.equal(A.heldItem, 'slingshot');
});
/** Vérifie le sens du tir et l’allongement de sa portée avec la traction. */
test('slingshot: the stone flies opposite to the pull and a longer pull goes farther', () => {
  /** Prépare une pierre armée puis vérifie son arrivée sur la cible du scénario. */
  const land = (pull: number) => {
    const r = raceRig();
    r.state.cars.A.heldItem = 'slingshot';
    r.rules.onPower('A');
    // fork at (900,540), pouch pulled straight down → the stone goes up
    r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 900, y: 700 }, pouch: { x: 900, y: 700 + pull } }));
    return r.state.stones[0].target;
  };
  const short = land(config.slingMinPullPx + 20), long = land(config.slingMaxPullPx);
  assert.equal(Math.round(short.x), 900, 'straight line');
  assert.ok(short.y < 700 && long.y < 700, 'opposite to the pull (up)');
  assert.ok(long.y < short.y, 'longer pull = farther landing');
  assert.ok(long.y >= 0 && long.y <= config.logicalHeight, 'kept inside the table');
});
/** Vérifie que la cible de la pierre reste dans les limites de la table. */
test('slingshot: the landing point is clamped to the table', () => {
  const r = raceRig();
  r.state.cars.A.heldItem = 'slingshot';
  r.rules.onPower('A');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 300, y: 200 }, pouch: { x: 300, y: 200 + config.slingMaxPullPx } }));
  const t = r.state.stones[0].target;
  assert.ok(t.y >= 0 && t.x >= 0 && t.x <= config.logicalWidth);
});
/** Vérifie les dimensions et l’intensité croissante des zones d’accélération. */
test('T-07 longer boost gate → stronger boost and acceleration zone properties', () => {
  /** Prépare une zone d’accélération et déplace la voiture à travers sa surface de test. */
  const crossWith = (len: number) => {
    const r = raceRig();
    const car = r.state.cars.A;
    car.heldItem = 'boost';
    r.rules.onPower('A');
    const c = { x: car.pos.x + 60, y: car.pos.y };
    r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: c.x, y: c.y - len / 2 }, b: { x: c.x, y: c.y + len / 2 } }));
    assert.equal(r.state.boostGates.length, 1);
    const gate = r.state.boostGates[0];
    assert.ok(gate.dir && typeof gate.dir.x === 'number' && typeof gate.dir.y === 'number', 'gate has propulsion direction');
    assert.equal(gate.depth, 60, 'gate has 60px depth acceleration zone');
    assert.equal(gate.createdAt, r.clock.now, 'gate has createdAt timestamp');
    car.speed = 200;
    const prev = { ...car.pos };
    car.pos = { x: c.x + 5, y: c.y };
    r.rules.afterMove('A', prev, r.clock.now);
    assert.equal(car.boostUntil, r.clock.now + config.boostDurationS * 1000, 'boost duration is 2s');
    return car.speed;
  };
  assert.ok(crossWith(400) > crossWith(120), 'k grows with the length');
});
/** Vérifie le déclenchement lors de l’entrée dans toute la surface du corridor d’accélération. */
test('T-07 boost zone triggers when entering the 2D acceleration corridor', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  car.heldItem = 'boost';
  r.rules.onPower('A');
  const c = { x: car.pos.x + 100, y: car.pos.y };
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: c.x, y: c.y - 80 }, b: { x: c.x, y: c.y + 80 } }));
  const gate = r.state.boostGates[0];
  // Car moves into the corridor ahead of AB
  car.speed = 200;
  const prev = { ...car.pos };
  car.pos = { x: c.x + gate.depth! / 2, y: c.y };
  r.rules.afterMove('A', prev, r.clock.now);
  assert.ok(car.boostUntil > r.clock.now, 'car triggered boost by entering the zone');
  assert.ok(car.speed > 200, 'speed increased');
  assert.ok(r.feedback.includes('boostHit'));
});
/** Vérifie qu’une zone d’accélération agit seulement sur la voiture de son équipe. */
test('T-07 boost zone affects allied car only, opponent ignores it', () => {
  const r = raceRig();
  r.state.cars.A.heldItem = 'boost';
  r.rules.onPower('A');
  const c = { x: 500, y: 500 };
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: c.x, y: c.y - 80 }, b: { x: c.x, y: c.y + 80 } }));
  const carB = r.state.cars.B;
  carB.speed = 200;
  const prevB = { x: c.x - 10, y: c.y };
  carB.pos = { x: c.x + 10, y: c.y };
  r.rules.afterMove('B', prevB, r.clock.now);
  assert.equal(carB.boostUntil, 0, 'opponent car does not receive allied boost');
  assert.equal(carB.speed, 200);
});
/** Vérifie la portée maximale des contacts et l’expiration de la zone d’accélération. */
test('boost gate rejects contacts over 400 px apart and expires after 8 s', () => {
  const r = raceRig();
  r.state.cars.A.heldItem = 'boost';
  r.rules.onPower('A');
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: 0, y: 0 }, b: { x: 450, y: 0 } }));
  assert.equal(r.state.boostGates.length, 0);
  assert.ok(r.state.cars.A.itemArmed, 'item stays armed after a rejected gesture');
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: 0, y: 0 }, b: { x: 200, y: 0 } }));
  assert.equal(r.state.boostGates.length, 1);
  r.advance(config.boostGateLifeS * 1000 + 100);
  assert.equal(r.state.boostGates.length, 0);
});
/** Vérifie la réservation d’un seul stock armé et son utilisation possible par l’autre copilote. */
test('only the first stock arms globally; either nearby copilot may use it', () => {
  for (const [team, y] of [['A', 350], ['B', 750]] as const) {
    const r = raceRig();
    for (const t of ['A', 'B'] as Team[]) { r.state.cars[t].heldItem = 'slingshot'; r.rules.onPower(t); }
    r.rules.onSlingshot(msg({ type: 'Slingshot', anchor: { x: 1600, y }, pouch: { x: 1600, y: y + 100 } }));
    assert.equal(r.state.stones[0].team, team);
    assert.equal(r.state.cars.A.heldItem,null);assert.equal(r.state.cars.B.heldItem,'slingshot');assert.equal(r.state.cars.B.itemArmed,false);
  }
});

/** Vérifie la cohérence des postes en diagonale, de l’attribution des gestes et des messages orientés. */
test('diagonal teammates: corners, docking, gesture ownership and feedback orientation agree', () => {
  assert.deepEqual(panelOf('A', 'copilot'), { team: 'A', role: 'copilot', cx: 1760, cy: 90, rot: Math.PI });
  assert.deepEqual(panelOf('B', 'copilot'), { team: 'B', role: 'copilot', cx: 1760, cy: 990, rot: 0 });
  for (const team of ['A', 'B'] as const) {
    const pilot = panelOf(team, 'pilot'), copilot = panelOf(team, 'copilot');
    assert.notEqual(pilot.cy, copilot.cy);
    assert.notEqual(pilot.cx, copilot.cx);
    const zone = localToWorld(copilot, CHARGE_ZONE_LOCAL.x, CHARGE_ZONE_LOCAL.y);
    assert.equal(chargeZoneTeam(zone), null);
    assert.equal(nearestStationTeam(zone), team);
    assert.equal(rotationTowardsTeam(team, zone), copilot.rot);
    assert.equal(rotationTowardsTeam(team, { x: pilot.cx, y: pilot.cy }), pilot.rot);
    const r = raceRig();
    r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'dock', team, kind: 'wall' }));
    assert.equal(r.state.tangibles[1].status,'parked');assert.equal(r.state.tangibles[1].team,null);
  }
});
