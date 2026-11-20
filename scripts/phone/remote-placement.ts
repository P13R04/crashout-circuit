/**
 * Vérifie les conversions sur le circuit et la visée du lance-pierre au relâchement.
 * Liens : server/rules/gameplay/remotePlacementGeometry.ts, client-phone/copilot/placement/.
 */
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { createInitialState } from '../../server/rules/session/initialState.js';
import { prepareRemotePlacement } from '../../server/rules/gameplay/remotePlacementGeometry.js';
import { generatePreset } from '../../server/track/MapGenerator.js';
import { tangibleTouchPose } from '../../server/tangibles/tangibleTouch.js';
import { tablePanels } from '../../server/tableStations.js';
import { dist, slingshotShot } from '../../server/geometry.js';
import { orientBoostGate } from '../../server/track/boostGeometry.js';
import type { RemotePlacementTarget } from '../../server/types.js';
import { aimBearing, PlacementGesture } from '../../client-phone/copilot/placement/PlacementGesture.js';
import { pointAlong, tracedPlacement, trackPercent, transverseAngle } from '../../client-phone/copilot/placement/placementInput.js';
import { lateralTilt, TiltAim } from '../../client-phone/copilot/placement/TiltAim.js';
import { PlacementMap, type MapGesture } from '../../client-phone/copilot/placement/PlacementMap.js';
import { beginPinch, boundedFocus, resizePinch } from '../../client-phone/copilot/placement/pinchZoom.js';
import { toWorld } from '../../client-shared/raceMap/camera2d.js';

const state = createInitialState(), track = generatePreset();
state.phase = 'RACE';
state.tangiblePlacementMode = 'touch';
state.track = track;
state.wideTable = true;
const arm = { team: 'A', version: 3 } as const;
const roadCandidates = track.centerline.filter(({ x, y }) => x > 310 && x < 1600 && y > 310 && y < 900);
assert.ok(roadCandidates.length > 0);
state.cars.A.itemArmed = true;
state.cars.A.itemArmVersion = arm.version;
let seed = 42613;

/** Donne des valeurs reproductibles et bien réparties pour les essais. */
function random(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
}

for (let i = 0; i < 200; i++) {
  const pos = { x: 650 + 600 * random(), y: 350 + 380 * random() };
  const angle = 720 * random() - 360;
  const id = ([1, 2, 3] as const)[i % 3];
  const tangible = prepareRemotePlacement(state, { kind: 'tangible', id, pos, angle });
  assert.ok('kind' in tangible && tangible.kind === 'tangible');
  assert.deepEqual(tangible.pose,
    tangibleTouchPose(id === 1 ? 'wall' : 'pylon', tangible.a, tangible.b, state.params, tablePanels(state)));
  assert.ok(Math.abs(tangible.pose.x * state.params.logicalWidth - pos.x) < 1e-6);
  if (id === 1) assert.ok(Math.abs(tangible.pose.angle - ((angle % 180) + 180) % 180) < 1e-6);

  state.cars.A.heldItem = 'slingshot';
  const shot = prepareRemotePlacement(state, { kind: 'slingshot', pos, angle, power: i % 2 ? random() : 0, arm });
  assert.ok('kind' in shot && shot.kind === 'slingshot');
  assert.deepEqual(shot.shot, slingshotShot(shot.anchor, shot.pouch, state.params));
  assert.ok(shot.shot.valid);
  assert.deepEqual(shot.pouch, pos);

  state.cars.A.heldItem = 'boost';
  const road = roadCandidates[Math.floor(random() * roadCandidates.length)];
  const width = 110 + random() * 200;
  const gate = prepareRemotePlacement(state, { kind: 'boost', pos: road, angle: transverseAngle(track, road), width, arm });
  assert.ok('kind' in gate && gate.kind === 'boost', JSON.stringify({ i, road, width, gate }));
  assert.ok(Math.abs(dist(gate.a, gate.b) - width) < 1e-6);
  assert.deepEqual(gate.gate, orientBoostGate(gate.a, gate.b, track));
}

const middle = { x: 900, y: 540 };
const wall: RemotePlacementTarget = { kind: 'tangible', id: 1, pos: middle, angle: 0 };
assert.deepEqual(prepareRemotePlacement(state, { ...wall, pos: { x: -5, y: 20 } }), { reason: 'outside-table' });
assert.deepEqual(prepareRemotePlacement(state, { ...wall, angle: NaN }), { reason: 'invalid' });
assert.deepEqual(prepareRemotePlacement(state, { kind: 'boost', pos: track.centerline[0], angle: 0, width: 410, arm }),
  { reason: 'invalid' });
assert.deepEqual(prepareRemotePlacement(state, { kind: 'boost', pos: track.centerline[0], angle: 0, width: 140,
  arm: { ...arm, version: 2 } }), { reason: 'not-armed' });
state.cars.A.heldItem = 'slingshot';
assert.deepEqual(prepareRemotePlacement(state, { kind: 'slingshot', pos: { x: 7, y: 540 }, angle: 180, power: 1, arm }),
  { reason: 'out-of-range' });

const trace = tracedPlacement({ x: 200, y: 300 }, { x: 200, y: 420 });
assert.deepEqual(trace, { pos: { x: 200, y: 360 }, angle: 90, length: 120 });
const start = pointAlong(track, 0, 0)!;
assert.ok(dist(start, track.startLine.pos) < 2);
assert.ok(dist(start, pointAlong(track, 100, 0)!) < 1e-6);
assert.ok(Math.abs(trackPercent(track, pointAlong(track, 25, 0)!) - 25) <= 1);
assert.ok(Math.abs(dist(pointAlong(track, 25, 0)!, pointAlong(track, 25, 15)!) - 15) < 1e-6);
assert.equal(lateralTilt(0, null, 0), null);
assert.ok(lateralTilt(0, 30, 0)! > 29);
assert.ok(lateralTilt(30, 0, 90)! > 29);

const globals = globalThis as unknown as Record<string, unknown>;
const events = Object.assign(new EventTarget(), { isSecureContext: true });
const handset = { orientation: { angle: 0 } };
let permissionRequests = 0;
Object.assign(globals, {
  window: events, screen: handset, document: { hidden: false },
  DeviceMotionEvent: class extends Event {},
  DeviceOrientationEvent: class extends Event {
    static async requestPermission(): Promise<string> {
      permissionRequests++;
      return 'granted';
    }
  },
});

/** Envoie une inclinaison portrait à la visée comme le ferait le navigateur. */
function tiltTo(gamma: number): void {
  events.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 0, gamma }));
}

/** Simule un navigateur qui fournit la gravité par l'accéléromètre. */
function gravityAt(x: number | null, y: number, z: number): void {
  events.dispatchEvent(Object.assign(new Event('devicemotion'), { accelerationIncludingGravity: { x, y, z } }));
}

const tilt = new TiltAim(() => {});
const gesture = new PlacementGesture(tilt);
const sling = { kind: 'slingshot', pos: middle, angle: 0, power: .6, arm } as const;

let now = 0;
mock.method(performance, 'now', () => now);
try {
  gesture.begin(middle, wall, state.params);
  assert.equal(gesture.project({ x: 900, y: 600 }, state.params)?.angle, 90);
  assert.equal(gesture.release().action, 'preview');
  gesture.begin(middle, { ...wall, id: 2 }, state.params);
  assert.equal(gesture.release().action, 'confirm');
  gesture.begin(middle, sling, state.params);
  now += 200;
  assert.equal(gesture.release().action, 'manual-aim');

  await tilt.enable();
  assert.equal(permissionRequests, 1);
  tiltTo(0);
  gesture.begin(middle, sling, state.params);
  assert.deepEqual(gesture.release(), { action: 'short-press', before: sling });

  tilt.stop();
  gesture.begin(middle, sling, state.params);
  await tilt.enable();
  assert.equal(permissionRequests, 1, 'la permission accordée vaut aussi pour la reprise du capteur');
  tiltTo(0);
  tiltTo(25);
  const aimed = gesture.projectTilt(state.params)!;
  assert.deepEqual(aimed.pos, middle);
  assert.ok(aimed.angle > aimBearing(middle, state.params), 'incliner à droite change la direction');
  tiltTo(-25);
  gravityAt(-4, 0, 9);
  assert.ok(gesture.projectTilt(state.params)!.angle < aimBearing(middle, state.params), 'incliner à gauche change la direction');
  now += 2_500;
  assert.equal(gesture.release().action, 'confirm', 'une direction immobile reste valide jusqu’au relâchement');

  gesture.begin(middle, sling, state.params);
  handset.orientation.angle = 90;
  now += 200;
  assert.equal(gesture.release().action, 'manual-aim', 'une rotation de l’écran invalide le tir maintenu');
} finally {
  tilt.stop();
  mock.restoreAll();
}

delete globals.DeviceOrientationEvent;
handset.orientation.angle = 0;
await tilt.enable();
try {
  gravityAt(null, 0, 9.8);
  assert.equal(tilt.status, 'waiting', 'les événements sans composante latérale ne valident pas le capteur');
  gravityAt(0, 0, 9.8);
  assert.equal(tilt.status, 'ready');
  gesture.begin(middle, sling, state.params);
  gravityAt(-4, 0, 9);
  assert.ok(gesture.projectTilt(state.params)!.angle > aimBearing(middle, state.params));
  gravityAt(4, 0, 9);
  assert.ok(gesture.projectTilt(state.params)!.angle < aimBearing(middle, state.params));
  gesture.cancel();

  handset.orientation.angle = 90;
  gravityAt(0, 0, 9.8);
  gesture.begin(middle, sling, state.params);
  gravityAt(0, 4, 9);
  assert.ok(gesture.projectTilt(state.params)!.angle > aimBearing(middle, state.params));
  gesture.cancel();
} finally {
  tilt.stop();
}

const camera = { width: 400, height: 240, rotation: 0, scale: .2, center: middle };
const pinch = beginPinch(camera, 1, { x: 100, y: 110 }, { x: 200, y: 110 });
const enlarged = resizePinch(pinch, { x: 60, y: 130 }, { x: 260, y: 130 });
assert.equal(enlarged.zoom, 2);
assert.deepEqual(toWorld({ ...camera, scale: .4, center: enlarged.focus! }, { x: 160, y: 130 }), pinch.anchor);
assert.deepEqual(resizePinch(pinch, { x: 120, y: 110 }, { x: 170, y: 110 }), { zoom: 1, focus: null });
assert.equal(resizePinch(pinch, { x: 0, y: 110 }, { x: 400, y: 110 }).zoom, 3);
assert.deepEqual(boundedFocus({ ...camera, scale: .5, center: { x: -100, y: 1700 } }, 1800, 1080),
  { x: 400, y: 840 });

class TestCanvas extends EventTarget {
  width = 400;
  height = 240;
  clientWidth = this.width;
  clientHeight = this.height;
  readonly rotations: number[] = [];
  private readonly pointers = new Set<number>();

  setAttribute(): void {}
  getContext() {
    return new Proxy({ rotate: (angle: number) => this.rotations.push(angle) }, {
      get: (target, prop) => prop === 'rotate' ? target.rotate : () => {},
    });
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
  setPointerCapture(id: number): void { this.pointers.add(id); }
  hasPointerCapture(id: number): boolean { return this.pointers.has(id); }
  releasePointerCapture(id: number): void { this.pointers.delete(id); }
}

globals.document = { hidden: false, createElement: () => new TestCanvas() };
const phases: MapGesture[] = [];
const draw = () => map.draw(state, null, null, 0);
const map = new PlacementMap(event => phases.push(event), draw);
draw();
assert.equal(map.canvas.dispatchEvent(new Event('contextmenu', { cancelable: true })), false);

/** Rejoue un contact capturé sur le canvas. */
function touch(type: string, pointerId: number, clientX: number): void {
  map.canvas.dispatchEvent(Object.assign(new Event(type),
    { pointerId, clientX, clientY: 120, isPrimary: pointerId === 1, pointerType: 'touch', button: 0 }));
}

touch('pointerdown', 1, 140);
touch('pointerdown', 2, 260);
touch('pointermove', 1, 80);
touch('pointermove', 2, 320);
touch('pointerup', 2, 320);
touch('pointermove', 1, 170);
touch('pointerup', 1, 170);
assert.deepEqual(phases.map(event => event.phase), ['start', 'cancel'], 'le pincement annule la pose pour les deux doigts');
const firstStart = phases[0];
touch('pointerdown', 1, 140);
touch('pointerup', 1, 140);
const zoomedStart = phases[2];
assert.deepEqual(phases.slice(2).map(event => event.phase), ['start', 'end']);
assert.ok(firstStart.phase === 'start' && zoomedStart.phase === 'start');
assert.ok(zoomedStart.point.x > firstStart.point.x, 'la pose suivante utilise le cadre agrandi');
touch('pointerdown', 1, 140);
touch('pointercancel', 1, 140);
assert.deepEqual(phases.slice(-2).map(event => event.phase), ['start', 'cancel']);
map.draw(state, { ...sling, angle: 90 }, { reason: 'out-of-range' }, 0);
assert.equal((map.canvas as unknown as TestCanvas).rotations.at(-1), Math.PI / 2, 'le cap reste visible pour un tir hors portée');
console.log('✓ Pose mobile : conversions, pincement sans pose et visée au relâchement');
