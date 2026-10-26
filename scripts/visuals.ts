/** Visual invariants and rendering smoke checks; actual raster/performance QA runs in the browser. */
import assert from 'node:assert/strict';
import { indexedRotation, pressStroke, steamSample } from '../client-table/IndustrialMotion.js';
import { ScrapBackdrop } from '../client-table/ScrapBackdrop.js';
import { TrailBuffer, TRAIL_LIMIT, TRAIL_LIFE_MS, advanceVisualTime } from '../client-table/VisualMotion.js';
import { visibleTrackEdges } from '../client-table/NeonTrack.js';
import { NeonVehicles } from '../client-table/NeonVehicles.js';
import { generatePreset, generate, selfCrossings } from '../server/MapGenerator.js';
import { createInitialState } from '../server/GameRules.js';
import { THEMES, loadTheme, saveTheme, THEME_STORAGE_KEY } from '../client-table/themes.js';
import { createView } from '../client-table/view.js';
import type { TrackGeometry, Vec2 } from '../server/types.js';

let passed = 0;
function test(name: string, run: () => void): void { run(); passed++; console.log(`  ✓ ${name}`); }

test('visual clock freezes in pause and caps hidden-tab gaps without going backwards', () => {
  assert.equal(advanceVisualTime(100, 16, false), 116);
  assert.equal(advanceVisualTime(100, 60_000, true), 100);
  assert.equal(advanceVisualTime(100, 60_000, false), 150);
  assert.equal(advanceVisualTime(100, -50, false), 100);
  assert.equal(advanceVisualTime(100, Number.NaN, false), 100);
});
test('mechanical indexing holds still, advances once per cycle and settles without a discontinuity', () => {
  assert.equal(indexedRotation(300), indexedRotation(1600));
  assert.ok(indexedRotation(3100) > indexedRotation(1600));
  assert.ok(Math.abs(indexedRotation(3700) - Math.PI * 2 / 9) < 1e-10);
  assert.ok(Math.abs(indexedRotation(3699) - indexedRotation(3700)) < .004);
  assert.equal(indexedRotation(4100), indexedRotation(5000));
});
test('presses dwell under load and retract, while steam remains bounded over long sessions', () => {
  assert.equal(pressStroke(0), 0); assert.equal(pressStroke(2500), 1);
  assert.equal(pressStroke(3000), 1); assert.equal(pressStroke(6000), 0);
  for (let t = 0; t < 3_600_000; t += 1171) {
    const stroke = pressStroke(t), puff = steamSample(t, 2, .17);
    assert.ok(stroke >= 0 && stroke <= 1);
    assert.ok(puff.age >= 0 && puff.age < 1); assert.ok(puff.alpha >= 0 && puff.alpha <= .22);
    assert.ok(puff.scale >= .25 && puff.scale <= 1.65);
  }
});
test('trajectory history stays bounded and expires when the car stops', () => {
  const trail = new TrailBuffer();
  for (let i = 0; i < 10_000; i++) trail.add({ x: i, y: i * .2 }, i * 31, i % 5 === 0, true);
  assert.ok(trail.points.length <= TRAIL_LIMIT);
  assert.ok(trail.points[0].t >= trail.points.at(-1)!.t - TRAIL_LIFE_MS);
  trail.add({ x: 9999, y: 1999.8 }, 10_000 * 31 + TRAIL_LIFE_MS + 1, false, false);
  assert.equal(trail.points.length, 0);
});
test('teleports / respawns and time resets never draw a line across the circuit', () => {
  const trail = new TrailBuffer();
  trail.add({ x: 10, y: 10 }, 0, false, true); trail.add({ x: 20, y: 10 }, 40, false, true);
  trail.add({ x: 1000, y: 600 }, 80, true, true);
  assert.deepEqual(trail.points.map(p => [p.x, p.y]), [[1000, 600]]);
  trail.add({ x: 1002, y: 600 }, 0, false, true);
  assert.equal(trail.points.length, 1);
  trail.add({ x: Number.NaN, y: 1 }, 40, false, true);
  assert.equal(trail.points.length, 1);
});
test('paused / duplicate samples add no points, resumed samples preserve their own energy state', () => {
  const trail = new TrailBuffer();
  trail.add({ x: 10, y: 10 }, 100, false, true);
  for (let i = 0; i < 300; i++) trail.add({ x: 10, y: 10 }, 100, true, false);
  assert.equal(trail.points.length, 1);
  trail.add({ x: 20, y: 10 }, 140, true, true);
  assert.deepEqual(trail.points.map(p => p.boosted), [false, true]);
});

function bruteVisibility(track: TrackGeometry): boolean[][] {
  const c = track.centerline, n = c.length, cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(c[i % n].x - c[i - 1].x, c[i % n].y - c[i - 1].y));
  return [track.outerEdge, track.innerEdge].map(edge => edge.map((p, k) => !c.some((q, m) => {
    const gap = Math.abs(cum[m] - cum[k]);
    return Math.min(gap, cum[n] - gap) >= 200 && Math.hypot(p.x - q.x, p.y - q.y) < track.widths[m] / 2 - 1;
  })));
}
const p1 = { x: 560, y: 540 }, p2 = { x: 1360, y: 540 };
const wave = (a: Vec2, b: Vec2) => Array.from({ length: 121 }, (_, i) => {
  const t = i / 120; return { x: a.x + (b.x - a.x) * t, y: 540 - 170 * Math.sin(2 * Math.PI * t) };
});
const eight = generate(wave(p1, p2), wave(p2, p1), p1, p2, p2, p1);
test('spatially indexed lighting keeps exactly the previous visible edges at crossings', () => {
  assert.ok(selfCrossings(eight.centerline).length > 0, 'fixture really crosses itself');
  for (const track of [generatePreset(), eight]) {
    assert.deepEqual(visibleTrackEdges(track), bruteVisibility(track));
    const before = JSON.stringify(track);
    visibleTrackEdges(track);
    assert.equal(JSON.stringify(track), before, 'visual geometry never changes physics geometry');
  }
  assert.ok(visibleTrackEdges(eight).flat().some(v => !v), 'junctions do not get LED barriers');
});
test('lighting visibility stays exact after a deformation and at a translated origin', () => {
  const track = structuredClone(eight);
  for (const pts of [track.centerline, track.outerEdge, track.innerEdge]) {
    pts.forEach((p, i) => { p.x -= 900; p.y += Math.sin(i / 8) * 22 - 300; });
  }
  assert.deepEqual(visibleTrackEdges(track), bruteVisibility(track));
});

// Finite drawing commands, complete canvas shape, and no DOM dependency in the game rules.
const calls = new Map<string, number>();
function finite(args: unknown[]): void { for (const x of args) if (typeof x === 'number') assert.ok(Number.isFinite(x)); }
class TestPath {
  moveTo(...a: number[]): void { finite(a); }
  lineTo(...a: number[]): void { finite(a); }
  closePath(): void {}
}
function canvas(): HTMLCanvasElement {
  calls.set('canvasAllocations', (calls.get('canvasAllocations') ?? 0) + 1);
  const result = { width: 1920, height: 1080 } as HTMLCanvasElement;
  const gradient = { addColorStop(offset: number): void { assert.ok(offset >= 0 && offset <= 1); } };
  const props: Record<string, unknown> = { canvas: result, globalAlpha: 1 };
  const context = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args: number[]) => { finite(args); return gradient; };
      if (key === 'measureText') return (text: string) => ({ width: text.length * 8 });
      return (...args: unknown[]) => { finite(args); calls.set(key, (calls.get(key) ?? 0) + 1); };
    },
    set(target, key: string, value) { if (typeof value === 'number') finite([value]); target[key] = value; return true; },
  });
  result.getContext = (() => context) as never;
  return result;
}
Object.assign(globalThis, { document: { createElement: canvas }, Path2D: TestPath });
const { Renderer } = await import('../client-table/Renderer.js');
test('industrial machinery and vapour reuse their raster parts through motion and reduced frames', () => {
  const backdrop = new ScrapBackdrop(), ctx = canvas().getContext('2d')!;
  backdrop.draw(ctx, 0, false, false);
  const prepared = calls.get('canvasAllocations');
  for (let frame = 0; frame < 120; frame++) backdrop.draw(ctx, frame * 131, frame > 80, frame > 100);
  assert.equal(calls.get('canvasAllocations'), prepared, 'no new canvases in ongoing animation');
});
function scene() {
  const view = createView(() => 1_000_000), state = createInitialState();
  view.state = state; view.visualTime = 200; state.track = generatePreset(); state.trackVersion = 1;
  state.sessionStartAt = 990_000;
  state.cars.A.pos = { ...state.track.centerline[20] }; state.cars.A.speed = 260;
  state.walls = [{ id: 'wall', team: 'B', pos: { x: 800, y: 650 }, angle: 32, lengthPx: 120, disabledUntil: 0 }];
  state.arcs = [{ id: 'arc', team: 'A', pylon1: { x: 700, y: 400 }, pylon2: { x: 900, y: 450 }, disabledUntil: 0 }];
  state.tangibles[1] = { x: .5, y: .4, angle: 0, kind: 'pylon', team: 'A', active: true, dockTeam: null, status: 'placed' };
  state.boostGates = [{ id: 'boost', team: 'A', a: { x: 1000, y: 650 }, b: { x: 1150, y: 650 }, expiresAt: 1_002_000 }];
  state.pickups = [{ id: 1, pos: { x: 950, y: 600 }, kind: 'slingshot', respawnAt: 0 }];
  const surface = canvas(), renderer = new Renderer(surface.getContext('2d')!);
  return { view, state, renderer, surface };
}
test('every phase, both motion preferences and all feedback effects render without changing authoritative state', () => {
  const { view, state, renderer } = scene();
  for (const theme of THEMES) for (const track of [generatePreset(), eight]) for (const reduced of [false, true]) {
    view.theme = theme.id; state.track = track; state.trackVersion++;
    view.reducedMotion = reduced;
    for (const phase of ['LOBBY', 'MAP', 'READY', 'RACE', 'PAUSED', 'RESULT'] as const) {
      state.phase = phase; state.winner = 'A'; state.pausedAt = 1_000_000;
      view.effects = ['pickup', 'itemArmed', 'itemLost', 'stoneImpact', 'stoneHit', 'hit', 'wallDestroyed', 'repairDone', 'boostHit', 'boostGate', 'fall', 'carDisabled', 'checkpoint', 'trackDeformed']
        .map(kind => ({ kind, x: 900, y: 600, team: 'A', start: 0, dur: 900 }));
      const before = JSON.stringify(state);
      renderer.render(view);
      assert.equal(JSON.stringify(state), before);
    }
  }
  assert.ok((calls.get('drawImage') ?? 0) > 0);
});
for (const theme of THEMES) test(`${theme.name}: static / paused frames reuse the deck, deformed geometry updates it and resize invalidates it`, () => {
  const { view, state, renderer, surface } = scene(); view.theme = theme.id; state.phase = 'RACE'; renderer.render(view);
  assert.equal(renderer.stats.trackBuilds, 1);
  for (let i = 0; i < 100; i++) { view.visualTime += 16; state.cars.A.pos.x += 1; renderer.render(view); }
  assert.equal(renderer.stats.trackBuilds, 1);
  assert.ok(renderer.stats.trailPoints <= TRAIL_LIMIT * 2);
  state.deformations = [{ id: 'x' }] as never;
  state.track = structuredClone(state.track!); state.trackVersion++; renderer.render(view);
  assert.equal(renderer.stats.trackBuilds, 2);
  state.track = structuredClone(state.track!); renderer.render(view);
  assert.equal(renderer.stats.trackBuilds, 2, 'same geometry not redrawn for another full network snapshot');
  state.phase = 'PAUSED';
  for (let i = 0; i < 10; i++) { state.track = structuredClone(state.track!); renderer.render(view); }
  assert.equal(renderer.stats.trackBuilds, 2, 'a held deformation is cached through pause snapshots');
  state.phase = 'RACE';
  state.deformations = []; state.track = structuredClone(state.track!); state.trackVersion++; renderer.render(view);
  assert.equal(renderer.stats.trackBuilds, 3, 'final deck restored after deformation');
  state.phase = 'PAUSED'; const points = renderer.stats.trailPoints;
  for (let i = 0; i < 100; i++) renderer.render(view);
  assert.equal(renderer.stats.trackBuilds, 3); assert.equal(renderer.stats.trailPoints, points);
  surface.width = 3840; surface.height = 2160; renderer.render(view);
  assert.equal(renderer.stats.trackBuilds, 4, 'resize updates the cached deck resolution');
});
test('reduced motion and new game clear trajectory history', () => {
  const { view, state, renderer } = scene(); state.phase = 'RACE';
  for (let i = 0; i < 20; i++) { view.visualTime += 33; state.cars.A.pos.x += 2; renderer.render(view); }
  assert.ok(renderer.stats.trailPoints > 0);
  view.reducedMotion = true; renderer.render(view); assert.equal(renderer.stats.trailPoints, 0);
  view.reducedMotion = false; view.visualTime += 40; renderer.render(view);
  state.phase = 'LOBBY'; renderer.render(view); assert.equal(renderer.stats.trailPoints, 0);
});
test('a fallen vehicle stays hidden after its effect expires and becomes visible after repair', () => {
  const vehicles = new NeonVehicles(), c = canvas().getContext('2d')!, car = createInitialState().cars.A;
  car.disabled = true; car.hp = 0;
  const before = calls.get('drawImage') ?? 0;
  vehicles.draw(c, car, 200, 1000, false, [{ kind: 'fall', team: 'A', x: car.pos.x, y: car.pos.y, start: 0, dur: 950 }]);
  const falling = calls.get('drawImage') ?? 0; assert.ok(falling > before);
  vehicles.draw(c, car, 1000, 1000, false, []);
  assert.equal(calls.get('drawImage'), falling, 'the vanished vehicle does not reappear at the fall position');
  car.disabled = false; car.hp = 60;
  vehicles.draw(c, car, 1100, 1000, false, []);
  assert.ok((calls.get('drawImage') ?? 0) > falling, 'the repaired vehicle is visible again');
});
test('changing theme after a fall never reveals the vanished car, but repair still restores it', () => {
  const fallen = new Set<'A' | 'B'>(), neon = new NeonVehicles('neon', fallen), scrap = new NeonVehicles('scrap', fallen);
  const ctx = canvas().getContext('2d')!, car = createInitialState().cars.A;
  car.disabled = true; car.hp = 0;
  neon.draw(ctx, car, 200, 1000, false, [{ kind: 'fall', team: 'A', x: car.pos.x, y: car.pos.y, start: 0, dur: 950 }]);
  const drawn = calls.get('drawImage');
  neon.clearTrails(); scrap.clearTrails();
  scrap.draw(ctx, car, 1100, 1000, false, []);
  neon.draw(ctx, car, 1200, 1000, false, []);
  assert.equal(calls.get('drawImage'), drawn, 'neither theme resurrects a fallen car');
  car.disabled = false; car.hp = 60;
  scrap.draw(ctx, car, 1300, 1000, false, []);
  assert.ok((calls.get('drawImage') ?? 0) > (drawn ?? 0), 'repair restores the vehicle in the selected theme');
  assert.equal(fallen.size, 0);
});
test('switching themes preserves race data, reuses each deck and clears incompatible trails', () => {
  const { view, state, renderer } = scene(); state.phase = 'RACE';
  renderer.render(view); view.visualTime += 40; state.cars.A.pos.x += 2; renderer.render(view);
  assert.ok(renderer.stats.trailPoints > 1);
  const before = JSON.stringify(state);
  view.theme = 'scrap'; renderer.render(view);
  assert.equal(JSON.stringify(state), before); assert.equal(renderer.stats.trackBuilds, 2);
  assert.ok(renderer.stats.trailPoints <= 2, 'old theme trails do not leak across a switch');
  view.theme = 'neon'; renderer.render(view);
  assert.equal(renderer.stats.trackBuilds, 2, 'the previous theme is retained, including its cached road');
  assert.equal(JSON.stringify(state), before);
});
test('theme preference survives reload, tolerates invalid values and unavailable storage', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(loadTheme(storage), 'neon'); saveTheme(storage, 'scrap'); assert.equal(loadTheme(storage), 'scrap');
  values.set(THEME_STORAGE_KEY, 'unknown'); assert.equal(loadTheme(storage), 'neon');
  assert.equal(loadTheme({ getItem() { throw Error('denied'); } }), 'neon');
  assert.doesNotThrow(() => saveTheme({ setItem() { throw Error('denied'); } }, 'scrap'));
});
console.log(`\n${passed} visual checks passed`);
