/**
 * Automated acceptance checks for the server-side rules (run: `npm run test:acceptance`).
 * Covers T-01, T-03 … T-11 without any network or browser; T-02 and the latency
 * figures need the real table and are measured manually (see measures.md).
 */
import assert from 'node:assert/strict';
import { OzMap } from '../client-oz/OzMap.js';
import { rotateWall, wallEndpoints } from '../client-shared/tangibleGeometry.js';
import type { GameState, Team, Vec2, Phase } from '../server/types.js';
import { GameRules, createInitialState } from '../server/GameRules.js';
import type { RulesHost } from '../server/GameRules.js';
import { PhysicsLoop } from '../server/PhysicsLoop.js';
import { config } from '../server/config.js';
import { generate, generatePreset, validateGeometry, generationInfo, selfCrossings } from '../server/MapGenerator.js';
import { nearestOnTrack, slingshotShot } from '../server/geometry.js';
import { mock } from 'node:test';
import { GestureRecognizer } from '../client-table/GestureRecognizer.js';
import { createView } from '../client-table/view.js';

const queue: Array<{ name: string; fn?: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>): void { queue.push({ name, fn }); }
function section(name: string): void { queue.push({ name }); }

// ─── Harness ─────────────────────────────────────────────────────────────────

interface Rig { state: GameState; rules: GameRules; physics: PhysicsLoop; clock: { now: number }; feedback: string[]; phases: Phase[]; advance(ms: number): void }

function rig(seed = 1): Rig {
  const clock = { now: 1_000_000 };
  const state = createInitialState();
  const feedback: string[] = [];
  const phases: Phase[] = [];
  const host: RulesHost = {
    feedback: (kind) => { feedback.push(kind); },
    transition: (phase) => { state.phase = phase; phases.push(phase); },
    broadcastFull: () => {},
  };
  let s = seed;
  const rng = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const rules = new GameRules(state, host, () => clock.now, rng);
  const physics = new PhysicsLoop(state, rules, () => {}, () => clock.now);
  const advance = (ms: number) => {
    const dt = 1 / config.physicsHz;
    for (let t = 0; t < ms; t += dt * 1000) { clock.now += dt * 1000; physics.step(clock.now, dt); }
  };
  return { state, rules, physics, clock, feedback, phases, advance };
}

/** Rig already in RACE on the preset circuit, countdown elapsed. */
function raceRig(): Rig {
  const r = rig();
  r.state.phase = 'RACE';
  r.rules.startRace(generatePreset());
  r.advance(3100);
  return r;
}

const msg = <T extends object>(o: T) => ({ t: 0, ...o });

/**
 * A slingshot message that lands on `target`: the stone flies from the pouch through
 * the fork, so the fork sits `range` px before the target and the pouch `pull` px behind it.
 */
function aim(target: Vec2, pull: number): { anchor: Vec2; pouch: Vec2 } {
  const { range } = slingshotShot({ x: 0, y: 0 }, { x: -pull, y: 0 }, config);
  const anchor = { x: target.x - range, y: target.y };
  return { anchor, pouch: { x: anchor.x - pull, y: anchor.y } };
}

function randomStroke(p1: Vec2, p2: Vec2, rnd: () => number): Vec2[] {
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  const off = (rnd() * 2 - 1) * 0.5 * len;
  const c = { x: mx - (dy / len) * off, y: my + (dx / len) * off };
  const pts: Vec2[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    pts.push({
      x: (1 - t) ** 2 * p1.x + 2 * (1 - t) * t * c.x + t * t * p2.x + (rnd() - 0.5) * 6,
      y: (1 - t) ** 2 * p1.y + 2 * (1 - t) * t * c.y + t * t * p2.y + (rnd() - 0.5) * 6,
    });
  }
  return pts;
}

// ─── T-01 ────────────────────────────────────────────────────────────────────

section('T-01 · MapGenerator');
test('100 random stroke pairs → valid circuit, no self-intersection, each < 3 s', () => {
  let s = 42;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  let worst = 0;
  const methods: Record<string, number> = {};
  for (let i = 0; i < 100; i++) {
    const j = () => (rnd() * 2 - 1) * 150;
    const A1 = { x: 520 + j(), y: 400 + j() * 0.5 }, A2 = { x: 1400 + j(), y: 680 + j() * 0.5 };
    const B1 = { x: 1400 + j(), y: 400 + j() * 0.5 }, B2 = { x: 520 + j(), y: 680 + j() * 0.5 };
    const t0 = performance.now();
    const geo = generate(randomStroke(A1, A2, rnd), randomStroke(B1, B2, rnd), A1, A2, B1, B2);
    worst = Math.max(worst, performance.now() - t0);
    methods[generationInfo.method] = (methods[generationInfo.method] ?? 0) + 1;
    assert.ok(validateGeometry(geo), `generation ${i} produced an invalid circuit`);
    assert.equal(geo.centerline.length, 256);
    assert.equal(geo.checkpoints.length, 8);
    assert.equal(geo.pickupPositions.length, 4);
    assert.equal(geo.startPositions.length, 2);
    for (const w of geo.widths) assert.ok(w >= 90 && w <= 170, `width ${w}`);
    // Free of the corner HUD panels (R-22)
    for (const p of geo.outerEdge.concat(geo.innerEdge)) assert.ok(p.y > 215 && p.y < 865, `edge y=${p.y}`);
  }
  assert.ok(worst < 3000, `worst generation ${worst.toFixed(0)} ms`);
  console.log(`      worst case ${worst.toFixed(0)} ms; strategies: ${JSON.stringify(methods)}`);
});

/** Smooth half-stroke from a to b bulging `amp` px sideways (positive = towards +y when a→b goes right). */
function bulge(a: Vec2, b: Vec2, amp: number, n = 60): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + amp * Math.sin(Math.PI * t) });
  }
  return out;
}
const distToLoop = (p: Vec2, loop: Vec2[]): number => Math.min(...loop.map(q => Math.hypot(p.x - q.x, p.y - q.y)));

test('issue #3: two ~100 px half-strokes give a circuit through both halves, not the preset', () => {
  const P1 = { x: 560, y: 540 }, P2 = { x: 1360, y: 540 };
  for (const amp of [60, 100, 150, 220]) {
    const A = bulge(P1, P2, amp), B = bulge(P2, P1, -amp);
    const geo = generate(A, B, P1, P2, P2, P1);
    assert.equal(generationInfo.method, 'closed loop union', `amplitude ${amp}`);
    assert.ok(!geo.preset && validateGeometry(geo), `amplitude ${amp}`);
    // the circuit stays the drawing: a half is only bulged when the loop would otherwise
    // be undrivable, and then no further than needed (never more than the 150 px minimum)
    const ys = geo.centerline.map(p => p.y);
    const need = Math.max(amp, 90);
    assert.ok(Math.min(...ys) >= 540 - need - 15 && Math.max(...ys) <= 540 + need + 15,
      `amplitude ${amp}: ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)}`);
    // the middle of each drawn half is still on the circuit
    const apexA = A[30], apexB = B[30];
    const tol = Math.max(0, need - amp) + 25;
    assert.ok(distToLoop(apexA, geo.centerline) <= tol, `amplitude ${amp}: half A ${distToLoop(apexA, geo.centerline).toFixed(0)} px away`);
    assert.ok(distToLoop(apexB, geo.centerline) <= tol, `amplitude ${amp}: half B ${distToLoop(apexB, geo.centerline).toFixed(0)} px away`);
    // the start line is on P1's side
    assert.ok(Math.hypot(geo.startLine.pos.x - P1.x, geo.startLine.pos.y - P1.y) < 160);
  }
});
test('issue #3: 100 random drawings with shared anchors never fall back to the preset', () => {
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  for (let i = 0; i < 100; i++) {
    const len = 360 + rnd() * 540, ang = (rnd() - 0.5) * 0.8;
    const c = { x: 760 + rnd() * 400, y: 440 + rnd() * 200 };
    const P1 = { x: c.x - Math.cos(ang) * len / 2, y: c.y - Math.sin(ang) * len / 2 };
    const P2 = { x: c.x + Math.cos(ang) * len / 2, y: c.y + Math.sin(ang) * len / 2 };
    const half = (a: Vec2, b: Vec2, amp: number): Vec2[] => {
      const L = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
      return Array.from({ length: 61 }, (_, k) => {
        const t = k / 60, d = amp * Math.sin(Math.PI * t) * (1 + 0.15 * Math.sin(6 * t)) + (rnd() - 0.5) * 4;
        return { x: a.x + (b.x - a.x) * t + nx * d, y: a.y + (b.y - a.y) * t + ny * d };
      });
    };
    const A = half(P1, P2, 70 + rnd() * 170), B = half(P2, P1, 70 + rnd() * 170);
    const geo = generate(A, B, P1, P2, P2, P1);
    assert.equal(generationInfo.method, 'closed loop union', `drawing ${i}`);
    assert.ok(validateGeometry(geo) && !geo.preset, `drawing ${i}`);
  }
});
test('issue #3: an undrivable drawing is smoothed, never replaced by the preset', () => {
  const P1 = { x: 560, y: 540 }, P2 = { x: 1360, y: 540 };
  // A: a loop that crosses itself ; B: pinched against the divider in the middle, with a dip across it
  const A = bulge(P1, P2, 170);
  const c = A[30];
  const loop = Array.from({ length: 25 }, (_, k) => {
    const th = (k / 24) * 2 * Math.PI;
    return { x: c.x + 45 * Math.sin(th), y: c.y - 45 * (1 - Math.cos(th)) };
  });
  const strokeA = [...A.slice(0, 30), ...loop, ...A.slice(31)];
  const strokeB = bulge(P2, P1, -170).map((p, i) => (i > 24 && i < 36 ? { x: p.x, y: 540 + (i % 2 ? 6 : -8) } : p));
  const geo = generate(strokeA, strokeB, P1, P2, P2, P1);
  assert.notEqual(generationInfo.method, 'preset');
  assert.ok(!geo.preset && validateGeometry(geo));
  // still the players' circuit: both halves are close to it
  const ds = [...strokeA, ...strokeB].map(p => distToLoop(p, geo.centerline));
  const mean = ds.reduce((a, d) => a + d, 0) / ds.length;
  assert.ok(mean < 60, `mean distance to the drawing ${mean.toFixed(0)} px`);
});
test('self-crossing drawings: a figure of eight and a loop-de-loop are kept as drawn', () => {
  const P1 = { x: 560, y: 540 }, P2 = { x: 1360, y: 540 };
  const wave = (a: Vec2, b: Vec2, amp: number): Vec2[] =>
    Array.from({ length: 121 }, (_, i) => { const t = i / 120; return { x: a.x + (b.x - a.x) * t, y: 540 + amp * Math.sin(2 * Math.PI * t) }; });
  // each half crosses the divider once: the two halves, hooked on P1 and P2, make an 8
  const A = wave(P1, P2, -170), B = wave(P2, P1, -170);
  const r = rig();
  r.rules.enterMap('pc');
  r.rules.onMapDivider(msg({ type: 'MapDivider' as const, a: P1, b: P2 }));
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'A' as Team, pts: A }));
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'B' as Team, pts: B }));
  assert.ok(r.state.mapStrokes.A && r.state.mapStrokes.B, 'strokes crossing the divider are accepted');

  const geo = generate(A, B, P1, P2, P2, P1);
  assert.equal(generationInfo.method, 'closed loop union');
  assert.ok(!geo.preset && validateGeometry(geo));
  const crossings = selfCrossings(geo.centerline);
  assert.equal(crossings.length, 1, 'the circuit crosses itself once');
  assert.ok(crossings[0].sin >= 0.64, 'a clean crossing');
  // fidelity: the circuit is the 8 that was drawn
  const ds = [...A, ...B].map(p => distToLoop(p, geo.centerline));
  assert.ok(ds.reduce((a, d) => a + d, 0) / ds.length < 25);
  // start line and checkpoints stay clear of the junction (the other branch would trigger them)
  for (const cp of [geo.startLine, ...geo.checkpoints]) {
    assert.ok(Math.hypot(cp.pos.x - crossings[0].at.x, cp.pos.y - crossings[0].at.y) > 130, 'checkpoint away from the junction');
  }
  // …and a lap can be completed on it
  const race = rig();
  race.state.phase = 'RACE';
  race.rules.startRace(geo);
  race.advance(3100);
  const car = race.state.cars.A;
  const n = geo.centerline.length;
  const startIdx = nearestOnTrack(geo.startLine.pos, geo).index;
  for (let k = 0; k <= n + 6; k++) {
    const p = geo.centerline[(startIdx - 3 + k + n) % n];
    const prev = { ...car.pos };
    car.pos = { x: p.x, y: p.y };
    race.rules.afterMove('A', prev, race.clock.now);
  }
  assert.equal(car.lap, 1);

  // and a car actually driving it goes through the junction (twice per lap) without falling
  const drive = rig();
  drive.state.phase = 'RACE';
  drive.rules.startRace(geo);
  drive.advance(3100);
  const d = drive.state.cars.A;
  let crossedJunction = 0, wasIn = false;
  for (let step = 0; step < 60 * 40 && d.lap < 1; step++) { // 40 s at most
    const idx = nearestOnTrack(d.pos, geo).index;
    const target = geo.centerline[(idx + 12) % n];
    let err = Math.atan2(target.y - d.pos.y, target.x - d.pos.x) - d.angle;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    drive.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: Math.max(-1, Math.min(1, err * 3)) }));
    drive.advance(1000 / 60);
    const inJ = Math.hypot(d.pos.x - crossings[0].at.x, d.pos.y - crossings[0].at.y) < 60;
    if (inJ && !wasIn) crossedJunction++;
    wasIn = inJ;
    assert.equal(d.disabled, false, `fell off the track at step ${step}`);
  }
  assert.equal(d.lap >= 1, true, 'completed a lap');
  assert.ok(crossedJunction >= 2, `went through the junction ${crossedJunction} times`);
});
test('self-crossing drawings: a loop drawn in a half is kept (blown up to a drivable size)', () => {
  const P1 = { x: 560, y: 540 }, P2 = { x: 1360, y: 540 };
  const base = bulge(P1, P2, 150, 160);
  // loop-de-loop going away from the divider: prolate trochoid inserted at x ≈ 960
  const at = 80, c0 = base[at];
  const loop = Array.from({ length: 61 }, (_, k) => {
    const th = -Math.PI + (k / 60) * 2 * Math.PI;
    return { x: c0.x + 20 * th - 60 * Math.sin(th), y: c0.y + 60 * (1 + Math.cos(th)) };
  });
  const A = [...base.slice(0, at - 7), ...loop, ...base.slice(at + 7)];
  const B = bulge(P2, P1, -150, 160);
  const geo = generate(A, B, P1, P2, P2, P1);
  assert.equal(generationInfo.method, 'closed loop union');
  assert.ok(validateGeometry(geo) && !geo.preset);
  assert.ok(selfCrossings(geo.centerline).length >= 1, 'the loop crosses the rest of the track');
  const apex = loop[30];
  assert.ok(distToLoop(apex, geo.centerline) < 90, `the loop is still there (${distToLoop(apex, geo.centerline).toFixed(0)} px from its apex)`);
});
test('the circuit is the drawing: ~1 px away from the anchors, only the two tips are rounded', () => {
  let s = 11;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  let farMeans: number[] = [];
  for (let i = 0; i < 60; i++) {
    // drawn inside the play area (outside it, the circuit is moved back in: that is the only change)
    const len = 400 + rnd() * 450, c = { x: 760 + rnd() * 400, y: 500 + rnd() * 80 };
    const room = Math.min(c.y - 305, 775 - c.y);
    const P1 = { x: c.x - len / 2, y: c.y }, P2 = { x: c.x + len / 2, y: c.y };
    const A = bulge(P1, P2, 100 + rnd() * (room - 100)), B = bulge(P2, P1, -(100 + rnd() * (room - 100)));
    const geo = generate(A, B, P1, P2, P2, P1);
    assert.equal(generationInfo.method, 'closed loop union');
    const far = [...A, ...B].filter(p => Math.hypot(p.x - P1.x, p.y - P1.y) > 140 && Math.hypot(p.x - P2.x, p.y - P2.y) > 140);
    const ds = far.map(p => distToLoop(p, geo.centerline));
    // (distToLoop uses the 256 vertices: the polyline lies within a few px of them)
    assert.ok(Math.max(...ds) < 14, `drawing ${i}: ${Math.max(...ds).toFixed(0)} px from the circuit`);
    farMeans = farMeans.concat(ds.reduce((a, d) => a + d, 0) / ds.length);
  }
  assert.ok(farMeans.reduce((a, d) => a + d, 0) / farMeans.length < 5);
});
test('issue #3: the predefined circuit is flagged, a circuit built on the drawing is not', () => {
  assert.equal(generatePreset().preset, true);
  const fallback = generate([{ x: 0, y: 0 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 5, y: 5 }]);
  assert.equal(fallback.preset, true);
  const P1 = { x: 600, y: 540 }, P2 = { x: 1320, y: 540 };
  assert.equal(generate(bulge(P1, P2, 160), bulge(P2, P1, -160), P1, P2, P2, P1).preset, undefined);
});
test('invalid strokes fall back to the preset circuit', () => {
  const geo = generate([{ x: 0, y: 0 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 5, y: 5 }]);
  assert.ok(validateGeometry(geo));
});

// ─── MAP phase protocol ──────────────────────────────────────────────────────

section('MAP phase');
test('two shared divider contacts then two half-strokes wait for confirmation before RACE', () => {
  const r = rig();
  r.state.phase = 'LOBBY';
  r.rules.enterMap();
  assert.equal(r.state.phase, 'MAP');
  assert.equal(r.state.mapTargets, null);
  r.rules.onMapDivider(msg({ type: 'MapDivider' as const, a: { x: 480, y: 540 }, b: { x: 1440, y: 540 } }));
  const t = r.state.mapTargets!;
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'A' as Team, pts: [t.A[0], { x: t.A[0].x + 10, y: t.A[0].y }] }));
  assert.ok(r.feedback.includes('mapWrongEnd'));
  assert.equal(r.state.mapStrokes.A, false);
  const aStroke = [t.A[0], { x: 700, y: 680 }, { x: 1100, y: 760 }, t.A[1]];
  const bStroke = [t.B[0], { x: 1220, y: 390 }, { x: 820, y: 320 }, t.B[1]];
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'A' as Team, pts: aStroke }));
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'B' as Team, pts: bStroke }));
  assert.equal(r.state.phase, 'MAP', 'players explicitly validate the completed drawing');
  r.rules.onGenerateTrack();
  // generation is asynchronous (Promise)
  return new Promise<void>((resolve, reject) => setTimeout(() => {
    try {
      assert.equal(r.state.phase, 'READY');
      assert.ok(r.state.track);
      r.rules.beginRace();
      assert.equal(r.state.phase, 'RACE');
      resolve();
    } catch (e) { reject(e); }
  }, 100));
});

test('issue #3: a refused divider is announced (too short, outside the table area)', () => {
  const asks = (a: Vec2, b: Vec2) => {
    const r = rig();
    r.rules.enterMap();
    r.rules.onMapDivider(msg({ type: 'MapDivider' as const, a, b }));
    return r;
  };
  let r = asks({ x: 700, y: 540 }, { x: 900, y: 540 });
  assert.equal(r.state.mapDivider, null);
  assert.deepEqual(r.feedback, ['dividerTooShort']);
  r = asks({ x: 100, y: 100 }, { x: 1000, y: 540 });
  assert.equal(r.state.mapDivider, null);
  assert.deepEqual(r.feedback, ['dividerOutOfZone']);
  r = asks({ x: 600, y: 540 }, { x: 1400, y: 900 });
  assert.deepEqual(r.feedback, ['dividerOutOfZone']);
  r = asks({ x: 600, y: 540 }, { x: 960, y: 540 }); // exactly 360 px
  assert.ok(r.state.mapDivider);
  assert.deepEqual(r.feedback, []);
});

/** Table client driven with synthetic pointer events and fake timers (no browser). */
function tableClient(mode: 'table' | 'pc') {
  const handlers: Record<string, (e: unknown) => void> = {};
  const canvas = {
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
    setPointerCapture: () => {},
  } as unknown as HTMLCanvasElement;
  const view = createView(() => 0);
  const state = createInitialState();
  state.phase = 'MAP';
  state.mapMode = mode;
  view.state = state;
  const sent: Array<{ type: string } & Record<string, unknown>> = [];
  const gestures = new GestureRecognizer(canvas, view, m => sent.push(m));
  const ev = (id: number, p: Vec2, type: string) => ({ type, pointerId: id, clientX: p.x, clientY: p.y, timeStamp: 0, preventDefault() {} });
  return {
    view, sent, gestures,
    down: (id: number, p: Vec2) => handlers.pointerdown(ev(id, p, 'pointerdown')),
    move: (id: number, p: Vec2) => handlers.pointermove(ev(id, p, 'pointermove')),
    up: (id: number, p: Vec2) => handlers.pointerup(ev(id, p, 'pointerup')),
    cancel: (id: number, p: Vec2) => handlers.pointercancel(ev(id, p, 'pointercancel')),
    dividers: () => sent.filter(m => m.type === 'MapDivider'),
  };
}
test('guided MAP: P1 survives a lifted finger and a long wait, on table and PC', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    for (const mode of ['table', 'pc'] as const) {
      const c = tableClient(mode);
      const p1 = { x: 600, y: 540 }, p2 = { x: 1400, y: 540 };
      c.down(1, p1); c.up(1, p1);
      mock.timers.tick(60_000);
      assert.deepEqual(c.view.pendingDivider, [p1]);
      c.down(2, { x: 650, y: 540 }); c.up(2, { x: 650, y: 540 });
      assert.equal(c.dividers().length, 0);
      assert.match(c.view.mapNotice!.text, /360/);
      assert.deepEqual(c.view.pendingDivider, [p1], 'refusing P2 preserves P1');
      c.down(3, { x: 60, y: 60 }); c.up(3, { x: 60, y: 60 });
      assert.match(c.view.mapNotice!.text, /zone/);
      assert.deepEqual(c.view.pendingDivider, [p1]);
      c.down(4, p2); c.up(4, p2);
      assert.equal(c.dividers().length, 1);
      assert.deepEqual(c.dividers()[0].a, p1);
      assert.deepEqual(c.dividers()[0].b, p2);
      c.down(5, { x: 1000, y: 500 });
      assert.equal(c.dividers().length, 1, 'extra contacts cannot replace a pending divider');
    }
  } finally { mock.timers.reset(); }
});

test('guided MAP: held placement contacts never turn into drawing contacts', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const c = tableClient('table');
    const p1 = { x: 600, y: 540 }, p2 = { x: 1400, y: 540 };
    c.down(1, p1); c.down(2, p2);
    assert.equal(c.dividers().length, 1);
    const state = c.view.state!;
    state.mapDivider = [p1, p2];
    state.mapTargets = { A: [p1, p2], B: [p2, p1] };
    c.move(1, { x: 800, y: 740 }); c.up(1, p2); c.up(2, p2);
    assert.equal(c.view.strokes.size, 0);
    assert.equal(c.sent.filter(m => m.type === 'StrokeDraw').length, 0);
  } finally { mock.timers.reset(); }
});

test('guided MAP: only active start works, concurrent fingers and in-flight duplicates are blocked', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    for (const mode of ['table', 'pc'] as const) {
      const c = tableClient(mode);
      const state = c.view.state!;
      const p1 = { x: 600, y: 540 }, p2 = { x: 1400, y: 540 };
      state.mapDivider = [p1, p2]; state.mapTargets = { A: [p1, p2], B: [p2, p1] };
      c.down(1, p2); c.up(1, p1);
      assert.equal(c.view.strokes.size, 0, 'rose cannot start first');
      assert.match(c.view.mapNotice!.text, /cyan trace en premier/);
      c.down(1, { x: 600, y: 636 }); c.up(1, p2);
      assert.equal(c.view.strokes.size, 0, 'outside the visible 95 px ring');
      c.down(1, { x: 600, y: 635 });
      c.move(1, { x: 950, y: 740 });
      c.down(2, p1); c.move(2, { x: 900, y: 680 }); c.up(2, p2);
      assert.equal(c.view.strokes.size, 1, 'second finger cannot replace first');
      c.up(1, p2);
      const sent = c.sent.filter(m => m.type === 'StrokeDraw');
      assert.equal(sent.length, 1);
      assert.deepEqual((sent[0].pts as Vec2[]).at(-1), p2, 'release position is included');
      c.down(1, p1); c.up(1, p2);
      assert.equal(c.sent.filter(m => m.type === 'StrokeDraw').length, 1, 'wait for server validation');
      state.mapStrokes.A = true;
      c.down(1, p1); c.up(1, p2);
      assert.match(c.view.mapNotice!.text, /cyan.*déjà validé/);
      c.down(1, p2); c.move(1, { x: 950, y: 340 }); c.up(1, p1);
      assert.deepEqual(c.sent.filter(m => m.type === 'StrokeDraw').map(m => m.creator), ['A', 'B']);
      assert.deepEqual([...c.view.strokes.values()].map(s => s.team), ['A', 'B'], 'same mouse id keeps both halves');
    }
  } finally { mock.timers.reset(); }
});

test('guided MAP: early release and cancellation can be retried without advancing', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const c = tableClient('table');
    const p1 = { x: 600, y: 540 }, p2 = { x: 1400, y: 540 };
    c.view.state!.mapDivider = [p1, p2];
    c.view.state!.mapTargets = { A: [p1, p2], B: [p2, p1] };
    c.down(1, p1); c.move(1, { x: 900, y: 720 }); c.up(1, { x: 1000, y: 700 });
    assert.match(c.view.mapNotice!.text, /Rejoignez P2/);
    assert.ok([...c.view.strokes.values()][0].rejectedAt !== undefined);
    c.down(1, p1); c.move(1, p2); c.cancel(1, p2);
    assert.match(c.view.mapNotice!.text, /interrompu/);
    assert.equal(c.sent.filter(m => m.type === 'StrokeDraw').length, 0);
    c.down(1, p1); c.move(1, { x: 900, y: 720 });
    c.gestures.releaseAll();
    c.down(1, p1); c.move(1, { x: 900, y: 720 }); c.up(1, p2);
    assert.equal(c.sent.filter(m => m.type === 'StrokeDraw').length, 1, 'retry after lost connection/hidden tab');
  } finally { mock.timers.reset(); }
});

test('guided MAP: server enforces order, endpoints, locked halves and final confirmation', async () => {
  const r = rig();
  r.rules.enterMap();
  const p1 = { x: 480, y: 540 }, p2 = { x: 1440, y: 540 };
  r.rules.onMapDivider(msg({ type: 'MapDivider', a: p1, b: p2 }));
  const a = [p1, { x: 700, y: 700 }, { x: 1100, y: 740 }, p2];
  const b = [p2, { x: 1200, y: 380 }, { x: 800, y: 340 }, p1];
  const submit = (creator: Team, pts: Vec2[]) => r.rules.onStrokeDraw(msg({ type: 'StrokeDraw', creator, pts }));
  submit('B', b);
  assert.equal(r.feedback.at(-1), 'mapWaitCyan');
  assert.equal(r.state.mapStrokes.B, false);
  submit('A', [...a].reverse());
  assert.equal(r.feedback.at(-1), 'mapWrongStart');
  submit('A', [p1, ...a.slice(1, -1), { x: 1440, y: 636 }]);
  assert.equal(r.feedback.at(-1), 'mapWrongEnd');
  submit('A', [p1, { x: 650, y: 350 }, { x: 800, y: 340 }, { x: 1000, y: 340 }, { x: 1200, y: 350 }, p2]);
  assert.equal(r.feedback.at(-1), 'mapWrongSide');
  assert.equal(r.state.mapStrokes.A, false);
  submit('A', a);
  assert.equal(r.feedback.at(-1), 'mapAccepted');
  assert.equal(r.state.mapStrokes.A, true);
  r.rules.onGenerateTrack();
  await Promise.resolve();
  assert.equal(r.state.phase, 'MAP', 'one accepted half is not enough');
  submit('A', a);
  assert.equal(r.feedback.at(-1), 'mapLocked');
  submit('B', [...b].reverse());
  assert.equal(r.feedback.at(-1), 'mapWrongStart');
  submit('B', b);
  assert.equal(r.feedback.at(-1), 'mapAccepted');
  assert.deepEqual(r.state.mapStrokes, { A: true, B: true });
  assert.equal(r.state.phase, 'MAP', 'two halves still require confirmation');
  submit('B', b);
  assert.equal(r.feedback.at(-1), 'mapLocked');
  r.rules.onGenerateTrack();
  await Promise.resolve();
  assert.equal(r.state.phase, 'READY');
  r.rules.resetToLobby();
  r.rules.enterMap();
  assert.deepEqual(r.state.mapStrokes, { A: false, B: false });
  assert.equal(r.state.mapDivider, null);
});

// ─── Physics ─────────────────────────────────────────────────────────────────

section('Vehicle & HP');
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
test('steering turns the car', () => {
  const r = raceRig();
  const a0 = r.state.cars.A.angle;
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 1 }));
  r.advance(500);
  assert.notEqual(r.state.cars.A.angle, a0);
});
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
test('tactile and keyboard steering receive the same configured small turn gain', () => {
  const r = raceRig();
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 1 }));
  r.rules.onPilotInput('B', msg({ type: 'PilotInput' as const, team: 'B' as Team, throttle: 1, steer: 1 }));
  assert.equal(r.rules.inputs.A.steer, config.steerGain);
  assert.equal(r.rules.inputs.B.steer, config.steerGain);
});
test('central drive mode switches all cars to a held-pedal acceleration model', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  r.rules.toggleDriveMode();
  assert.equal(r.state.driveMode, 'pedal');
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
test('pause preserves the armed gesture window and temporary obstacle lifetimes', () => {
  const r = raceRig(); r.state.cars.A.heldItem = 'boost'; r.rules.onPower('A');
  r.state.walls.push({ id: 'temporary', team: 'A', pos: { x: 900, y: 500 }, angle: 0, lengthPx: 120, disabledUntil: 0, expiresAt: r.clock.now + 8000 });
  const armAt = r.state.cars.A.itemArmExpiry, wallAt = r.state.walls[0].expiresAt!;
  r.rules.togglePause(); r.advance(8000); const duration = r.clock.now - r.state.pausedAt;
  r.rules.togglePause();
  assert.equal(r.state.cars.A.itemArmExpiry, armAt + duration);
  assert.equal(r.state.walls[0].expiresAt, wallAt + duration);
  r.rules.expire(r.clock.now); assert.equal(r.state.cars.A.itemArmed, true);
});
test('pause keeps the elastic projectile at the same point of its flight when resumed', () => {
  const r = raceRig(); r.state.cars.A.heldItem = 'slingshot'; r.rules.onPower('A');
  r.rules.onSlingshot(msg({ type: 'Slingshot', team: 'A', ...aim(r.state.cars.B.pos, 120) }));
  r.clock.now += 200;
  const stone = r.state.stones[0];
  const fraction = () => (r.clock.now - stone.launchedAt) / (stone.impactAt - stone.launchedAt);
  const before = fraction();
  r.rules.togglePause(); r.advance(3000); r.rules.togglePause();
  assert.ok(Math.abs(fraction() - before) < 1e-9, 'the projectile resumes without jumping forward');
});
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
test('victory at lapsToWin → RESULT', () => {
  const r = raceRig();
  r.state.cars.B.lap = config.lapsToWin;
  r.advance(50);
  assert.equal(r.state.phase, 'RESULT');
  assert.equal(r.state.winner, 'B');
});
test('timeout → RESULT, leader wins', () => {
  const r = raceRig();
  r.state.cars.A.checkpointIndex = 4;
  r.state.sessionStartAt = r.clock.now - config.sessionMaxSeconds * 1000 - 1;
  r.advance(50);
  assert.equal(r.state.phase, 'RESULT');
  assert.equal(r.state.winner, 'A');
});

// ─── Pylons: T-03, T-04, T-10 ────────────────────────────────────────────────

section('Tangibles · charge, placement and electrical pairs');
function charge(r: Rig, id: 1 | 2 | 3 | 4, team: Team, kind: 'wall' | 'pylon' = 'wall') {
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id, team, kind, action: 'dock' }));
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id, team, action: 'activate' }));
}
function placeBlocking(r: Rig, ids: number[]) {
  const p = r.state.cars.A.pos;
  ids.forEach((id, i) => {
    charge(r, id as 1, id <= 2 ? 'A' : 'B');
    r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: id as 1, x: (p.x + i * 150) / config.logicalWidth, y: p.y / config.logicalHeight, angle: 0 }));
  });
}
test('POWER arms pickups only; inactive tangibles can be positioned, only Oz activates them', () => {
  const r = raceRig();
  r.state.cars.B.heldItem = 'boost';
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, team: 'B', kind: 'wall', action: 'configure' }));
  r.rules.onPower('A'); r.rules.onPower('B');
  assert.equal(r.state.cars.B.itemArmed, true);
  assert.equal(r.state.tangibles[1].active, false);
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 1, x: .4, y: .5, angle: 0 }));
  assert.equal(r.state.tangibles[1].status, 'placed'); assert.equal(r.state.walls.length, 0);
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'activate' }));
  assert.equal(r.state.walls[0].team, 'B', 'id does not impose ownership');
  const placed = { ...r.state.tangibles[1] };
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'deactivate' }));
  assert.equal(r.state.walls.length, 0);
  assert.deepEqual(r.state.tangibles[1], { ...placed, active: false });
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'activate' }));
  assert.equal(r.state.walls[0].pos.x, placed.x * config.logicalWidth, 'reactivation preserves placement');
});
test('T-03 hostile wall: damage then invulnerability; own wall leaves own car safe', () => {
  const r = raceRig();
  placeBlocking(r, [3]);
  r.rules.afterMove('A', r.state.cars.A.pos, r.clock.now);
  assert.equal(r.state.cars.A.hp, config.hpMax - config.dmgWall);
  r.state.cars.A.pos = { ...r.state.walls[0].pos };
  r.rules.afterMove('A', r.state.cars.A.pos, r.clock.now);
  assert.equal(r.state.cars.A.hp, config.hpMax - config.dmgWall);
  const own = raceRig(); placeBlocking(own, [1]);
  own.rules.afterMove('A', own.state.cars.A.pos, own.clock.now);
  assert.equal(own.state.cars.A.hp, config.hpMax);
});
test('T-04 explicit allied pillars form an arc, slow and damage the opponent', () => {
  const r = raceRig(), p = { ...r.state.cars.A.pos };
  charge(r, 3, 'B', 'pylon'); charge(r, 4, 'B', 'pylon');
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 3, x: (p.x - 100) / config.logicalWidth, y: p.y / config.logicalHeight, angle: 0 }));
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 4, x: (p.x + 100) / config.logicalWidth, y: p.y / config.logicalHeight, angle: 0 }));
  assert.equal(r.state.arcs.length, 1); assert.equal(r.state.walls.length, 0);
  r.state.cars.A.speed = 300; r.rules.afterMove('A', p, r.clock.now);
  assert.equal(r.state.cars.A.hp, config.hpMax - config.dmgArc);
  assert.equal(r.state.cars.A.speed, 300 * config.arcSlowFactor);
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 4, x: .9, y: .5, angle: 0 }));
  assert.equal(r.state.arcs.length, 0, 'moving outside range breaks arc');
  assert.equal(r.state.walls.length, 0, 'unpaired pillars never become walls');
});
test('walls retain type at close range; redocking removes effect and charge', () => {
  const r = raceRig(); charge(r, 1, 'A'); charge(r, 2, 'A');
  for (const id of [1, 2] as const) r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id, x: .4 + id * .04, y: .5, angle: 15 }));
  assert.equal(r.state.walls.length, 2); assert.equal(r.state.arcs.length, 0);
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, team: 'B', action: 'dock' }));
  assert.equal(r.state.walls.length, 1); assert.equal(r.state.tangibles[1].status, 'docked');
  assert.equal(r.state.tangibles[1].team, 'B');
  assert.equal(r.state.tangibles[1].active, false);
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 2, action: 'deactivate' }));
  assert.equal(r.state.walls.length, 0); assert.equal(r.state.tangibles[2].active, false);
});
test('physical zone drop uses same charging lifecycle; resets clear all tangibles', () => {
  const r = raceRig();
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 2, x: 1627 / 1920, y: 972 / 1080, angle: 0 }));
  assert.equal(r.state.tangibles[2].dockTeam, 'A');
  r.rules.onPower('A'); assert.equal(r.state.tangibles[2].active, false);
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 2, action: 'activate' }));
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 2, x: .5, y: .5, angle: 45 }));
  assert.equal(r.state.walls[0].angle, 45);
  r.rules.resetToLobby(); assert.deepEqual(r.state.tangibles, {});
  r.rules.enterMap(); r.rules.startRace(); assert.equal(r.state.walls.length, 0);
});
test('invalid lifecycle and coordinates are ignored; removal breaks an arc', () => {
  const r = raceRig(); charge(r, 1, 'B', 'pylon'); charge(r, 2, 'B', 'pylon');
  for (const id of [1, 2] as const) r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id, x: .4 + id * .05, y: .5, angle: 0 }));
  assert.equal(r.state.arcs.length, 1);
  r.rules.onTangibleRemoved(msg({ type: 'TangibleRemoved', id: 1 })); assert.equal(r.state.arcs.length, 0);
  const before = structuredClone(r.state.tangibles[2]);
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 2, x: NaN, y: .5, angle: 0 }));
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 2, team: 'A', action: 'activate' }));
  assert.deepEqual(r.state.tangibles[2], before);
});

// ─── Items: T-05, T-06, T-07 ─────────────────────────────────────────────────

section('Items');
test('pickup: grabbed when stock empty, respawns after 15 s', () => {
  const r = raceRig();
  const pk = r.state.pickups[0];
  const car = r.state.cars.A;
  car.pos = { ...pk.pos };
  r.rules.afterMove('A', pk.pos, r.clock.now);
  assert.equal(car.heldItem, pk.kind);
  assert.ok(pk.respawnAt > r.clock.now);
  car.pos = { ...r.state.pickups[1].pos };
  car.heldItem = 'boost';
  r.rules.afterMove('A', car.pos, r.clock.now);
  assert.equal(car.heldItem, 'boost', 'no second pickup while stock is full');
  r.advance(config.pickupRespawnS * 1000 + 100);
  assert.equal(pk.respawnAt, 0);
});
test('T-05 armed item without gesture within 5 s is lost', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  car.heldItem = 'slingshot';
  r.rules.onPower('A');
  assert.equal(car.itemArmed, true);
  r.advance(4900);
  assert.equal(car.itemArmed, true);
  r.advance(300);
  assert.equal(car.heldItem, null);
  assert.equal(car.itemArmed, false);
});
test('T-06 slingshot: 0.8 s telegraph, then a full-HP car is put out of order (+ stun, "stoneHit" feedback), opponent only', () => {
  const r = raceRig();
  const A = r.state.cars.A, B = r.state.cars.B;
  A.heldItem = 'slingshot';
  r.rules.onPower('A');
  const target = { ...B.pos };
  const shot = aim(target, 120);
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, team: 'A' as Team, ...shot }));
  assert.equal(r.state.stones.length, 1);
  assert.ok(Math.hypot(r.state.stones[0].target.x - target.x, r.state.stones[0].target.y - target.y) < 1, 'lands on the aimed point');
  assert.deepEqual(r.state.stones[0].from, shot.pouch, 'flies from the pouch');
  assert.equal(A.heldItem, null, 'item consumed');
  assert.ok(Math.abs(r.state.stones[0].impactAt - r.clock.now - config.stoneTelegraphS * 1000) < 1);
  r.advance(700);
  assert.equal(B.hp, config.hpMax, 'no damage during the warning');
  // Aim is a point in space: put the moving victim inside the impact radius
  // at the scheduled moment, without conflating this rule test with driving.
  B.pos = { ...target };
  r.clock.now += 200;
  r.rules.updateStones(r.clock.now);
  assert.equal(B.hp, Math.max(0, config.hpMax - config.dmgStone));
  assert.ok(config.dmgStone >= config.hpMax, 'one stone breaks a full-HP car');
  assert.equal(B.disabled, true);
  assert.ok(r.feedback.includes('stoneHit'), 'hit feedback for the comic effect');
  assert.ok(B.stunUntil > r.clock.now);
  assert.equal(A.hp, config.hpMax);
  assert.equal(r.state.stones.length, 0);
});
test('slingshot without armed slingshot is ignored', () => {
  const r = raceRig();
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, ...aim({ x: 900, y: 500 }, 120) }));
  assert.equal(r.state.stones.length, 0);
});
test('slingshot: a pull shorter than the minimum does nothing and the item stays armed', () => {
  const r = raceRig();
  const A = r.state.cars.A;
  A.heldItem = 'slingshot';
  r.rules.onPower('A');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 900, y: 500 }, pouch: { x: 900, y: 500 + config.slingMinPullPx - 5 } }));
  assert.equal(r.state.stones.length, 0);
  assert.equal(A.itemArmed, true);
  assert.equal(A.heldItem, 'slingshot');
});
test('slingshot: the stone flies opposite to the pull and a longer pull goes farther', () => {
  const land = (pull: number) => {
    const r = raceRig();
    r.state.cars.A.heldItem = 'slingshot';
    r.rules.onPower('A');
    // fork at (900,540), pouch pulled straight down → the stone goes up
    r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 900, y: 700 }, pouch: { x: 900, y: 700 + pull } }));
    return r.state.stones[0].target;
  };
  const short = land(config.slingMinPullPx + 20), long = land(config.slingMaxPullPx);
  assert.equal(Math.round(short.x), 900, 'straight line');
  assert.ok(short.y < 700 && long.y < 700, 'opposite to the pull (up)');
  assert.ok(long.y < short.y, 'longer pull = farther landing');
  assert.ok(long.y >= 0 && long.y <= config.logicalHeight, 'kept inside the table');
});
test('slingshot: the landing point is clamped to the table', () => {
  const r = raceRig();
  r.state.cars.A.heldItem = 'slingshot';
  r.rules.onPower('A');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 300, y: 200 }, pouch: { x: 300, y: 200 + config.slingMaxPullPx } }));
  const t = r.state.stones[0].target;
  assert.ok(t.y >= 0 && t.x >= 0 && t.x <= config.logicalWidth);
});
test('T-07 longer boost gate → stronger boost and acceleration zone properties', () => {
  const crossWith = (len: number) => {
    const r = raceRig();
    const car = r.state.cars.A;
    car.heldItem = 'boost';
    r.rules.onPower('A');
    const c = { x: car.pos.x + 60, y: car.pos.y };
    r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: c.x, y: c.y - len / 2 }, b: { x: c.x, y: c.y + len / 2 } }));
    assert.equal(r.state.boostGates.length, 1);
    const gate = r.state.boostGates[0];
    assert.ok(gate.dir && typeof gate.dir.x === 'number' && typeof gate.dir.y === 'number', 'gate has propulsion direction');
    assert.equal(gate.depth, 60, 'gate has 60px depth acceleration zone');
    assert.equal(gate.createdAt, r.clock.now, 'gate has createdAt timestamp');
    car.speed = 200;
    const prev = { ...car.pos };
    car.pos = { x: c.x + 5, y: c.y };
    r.rules.afterMove('A', prev, r.clock.now);
    assert.equal(car.boostUntil, r.clock.now + config.boostDurationS * 1000, 'boost duration is 2s');
    return car.speed;
  };
  assert.ok(crossWith(400) > crossWith(120), 'k grows with the length');
});
test('T-07 boost zone triggers when entering the 2D acceleration corridor', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  car.heldItem = 'boost';
  r.rules.onPower('A');
  const c = { x: car.pos.x + 100, y: car.pos.y };
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: c.x, y: c.y - 80 }, b: { x: c.x, y: c.y + 80 } }));
  const gate = r.state.boostGates[0];
  // Car moves into the corridor ahead of AB
  car.speed = 200;
  const prev = { ...car.pos };
  car.pos = { x: c.x + gate.depth! / 2, y: c.y };
  r.rules.afterMove('A', prev, r.clock.now);
  assert.ok(car.boostUntil > r.clock.now, 'car triggered boost by entering the zone');
  assert.ok(car.speed > 200, 'speed increased');
  assert.ok(r.feedback.includes('boostHit'));
});
test('T-07 boost zone affects allied car only, opponent ignores it', () => {
  const r = raceRig();
  r.state.cars.A.heldItem = 'boost';
  r.rules.onPower('A');
  const c = { x: 500, y: 500 };
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: c.x, y: c.y - 80 }, b: { x: c.x, y: c.y + 80 } }));
  const carB = r.state.cars.B;
  carB.speed = 200;
  const prevB = { x: c.x - 10, y: c.y };
  carB.pos = { x: c.x + 10, y: c.y };
  r.rules.afterMove('B', prevB, r.clock.now);
  assert.equal(carB.boostUntil, 0, 'opponent car does not receive allied boost');
  assert.equal(carB.speed, 200);
});
test('boost gate rejects lengths outside 100–400 px and expires after 8 s', () => {
  const r = raceRig();
  r.state.cars.A.heldItem = 'boost';
  r.rules.onPower('A');
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: 0, y: 0 }, b: { x: 50, y: 0 } }));
  assert.equal(r.state.boostGates.length, 0);
  assert.ok(r.state.cars.A.itemArmed, 'item stays armed after a rejected gesture');
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: 0, y: 0 }, b: { x: 200, y: 0 } }));
  assert.equal(r.state.boostGates.length, 1);
  r.advance(config.boostGateLifeS * 1000 + 100);
  assert.equal(r.state.boostGates.length, 0);
});
test('R-03 both teams armed → team of the nearest station wins the gesture', () => {
  const r = raceRig();
  for (const t of ['A', 'B'] as Team[]) { r.state.cars[t].heldItem = 'slingshot'; r.rules.onPower(t); }
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 1600, y: 950 }, pouch: { x: 1600, y: 1050 } })); // fork near copilot A (bottom-right)
  assert.equal(r.state.stones[0].team, 'A');
});

// ─── Abilities: T-08 ─────────────────────────────────────────────────────────

section('Abilities');
test('T-08 ghost: ignores hostile elements for 3 s, then 20 s recharge', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'ghost' as const }));
  assert.ok(car.ghostUntil - r.clock.now === config.ghostS * 1000);
  placeBlocking(r, [3]);
  r.rules.afterMove('A', car.pos, r.clock.now);
  assert.equal(car.hp, config.hpMax, 'ghost passes through the wall');
  const readyAt = r.state.cooldowns.A.ghost;
  assert.equal(readyAt - car.ghostUntil, config.ghostCooldownS * 1000);
  r.advance(5000);
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'ghost' as const }));
  assert.ok(car.ghostUntil < r.clock.now, 'cooldown prevents re-activation');
});
test('destroy: disables an opponent wall for 10 s (15 s cooldown); own walls untouched', () => {
  const r = raceRig();
  charge(r, 3, 'B'); charge(r, 1, 'A');
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved' as const, id: 3, x: 0.2, y: 0.5, angle: 0 }));
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved' as const, id: 1, x: 0.8, y: 0.5, angle: 0 }));
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'destroy' as const, targetId: 'wall-1' }));
  assert.equal(r.state.walls.find(w => w.id === 'wall-1')!.disabledUntil, 0, 'own wall untouched');
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'destroy' as const, targetId: 'wall-3' }));
  const w = r.state.walls.find(x => x.id === 'wall-3')!;
  assert.equal(w.disabledUntil - r.clock.now, config.destroyDisableS * 1000);
  assert.equal(r.state.cooldowns.A.destroy - r.clock.now, config.destroyCooldownS * 1000);
  // disabled wall does not hurt
  r.state.cars.A.pos = { ...w.pos };
  r.rules.afterMove('A', w.pos, r.clock.now);
  assert.equal(r.state.cars.A.hp, config.hpMax);
});

// ─── Repair: T-09 ────────────────────────────────────────────────────────────

section('Repair');
const pad = (r: Rig, team: Team, role: 'pilot' | 'copilot', on: boolean) =>
  r.rules.onPadHold(msg({ type: 'PadHold' as const, team, role, on }));
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
test('HP 0 → car stops and ignores the pilot', () => {
  const r = raceRig();
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 0 }));
  r.advance(1000);
  r.rules.damage(r.state.cars.A, 999, r.clock.now);
  const p = { ...r.state.cars.A.pos };
  r.advance(1000);
  assert.deepEqual(r.state.cars.A.pos, p);
});

// ─── Border pull (C-07) ──────────────────────────────────────────────────────

section('PC test switches');
const toggle = (r: Rig, flag: 'invincible' | 'allItems', on: boolean) =>
  r.rules.onTestToggle(msg({ type: 'TestToggle' as const, flag, on }));
test('test switches are ignored outside the PC mode', () => {
  const r = raceRig();
  r.state.mapMode = 'table';
  toggle(r, 'invincible', true);
  toggle(r, 'allItems', true);
  assert.deepEqual(r.state.testMode, { invincible: false, allItems: false });
});
test('invincible: no damage from walls, arcs or stones, and a fall just respawns the car', () => {
  const r = raceRig();
  r.state.mapMode = 'pc';
  toggle(r, 'invincible', true);
  const A = r.state.cars.A;
  placeBlocking(r, [3]);
  r.rules.afterMove('A', A.pos, r.clock.now);
  assert.equal(A.hp, config.hpMax, 'wall');
  // stone right on the car
  r.state.cars.B.heldItem = 'slingshot';
  r.rules.onPower('B');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, team: 'B' as Team, ...aim({ ...A.pos }, 120) }));
  r.advance(config.stoneTelegraphS * 1000 + 100);
  assert.equal(A.hp, config.hpMax, 'stone');
  assert.ok(A.stunUntil <= r.clock.now, 'no stun');
  // leaving the ribbon
  A.checkpointIndex = 3;
  r.rules.fallOffTrack('A', r.clock.now);
  assert.equal(A.disabled, false);
  assert.equal(A.hp, config.hpMax);
  const cp = r.state.track!.checkpoints[2];
  assert.ok(Math.hypot(A.pos.x - cp.pos.x, A.pos.y - cp.pos.y) < 5, 'back on the last checkpoint');
  // and switching it off restores the normal rules
  toggle(r, 'invincible', false);
  r.rules.damage(A, 10, r.clock.now);
  assert.equal(A.hp, config.hpMax - 10);
});
test('allItems: every item is armed and usable without pickup, repeatedly, with no cooldown', () => {
  const r = raceRig();
  r.state.mapMode = 'pc';
  toggle(r, 'allItems', true);
  r.advance(50);
  const A = r.state.cars.A;
  assert.equal(A.itemArmed, true);
  // a boost gate works although the stocked item is a "slingshot"
  assert.equal(A.heldItem, 'slingshot');
  const c = { x: A.pos.x + 60, y: A.pos.y };
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, a: { x: c.x, y: c.y - 100 }, b: { x: c.x, y: c.y + 100 } }));
  assert.equal(r.state.boostGates.length, 1);
  r.advance(50);
  assert.equal(A.itemArmed, true, 're-armed right after use');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 900, y: 700 }, pouch: { x: 900, y: 800 } }));
  assert.equal(r.state.stones.length, 1);
  // abilities have no cooldown
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'ghost' as const }));
  assert.equal(r.state.cooldowns.A.ghost, 0);
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'ghost' as const }));
  assert.ok(A.ghostUntil > r.clock.now);
  // switching off: nothing stays armed for free
  toggle(r, 'allItems', false);
  assert.equal(A.itemArmed, false);
});

section('Border pull');
test('BorderPull shifts a local section, then reforms without changing its width', () => {
  const r = raceRig();
  const track = r.state.track!;
  const i = 40;
  const before = track.widths[i];
  const edge = track.outerEdge[i];
  const center = track.centerline[i];
  const outward = { x: edge.x - center.x, y: edge.y - center.y };
  const len = Math.hypot(outward.x, outward.y);
  const send = () => r.rules.onBorderPull(msg({ type: 'BorderPull' as const, x: edge.x, y: edge.y, dx: outward.x / len * 70, dy: outward.y / len * 70, team: 'A' as Team }));
  const base = { ...center };
  send();
  r.advance(config.trackDeformRampS * 1000 + 50);
  assert.equal(track.widths[i], before, 'road width is preserved');
  assert.ok(Math.hypot(track.centerline[i].x - base.x, track.centerline[i].y - base.y) > 40, 'centerline shifts');
  assert.equal(r.state.deformations.length, 1);

  // A fresh gesture is immediately accepted and begins easing the previous one home.
  send();
  assert.ok(r.state.deformations.some(d => d.releaseAt !== null), 'previous deformation reforms');
  r.advance((config.trackDeformRelaxS + config.trackDeformRampS + 0.2) * 1000);
  assert.equal(r.state.deformations.length, 1, 'only the latest deformation remains');
  r.advance((config.trackDeformHoldS + config.trackDeformRelaxS + 0.2) * 1000);
  assert.equal(r.state.deformations.length, 0, 'temporary deformation fully reforms');
  assert.ok(Math.hypot(track.centerline[i].x - base.x, track.centerline[i].y - base.y) < 1, 'reference path is restored');
});

// ─── Oz fallback & T-11 replay ───────────────────────────────────────────────

section('Oz console');
test('T-11 replaying dock, activation, placement and removal reproduces tangible state', () => {
  const a = raceRig();
  charge(a, 1, 'A'); charge(a, 2, 'B', 'pylon');
  a.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 1, x: .4, y: .5, angle: 35 }));
  a.rules.onTangibleRemoved(msg({ type: 'TangibleRemoved', id: 2 }));
  const b = raceRig();
  for (const e of a.rules.tangibleLog) {
    if (e.type === 'TangibleControl') b.rules.onTangibleControl(msg({ type: e.type, id: e.id as 1, action: e.action!, team: e.team, kind: e.kind }));
    else if (e.type === 'TangibleMoved') b.rules.onTangibleMoved(msg({ type: e.type, id: e.id as 1, x: e.x!, y: e.y!, angle: e.angle! }));
    else b.rules.onTangibleRemoved(msg({ type: e.type, id: e.id as 1 }));
  }
  assert.deepEqual(b.state.tangibles, a.state.tangibles);
  assert.deepEqual(b.state.walls, a.state.walls);
});
test('POWER cannot arm enemy stock, and repeated POWER cannot extend the window', () => {
  const r = raceRig(); r.state.cars.A.heldItem = 'boost';
  r.rules.onPower('B'); assert.equal(r.state.cars.A.itemArmed, false);
  r.rules.onPower('A'); const expiry = r.state.cars.A.itemArmExpiry;
  r.clock.now += 1000; r.rules.onPower('A'); assert.equal(r.state.cars.A.itemArmExpiry, expiry);
});
test('a stolen slingshot consumes only the owner stock and targets the owner team', () => {
  const r = raceRig(); r.state.cars.A.heldItem = 'slingshot'; r.rules.onPower('A');
  r.state.cars.B.heldItem = 'boost';
  r.rules.onSlingshot(msg({ type: 'Slingshot', team: 'B', ...aim(r.state.cars.A.pos, 120) }));
  assert.equal(r.state.cars.A.heldItem, null); assert.equal(r.state.cars.B.heldItem, 'boost');
  assert.equal(r.state.stones[0].team, 'B');
  r.clock.now += 1000; r.rules.updateStones(r.clock.now);
  assert.equal(r.state.cars.A.hp, Math.max(0, config.hpMax - config.dmgStone));
  assert.equal(r.state.cars.B.hp, config.hpMax);
  r.rules.onSlingshot(msg({ type: 'Slingshot', team: 'A', ...aim({ x: 900, y: 500 }, 120) }));
  assert.equal(r.state.stones.length, 0, 'same stock cannot be consumed twice');
});
test('a stolen boost belongs to the gesturing team without Oz', () => {
  const r = raceRig(); r.state.cars.A.heldItem = 'boost'; r.rules.onPower('A');
  r.rules.onBoostGate(msg({ type: 'BoostGate', team: 'B', a: { x: 1500, y: 700 }, b: { x: 1700, y: 700 } }));
  assert.equal(r.state.boostGates[0].team, 'B'); assert.equal(r.state.cars.A.heldItem, null);
});

section('Wall manipulation');
test('endpoint 2 rotates around a fixed endpoint 1 with constant length through all angles', () => {
  const anchor = { x: 800, y: 500 }, length = config.wallLengthPx;
  for (let degrees = -720; degrees <= 720; degrees += 7) {
    const angle = degrees * Math.PI / 180;
    const pose = rotateWall(anchor, { x: anchor.x + Math.cos(angle) * 300, y: anchor.y + Math.sin(angle) * 300 }, length)!;
    const [a, b] = wallEndpoints(pose, pose.angle, length);
    assert.ok(Math.hypot(a.x - anchor.x, a.y - anchor.y) < 1e-8);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - length) < 1e-8);
  }
  assert.equal(rotateWall(anchor, anchor, length), null, 'zero-length direction is ignored');
});
test('server preserves the rotation anchor and rejects walls over the table controls', () => {
  const r = raceRig(); charge(r, 1, 'A');
  const anchor = { x: 700, y: 500 };
  const pose = rotateWall(anchor, { x: 700, y: 900 }, config.wallLengthPx)!;
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 1, x: pose.x / config.logicalWidth, y: pose.y / config.logicalHeight, angle: pose.angle }));
  const [a] = GameRules.wallEnds(r.state.walls[0]);
  assert.ok(Math.hypot(a.x - anchor.x, a.y - anchor.y) < 1e-8);
  const before = { ...r.state.tangibles[1] };
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 1, x: 730 / 1920, y: 960 / 1080, angle: 0 }));
  assert.deepEqual(r.state.tangibles[1], before, 'wall endpoint cannot overlap pilot controls');
});
test('deactivating either pillar cuts its arc; reactivation restores the same pair', () => {
  const r = raceRig(); charge(r, 1, 'B', 'pylon'); charge(r, 2, 'B', 'pylon');
  for (const id of [1, 2] as const) r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id, x: .4 + id * .05, y: .5, angle: 0 }));
  assert.equal(r.state.arcs.length, 1);
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'deactivate' })); assert.equal(r.state.arcs.length, 0);
  r.rules.onPower('B'); assert.equal(r.state.arcs.length, 0, 'POWER cannot reactivate it');
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'activate' })); assert.equal(r.state.arcs.length, 1);
});

function mapRig() {
  const r = raceRig(); charge(r, 1, 'A');
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 1, x: .5, y: .5, angle: 0 }));
  const listeners = new Map<string, (event: PointerEvent) => void>();
  let draws = 0;
  const context = new Proxy({}, { get: () => () => { draws++; } });
  const canvas = { width: 1920, height: 1080, getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    addEventListener: (name: string, fn: (event: PointerEvent) => void) => listeners.set(name, fn), setPointerCapture: () => {} } as unknown as HTMLCanvasElement;
  const sent: Array<{ x: number; y: number; angle: number }> = [];
  const map = new OzMap(canvas, { enabled: () => true, selectedId: () => 1, selectedKind: () => 'wall', selectedTeam: () => 'A',
    onSelect: () => {}, onMove: (_id, x, y, angle) => { sent.push({ x, y, angle }); return true; } });
  map.setState(r.state);
  const pointer = (name: string, x: number, y: number) => listeners.get(name)!({ pointerId: 1, clientX: x, clientY: y, preventDefault: () => {} } as PointerEvent);
  return { map, sent, pointer, state: r.state, draws: () => draws };
}
test('rotation handle previews immediately and keeps its anchor despite older network snapshots', () => {
  const r = mapRig();
  r.pointer('pointerdown', 510, 270); // endpoint 2 of a 120 px logical wall
  const before = r.draws();
  r.pointer('pointermove', 450, 400);
  assert.ok(r.draws() > before, 'draws before receiving a server update');
  r.map.setState(r.state); // old server pose, as can happen during a drag
  r.pointer('pointermove', 350, 270);
  r.pointer('pointerup', 350, 270);
  for (const pose of r.sent) {
    const [anchor] = wallEndpoints({ x: pose.x * 1920, y: pose.y * 1080 }, pose.angle, 120);
    assert.ok(Math.hypot(anchor.x - 900, anchor.y - 540) < 1e-8);
  }
  assert.ok(r.sent.length >= 2);
});
test('dragging the wall body preserves grab offset; cancelled drags stop sending', () => {
  const r = mapRig();
  r.pointer('pointerdown', 475, 270);
  assert.equal(r.sent.length, 0, 'picking an existing wall does not move it');
  r.pointer('pointermove', 485, 280);
  assert.ok(Math.abs(r.sent[0].x - 980 / 1920) < 1e-12); assert.ok(Math.abs(r.sent[0].y - 560 / 1080) < 1e-12);
  r.pointer('pointercancel', 485, 280);
  const count = r.sent.length;
  r.pointer('pointermove', 600, 300); assert.equal(r.sent.length, count);
});

test('a confirmed return to the copilot zone clears the drag preview and stops movement', () => {
  const r = mapRig(); r.pointer('pointerdown', 475, 270);
  const next = structuredClone(r.state);
  next.tangibles[1].status = 'docked'; next.tangibles[1].dockTeam = 'A';
  r.map.setState(next);
  r.pointer('pointermove', 485, 280); r.pointer('pointerup', 485, 280);
  assert.equal(r.sent.length, 0, 'a docked object is not moved back onto the map by an older gesture');
});

let passed = 0;
let failed = 0;
for (const item of queue) {
  if (!item.fn) { console.log(item.name); continue; }
  try { await item.fn(); passed++; console.log(`  ✓ ${item.name}`); }
  catch (e) { failed++; console.log(`  ✗ ${item.name}\n      ${(e as Error).message}`); }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
