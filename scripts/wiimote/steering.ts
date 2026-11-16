/**
 * Vérifie le calcul de direction de la manette : angle, filtre, neutre, zone morte, maximum et équivalence avec le téléphone.
 * Liens : client-wiimote/steering/tiltAngle.ts, client-wiimote/steering/wiimoteSteering.ts, client-wiimote/control/wiimoteCommandSource.ts.
 */
import assert from 'node:assert/strict';
import { steerFromAngle } from '../../client-phone/pilot/gyro.js';
import { steerFromAngle as sharedSteer } from '../../client-shared/pilot/steeringCurve.js';
import { NO_BUTTONS, type DecodedReport, type RawAccel } from '../../client-wiimote/hid/reportDecoder.js';
import { ACCEL_PER_G, ACCEL_REST } from '../../client-wiimote/hid/wiimoteProtocol.js';
import { GravityFilter, tiltAngle, TILT } from '../../client-wiimote/steering/tiltAngle.js';
import { circularMean, WiimoteSteering } from '../../client-wiimote/steering/wiimoteSteering.js';
import { SILENCE_MS, WiimoteCommandSource } from '../../client-wiimote/control/wiimoteCommandSource.js';

/** Compare des nombres dont l'écart en virgule flottante est négligeable. */
function near(actual: number, expected: number, tolerance = 1e-6): void {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
}

/** Accélération brute d'un volant incliné de `degrees` dans le plan de la face (1 g réparti sur Y et X). */
function faceTilt(degrees: number): RawAccel {
  const a = degrees * Math.PI / 180;
  return { x: Math.round(ACCEL_REST + Math.cos(a) * ACCEL_PER_G), y: Math.round(ACCEL_REST + Math.sin(a) * ACCEL_PER_G), z: ACCEL_REST };
}

// La courbe est celle du téléphone, pas une copie.
assert.equal(steerFromAngle, sharedSteer);

// Angle dans le plan de la face et à plat ; null quand la manette est trop à plat pour ce plan.
const face = { grip: 'face', flip: false } as const;
near(tiltAngle({ x: 1, y: 0, z: 0 }, face)!, 0);
near(tiltAngle({ x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6), z: 0 }, face)!, 30);
near(tiltAngle({ x: 1, y: 0, z: 0 }, { ...face, flip: true })!, 0);
near(tiltAngle({ x: 0.5, y: 0.5, z: 0 }, { ...face, flip: true })!, -45);
near(tiltAngle({ x: 0, y: 0.5, z: 1 }, { grip: 'flat', flip: false })!, Math.atan2(0.5, 1) * 180 / Math.PI);
assert.equal(tiltAngle({ x: 0, y: 0, z: 1 }, face), null);
assert.equal(tiltAngle({ x: 1, y: 0, z: 0 }, { grip: 'flat', flip: false }), null);

// Moyenne circulaire de part et d'autre de ±180°.
near(Math.abs(circularMean([-179, 179])), 180);
near(circularMean([4, 6]), 5);

// Filtre : un rapport de repos suit, une secousse est rejetée et la dernière valeur fiable est conservée.
const filter = new GravityFilter();
const rest = filter.push(faceTilt(0));
assert.equal(rest.shaking, false);
const shake = filter.push({ x: 255, y: 20, z: 255 });
assert.equal(shake.shaking, true);
near(shake.gravity.x, rest.gravity.x);
assert.equal(filter.push(faceTilt(0)).shaking, false);
// Après une série continue de secousses, la référence est réapprise.
const stubborn = new GravityFilter();
stubborn.push(faceTilt(0));
for (let i = 0; i < TILT.shakeResetCount; i++) stubborn.push({ x: 250, y: 250, z: 250 });
assert.equal(stubborn.push({ x: 250, y: 250, z: 250 }).shaking, false);

/** Envoie `count` rapports identiques toutes les 10 ms à partir de `start` et renvoie l'heure suivante. */
function feed(steering: WiimoteSteering, raw: RawAccel, start: number, count: number): number {
  let now = start;
  for (let i = 0; i < count; i++, now += 10) steering.push(raw, now);
  return now;
}

// Calibration : 500 ms de neutre, puis direction nulle dans la zone morte.
const steering = new WiimoteSteering(face);
assert.equal(steering.status, 'waiting');
steering.push(faceTilt(20), 0);
assert.equal(steering.status, 'calibrating');
assert.equal(steering.steer, null);
let now = feed(steering, faceTilt(20), 10, 60);
assert.equal(steering.status, 'ready');
near(steering.steer!, 0, 1e-3);
// Dans la zone morte (±3°), la direction reste nulle.
now = feed(steering, faceTilt(22), now, 80);
near(steering.steer!, 0, 1e-3);
// Au-delà du maximum, la direction sature des deux côtés.
now = feed(steering, faceTilt(20 + 50), now, 120);
near(steering.steer!, 1, 1e-2);
now = feed(steering, faceTilt(20 - 50), now, 120);
near(steering.steer!, -1, 1e-2);
// Une inclinaison intermédiaire suit la courbe du téléphone.
now = feed(steering, faceTilt(20 + 19), now, 200);
near(steering.steer!, steerFromAngle(39, 20), 5e-2);
// Recalibrer efface le neutre.
steering.calibrate();
assert.equal(steering.status, 'waiting');
assert.equal(steering.steer, null);
// Manette à plat : plus de direction, mais le neutre mesuré est conservé.
feed(steering, { x: ACCEL_REST, y: ACCEL_REST, z: ACCEL_REST + ACCEL_PER_G }, now, 25);
assert.equal(steering.angle, null);
assert.equal(steering.steer, null);
assert.equal(steering.status, 'waiting');

// Le neutre peut tomber autour de ±180° (gravité sur −X) sans fausser la direction.
const inverted = new WiimoteSteering(face);
const invertedTilt = (deg: number): RawAccel => faceTilt(180 - deg);
let t = feed(inverted, invertedTilt(0), 0, 60);
t = feed(inverted, invertedTilt(0), t, 40);
near(inverted.steer!, 0, 1e-3);
feed(inverted, invertedTilt(45), t, 200);
assert.ok(inverted.steer! < -.9, 'incliner de 45° d’un côté du neutre à ±180° sature la direction');

// Source de commandes : Home recalibre, B/A/1 sont des niveaux, la perte coupe tout.
const source = new WiimoteCommandSource(face);
assert.equal(source.read(0), null);
source.connect(0);
assert.equal(source.read(0), null, 'pas de commande avant la calibration');
const motion = (buttons: Partial<typeof NO_BUTTONS>, raw: RawAccel): DecodedReport => ({ kind: 'motion', buttons: { ...NO_BUTTONS, ...buttons }, accel: raw });
let clock = 0;
for (; clock < 800; clock += 10) source.feed(motion({}, faceTilt(0)), clock);
assert.deepEqual(source.read(clock), { steer: source.steering.steer!, accelerate: false, repair: false, toggleDriveMode: false });
near(source.read(clock)!.steer, 0, 1e-3);
source.feed(motion({ b: true, a: true, one: true }, faceTilt(0)), clock);
assert.deepEqual(source.read(clock), { steer: source.read(clock)!.steer, accelerate: true, repair: true, toggleDriveMode: true });
source.feed(motion({ home: true }, faceTilt(0)), clock += 10);
assert.equal(source.steering.status, 'calibrating', 'Home efface le neutre et la mesure recommence aussitôt');
assert.equal(source.read(clock), null);
source.feed(motion({ two: true, plus: true, minus: true }, faceTilt(0)), clock += 10);
assert.equal(source.read(clock), null, '2, + et − ne commandent rien');
// Silence prolongé : la manette est tenue pour perdue.
for (let i = 0; i < 80; i++) source.feed(motion({}, faceTilt(0)), clock += 10);
assert.notEqual(source.read(clock), null);
assert.equal(source.read(clock + SILENCE_MS + 1), null);
// Déconnexion : plus de commande, boutons relâchés.
source.feed(motion({ b: true }, faceTilt(0)), clock);
source.disconnect();
assert.equal(source.read(clock), null);
assert.deepEqual(source.buttons, NO_BUTTONS);
source.feed(motion({ b: true }, faceTilt(0)), clock + 10);
assert.deepEqual(source.buttons, NO_BUTTONS, 'les rapports d’une manette déconnectée sont ignorés');

console.log('✓ Wiimote : angle, filtre, neutre, zone morte, maximum et courbe identique au téléphone');
