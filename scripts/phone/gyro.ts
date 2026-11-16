/** Vérifie la projection, la calibration et la cadence des commandes du volant. */
import assert from 'node:assert/strict';
import {
  wheelAngle, neutralAngle, steerFromAngle, smoothSteer, throttleFromPitch, shouldSendInput, driveSample, WHEEL,
} from '../../client-phone/pilot/gyro.js';

/** Compare des angles dont l'écart en virgule flottante est négligeable. */
function near(actual: number, expected: number): void { assert.ok(Math.abs(actual - expected) < 1e-6); }

near(wheelAngle(90, 0, 0)!.wheel, 0);
near(wheelAngle(70, 90, 0)!.wheel, 20);
near(wheelAngle(70, -90, 0)!.wheel, -20);
near(wheelAngle(0, -90, 90)!.wheel, 0);
near(wheelAngle(-20, -90, 90)!.wheel, -20);
near(wheelAngle(55, 0, 0)!.pitch, 35);
assert.equal(wheelAngle(null, 0, 0), null);
assert.equal(wheelAngle(0, 0, 0), null);
near(Math.abs(neutralAngle([{ wheel: -179, pitch: 18 }, { wheel: 179, pitch: 22 }]).wheel), 180);
near(neutralAngle([{ wheel: 5, pitch: 18 }, { wheel: 5, pitch: 22 }]).pitch, 20);
near(steerFromAngle(12, 10), 0);
near(steerFromAngle(45, 10), 1);
near(steerFromAngle(-55, 0), -1);
near(steerFromAngle(20, 0), (17 / 32) ** 1.3);
near(steerFromAngle(-175, 175), steerFromAngle(10, 0));
near(smoothSteer(.2, .6), .3);
near(smoothSteer(.2, 0), 0);
near(throttleFromPitch(25, 15), 0);
near(throttleFromPitch(50, 15), 1);
assert.equal(shouldSendInput(32, { steer: .5, throttle: 1 }, { time: 0, steer: 0, throttle: 1 }), false);
assert.equal(shouldSendInput(34, { steer: .5, throttle: 1 }, { time: 0, steer: 0, throttle: 1 }), true);
assert.equal(shouldSendInput(80, { steer: 0, throttle: 1 }, { time: 0, steer: 0, throttle: 1 }), false);
assert.equal(shouldSendInput(100, { steer: 0, throttle: 1 }, { time: 0, steer: 0, throttle: 1 }), true);
const stationary = { steer: 0, throttle: 1 };
let count = 0;
let last = { time: 0, ...stationary };
for (let time = WHEEL.pollMs; time <= 1000; time += WHEEL.pollMs) {
  if (!shouldSendInput(time, stationary, last)) continue;
  assert.ok(time - last.time <= 100);
  last = { time, ...stationary };
  count++;
}
assert.ok(count >= 10);
assert.deepEqual(driveSample({ steer: -.4, throttle: 0 }, false, false), { steer: -.4, throttle: 1 });
assert.deepEqual(driveSample({ steer: .4, throttle: .2 }, true, true), { steer: .4, throttle: 1 });
assert.deepEqual(driveSample({ steer: .4, throttle: 1 }, true, false), { steer: .4, throttle: 1 });
console.log('✓ Volant : projection, calibration, zone morte, lissage, pédale et débit des commandes');
