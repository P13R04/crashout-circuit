/**
 * Vérifie la direction au doigt : zone morte centrale, pleine direction avant le bord, symétrie et valeurs invalides.
 * Liens : client-phone/pilot/touchSteering.ts.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import { steerFromTouch, TOUCH_STEERING } from '../../client-phone/pilot/touchSteering.js';

assert.equal(steerFromTouch(.5), 0, 'le centre ne tourne pas');
assert.equal(steerFromTouch(.5 + TOUCH_STEERING.deadZone / 2 - .001), 0, 'la zone morte reste neutre');
assert.equal(steerFromTouch(0), -1);
assert.equal(steerFromTouch(1), 1);
assert.equal(steerFromTouch(.5 + TOUCH_STEERING.fullAt / 2), 1, 'la pleine direction est atteinte avant le bord');
let previous = 0;
for (let f = .55; f <= 1; f += .01) {
  const value = steerFromTouch(f);
  assert.ok(value >= previous, 'la direction ne diminue jamais quand le doigt s’éloigne du centre');
  assert.equal(steerFromTouch(1 - f), -value, 'gauche et droite sont symétriques');
  previous = value;
}
assert.equal(steerFromTouch(Number.NaN), 0);
assert.equal(steerFromTouch(-3), -1, 'un doigt hors de la bande reste borné');
assert.equal(steerFromTouch(4), 1);
console.log('✓ Direction au doigt : zone morte, pleine direction avant le bord, symétrie, bornes');
