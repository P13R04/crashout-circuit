/** Direction, full corridor collision and pause clocks shared by both render themes. */
import assert from 'node:assert/strict';
import { orientBoostGate, boostFrame, hitsBoostGate, BOOST_MIN_WIDTH } from '../server/boostGeometry.js';
import { generatePreset, generate, selfCrossings } from '../server/MapGenerator.js';
import { createInitialState, GameRules } from '../server/GameRules.js';
import { dist } from '../server/geometry.js';
import type { Vec2 } from '../server/types.js';

let passed=0;
function test(name:string,run:()=>void){run();passed++;console.log(`  ✓ ${name}`);}
const track=generatePreset();
test('every part of the circuit orients the runway forwards, regardless of contact angle or order',()=>{
  for(let i=0;i<track.centerline.length;i+=4)for(const angle of [0,.35,1.2,2.4]){
    const at=track.centerline[i],before=track.centerline[(i-1+track.centerline.length)%track.centerline.length],after=track.centerline[(i+1)%track.centerline.length];
    const size=dist(before,after),reference={x:(after.x-before.x)/size,y:(after.y-before.y)/size};
    const a={x:at.x-Math.cos(angle)*80,y:at.y-Math.sin(angle)*80},b={x:at.x+Math.cos(angle)*80,y:at.y+Math.sin(angle)*80};
    const g=orientBoostGate(a,b,track),frame=boostFrame(g);
    assert.ok(g.dir.x*reference.x+g.dir.y*reference.y>.96,'forwards on the local road, never into the void');
    assert.ok(Math.abs(frame.across.x*frame.forward.x+frame.across.y*frame.forward.y)<1e-9,'width and propulsion stay perpendicular');
    assert.ok(Math.abs(frame.length-160)<1e-9,'alignment preserves the gesture strength');
    assert.deepEqual(orientBoostGate(b,a,track),g,'contact order does not flip the boost');
  }
});
test('at a figure-eight crossing, the transverse gesture selects the intended branch',()=>{
  const a={x:560,y:540},b={x:1360,y:540};
  const wave=(p:Vec2,q:Vec2)=>Array.from({length:121},(_,i)=>{const t=i/120;return{x:p.x+(q.x-p.x)*t,y:540-170*Math.sin(2*Math.PI*t)};});
  const eight=generate(wave(a,b),wave(b,a),a,b,b,a),crossings=selfCrossings(eight.centerline);
  assert.ok(crossings.length>0,'fixture has a real crossing');
  for(const crossing of crossings)for(const index of [crossing.i,crossing.j]){
    const p=eight.centerline[index],q=eight.centerline[(index+1)%eight.centerline.length],size=dist(p,q);
    const tangent={x:(q.x-p.x)/size,y:(q.y-p.y)/size},normal={x:-tangent.y,y:tangent.x},at=crossing.at;
    const g=orientBoostGate({x:at.x-normal.x*80,y:at.y-normal.y*80},{x:at.x+normal.x*80,y:at.y+normal.y*80},eight);
    assert.ok(g.dir.x*tangent.x+g.dir.y*tangent.y>.99,'no jump to the crossing’s other road');
  }
});
test('the complete oriented corridor catches fast front, rear and lateral crossings without false hits nearby',()=>{
  const g=orientBoostGate({x:960,y:400},{x:960,y:600},track),f=boostFrame(g);
  const at=(x:number,y:number)=>({x:g.a.x+f.across.x*x+f.forward.x*y,y:g.a.y+f.across.y*x+f.forward.y*y});
  assert.ok(hitsBoostGate(at(100,-100),at(100,150),g),'front-to-back sweep');
  assert.ok(hitsBoostGate(at(100,150),at(100,-100),g),'reverse crossing remains functional');
  assert.ok(hitsBoostGate(at(-100,30),at(300,30),g),'fast side-to-side sweep');
  assert.equal(hitsBoostGate(at(-100,f.depth+16),at(300,f.depth+16),g),false,'outside the body-contact margin');
  assert.equal(hitsBoostGate(at(-100,-16),at(300,-16),g),false,'outside the rear margin');
});
test('close and coincident contacts make a finite, usable runway aligned with the road',()=>{
  for(const gap of [0,2,30,100]){
    const at=track.centerline[32],g=orientBoostGate(at,{x:at.x+gap,y:at.y},track),f=boostFrame(g);
    assert.equal(Math.round(f.length),BOOST_MIN_WIDTH,'small touches get a full footprint');
    assert.ok([g.a.x,g.a.y,g.b.x,g.b.y,g.dir.x,g.dir.y].every(Number.isFinite),'no division by zero on a repeated tap');
    assert.ok(hitsBoostGate(at,{x:at.x+g.dir.x*30,y:at.y+g.dir.y*30},g),'the minimum runway catches a car');
  }
  const s=createInitialState(),rules=new GameRules(s,{transition:p=>{s.phase=p;},broadcastFull(){},feedback(){}},()=>1_000_000);
  s.phase='RACE';rules.startRace(track);s.cars.A.heldItem='boost';rules.onPower('A');
  rules.onBoostGate({type:'BoostGate',t:1_000_000,team:'A',a:track.centerline[32],b:track.centerline[32]});
  assert.equal(s.boostGates.length,1,'the server accepts the same tolerant gesture as the table');
});
test('pause preserves the deployment age and lifetime of a boost; expiry still removes it',()=>{
  const s=createInitialState(),clock={now:1_000_000};
  const rules=new GameRules(s,{transition:p=>{s.phase=p;},broadcastFull(){},feedback(){}},()=>clock.now);
  s.phase='RACE';rules.startRace(track);s.cars.A.heldItem='boost';rules.onPower('A');
  rules.onBoostGate({type:'BoostGate',t:clock.now,team:'A',a:{x:1150,y:270},b:{x:1150,y:430}});
  const g=s.boostGates[0];assert.ok(g,'charged bonus creates the gate');
  clock.now+=180;rules.togglePause();const age=clock.now-g.createdAt!,remaining=g.expiresAt-clock.now;
  clock.now+=20_000;rules.togglePause();
  assert.equal(clock.now-g.createdAt!,age,'birth animation does not restart or finish during pause');
  assert.equal(g.expiresAt-clock.now,remaining,'test and race share the same pause clock');
  clock.now+=remaining+1;rules.expire(clock.now);assert.equal(s.boostGates.length,0,'expired boost cannot remain active');
});
console.log(`\n${passed} boost integration scenarios passed`);
