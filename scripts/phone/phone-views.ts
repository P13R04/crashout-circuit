/** Vérifie le cadrage de la carte, l'interpolation et l'invalidation du cache de piste. */
import assert from 'node:assert/strict';
import { COCKPIT_FOG, shotFor } from '../../client-shared/race3d/cameras.js';
import { toScreen, toWorld } from '../../client-shared/raceMap/camera2d.js';
import { TrackLayer } from '../../client-shared/raceMap/TrackLayer.js';
import { interpolateCar } from '../../client-shared/raceMap/raceFrames.js';
import { createInitialState } from '../../server/rules/GameRules.js';
import { generate, generatePreset } from '../../server/track/MapGenerator.js';

import { MeshBasicMaterial, type Mesh } from 'three';
import { RoadMesh } from '../../client-shared/race3d/RoadMesh.js';
import { LOOKS } from '../../client-shared/race3d/looks.js';
import { venuePlots, clearance } from '../../client-shared/race3d/venue/layout.js';
import { visibleTrackEdges } from '../../client-shared/trackVisibility.js';
import { THEMES } from '../../server/protocol/theme.js';

const material = new MeshBasicMaterial();

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

const bounds = { center: { x: 960, y: 540 }, span: 1920 };
const cockpit = shotFor('cockpit', { x: 100, y: 200 }, 0, bounds);
assert.deepEqual(cockpit.eye, [104, 19, 200]);
assert.ok(cockpit.target[0] > cockpit.eye[0]);
assert.ok(COCKPIT_FOG.near < COCKPIT_FOG.far && COCKPIT_FOG.far <= cockpit.far);
assert.ok(cockpit.far < shotFor('broadcast', car.pos, 0, bounds).far);
const chase = shotFor('chase', car.pos, 0, bounds);
assert.ok(chase.eye[0] < car.pos.x && chase.eye[1] > cockpit.eye[1]);
assert.deepEqual(shotFor('overview', car.pos, 0, bounds).target, [960, 0, 540]);
console.log('✓ Caméras 3D : cockpit, visibilité limitée, poursuite et vue globale');

const begin = { x: 560, y: 540 }, end = { x: 1360, y: 540 };
const wave = (a: typeof begin, b: typeof end) => Array.from({ length: 121 }, (_, i) => ({
  x: a.x + (b.x - a.x) * i / 120, y: 540 - 170 * Math.sin(2 * Math.PI * i / 120),
}));
const eight = generate(wave(begin, end), wave(end, begin), begin, end, end, begin);
assert.ok(!eight.preset);
assert.ok(visibleTrackEdges(eight).some(edge => edge.some(visible => !visible)));
const road = new RoadMesh({ road: material, verge: material, curb: material, white: material, dark: material });
road.update(eight, 1);
const mesh = road.group.children[0] as Mesh;
assert.equal(mesh.geometry.drawRange.count, 6 * eight.outerEdge.length);
road.update(state.track, 2);
assert.equal(road.group.children[0], mesh);
assert.deepEqual(Object.keys(LOOKS).sort(), THEMES.map(theme => theme.id).sort());
for (const track of [state.track, eight]) {
  const plots = venuePlots(track);
  assert.deepEqual(plots, venuePlots(track));
  assert.ok(plots.every(p => clearance(p.x, p.y, track.baseCenterline, track.widths) > p.radius));
}
road.dispose();
material.dispose();
console.log('✓ Piste 3D : croisement ouvert, maillage réutilisé, cinq ambiances et décors hors chaussée');
