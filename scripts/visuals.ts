/** Visual invariants and rendering smoke checks; actual raster/performance QA runs in the browser. */
import assert from 'node:assert/strict';
import { indexedRotation, pressStroke, steamSample } from '../client-table/IndustrialMotion.js';
import { layoutScenery, sceneryKey, sceneryReservations, standClearance, venuePoint, roadClearance } from '../client-table/SceneryLayout.js';
import { racingGrid } from '../client-table/RaceGrid.js';
import { isInsideTrackRibbon,trackTangent } from '../server/geometry.js';
import { ThemeWorld } from '../client-table/ThemeWorld.js';
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
let recordedText: string[] | null = null;
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
      return (...args: unknown[]) => { if (key === 'fillText' && recordedText) recordedText.push(String(args[0])); finite(args); calls.set(key, (calls.get(key) ?? 0) + 1); };
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
for(const id of ['toy','classic','mayhem'] as const)test(`${id}: scenery reuses its sprites through long animations and reduced motion`,()=>{
  const world=new ThemeWorld(id),ctx=canvas().getContext('2d')!;
  world.draw(ctx,0,false,false);const allocated=calls.get('canvasAllocations');
  for(let i=0;i<160;i++)world.draw(ctx,i*1271,i>120,i>140);
  assert.equal(calls.get('canvasAllocations'),allocated,'live scenery never allocates new canvases');
});
test('grandstands surround the drawing on both long sides and leave road and controls clear',()=>{
  const track=generatePreset(),layout=layoutScenery(track),frames=layout.stands.flat();
  assert.ok(frames.some(f=>f.ny<-.8),'grandstands reach the upper straight');
  assert.ok(frames.some(f=>f.ny>.8),'grandstands reach the lower straight');
  for(const f of frames){assert.ok(roadClearance(venuePoint(f,42),track)>28,'front terraces stay away from the road');assert.ok(roadClearance(venuePoint(f,110),track)>65,'the rear terrace does not overlap another branch');}
  const key=sceneryKey(track),copy=structuredClone(track);copy.centerline[0].x+=100;
  assert.equal(sceneryKey(copy),key,'a temporary pull does not make the venue slide around');
  copy.baseCenterline[0].x+=50;assert.notEqual(sceneryKey(copy),key,'a different circuit rebuilds the venue');
});
for(const id of ['toy','classic','mayhem'] as const)test(`${id}: populated venue stays cached across snapshots and temporary pulls`,()=>{
  const world=new ThemeWorld(id),ctx=canvas().getContext('2d')!,track=generatePreset();world.draw(ctx,0,false,false,track);
  const allocated=calls.get('canvasAllocations');
  for(let i=0;i<80;i++){const copy=structuredClone(track);copy.centerline[3].x+=i;world.draw(ctx,i*313,false,false,copy);}
  assert.equal(world.builds,1,'drawing-based scenery is prepared once');assert.equal(calls.get('canvasAllocations'),allocated,'no new canvases during venue animations');
  const changed=structuredClone(track);changed.baseCenterline[3].x+=25;world.draw(ctx,25000,true,false,changed);assert.equal(world.builds,2,'a new drawing updates the scenery');
});
test('title and creation layouts keep the full prop footprint away from text and drawing surfaces',()=>{
  for(const mode of ['lobby','map'] as const){
    const layout=layoutScenery(generatePreset(),mode);assert.ok(layout.anchors.length>=2,'peripheral decoration remains present');
    for(const p of layout.anchors)for(const r of sceneryReservations(mode)){
      const dx=Math.max(r.x-p.x,0,p.x-r.x-r.w),dy=Math.max(r.y-p.y,0,p.y-r.y-r.h);
      assert.ok(Math.hypot(dx,dy)>p.room,'the whole prop clears the reserved UI rectangle');
    }
  }
});
test('large scenery clears the road, grandstands and other full-sized props, including on a figure eight',()=>{
  for(const track of [generatePreset(),eight]){
    const layout=layoutScenery(track);
    for(const a of layout.anchors){
      assert.ok(roadClearance(a,track)>=a.room+9,'the full prop footprint clears the road');
      assert.ok(standClearance(a,layout.stands)>=a.room+9,'pits and festival stalls clear the spectator strip');
      for(const b of layout.anchors)if(a!==b)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>a.room+b.room,'props do not overlap one another');
    }
  }
});
test('F1 start boxes follow curved approaches and stay inside the road at bends and crossings',()=>{
  let visible=0;
  for(const base of [generatePreset(),eight])for(const index of [0,35,65,100,160,220]){
    const track=structuredClone(base),i=index%track.centerline.length,t=trackTangent(track,i);
    track.startLine={pos:{...track.centerline[i]},normal:{x:-t.y,y:t.x}};
    const boxes=racingGrid(track);visible+=boxes.length;
    for(const points of boxes)for(const p of points)assert.ok(isInsideTrackRibbon(p,track,8),'no paint outside the drivable ribbon');
  }
  assert.ok(visible>30,'the safety check preserves grid boxes on ordinary curves');
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
test('map labels remain P1 and P2 after JSON synchronization and either drawing direction', () => {
  const {view,state,renderer}=scene(),a={x:600,y:540},b={x:1400,y:540};
  state.phase='MAP';state.mapDivider=[a,b];state.mapTargets={A:[a,b],B:[b,a]};
  for(const team of ['A','B'] as const)for(const reverse of [false,true]){
    state.mapStrokes={A:team==='B',B:false};view.state=JSON.parse(JSON.stringify(state));
    const endpoints=view.state!.mapTargets![team],first=endpoints[reverse?1:0];
    view.strokes.set(1,{team,pts:[{...first},{x:1000,y:team==='A'?700:380}],done:false});
    recordedText=[];renderer.render(view);
    assert.equal(recordedText.filter(t=>t==='P1').length,1,'one P1 after crossing the network');
    assert.equal(recordedText.filter(t=>t==='P2').length,1,'one P2 after crossing the network');
    recordedText=null;view.strokes.clear();
  }
});
test('boost deployment and expiry remain finite and immutable across all themes and reduced motion', () => {
  const {view,state,renderer}=scene();state.phase='RACE';
  for(const theme of THEMES)for(const reduced of [false,true]){
    view.theme=theme.id;view.reducedMotion=reduced;
    for(const age of [0,180,449,1400,7200,7999,8001]){
      state.boostGates[0]={id:'lifecycle',team:'A',a:{x:1050,y:510},b:{x:1110,y:330},dir:{x:.948683298,y:.316227766},depth:60,createdAt:1_000_000-age,expiresAt:1_008_000-age};
      const before=JSON.stringify(state);renderer.render(view);assert.equal(JSON.stringify(state),before);
    }
  }
  assert.equal(renderer.stats.trackBuilds,THEMES.length,'object animation never rebuilds a theme deck');
});
test('automatic-pilot HUD and repair feedback render in all themes without changing physics', () => {
  const {view,state,renderer}=scene();state.sessionMode='tangibles-test';
  state.cars.A.disabled=true;state.cars.A.hp=0;
  state.repairPads['A-pilot'].held=true;state.repairProgress.A=.45;
  for(const theme of THEMES)for(const phase of ['READY','RACE','PAUSED'] as const){
    view.theme=theme.id;state.phase=phase;
    const before=JSON.stringify(state);renderer.render(view);assert.equal(JSON.stringify(state),before);
  }
});
test('touch placement shows neutral contact cues and a fixed-size preview in all themes without state mutations',()=>{
  const {view,state,renderer}=scene();state.phase='RACE';state.tangiblePlacementMode='touch';
  for(const theme of THEMES)for(const reduced of [false,true])for(const id of [1,2,3] as const){
    view.theme=theme.id;view.reducedMotion=reduced;state.tangiblePlacement={id,token:1,expiresAt:view.now()+20_000};
    for(const points of [[],[{x:900,y:500}],[{x:900,y:500},{x:900,y:580}]]){
      view.tangibleTouch={points,valid:points.length===2};const before=JSON.stringify(state);renderer.render(view);assert.equal(JSON.stringify(state),before);
    }
  }
  state.tangiblePlacement=null;view.tangibleTouch=null;renderer.render(view);
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
  assert.equal(loadTheme(storage), 'neon');for(const theme of THEMES){saveTheme(storage,theme.id);assert.equal(loadTheme(storage),theme.id);}
  values.set(THEME_STORAGE_KEY, 'unknown'); assert.equal(loadTheme(storage), 'neon');
  assert.equal(loadTheme({ getItem() { throw Error('denied'); } }), 'neon');
  assert.doesNotThrow(() => saveTheme({ setItem() { throw Error('denied'); } }, 'scrap'));
});
console.log(`\n${passed} visual checks passed`);
