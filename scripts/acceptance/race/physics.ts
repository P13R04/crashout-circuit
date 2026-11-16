/**
 * Scénarios de conduite : commandes, sorties de piste, dégâts, tours et victoire.
 * Liens : server/PhysicsLoop.ts, server/rules/GameRules.ts.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import type { Team } from '../../../server/types.js';
import { config } from '../../../server/config.js';
import { generatePreset } from '../../../server/track/MapGenerator.js';
import { nearestOnTrack } from '../../../server/geometry.js';
import { test, section, rig, raceRig, msg, aim } from '../harness.js';
import { pilot } from '../scenarioActions.js';

section('Vehicle & HP');
/** Vérifie la conduite par commande puis la chute réelle hors de la chaussée. */
test('car follows PilotInput then falls when it leaves the ribbon', () => {
  const r = raceRig();
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 0 }));
  r.advance(1500);
  assert.ok(r.state.cars.A.speed > 100, 'accelerates');
  r.advance(10000); // drive straight into the border at some point
  assert.equal(r.state.cars.A.hp, 0);
  assert.equal(r.state.cars.A.disabled, true);
  const hit = nearestOnTrack(r.state.cars.A.pos, r.state.track!);
  assert.ok(hit.distance > hit.halfWidth - 10, 'the car is no longer pushed back inside');
});
/** Vérifie que la commande de direction fait réellement tourner la voiture. */
test('steering turns the car', () => {
  const r = raceRig();
  const a0 = r.state.cars.A.angle;
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 1 }));
  r.advance(500);
  assert.notEqual(r.state.cars.A.angle, a0);
});
/** Vérifie l’indépendance des pilotes et le relâchement d’une commande trop ancienne. */
test('continuous pilot input is isolated per team and stale steering is neutralised', () => {
  const r = raceRig();
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 0.45 }));
  r.rules.onPilotInput('B', msg({ type: 'PilotInput' as const, team: 'B' as Team, throttle: 1, steer: -0.6 }));
  assert.equal(r.rules.inputs.A.steer, 0.45 * config.steerGain);
  assert.equal(r.rules.inputs.B.steer, -0.6 * config.steerGain);
  r.advance(config.pilotInputTimeoutMs + 50);
  assert.equal(r.rules.inputs.A.steer, 0);
  assert.equal(r.rules.inputs.B.steer, 0);
});
/** Compare le gain de direction des commandes clavier et tactiles. */
test('tactile and keyboard steering receive the same configured small turn gain', () => {
  const r = raceRig();
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 1 }));
  r.rules.onPilotInput('B', msg({ type: 'PilotInput' as const, team: 'B' as Team, throttle: 1, steer: 1 }));
  assert.equal(r.rules.inputs.A.steer, config.steerGain);
  assert.equal(r.rules.inputs.B.steer, config.steerGain);
});
/** Vérifie le choix de conduite par équipe avant et pendant une course. */
test('drive mode can be chosen before the race and toggled during the race per team', () => {
  const r = rig();
  assert.equal(r.state.phase, 'LOBBY');
  assert.equal(r.state.driveMode.A, 'auto');
  assert.equal(r.state.driveMode.B, 'auto');

  // Change mode before the race on the READY screen (Team A chooses pedal, Team B stays auto)
  r.state.phase = 'READY';
  r.rules.toggleDriveMode('A');
  assert.equal(r.state.driveMode.A, 'pedal');
  assert.equal(r.state.driveMode.B, 'auto');

  // Launch race and verify the chosen modes are preserved at start
  r.state.phase = 'RACE';
  r.rules.startRace(generatePreset());
  assert.equal(r.state.driveMode.A, 'pedal');
  assert.equal(r.state.driveMode.B, 'auto');
  assert.equal(r.rules.inputs.A.throttle, 0);
  assert.equal(r.rules.inputs.B.throttle, 1);

  // Toggle in race: Team B switches to pedal, Team A switches back to auto
  r.rules.toggleDriveMode('B');
  assert.equal(r.state.driveMode.A, 'pedal');
  assert.equal(r.state.driveMode.B, 'pedal');

  r.rules.toggleDriveMode('A');
  assert.equal(r.state.driveMode.A, 'auto');
  assert.equal(r.state.driveMode.B, 'pedal');
});

/** Vérifie l’ancienne commande qui bascule les deux équipes vers la conduite à pédale. */
test('compatibility drive-mode command switches both cars to held-pedal acceleration', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  r.rules.toggleDriveMode();
  assert.equal(r.state.driveMode.A, 'pedal');
  assert.equal(r.state.driveMode.B, 'pedal');
  car.speed = 100;
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 0, steer: 0 }));
  r.physics.step(r.clock.now += 100, 0.1);
  assert.ok(car.speed < 100 && car.speed > 0, 'released pedal coasts toward a stop');
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 0 }));
  const before = car.speed;
  r.physics.step(r.clock.now += 100, 0.1);
  assert.ok(car.speed > before, 'held pedal accelerates');
  car.speed = config.vMaxFwd;
  r.physics.step(r.clock.now += 100, 0.1);
  assert.equal(car.speed, config.vMaxPedal, 'pedal mode uses its lower maximum speed');
});
/** Vérifie que la pause fige le mouvement sans consommer la durée de course. */
test('pause freezes race motion and resumes without consuming race time', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  r.rules.togglePause();
  assert.equal(r.state.phase, 'PAUSED');
  const before = { ...car.pos };
  const startAt = r.state.sessionStartAt;
  r.advance(1000);
  assert.deepEqual(car.pos, before);
  r.rules.togglePause();
  assert.equal(r.state.phase, 'RACE');
  assert.ok(r.state.sessionStartAt >= startAt + 1000);
});
/** Vérifie que la pause conserve le bonus armé et la durée des obstacles temporaires. */
test('pause preserves the armed gesture window and temporary obstacle lifetimes', () => {
  const r = raceRig(); r.state.cars.A.heldItem = 'boost'; r.rules.onPower('A');
  r.state.walls.push({ id: 'temporary', team: 'A', pos: { x: 900, y: 500 }, angle: 0, lengthPx: 120, disabledUntil: 0, expiresAt: r.clock.now + 8000 });
  const armAt = r.state.cars.A.itemArmExpiry, wallAt = r.state.walls[0].expiresAt!;
  r.rules.togglePause(); r.advance(8000); const duration = r.clock.now - r.state.pausedAt;
  r.rules.togglePause();
  assert.equal(r.state.cars.A.itemArmExpiry, armAt);
  assert.equal(r.state.walls[0].expiresAt, wallAt + duration);
  r.rules.expire(r.clock.now); assert.equal(r.state.cars.A.itemArmed, true);
});
/** Vérifie qu’une pierre reprend au même point de sa trajectoire après une pause. */
test('pause keeps the elastic projectile at the same point of its flight when resumed', () => {
  const r = raceRig(); r.state.cars.A.heldItem = 'slingshot'; r.rules.onPower('A');
  r.rules.onSlingshot(msg({ type: 'Slingshot', team: 'A', ...aim(r.state.cars.B.pos, 120) }));
  r.clock.now += 200;
  const stone = r.state.stones[0];
  /** Calcule l’avancement de la pierre à l’instant contrôlé du test. */
  const fraction = () => (r.clock.now - stone.launchedAt) / (stone.impactAt - stone.launchedAt);
  const before = fraction();
  r.rules.togglePause(); r.advance(3000); r.rules.togglePause();
  assert.ok(Math.abs(fraction() - before) < 1e-9, 'the projectile resumes without jumping forward');
});
/** Vérifie qu’un tour est compté après le passage des checkpoints dans l’ordre. */
test('car can complete a lap by following the centerline (checkpoints in order)', () => {
  const r = raceRig();
  const track = r.state.track!;
  const car = r.state.cars.A;
  // Teleport along the centerline, one sample at a time
  const n = track.centerline.length;
  const startIdx = nearestOnTrack(track.startLine.pos, track).index;
  for (let k = 0; k <= n + 6; k++) {
    const p = track.centerline[(startIdx - 3 + k + n) % n];
    const prev = { ...car.pos };
    car.pos = { x: p.x, y: p.y };
    r.rules.afterMove('A', prev, r.clock.now);
  }
  assert.equal(car.lap, 1);
  assert.equal(car.checkpointIndex, 1);
});
/** Vérifie la fin de course lorsque le nombre de tours demandé est atteint. */
test('victory at lapsToWin → RESULT', () => {
  const r = raceRig();
  r.state.cars.B.lap = config.lapsToWin;
  r.advance(50);
  assert.equal(r.state.phase, 'RESULT');
  assert.equal(r.state.winner, 'B');
});
/** Vérifie que l’expiration du chronomètre donne la victoire à la voiture en tête. */
test('timeout → RESULT, leader wins', () => {
  const r = raceRig();
  r.rules.updateRaceSettings({type:'RaceSettings',t:0,sessionMaxSeconds:60});
  r.state.raceDeadline=r.clock.now-1;
  r.state.cars.A.checkpointIndex = 4;
  r.state.sessionStartAt = r.clock.now - config.sessionMaxSeconds * 1000 - 1;
  r.advance(50);
  assert.equal(r.state.phase, 'RESULT');
  assert.equal(r.state.winner, 'A');
});
