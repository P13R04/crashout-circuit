import assert from 'node:assert/strict';
import { createInitialState, GameRules } from '../server/GameRules.js';
import { PhysicsLoop } from '../server/PhysicsLoop.js';
import { tangibleTouchPose, TANGIBLE_WAIT_MS } from '../server/tangibleTouch.js';
import { generatePreset } from '../server/MapGenerator.js';
import type { TangibleTouchPlacedMsg } from '../server/types.js';

const dom=globalThis as Record<string,unknown>;
dom.document={getElementById:()=>null,createElement:()=>({getContext:()=>null,style:{}})};
const {GestureRecognizer}=await import('../client-table/GestureRecognizer.js');
const {createView}=await import('../client-table/view.js');
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let passed=0;
async function test(name:string,run:()=>void|Promise<void>){await run();console.log(`  ✓ ${name}`);passed++;}
function rig(){
  const s=createInitialState(),clock={now:1_000_000};
  const rules=new GameRules(s,{transition:p=>{s.phase=p;},broadcastFull(){},feedback(){}},()=>clock.now);
  rules.startRace(generatePreset(),true);rules.setTangiblePlacementMode('touch');
  const place=(id:1|2|3,a={x:880,y:540},b={x:980,y:540},token=s.tangiblePlacement?.token??0)=>
    rules.onTangibleTouchPlaced({type:'TangibleTouchPlaced',t:clock.now,id,token,a,b});
  return{s,clock,rules,place,pending:()=>s.tangiblePlacement};
}
function gestures(){
  const r=rig(),view=createView(()=>r.clock.now);view.state=r.s;
  r.s.phase='RACE';r.s.track=null;r.s.cars.A.heldItem='boost';r.s.cars.A.itemArmed=true;r.s.cars.A.itemArmExpiry=r.clock.now+60_000;
  const handlers:Record<string,(e:unknown)=>void>={},sent:Array<Record<string,unknown>>=[];
  const canvas={addEventListener:(key:string,fn:(e:unknown)=>void)=>{handlers[key]=fn;},setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:1920,height:1080})};
  const g=new GestureRecognizer(canvas as never,view,msg=>sent.push(msg));
  const event=(type:string,id:number,x:number,y:number,pointerType='touch',width=1)=>
    handlers[type]({type,pointerId:id,clientX:x,clientY:y,pointerType,width,height:width,timeStamp:r.clock.now,preventDefault(){}});
  const down=(id:number,x:number,y:number,type='touch',width=1)=>event('pointerdown',id,x,y,type,width);
  const move=(id:number,x:number,y:number)=>event('pointermove',id,x,y);
  const up=(id:number,x:number,y:number)=>event('pointerup',id,x,y);
  const cancel=(id:number)=>event('pointercancel',id,900,540);
  const announce=(id:1|2|3=1)=>{r.rules.prepareTangiblePlacement(id);g.syncState();};
  return{...r,view,g,sent,down,move,up,cancel,announce};
}

await test('a grant requires Oz’s explicit touch mode, a valid object and a ready/racing session',()=>{
  const r=rig();r.rules.setTangiblePlacementMode('manual');r.rules.prepareTangiblePlacement(1);assert.equal(r.s.tangiblePlacement,null);
  r.rules.setTangiblePlacementMode('touch');r.rules.prepareTangiblePlacement(4);assert.equal(r.s.tangiblePlacement,null);
  r.s.phase='PAUSED';r.rules.prepareTangiblePlacement(1);assert.equal(r.s.tangiblePlacement,null);
  r.s.phase='READY';r.rules.prepareTangiblePlacement(1);assert.equal(r.pending()?.id,1);assert.deepEqual(r.s.tangibles,{});
  r.rules.onTangibleControl({type:'TangibleControl',id:1,t:0,action:'configure'});assert.equal(r.pending()?.id,1,'obsolete configure packet cannot cancel a valid grant');
});
await test('midpoint and orthogonal wall direction stay exact, order-independent and physically sized',()=>{
  const r=rig(),p=r.s.params,a={x:880,y:500},b={x:960,y:580};
  const wall=tangibleTouchPose('wall',a,b,p)!;
  assert.deepEqual(tangibleTouchPose('wall',b,a,p),wall);
  assert.equal(wall.x,920/1920);assert.equal(wall.y,.5);assert.equal(wall.angle,135);
  assert.equal(tangibleTouchPose('pylon',a,b,p)?.angle,0);
  r.rules.prepareTangiblePlacement(1);r.place(1,a,b);assert.equal(r.s.walls[0].lengthPx,p.wallLengthPx);
  assert.equal(r.s.walls[0].widthPx,p.wallWidthPx);assert.equal(r.s.walls[0].angle,135);
});
await test('invalid contacts, stale tokens and wrong ids cannot consume or forge a placement; replay cannot move it',()=>{
  const r=rig();r.rules.prepareTangiblePlacement(1);const token=r.pending()!.token;
  r.place(2);r.place(1,undefined,undefined,token+1);
  for(const [a,b] of [[{x:NaN,y:540},{x:980,y:540}],[{x:900,y:540},{x:901,y:540}],[{x:600,y:540},{x:1500,y:540}],[{x:-20,y:540},{x:80,y:540}],[{x:100,y:100},{x:200,y:100}]])r.place(1,a,b);
  assert.equal(r.pending()?.token,token);assert.equal(r.s.walls.length,0);
  r.place(1);assert.equal(r.s.tangiblePlacement,null);const before=JSON.stringify(r.s.tangibles);
  r.place(1,{x:1000,y:600},{x:1100,y:600},token);r.rules.prepareTangiblePlacement(1);
  assert.equal(JSON.stringify(r.s.tangibles),before);assert.equal(r.s.tangiblePlacement,null);
  r.rules.onTangibleRemoved({type:'TangibleRemoved',id:1,t:0});assert.equal(r.s.walls.length,0);
  r.rules.prepareTangiblePlacement(1);assert.notEqual(r.pending()?.token,token);
  r.place(1,undefined,undefined,token);assert.equal(r.s.walls.length,0);
});
await test('pylons remain neutral electrical fields and form the real damaging arc',()=>{
  const r=rig();r.rules.prepareTangiblePlacement(2);r.place(2,{x:850,y:540},{x:950,y:540});
  r.rules.prepareTangiblePlacement(3);r.place(3,{x:1050,y:540},{x:1150,y:540});
  assert.equal(r.s.arcs.length,1);assert.equal(r.s.arcs[0].team,null);
  for(const team of ['A','B'] as const){const car=r.s.cars[team];car.pos={x:1000,y:540};car.invulnUntil=0;r.rules.afterMove(team,car.pos,r.clock.now);assert.ok(car.hp<r.s.params.hpMax,'neutral arc damages either team');}
});
await test('waiting expires in READY too; pause, reset and mode changes invalidate the grant without deleting placed objects',()=>{
  const r=rig();r.rules.prepareTangiblePlacement(1);const token=r.pending()!.token;
  r.clock.now+=TANGIBLE_WAIT_MS;new PhysicsLoop(r.s,r.rules,()=>{},()=>r.clock.now).step(r.clock.now);assert.equal(r.s.tangiblePlacement,null);
  r.rules.prepareTangiblePlacement(1);r.s.phase='RACE';r.rules.togglePause();assert.equal(r.s.tangiblePlacement,null);
  r.rules.togglePause();r.rules.prepareTangiblePlacement(1);r.place(1);r.rules.prepareTangiblePlacement(2);
  r.rules.setTangiblePlacementMode('manual');assert.equal(r.s.tangiblePlacement,null);assert.equal(r.s.walls.length,1);
  r.rules.setTangiblePlacementMode('touch');r.rules.prepareTangiblePlacement(2);r.rules.resetToLobby();assert.equal(r.s.tangiblePlacement,null);assert.equal(r.s.tangiblePlacementMode,'touch');
  r.rules.startRace();r.rules.prepareTangiblePlacement(1);assert.notEqual(r.pending()?.token,token);
});
await test('the reserved interval blocks gameplay gestures without spending the armed bonus',()=>{
  const r=rig();r.s.phase='RACE';r.s.cars.A.heldItem='boost';r.rules.onPower('A');r.rules.prepareTangiblePlacement(1);
  const gate={type:'BoostGate' as const,t:0,team:'A' as const,a:{x:880,y:540},b:{x:1000,y:540}};
  r.rules.onBoostGate(gate);r.rules.onBorderPull({type:'BorderPull',t:0,team:'A',at:{x:960,y:400},dx:0,dy:60} as never);
  assert.equal(r.s.boostGates.length,0);assert.equal(r.s.deformations.length,0);assert.equal(r.s.cars.A.itemArmed,true);
  r.rules.cancelTangiblePlacement();r.rules.onBoostGate(gate);assert.equal(r.s.boostGates.length,1);
});
await test('two new fingers place once in about 90 ms despite jitter, ahead of the armed boost',async()=>{
  const r=gestures();r.announce();r.down(1,880,540);r.down(2,980,540);
  for(let i=0;i<5;i++){await sleep(15);r.move(1,881+i*.1,540);r.move(2,981+i*.1,540);}
  await sleep(45);const placements=r.sent.filter(m=>m.type==='TangibleTouchPlaced');assert.equal(placements.length,1);
  const msg=placements[0] as unknown as TangibleTouchPlacedMsg;r.rules.onTangibleTouchPlaced(msg);r.g.syncState();
  assert.equal(r.s.walls[0].angle,90);r.up(1,881,540);r.up(2,981,540);await sleep(200);
  assert.equal(r.sent.filter(m=>m.type==='BoostGate').length,0);assert.equal(r.sent.filter(m=>m.type==='TangibleTouchPlaced').length,1);
});
await test('old contacts cannot join the next grant, while copilot POWER and repair pads remain independent',async()=>{
  const r=gestures();r.down(1,880,540);r.announce();r.down(2,980,540);await sleep(130);assert.equal(r.sent.length,0);
  r.up(1,880,540);r.up(2,980,540);
  const {panelOf,localToWorld,padLocal,POWER_BTN_LOCAL}=await import('../server/layout.js');
  const panel=panelOf('A','copilot'),pad=padLocal('copilot'),at=localToWorld(panel,pad.x,pad.y),power=localToWorld(panel,POWER_BTN_LOCAL.x,POWER_BTN_LOCAL.y);
  r.down(3,at.x,at.y);r.down(4,power.x,power.y);r.up(4,power.x,power.y);
  r.down(5,880,540);r.down(6,980,540);await sleep(130);
  assert.equal(r.sent.filter(m=>m.type==='TangibleTouchPlaced').length,1);assert.equal(r.sent.filter(m=>m.type==='Power').length,1);
  r.up(3,at.x,at.y);assert.deepEqual(r.sent.filter(m=>m.type==='PadHold').map(m=>m.on),[true,false]);r.g.releaseAll();
});
await test('a third contact, cancellation, a palm or a withdrawn grant never falls through to another gesture',async()=>{
  for(const scenario of ['third','cancel','palm','withdraw','pause']){
    const r=gestures();r.announce();r.down(1,880,540);r.down(2,980,540,'touch',scenario==='palm'?200:1);
    if(scenario==='third')r.down(3,930,600);
    if(scenario==='cancel')r.cancel(2);
    if(scenario==='withdraw'){r.rules.cancelTangiblePlacement();r.g.syncState();}
    if(scenario==='pause'){r.rules.togglePause();r.g.syncState();}
    await sleep(220);assert.equal(r.sent.length,0,scenario);r.g.releaseAll();
  }
});
await test('READY accepts contact placement; mouse testing uses two clicks with the same geometry',async()=>{
  const r=gestures();r.s.phase='READY';r.announce(2);r.down(1,880,400);r.down(2,980,400);await sleep(130);
  assert.equal(r.sent[0]?.type,'TangibleTouchPlaced');r.g.releaseAll();
  r.s.phase='RACE';r.announce(1);r.down(3,880,400,'mouse');r.up(3,880,400);r.down(3,980,400,'mouse');r.up(3,980,400);
  assert.equal(r.sent.filter(m=>m.type==='TangibleTouchPlaced').length,2);r.g.releaseAll();
});
console.log(`\n${passed} touch-placement scenarios passed`);
process.exit(0);
