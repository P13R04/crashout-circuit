/**
 * Scénarios des anciennes capacités (fantôme, destruction) et de la réparation à deux pads.
 * Liens : server/rules/GameRules.ts.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import type { Team } from '../../../server/types.js';
import { config } from '../../../server/config.js';
import { test, section, raceRig, msg } from '../harness.js';
import { pilot, place, placeBlocking, pad } from '../scenarioActions.js';

section('Abilities');
/** Vérifie l’ancienne capacité fantôme et sa durée de recharge. */
test('T-08 ghost: ignores hostile elements for 3 s, then 20 s recharge', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'ghost' as const }));
  assert.ok(car.ghostUntil - r.clock.now === config.ghostS * 1000);
  placeBlocking(r);
  r.rules.afterMove('A', car.pos, r.clock.now);
  assert.equal(car.hp, config.hpMax, 'ghost passes through the wall');
  const readyAt = r.state.cooldowns.A.ghost;
  assert.equal(readyAt - car.ghostUntil, config.ghostCooldownS * 1000);
  r.advance(5000);
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'ghost' as const }));
  assert.ok(car.ghostUntil < r.clock.now, 'cooldown prevents re-activation');
});
/** Vérifie l’ancienne destruction sur les murs neutres et les murs attribués hérités. */
test('destroy: disables a neutral wall but still spares legacy owned walls', () => {
  const r = raceRig(); place(r, 1, .2, .5);
  r.state.walls.push({ id: 'legacy-own', team: 'A', pos: { x: 1500, y: 500 }, angle: 0, lengthPx: 120, disabledUntil: 0 });
  r.rules.onAbility(msg({ type: 'Ability', team: 'A', kind: 'destroy', targetId: 'legacy-own' }));
  assert.equal(r.state.walls.find(/* Retrouve le mur hérité attribué à une équipe pour tester la compatibilité. */ w => w.id === 'legacy-own')!.disabledUntil, 0);
  r.rules.onAbility(msg({ type: 'Ability', team: 'A', kind: 'destroy', targetId: 'wall-1' }));
  const w = r.state.walls.find(/* Retrouve le mur neutre ciblé par l’ancienne capacité. */ x => x.id === 'wall-1')!;
  assert.equal(w.disabledUntil - r.clock.now, config.destroyDisableS * 1000);
  assert.equal(r.state.cooldowns.A.destroy - r.clock.now, config.destroyCooldownS * 1000);
  r.state.cars.A.pos = { ...w.pos }; r.rules.afterMove('A', w.pos, r.clock.now);
  assert.equal(r.state.cars.A.hp, config.hpMax);
});

// ─── Repair: T-09 ────────────────────────────────────────────────────────────

section('Repair');
/** Vérifie que la réparation demande les deux appuis et recommence dès qu’un partenaire lâche. */
test('T-09 repair needs BOTH pads; releasing one resets the gauge', () => {
  const r = raceRig();
  r.state.cars.A.hp = 0; r.state.cars.A.disabled = true;
  pad(r, 'A', 'pilot', true);
  r.advance(3000);
  assert.equal(r.state.repairProgress.A, 0, 'a single pad does nothing');
  assert.ok(r.state.cars.A.disabled);
  pad(r, 'A', 'copilot', true);
  r.advance(1000);
  assert.ok(r.state.repairProgress.A > 0.4 && r.state.repairProgress.A < 0.6);
  pad(r, 'A', 'pilot', false);
  r.advance(50);
  assert.equal(r.state.repairProgress.A, 0);
  pad(r, 'A', 'pilot', true);
  r.advance(config.repairHoldS * 1000 + 100);
  assert.equal(r.state.cars.A.hp, config.repairHpRestore);
  assert.equal(r.state.cars.A.disabled, false);
});
/** Vérifie la réapparition de la voiture réparée au dernier checkpoint. */
test('repair respawns a disabled car at the last checkpoint', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  car.checkpointIndex = 3;
  car.pos = { x: 5, y: 5 };
  car.hp = 0; car.disabled = true;
  pad(r, 'A', 'pilot', true); pad(r, 'A', 'copilot', true);
  r.advance(config.repairHoldS * 1000 + 100);
  const cp = r.state.track!.checkpoints[2];
  assert.ok(Math.hypot(car.pos.x - cp.pos.x, car.pos.y - cp.pos.y) < 5);
});
/** Vérifie qu’une voiture détruite s’arrête et ignore les commandes du pilote. */
test('HP 0 → car stops and ignores the pilot', () => {
  const r = raceRig();
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 0 }));
  r.advance(1000);
  r.rules.damage(r.state.cars.A, 999, r.clock.now);
  const p = { ...r.state.cars.A.pos };
  r.advance(1000);
  assert.deepEqual(r.state.cars.A.pos, p);
});
