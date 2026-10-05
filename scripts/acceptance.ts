/**
 * Automated acceptance checks for the server-side rules (run: `npm run test:acceptance`).
 * Covers T-01, T-03 … T-11 without any network or browser; T-02 and the latency
 * figures need the real table and are measured manually (see measures.md).
 */
import assert from 'node:assert/strict';
import type { GameState, Team, Vec2, Phase } from '../server/types.js';
import { GameRules, createInitialState } from '../server/GameRules.js';
import type { RulesHost } from '../server/GameRules.js';
import { PhysicsLoop } from '../server/PhysicsLoop.js';
import { config } from '../server/config.js';
import { generate, generatePreset, validateGeometry, generationInfo } from '../server/MapGenerator.js';
import { nearestOnTrack } from '../server/geometry.js';

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
test('invalid strokes fall back to the preset circuit', () => {
  const geo = generate([{ x: 0, y: 0 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 5, y: 5 }]);
  assert.ok(validateGeometry(geo));
});

// ─── MAP phase protocol ──────────────────────────────────────────────────────

section('MAP phase');
test('two valid StrokeDraw → RACE with a track; invalid stroke → mapError', () => {
  const r = rig();
  r.state.phase = 'LOBBY';
  r.rules.enterMap();
  assert.equal(r.state.phase, 'MAP');
  const t = r.state.mapTargets!;
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'A' as Team, pts: [t.A[0], { x: t.A[0].x + 10, y: t.A[0].y }] }));
  assert.ok(r.feedback.includes('mapError'));
  assert.equal(r.state.mapStrokes.A, false);
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'A' as Team, pts: randomStroke(t.A[0], t.A[1], rnd) }));
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'B' as Team, pts: randomStroke(t.B[0], t.B[1], rnd) }));
  // generation is asynchronous (Promise)
  return new Promise<void>((resolve, reject) => setTimeout(() => {
    try {
      assert.equal(r.state.phase, 'RACE');
      assert.ok(r.state.track);
      resolve();
    } catch (e) { reject(e); }
  }, 100));
});

// ─── Physics ─────────────────────────────────────────────────────────────────

section('Vehicle & HP');
test('car follows PilotInput; rebound on the edge costs no HP', () => {
  const r = raceRig();
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 0 }));
  r.advance(1500);
  assert.ok(r.state.cars.A.speed > 100, 'accelerates');
  r.advance(10000); // drive straight into the border at some point
  assert.equal(r.state.cars.A.hp, config.hpMax);
  const hit = nearestOnTrack(r.state.cars.A.pos, r.state.track!);
  assert.ok(hit.distance <= hit.halfWidth + 1, 'stays inside the track');
});
test('steering turns the car', () => {
  const r = raceRig();
  const a0 = r.state.cars.A.angle;
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 1 }));
  r.advance(500);
  assert.notEqual(r.state.cars.A.angle, a0);
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

section('Pylons');
function placeBlocking(r: Rig, ids: number[]) {
  // put pylons exactly on car A's position so contact is immediate
  const p = r.state.cars.A.pos;
  ids.forEach((id, i) => r.rules.onTangibleMoved(msg({
    type: 'TangibleMoved' as const, id: id as 3, x: (p.x + i * 150) / config.logicalWidth, y: p.y / config.logicalHeight, angle: 0,
  })));
}
test('T-03 hostile wall: −10 HP, then 1 s invulnerability', () => {
  const r = raceRig();
  placeBlocking(r, [3]); // team B pylon
  assert.equal(r.state.walls.length, 1);
  r.rules.afterMove('A', r.state.cars.A.pos, r.clock.now);
  assert.equal(r.state.cars.A.hp, config.hpMax - config.dmgWall);
  assert.ok(r.state.cars.A.invulnUntil > r.clock.now);
  // still in contact but invulnerable → no further damage
  r.state.cars.A.pos = { ...r.state.walls[0].pos };
  r.rules.afterMove('A', r.state.cars.A.pos, r.clock.now);
  assert.equal(r.state.cars.A.hp, config.hpMax - config.dmgWall);
  r.clock.now += 1100;
  r.state.cars.A.pos = { ...r.state.walls[0].pos };
  r.rules.afterMove('A', r.state.cars.A.pos, r.clock.now);
  assert.equal(r.state.cars.A.hp, config.hpMax - 2 * config.dmgWall);
});
test('R-09 own wall never hurts its own car', () => {
  const r = raceRig();
  placeBlocking(r, [1]); // team A pylon on A's car
  r.rules.afterMove('A', r.state.cars.A.pos, r.clock.now);
  assert.equal(r.state.cars.A.hp, config.hpMax);
});
test('T-04 two allied pylons ≤ 500 px → one arc; −10 HP and slow-down', () => {
  const r = raceRig();
  const p = r.state.cars.A.pos;
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved' as const, id: 3, x: (p.x - 100) / config.logicalWidth, y: p.y / config.logicalHeight, angle: 0 }));
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved' as const, id: 4, x: (p.x + 100) / config.logicalWidth, y: p.y / config.logicalHeight, angle: 0 }));
  assert.equal(r.state.arcs.length, 1);
  assert.equal(r.state.walls.filter(w => w.team === 'B').length, 0, 'arc replaces the two walls');
  r.state.cars.A.speed = 300;
  r.rules.afterMove('A', p, r.clock.now);
  assert.equal(r.state.cars.A.hp, config.hpMax - config.dmgArc);
  assert.equal(r.state.cars.A.speed, 300 * config.arcSlowFactor);
  assert.ok(r.state.cars.A.slowUntil > r.clock.now);
});
test('pylons farther than 500 px → two walls; removal clears them', () => {
  const r = raceRig();
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved' as const, id: 3, x: 0.2, y: 0.5, angle: 0 }));
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved' as const, id: 4, x: 0.8, y: 0.5, angle: 0 }));
  assert.equal(r.state.arcs.length, 0);
  assert.equal(r.state.walls.length, 2);
  r.rules.onTangibleRemoved(msg({ type: 'TangibleRemoved' as const, id: 3 }));
  assert.equal(r.state.walls.length, 1);
});
test('T-10 operator event and TUIO-style event reach the same handler → identical state', () => {
  const a = raceRig(), b = raceRig();
  const ev = msg({ type: 'TangibleMoved' as const, id: 3 as const, x: 0.4, y: 0.6, angle: 45 });
  a.rules.onTangibleMoved(ev);          // as sent by the Oz console
  b.rules.onTangibleMoved({ ...ev });   // as sent by a TUIO bridge
  assert.deepEqual(a.state.walls, b.state.walls);
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
  r.rules.onUseItem('A');
  assert.equal(car.itemArmed, true);
  r.advance(4900);
  assert.equal(car.itemArmed, true);
  r.advance(300);
  assert.equal(car.heldItem, null);
  assert.equal(car.itemArmed, false);
});
test('T-06 slingshot: 0.8 s telegraph, then −25 HP + stun on the opponent only', () => {
  const r = raceRig();
  const A = r.state.cars.A, B = r.state.cars.B;
  A.heldItem = 'slingshot';
  r.rules.onUseItem('A');
  const target = { ...B.pos };
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, x: target.x, y: target.y }));
  assert.equal(r.state.stones.length, 1);
  assert.equal(A.heldItem, null, 'item consumed');
  assert.ok(Math.abs(r.state.stones[0].impactAt - r.clock.now - config.stoneTelegraphS * 1000) < 1);
  r.advance(700);
  assert.equal(B.hp, config.hpMax, 'no damage during the warning');
  r.advance(200);
  assert.equal(B.hp, config.hpMax - config.dmgStone);
  assert.ok(B.stunUntil > r.clock.now);
  assert.equal(A.hp, config.hpMax);
  assert.equal(r.state.stones.length, 0);
});
test('slingshot without armed slingshot is ignored', () => {
  const r = raceRig();
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, x: 500, y: 500 }));
  assert.equal(r.state.stones.length, 0);
});
test('T-07 longer boost gate → stronger boost', () => {
  const crossWith = (len: number) => {
    const r = raceRig();
    const car = r.state.cars.A;
    car.heldItem = 'boost';
    r.rules.onUseItem('A');
    const c = { x: car.pos.x + 60, y: car.pos.y };
    r.rules.onBoostGate(msg({ type: 'BoostGate' as const, a: { x: c.x, y: c.y - len / 2 }, b: { x: c.x, y: c.y + len / 2 } }));
    assert.equal(r.state.boostGates.length, 1);
    car.speed = 200;
    const prev = { ...car.pos };
    car.pos = { x: c.x + 5, y: c.y };
    r.rules.afterMove('A', prev, r.clock.now);
    return car.speed;
  };
  assert.ok(crossWith(400) > crossWith(120), 'k grows with the length');
});
test('boost gate rejects lengths outside 100–400 px and expires after 8 s', () => {
  const r = raceRig();
  r.state.cars.A.heldItem = 'boost';
  r.rules.onUseItem('A');
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, a: { x: 0, y: 0 }, b: { x: 50, y: 0 } }));
  assert.equal(r.state.boostGates.length, 0);
  assert.ok(r.state.cars.A.itemArmed, 'item stays armed after a rejected gesture');
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, a: { x: 0, y: 0 }, b: { x: 200, y: 0 } }));
  assert.equal(r.state.boostGates.length, 1);
  r.advance(config.boostGateLifeS * 1000 + 100);
  assert.equal(r.state.boostGates.length, 0);
});
test('R-03 both teams armed → team of the nearest station wins the gesture', () => {
  const r = raceRig();
  for (const t of ['A', 'B'] as Team[]) { r.state.cars[t].heldItem = 'slingshot'; r.rules.onUseItem(t); }
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, x: 1600, y: 950 })); // near copilot A (bottom-right)
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

section('Border pull');
test('BorderPull widens locally, then 20 s cooldown', () => {
  const r = raceRig();
  const track = r.state.track!;
  const i = 40;
  const before = track.widths[i];
  const edge = track.outerEdge[i];
  const send = () => r.rules.onBorderPull(msg({ type: 'BorderPull' as const, x: edge.x, y: edge.y, dx: 30, dy: 0, team: 'A' as Team }));
  send();
  assert.ok(track.widths[i] > before);
  const after = track.widths[i];
  send();
  assert.equal(track.widths[i], after, 'cooldown');
  assert.ok(Math.hypot(track.outerEdge[i].x - track.innerEdge[i].x, track.outerEdge[i].y - track.innerEdge[i].y) > before);
});

// ─── Oz fallback & T-11 replay ───────────────────────────────────────────────

section('Oz console');
test('OzTrigger obstacle / boost / breakdown / widen / fallbackTrack', () => {
  const r = raceRig();
  r.rules.onOzTrigger(msg({ type: 'OzTrigger' as const, kind: 'obstacle', params: { team: 'A' } }));
  assert.equal(r.state.walls.length, 1);
  assert.ok(r.state.walls[0].expiresAt! > r.clock.now);
  r.rules.onOzTrigger(msg({ type: 'OzTrigger' as const, kind: 'boost', params: { team: 'A' } }));
  assert.equal(r.state.boostGates.length, 1);
  r.rules.onOzTrigger(msg({ type: 'OzTrigger' as const, kind: 'widen', params: { team: 'A' } }));
  r.rules.onOzTrigger(msg({ type: 'OzTrigger' as const, kind: 'breakdown', params: { team: 'B' } }));
  assert.ok(r.state.cars.B.disabled);
  const v = r.state.trackVersion;
  r.rules.onOzTrigger(msg({ type: 'OzTrigger' as const, kind: 'fallbackTrack', params: {} }));
  assert.ok(r.state.trackVersion > v);
});
test('T-11 replaying the recorded journal reproduces the same pylon state', () => {
  const a = raceRig();
  const events = [
    { id: 1, x: 0.3, y: 0.5, angle: 10 }, { id: 2, x: 0.4, y: 0.5, angle: 20 },
    { id: 3, x: 0.6, y: 0.4, angle: 30 }, { id: 1, x: 0.9, y: 0.5, angle: 40 },
  ];
  for (const e of events) { a.rules.onTangibleMoved(msg({ type: 'TangibleMoved' as const, ...e, id: e.id as 1 })); a.advance(100); }
  a.rules.onTangibleRemoved(msg({ type: 'TangibleRemoved' as const, id: 3 }));
  const journal = JSON.parse(JSON.stringify(a.rules.tangibleLog)) as typeof a.rules.tangibleLog;

  const b = raceRig();
  let last = journal[0].t;
  for (const e of journal) {
    b.advance(e.t - last); last = e.t;
    if (e.type === 'TangibleMoved') b.rules.onTangibleMoved(msg({ type: 'TangibleMoved' as const, id: e.id as 1, x: e.x!, y: e.y!, angle: e.angle! }));
    else b.rules.onTangibleRemoved(msg({ type: 'TangibleRemoved' as const, id: e.id as 1 }));
  }
  assert.deepEqual(b.state.walls, a.state.walls);
  assert.deepEqual(b.state.arcs, a.state.arcs);
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
