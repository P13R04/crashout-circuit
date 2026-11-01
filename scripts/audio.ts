import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TRACK_REVEAL_MS,FINISH_ROULETTE_MS} from '../server/trackPresentation.js';
import {AudioTimeline,CueGate,audioSettings,DEFAULT_AUDIO} from '../client-table/AudioPlan.js';
import {TableAudio} from '../client-table/Sound.js';
import {AUDIO_ASSETS} from '../client-table/AudioAssets.js';
import {audioByteRange} from '../server/audioHttp.js';
import {createInitialState,GameRules} from '../server/GameRules.js';
import {generatePreset} from '../server/MapGenerator.js';
import {createView} from '../client-table/view.js';
let passed=0;
async function test(name:string,fn:()=>void|Promise<void>){await fn();passed++;console.log(`  ✓ ${name}`);}
const kinds=(cues:{kind:string}[])=>cues.map(c=>c.kind);
await test('streamed music supports bounded, suffix and open byte ranges and rejects invalid seeks',()=>{
  assert.deepEqual(audioByteRange('bytes=0-9',100),{start:0,end:9});assert.deepEqual(audioByteRange('bytes=80-',100),{start:80,end:99});
  assert.deepEqual(audioByteRange('bytes=-20',100),{start:80,end:99});assert.deepEqual(audioByteRange('bytes=90-999',100),{start:90,end:99});
  for(const range of ['bytes=200-','bytes=20-2','bytes=-0','bytes=0-2,8-9','bad'])assert.equal(audioByteRange(range,100),null);
});
await test('audio levels are clamped and corrupt preferences have safe defaults',()=>{
  assert.deepEqual(audioSettings(null),DEFAULT_AUDIO);
  assert.deepEqual(audioSettings({enabled:false,effects:9,ambience:-2,music:Number.NaN}),{enabled:false,effects:1,ambience:0,music:.12});
});
await test('countdowns follow the authoritative clock once, and never replay late on connection',()=>{
  const s=createInitialState(),timeline=new AudioTimeline();s.phase='RACE';s.sessionStartAt=13000;
  assert.deepEqual(kinds(timeline.step(s,10000)),['countdown']);
  assert.deepEqual(kinds(timeline.step(s,10100)),[]);
  assert.deepEqual(kinds(timeline.step(s,11001)),['countdown']);
  assert.deepEqual(kinds(timeline.step(s,12001)),['countdown']);
  assert.deepEqual(kinds(timeline.step(s,13001)),['go']);assert.deepEqual(kinds(timeline.step(s,14000)),[]);
  assert.deepEqual(kinds(new AudioTimeline().step(s,20000)),[],'joining an ongoing race has no stale GO');
});
await test('the tutorial start lights stay silent until all four stations have identified themselves',()=>{
  const s=createInitialState(),timeline=new AudioTimeline();s.phase='RACE';s.sessionStartAt=13000;
  s.tutorial={steps:['identify','steer'],teams:{A:{step:0,sub:1},B:{step:1,sub:0}},finished:false};
  assert.deepEqual(kinds(timeline.step(s,10000)),[]);
  s.tutorial.teams.A.step=1;s.sessionStartAt=23000;
  assert.deepEqual(kinds(timeline.step(s,20000)),['countdown']);
  timeline.step(s,24000);s.cars.A.lap++;assert.deepEqual(kinds(timeline.step(s,25000)),[],'practice laps never announce a final lap');
});
await test('roulette ticks slow with the draw, confirm only at the landing, and never replay after joining',()=>{
  const s=createInitialState(),timeline=new AudioTimeline();s.phase='MAP';timeline.step(s,1000);
  s.phase='READY';s.trackPresentation={startedAt:1000,originIndex:0};
  assert.deepEqual(kinds(timeline.step(s,1000)),[],'no ready chime when construction has just begun');
  timeline.step(s,1000+TRACK_REVEAL_MS);
  assert.deepEqual(kinds(timeline.step(s,1000+TRACK_REVEAL_MS+200)),['rouletteTick']);
  assert.deepEqual(kinds(timeline.step(s,1000+TRACK_REVEAL_MS+200)),[]);
  const landing=1000+TRACK_REVEAL_MS+FINISH_ROULETTE_MS;
  assert.deepEqual(kinds(timeline.step(s,landing)),['raceReady']);assert.deepEqual(kinds(timeline.step(s,landing+100)),[]);
  assert.deepEqual(kinds(new AudioTimeline().step(s,landing+10000)),[],'late viewers do not hear an old landing');
});
await test('pause shifts the countdown without duplicate beeps or a backlog',()=>{
  const s=createInitialState(),timeline=new AudioTimeline();s.phase='RACE';s.sessionStartAt=13000;timeline.step(s,10000);timeline.step(s,11001);
  s.phase='PAUSED';s.pausedAt=11001;assert.deepEqual(kinds(timeline.step(s,15000)),['pause']);
  s.phase='RACE';s.sessionStartAt+=10000;assert.deepEqual(kinds(timeline.step(s,21001)),['resume']);
  assert.deepEqual(kinds(timeline.step(s,23001)),['go']);
});
await test('repair restart lights have their own countdown and checkpoints stay silent',()=>{
  const s=createInitialState(),timeline=new AudioTimeline();s.phase='RACE';s.sessionStartAt=1;timeline.step(s,10000);
  s.cars.A.respawnUntil=13000;assert.deepEqual(kinds(timeline.step(s,10001)),['countdown']);
  assert.deepEqual(kinds(timeline.step(s,11001)),['countdown']);timeline.step(s,12001);
  assert.deepEqual(kinds(timeline.step(s,13001)),['go']);
  s.cars.A.checkpointIndex++;assert.deepEqual(kinds(timeline.step(s,14000)),[]);
  s.cars.A.lap++;assert.ok(kinds(timeline.step(s,15000)).includes('lap'),'only complete laps are signalled');
});
await test('repair and warning signals remain sparse; operator selections stay silent',()=>{
  const s=createInitialState(),timeline=new AudioTimeline();s.phase='RACE';s.sessionStartAt=1;timeline.step(s,10000);
  s.cars.A.hp=20;s.repairProgress.A=.1;
  assert.deepEqual(kinds(timeline.step(s,10020)),['lowHealth','repairBegin']);
  assert.deepEqual(kinds(timeline.step(s,10030)),[]);
  s.repairProgress.A=0;assert.deepEqual(kinds(timeline.step(s,10040)),['repairInterrupted']);
  s.tangiblePlacement={id:1,token:1,expiresAt:20000};assert.deepEqual(kinds(timeline.step(s,10050)),[]);
  s.tangiblePlacement=null;assert.deepEqual(kinds(timeline.step(s,10060)),[]);
});
await test('simultaneous impacts and button repeats are rate limited by family',()=>{
  const gate=new CueGate();assert.ok(gate.accept('impact',0,.09));assert.equal(gate.accept('impact',.01,.09),false);assert.ok(gate.accept('impact',.1,.09));
  assert.ok(gate.accept('go',.1,.05));gate.clear();assert.ok(gate.accept('impact',.1,.09));
});
await test('downloaded assets match their source manifest and are distributable CC0 files',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../client-table/audio/sources.json',import.meta.url),'utf8')) as {file:string;license:string;sha256:string;seconds:number}[];
  assert.equal(manifest.length,Object.keys(AUDIO_ASSETS).length);
  for(const asset of manifest){const bytes=readFileSync(new URL('../client-table/audio/'+asset.file,import.meta.url));assert.equal(asset.license,'CC0-1.0');assert.ok(asset.seconds>0,'non-empty sample');assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.file);}
});
// A real graph API shape tests ownership/stop behaviour; no sound device is needed in CI.
class Param {value=0;setValueAtTime(v:number){this.value=v;}setTargetAtTime(v:number){this.value=v;}exponentialRampToValueAtTime(v:number){this.value=v;}}
class Node {gain=new Param();frequency=new Param();pan=new Param();playbackRate=new Param();threshold=new Param();knee=new Param();ratio=new Param();attack=new Param();release=new Param();onended:(()=>void)|null=null;buffer:unknown;loop=false;type='';connect<T>(node:T):T{return node;}disconnect(){}start(){}stop(at?:number){if(at===undefined)this.onended?.();}}
class Context {state='running';currentTime=0;destination=new Node();createGain(){return new Node();}createDynamicsCompressor(){return new Node();}createOscillator(){return new Node();}createBufferSource(){return new Node();}createStereoPanner(){return new Node();}createMediaElementSource(){return new Node();}resume(){this.state='running';return Promise.resolve();}decodeAudioData(){return Promise.resolve({duration:1});}}
class Media {paused=true;loop=false;preload='';constructor(_url:string){}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}addEventListener(){}}
const originalFetch=globalThis.fetch;
Object.assign(globalThis,{AudioContext:Context,Audio:Media,fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})});
await test('audio loads once, engines are bounded, and pause/mute/disconnect release every source',async()=>{
  const audio=new TableAudio();audio.unlock();await new Promise(r=>setTimeout(r,10));assert.equal(audio.diagnostics.decoded,13);
  const s=createInitialState(),view=createView(()=>10000);s.phase='RACE';s.sessionStartAt=1;s.cars.A.speed=s.cars.B.speed=140;
  view.state=s;view.theme='scrap';audio.update(view,10000);assert.equal(audio.diagnostics.loops,3,'two engines and one ambience');
  for(let i=0;i<100;i++)audio.update(view,10050+i*50);assert.equal(audio.diagnostics.loops,3,'no new source per frame');
  s.phase='PAUSED';s.pausedAt=10000;audio.update(view,20000);assert.equal(audio.diagnostics.loops,0);assert.equal(audio.diagnostics.music,false);
  audio.configure({enabled:false});assert.equal(audio.diagnostics.voices,0);
  audio.configure({enabled:true});s.phase='RACE';audio.update(view,20100);audio.connection(false);assert.equal(audio.diagnostics.loops,0);assert.equal(audio.diagnostics.voices,0);
  audio.connection(true);audio.update(view,20200);audio.focus(false);assert.equal(audio.diagnostics.loops,0);assert.equal(audio.diagnostics.music,false);
});
await test('a missing audio file never prevents synthesized gameplay feedback',async()=>{
  globalThis.fetch=(async()=>{throw Error('offline');}) as typeof fetch;
  const audio=new TableAudio();audio.unlock();await new Promise(r=>setTimeout(r,10));assert.equal(audio.diagnostics.failed,13);
  audio.feedback('go');assert.equal(audio.diagnostics.voices,1);audio.stop();assert.equal(audio.diagnostics.voices,0);
});
globalThis.fetch=originalFetch;
await test('electrical collisions report a zap event while keeping the same damage rules',()=>{
  const s=createInitialState(),events:string[]=[],clock=10000,rules=new GameRules(s,{transition:p=>{s.phase=p;},broadcastFull(){},feedback:kind=>events.push(kind)},()=>clock);
  s.phase='RACE';rules.startRace(generatePreset());s.cars.A.pos={...s.track!.centerline[30]};
  s.tangibles[2]={kind:'pylon',x:s.cars.A.pos.x/1920,y:s.cars.A.pos.y/1080,angle:0,team:null,status:'placed',active:true,dockTeam:null};
  rules.afterMove('A',{...s.cars.A.pos},clock);assert.ok(events.includes('electricHit'),'a real field collision selects electrical audio');assert.equal(s.cars.A.hp,90);
});
console.log(`\n${passed} audio checks passed`);
