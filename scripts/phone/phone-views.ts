/** Vérifie le cadrage de la carte, l'interpolation et l'invalidation du cache de piste. */
import assert from 'node:assert/strict';
import { toScreen, toWorld } from '../../client-shared/raceMap/camera2d.js';
import { TrackLayer } from '../../client-shared/raceMap/TrackLayer.js';
import { interpolateCar } from '../../client-phone/pilot/views/raceFrames.js';
import { createInitialState } from '../../server/rules/GameRules.js';
import { generatePreset } from '../../server/track/MapGenerator.js';

const camera = { center: { x: 100, y: 200 }, width: 300, height: 200, scale: 2, rotation: -Math.PI / 2 };
assert.deepEqual(toScreen(camera, camera.center), { x: 150, y: 100 });
assert.deepEqual(toScreen(camera, { x: 125, y: 200 }), { x: 150, y: 50 });
assert.deepEqual(toWorld(camera, { x: 150, y: 50 }), { x: 125, y: 200 });
const car = { pos: { x: 100, y: 100 }, angle: Math.PI - .1 };
const after = { pos: { x: 120, y: 110 }, angle: -Math.PI + .1 };
const frame = interpolateCar(car, after, .5);
assert.deepEqual(frame.pos, { x: 110, y: 105 });
assert.ok(Math.abs(frame.angle - Math.PI) < 1e-8);
assert.deepEqual(interpolateCar(car, { ...after, pos: { x: 700, y: 900 } }, .1).pos, { x: 700, y: 900 });

let builds = 0;
const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
Object.defineProperty(globalThis, 'document', { value: {
  createElement: () => ({ getContext: () => { builds++; return ctx; } }),
} });
const layer = new TrackLayer();
const state = createInitialState();
state.track = generatePreset();
layer.get(state);
layer.get({ ...state });
assert.equal(builds, 1);
layer.get({ ...state, trackVersion: 1 });
assert.equal(builds, 2);
console.log('✓ Vue périphérique : cadrage, conversion, interpolation et cache de géométrie');
