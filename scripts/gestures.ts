/**
 * Table-side gesture checks (run: `npm run test:gestures`): drives the real
 * GestureRecognizer with fake touch pointer events and checks the semantic messages it
 * sends. No browser, no server. Covers the 3-finger slingshot (C-01, T-06 gesture side).
 */
import assert from 'node:assert/strict';

// The recognizer pulls in the renderer module, which only needs a DOM shape at call time.
const g = globalThis as Record<string, unknown>;
g.document = { getElementById: () => null, createElement: () => ({ getContext: () => null, style: {} }) };

const { GestureRecognizer } = await import('../client-table/GestureRecognizer.js');
const { createView } = await import('../client-table/view.js');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Held = 'slingshot' | 'boost' | null;

function rig(held: Held = 'slingshot') {
  const handlers: Record<string, (e: unknown) => void> = {};
  const canvas = {
    addEventListener: (n: string, f: (e: unknown) => void) => { handlers[n] = f; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
    setPointerCapture: () => {},
  };
  const view = createView(() => Date.now());
  const car = (team: string, armed: boolean) => ({
    team, itemArmed: armed, heldItem: armed ? held : null, itemArmExpiry: Date.now() + 600_000, pos: { x: 100, y: 100 },
  });
  // Only the fields the recognizer reads; no track, so no contact is on a track edge.
  view.state = {
    phase: 'RACE', mapMode: 'table', track: null, driveMode: { A: 'auto', B: 'auto' },
    cars: { A: car('A', true), B: car('B', false) },
    cooldowns: { A: { ghost: 0, destroy: 0 }, B: { ghost: 0, destroy: 0 } },
    testMode: { invincible: false, allItems: false },
    params: { slingMinPullPx: 40, slingMaxPullPx: 260, slingMinRangePx: 220, slingMaxRangePx: 900, logicalWidth: 1920, logicalHeight: 1080, stoneRadiusPx: 60 },
    walls: [], arcs: [],
  } as never;
  const sent: Array<Record<string, unknown>> = [];
  const recognizer = new GestureRecognizer(canvas as never, view, m => sent.push(m));
  const ev = (type: string, id: number, x: number, y: number) =>
    ({ type, pointerId: id, clientX: x, clientY: y, pointerType: 'touch', width: 1, height: 1, timeStamp: Date.now(), preventDefault() {} });
  return {
    view, sent, recognizer,
    down: (id: number, x: number, y: number) => handlers.pointerdown(ev('pointerdown', id, x, y)),
    move: (id: number, x: number, y: number) => handlers.pointermove(ev('pointermove', id, x, y)),
    up: (id: number, x: number, y: number) => handlers.pointerup(ev('pointerup', id, x, y)),
    cancel: (id: number, x: number, y: number) => handlers.pointercancel(ev('pointercancel', id, x, y)),
  };
}

// Fork fingers 1 and 2 side by side, finger 3 below them.
const F1 = { x: 880, y: 500 }, F2 = { x: 1000, y: 500 }, F3 = { x: 940, y: 600 };

async function land(r: ReturnType<typeof rig>): Promise<void> {
  r.down(1, F1.x, F1.y); await sleep(4);
  r.down(2, F2.x, F2.y); await sleep(4);
  r.down(3, F3.x, F3.y); await sleep(4);
}

/** Pull `id` from `from` straight down by `px`, in 25 px steps. */
async function pullDown(r: ReturnType<typeof rig>, id: number, from: { x: number; y: number }, px: number): Promise<void> {
  for (let d = 25; d <= px; d += 25) { r.move(id, from.x, from.y + d); await sleep(3); }
}

/** Coordinates go through a px → logical conversion: compare with a sub-pixel tolerance. */
function near(actual: { x: number; y: number }, expected: { x: number; y: number }, msg?: string): void {
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 0.01, `${msg ?? 'point'}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

const results: Array<[string, boolean, string?]> = [];
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); results.push([name, true]); } catch (e) { results.push([name, false, (e as Error).message]); }
}

await test('pulling the third finger back and lifting it fires one shot opposite to the pull', async () => {
  const r = rig();
  r.view.state!.cars.A.itemArmed = false; r.view.state!.cars.A.heldItem = null;
  r.view.state!.cars.B.itemArmed = true; r.view.state!.cars.B.heldItem = 'slingshot';
  await land(r);
  await pullDown(r, 3, F3, 150);
  assert.equal(r.view.sling?.idle, false);
  r.up(3, F3.x, F3.y + 150);
  assert.equal(r.sent.length, 1);
  const m = r.sent[0] as { type: string; anchor: { x: number; y: number }; pouch: { x: number; y: number }; team: string };
  assert.equal(m.type, 'Slingshot');
  near(m.anchor, { x: 940, y: 500 }, 'anchor');
  near(m.pouch, { x: 940, y: 750 }, 'pouch');
  assert.equal(m.team, 'A', 'the fork is nearer the cyan station: it can steal the item armed by rose');
});

await test('three resting fingers are no instant strike (no message after the settle delay)', async () => {
  const r = rig();
  await land(r);
  await sleep(400);
  assert.deepEqual(r.sent, []);
  r.up(3, F3.x, F3.y);
  assert.deepEqual(r.sent, []); // nothing was pulled: no shot
});

await test('the preview shows no role until one finger has clearly moved', async () => {
  const r = rig();
  await land(r);
  assert.equal(r.view.sling?.idle, true);
  r.move(3, F3.x, F3.y + 5); // under the threshold
  assert.equal(r.view.sling?.idle, true);
  r.move(3, F3.x, F3.y + 40);
  assert.equal(r.view.sling?.idle, false);
});

await test('REGRESSION fingers 2/3: finger 2 sliding while settling does not steal the pouch from finger 3', async () => {
  const r = rig();
  await land(r);
  r.move(2, F2.x + 22, F2.y + 8); // finger 2 slides ~23 px: it looks like a pouch for a moment
  assert.equal(r.view.sling?.idle, false);
  await pullDown(r, 3, F3, 150); // the real pull
  r.up(3, F3.x, F3.y + 150);
  const m = r.sent[0] as { anchor: { x: number; y: number }; pouch: { x: number; y: number } };
  assert.ok(m, 'a shot is fired');
  near(m.pouch, { x: 940, y: 750 }, 'finger 3 is the pouch');
  near(m.anchor, { x: (F1.x + F2.x + 22) / 2, y: (F1.y + F2.y + 8) / 2 }, 'fork = fingers 1 and 2 at their current position');
});

await test('whichever finger is pulled is the pouch (roles do not depend on the landing order)', async () => {
  const r = rig();
  await land(r);
  await pullDown(r, 2, F2, 150); // finger 2 pulled this time
  r.up(2, F2.x, F2.y + 150);
  const m = r.sent[0] as { anchor: { x: number; y: number }; pouch: { x: number; y: number } };
  near(m.pouch, { x: F2.x, y: F2.y + 150 }, 'pouch');
  near(m.anchor, { x: (F1.x + F3.x) / 2, y: (F1.y + F3.y) / 2 }, 'fork');
});

await test('a fork lift has a short recovery grace, then fires the valid shot', async () => {
  const r = rig();
  await land(r);
  await pullDown(r, 3, F3, 150);
  r.up(1, F1.x, F1.y);
  assert.equal(r.sent.length,0);await sleep(300);
  assert.equal(r.sent.length, 1);
  r.up(2, F2.x, F2.y);
  r.up(3, F3.x, F3.y + 150);
  assert.equal(r.sent.length, 1, 'the other fingers do not fire anything else');
});

await test('a pull shorter than the minimum fires nothing', async () => {
  const r = rig();
  r.down(1, F1.x, F1.y); await sleep(4);
  r.down(2, F2.x, F2.y); await sleep(4);
  r.down(3, 940, 515); await sleep(4); // lands 15 px from the fork centre
  r.move(3, 940, 535); // moved 20 px (a role is chosen) but the elastic is only 35 px long
  assert.equal(r.view.sling?.idle, false);
  assert.equal(r.view.sling?.shot.valid, false);
  r.up(3, 940, 535);
  assert.deepEqual(r.sent, []);
});

await test('a cancelled touch (pointercancel) does not fire the shot', async () => {
  const r = rig();
  await land(r);
  await pullDown(r, 3, F3, 150);
  r.cancel(3, F3.x, F3.y + 150);
  assert.deepEqual(r.sent, []);
});

await test('without an armed slingshot, three fingers do nothing', async () => {
  const r = rig();
  (r.view.state as { cars: { A: { itemArmed: boolean } } }).cars.A.itemArmed = false;
  await land(r);
  await pullDown(r, 3, F3, 150);
  r.up(3, F3.x, F3.y + 150);
  assert.deepEqual(r.sent, []);
  assert.equal(r.view.sling, null);
});

await test('two fingers 100–400 px apart still open a boost gate with a boost armed', async () => {
  const r = rig('boost');
  r.down(1, 800, 500); r.down(2, 1000, 500);
  await sleep(300);
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].type, 'BoostGate');
});

await test('only the copilot POWER button emits activation, the former pilot item zone is inert', async () => {
  const { localToWorld, panelOf, POWER_BTN_LOCAL } = await import('../server/layout.js');
  for (const team of ['A', 'B'] as const) {
    const r = rig();
    const at = localToWorld(panelOf(team, 'copilot'), POWER_BTN_LOCAL.x, POWER_BTN_LOCAL.y);
    r.down(1, at.x, at.y); r.up(1, at.x, at.y);
    assert.deepEqual(r.sent, [{ type: 'Power', team, role: 'copilot' }]);
    r.sent.length = 0;
    const former = localToWorld(panelOf(team, 'pilot'), -20, 45);
    r.down(2, former.x, former.y); r.up(2, former.x, former.y);
    assert.equal(r.sent.filter(m=>m.type==='Power').length,0,'pilot controls never arm stock');
  }
});

await test('two repair contacts in opposite corners belong to the same team', async () => {
  const { localToWorld, panelOf, padLocal } = await import('../server/layout.js');
  for (const team of ['A', 'B'] as const) {
    const r = rig(null);
    for (const [id, role] of [[1, 'pilot'], [2, 'copilot']] as const) {
      const pad = padLocal(role), at = localToWorld(panelOf(team, role), pad.x, pad.y);
      r.down(id, at.x, at.y);
    }
    assert.deepEqual(r.sent, [
      { type: 'PadHold', team, role: 'pilot', on: true },
      { type: 'PadHold', team, role: 'copilot', on: true },
    ]);
    r.recognizer.releaseAll();
  }
});

await test('the shared control adapter preserves held-pedal throttle across steering and releases', async () => {
  const { localToWorld, panelOf, PEDAL_LOCAL, STEER_AREA_LOCAL, steerArea } = await import('../server/layout.js');
  const r = rig(); r.view.state!.driveMode.A = 'pedal';
  const pedal = localToWorld(panelOf('A', 'pilot'), PEDAL_LOCAL.x, PEDAL_LOCAL.y);
  const steer = localToWorld(panelOf('A', 'pilot'), steerArea('pedal').x - 30, steerArea('pedal').y);
  r.down(1, pedal.x, pedal.y);
  assert.equal(r.sent.at(-1)!.throttle, 1);
  r.down(2, steer.x, steer.y);
  // The continuous steering heartbeat also carries the currently held pedal.
  await sleep(30);
  assert.equal(r.sent.at(-1)!.steer, -1); assert.equal(r.sent.at(-1)!.throttle, 1);
  r.up(1, pedal.x, pedal.y);
  assert.equal(r.sent.at(-1)!.steer, -1); assert.equal(r.sent.at(-1)!.throttle, 0);
  r.up(2, steer.x, steer.y);
  assert.equal(r.sent.at(-1)!.steer, 0); assert.equal(r.sent.at(-1)!.throttle, 0);
});

await test('the central resume icon works only while paused, and consumes the touch', async () => {
  const r = rig(null);
  r.down(1, 960, 540); r.up(1, 960, 540);
  assert.deepEqual(r.sent, [], 'the same location is ordinary track during the race');
  r.view.state!.phase = 'PAUSED';
  r.down(2, 960, 540); r.up(2, 960, 540);
  assert.deepEqual(r.sent, [{ type: 'Pause' }]);
  assert.equal(r.view.sling, null);
});

await test('former mode buttons and neutral settings space never toggle drive mode on the canvas',async()=>{
  const {SETTINGS_BUTTON}=await import('../server/layout.js');
  for(const phase of ['LOBBY','READY','RACE'] as const){const r=rig(null);r.view.state!.phase=phase;r.down(1,SETTINGS_BUTTON.x+30,SETTINGS_BUTTON.y+30);r.up(1,SETTINGS_BUTTON.x+30,SETTINGS_BUTTON.y+30);assert.equal(r.sent.length,0);}
});

await test('the tangible-test lobby entry starts its own mode without changing the other entries', async () => {
  const { START_TANGIBLE_TEST_BUTTON, START_TABLE_BUTTON, START_PC_BUTTON, START_TUTORIAL_BUTTON } = await import('../client-table/Renderer.js');
  for (const [button, expected] of [[START_TANGIBLE_TEST_BUTTON,'StartTangibleTest'],[START_TABLE_BUTTON,'StartGame'],[START_PC_BUTTON,'StartGame'],[START_TUTORIAL_BUTTON,'StartTutorial']] as const) {
    const r=rig(null);r.view.state!.phase='LOBBY';
    const x=button.x+button.w/2,y=button.y+button.h/2;
    r.down(1,x,y);r.up(1,x,y);assert.equal(r.sent.length,1);assert.equal(r.sent[0].type,expected);
  }
});
await test('automatic test consumes pilot touches while copilot POWER and repair remain available', async () => {
  const r=rig();r.view.state!.sessionMode='tangibles-test';
  // Pilot A steering strip, repair pad, and former drive-mode selector.
  for(const [x,y] of [[155,970],[620,970],[370,829]]){r.down(1,x,y);r.up(1,x,y);}
  assert.equal(r.sent.length,0);
  const { panelOf,localToWorld,POWER_BTN_LOCAL,padLocal }=await import('../server/layout.js');
  const panel=panelOf('A','copilot'),power=localToWorld(panel,POWER_BTN_LOCAL.x,POWER_BTN_LOCAL.y);
  r.down(3,power.x,power.y);r.up(3,power.x,power.y);
  assert.equal(r.sent.at(-1)?.type,'Power');
  const pad=padLocal('copilot'),at=localToWorld(panel,pad.x,pad.y);
  r.down(4,at.x,at.y);r.up(4,at.x,at.y);
  assert.deepEqual(r.sent.filter(m=>m.type==='PadHold').map(m=>[m.role,m.on]),[['copilot',true],['copilot',false]]);
});

await test('a border pull follows the two fingers through a full wall-sized drag instead of consuming the first movement',async()=>{
  const {generatePreset}=await import('../server/MapGenerator.js');
  const r=rig('boost'),track=generatePreset();r.view.state!.track=track;
  const index=Math.floor(track.centerline.length/4),at=track.outerEdge[index],centre=track.centerline[index],d=Math.hypot(at.x-centre.x,at.y-centre.y),out={x:(at.x-centre.x)/d,y:(at.y-centre.y)/d};
  // Adjacent samples on the same edge supply actual, nearby grab points.
  const b=track.outerEdge[(index+1)%track.outerEdge.length];r.down(1,at.x,at.y);r.down(2,b.x,b.y);
  for(let amount=30;amount<=220;amount+=30){r.move(1,at.x+out.x*amount,at.y+out.y*amount);r.move(2,b.x+out.x*amount,b.y+out.y*amount);await sleep(35);}
  r.up(1,at.x+out.x*220,at.y+out.y*220);r.up(2,b.x+out.x*220,b.y+out.y*220);
  const pulls=r.sent.filter(m=>m.type==='BorderPull');assert.ok(pulls.length>=4,'one gesture streams its growing displacement');
  assert.equal(new Set(pulls.map(m=>m.gestureId)).size,1);assert.equal(pulls.at(-1)!.end,true);
  assert.ok(Math.hypot(pulls.at(-1)!.dx as number,pulls.at(-1)!.dy as number)>150,'the final pull is much larger than its first 20 px');
  assert.equal(r.sent.filter(m=>m.type==='BoostGate').length,0);
});

await test('bend grabs accept fingers inside and outside the edge and drag perpendicular to the local tangent',async()=>{
  const {generatePreset}=await import('../server/MapGenerator.js');const {trackTangent}=await import('../server/geometry.js');
  const r=rig('boost'),track=generatePreset();r.view.state!.track=track;
  const index=42;
  const point=(i:number,offset:number)=>{const t=trackTangent(track,i),edge=track.outerEdge[i],centre=track.centerline[i],side=(edge.x-centre.x)*(-t.y)+(edge.y-centre.y)*t.x<0?-1:1;return{x:edge.x-t.y*side*offset,y:edge.y+t.x*side*offset};};
  const a=point(index,35),b=point(index+2,-35),t=trackTangent(track,index+1),edge=track.outerEdge[index+1],centre=track.centerline[index+1],side=(edge.x-centre.x)*(-t.y)+(edge.y-centre.y)*t.x<0?-1:1,out={x:-t.y*side,y:t.x*side};
  r.down(1,a.x,a.y);r.down(2,b.x,b.y);r.move(1,a.x+out.x*100,a.y+out.y*100);r.move(2,b.x+out.x*100,b.y+out.y*100);r.up(1,a.x+out.x*100,a.y+out.y*100);r.up(2,b.x+out.x*100,b.y+out.y*100);
  const pull=r.sent.find(m=>m.type==='BorderPull');assert.ok(pull,'the curved edge is grabbable on either side of its outline');
  assert.ok(Math.abs((pull.dx as number)*t.x+(pull.dy as number)*t.y)<20,'the pull follows the normal to the local tangent');
});

await test('stationary boost contacts still work on the ribbon edges despite the wider drag grab margin',async()=>{
  const {generatePreset}=await import('../server/MapGenerator.js');const r=rig('boost'),track=generatePreset();r.view.state!.track=track;
  const i=42,a=track.outerEdge[i],b=track.innerEdge[i];r.down(1,a.x,a.y);r.down(2,b.x,b.y);await sleep(240);
  assert.equal(r.sent.filter(m=>m.type==='BoostGate').length,1);r.recognizer.releaseAll();
});

await test('an expected boost accepts delayed taps and ignores a third finger instead of forming a sling',async()=>{
  const r=rig('boost');r.down(1,800,500);r.up(1,800,500);await sleep(400);
  r.down(2,1000,500);r.down(3,812,510);await sleep(240);
  assert.equal(r.sent.filter(m=>m.type==='BoostGate').length,1);assert.equal(r.view.sling,null);r.recognizer.releaseAll();
});
await test('a slingshot accepts delayed fork contacts and a brief lost/replaced anchor',async()=>{
  const r=rig();r.down(1,F1.x,F1.y);await sleep(450);r.down(2,F2.x,F2.y);r.down(3,F3.x,F3.y);
  await pullDown(r,3,F3,150);r.up(1,F1.x,F1.y);await sleep(80);assert.equal(r.sent.length,0);
  r.down(4,F1.x+6,F1.y+4);r.up(3,F3.x,F3.y+150);assert.equal(r.sent.filter(m=>m.type==='Slingshot').length,1);r.recognizer.releaseAll();
});
await test('a slingshot fork may be tapped before the pulling finger is held',async()=>{
  const r=rig();r.down(1,F1.x,F1.y);r.up(1,F1.x,F1.y);await sleep(350);
  r.down(2,F2.x,F2.y);r.down(3,F3.x,F3.y);await pullDown(r,3,F3,150);r.up(3,F3.x,F3.y+150);
  assert.equal(r.sent.filter(m=>m.type==='Slingshot').length,1);r.recognizer.releaseAll();
});

await test('two held fingers can grab the folded inner bank of a right-angle elbow',async()=>{
  const {generatePreset,rebuildEdges}=await import('../server/MapGenerator.js');const r=rig(null),track=generatePreset();
  const corners=[{x:600,y:400},{x:1200,y:400},{x:1200,y:700},{x:600,y:700}];
  track.centerline=corners.flatMap((p,i)=>Array.from({length:20},(_,j)=>({x:p.x+(corners[(i+1)%4].x-p.x)*j/20,y:p.y+(corners[(i+1)%4].y-p.y)*j/20})));
  track.baseCenterline=track.centerline.map(p=>({...p}));track.widths=track.centerline.map(()=>140);rebuildEdges(track);r.view.state!.track=track;
  const a=track.innerEdge[19],b=track.innerEdge[21];r.down(1,a.x,a.y);r.down(2,b.x,b.y);
  r.move(1,a.x-70,a.y+70);r.move(2,b.x-70,b.y+70);r.up(1,a.x-70,a.y+70);r.up(2,b.x-70,b.y+70);
  assert.ok(r.sent.some(m=>m.type==='BorderPull'),'the concave elbow is a grabbable rendered bank');r.recognizer.releaseAll();
});

let failed = 0;
for (const [name, ok, err] of results) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}`);
  if (!ok) { failed++; console.log(`      ${err}`); }
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
