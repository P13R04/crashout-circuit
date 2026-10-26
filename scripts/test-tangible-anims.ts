import assert from 'node:assert/strict';
import { Renderer } from '../client-table/Renderer.js';
import type { GameState, Wall, ArcElectric, Tangible } from '../server/types.js';

console.log('Testing Tangible animations and tracking in Renderer...');

// Mock canvas context
const noop = () => {};
const mockCtx = new Proxy({} as CanvasRenderingContext2D, {
  get: (_, prop) => {
    if (prop === 'canvas') return { width: 1920, height: 1080 };
    return noop;
  },
});

const renderer = new Renderer(mockCtx);

function makeState(): GameState {
  return {
    phase: 'RACE',
    driveMode: 'auto',
    tick: 1,
    cars: {} as never,
    walls: [],
    arcs: [],
    boostGates: [],
    stones: [],
    pickups: [],
    repairPads: {} as never,
    cooldowns: {} as never,
    track: null,
    deformations: [],
    winner: null,
    sessionStartAt: 0,
    pausedAt: 0,
    mapTargets: null,
    mapDivider: null,
    mapStrokes: { A: true, B: true },
    mapDeadline: 0,
    mapMode: 'table',
    repairProgress: { A: 0, B: 0 },
    trackVersion: 1,
    tangibles: {},
    params: { logicalWidth: 1920, logicalHeight: 1080, wallLengthPx: 120 } as never,
    testMode: { invincible: false, allItems: false },
  };
}

const state = makeState();
const rAny = renderer as unknown as {
  updateTangibleTracking(state: GameState, now: number): void;
  trackedWalls: Map<string, { id: string; birth: number; pos: { x: number; y: number } }>;
  trackedPylons: Map<string, { id: string; birth: number; pos: { x: number; y: number } }>;
  trackedArcs: Map<string, { id: string; birth: number }>;
  dissolvingItems: Array<{ kind: string; start: number; dur: number }>;
};

// 1. Placing a wall
state.walls.push({ id: 'wall-1', team: 'A', pos: { x: 500, y: 500 }, angle: 0, lengthPx: 120, disabledUntil: 0 });
rAny.updateTangibleTracking(state, 1000);
assert.equal(rAny.trackedWalls.size, 1);
assert.equal(rAny.trackedWalls.get('wall-1')!.birth, 1000);
assert.equal(rAny.dissolvingItems.length, 0);
console.log('✓ Wall placement tracked with birth timestamp');

// 2. Moving the wall
state.walls[0] = { id: 'wall-1', team: 'A', pos: { x: 600, y: 500 }, angle: 0, lengthPx: 120, disabledUntil: 0 };
rAny.updateTangibleTracking(state, 1200);
assert.equal(rAny.trackedWalls.get('wall-1')!.birth, 1200);
assert.equal(rAny.dissolvingItems.length, 1);
assert.equal(rAny.dissolvingItems[0].kind, 'wall');
console.log('✓ Wall movement spawns dissolving wall and resets appearance birth');

// 3. Removing the wall (before the previous one expires)
state.walls = [];
rAny.updateTangibleTracking(state, 1400);
assert.equal(rAny.trackedWalls.size, 0);
assert.equal(rAny.dissolvingItems.length, 2);
console.log('✓ Wall removal spawns dissolving wall');

// 4. Placing two pylons forming an arc
state.tangibles['1'] = { x: 0.4, y: 0.5, angle: 0, kind: 'pylon', team: 'A', active: true, status: 'placed', dockTeam: null };
state.tangibles['2'] = { x: 0.45, y: 0.5, angle: 0, kind: 'pylon', team: 'A', active: true, status: 'placed', dockTeam: null };
state.arcs.push({ id: 'arc-1-2', team: 'A', pylon1: { x: 768, y: 540 }, pylon2: { x: 864, y: 540 }, disabledUntil: 0 });

rAny.updateTangibleTracking(state, 3000);
assert.equal(rAny.trackedPylons.size, 2);
assert.equal(rAny.trackedArcs.size, 1);
assert.equal(rAny.trackedArcs.get('arc-1-2')!.birth, 3000);
console.log('✓ Pylons and Arc formation tracked with formation timestamp');

// 5. Breaking the arc (removing one pylon)
delete state.tangibles['2'];
state.arcs = [];
rAny.updateTangibleTracking(state, 3200);
assert.equal(rAny.trackedPylons.size, 1);
assert.equal(rAny.trackedArcs.size, 0);
const dissolvingArc = rAny.dissolvingItems.find(i => i.kind === 'arc');
assert.ok(dissolvingArc, 'dissolving arc recorded on arc break');
console.log('✓ Arc break spawns dissolving arc rupture effect');

console.log('All tangible animation tracking tests passed!\n');
