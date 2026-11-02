/**
 * Vérifie le départ aléatoire et la progression de l’animation de construction, y compris les reconnexions
 * et les modes prédéfinis.
 * Liens : server/GameRules.ts, server/PhysicsLoop.ts, server/MapGenerator.ts, server/geometry.ts,
 * server/trackPresentation.ts et les utilitaires importés ci-dessous.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import {generatePreset,generate,randomizeRaceStart,selfCrossings} from '../server/MapGenerator.js';
import {nearestOnTrack} from '../server/geometry.js';
import {createInitialState,GameRules} from '../server/GameRules.js';
import {PhysicsLoop} from '../server/PhysicsLoop.js';
import {TRACK_PRESENTATION_MS,TRACK_REVEAL_MS,FINISH_ROULETTE_MS,presentationFrame,presentingTrack,rouletteTravel} from '../server/trackPresentation.js';
import {PresentationRoute} from '../client-table/TrackCreation.js';

const p1={x:560,y:540},p2={x:1360,y:540};
/** Construit une portion ondulée pour tester les courbes et les croisements du circuit. */
const wave=(a:typeof p1,b:typeof p1)=>Array.from({length:121},/* Construit un point échantillonné de la courbe utilisée par le scénario. */ (_,i)=>({x:a.x+(b.x-a.x)*i/120,y:540-170*Math.sin(2*Math.PI*i/120)}));
const eight=generate(wave(p1,p2),wave(p2,p1),p1,p2,p2,p1),source=generatePreset();
assert.ok(selfCrossings(eight.centerline).length>0,'fixture includes a real junction');
for(const original of [source,eight]){
const before=JSON.stringify(original),starts=new Set<number>();
for(let i=0;i<40;i++){
  const track=randomizeRaceStart(original,/* Fait varier régulièrement le tirage pour tester plusieurs départs possibles. */ ()=>i/40);starts.add(track.featureIndices.start);
  assert.deepEqual(track.centerline,original.centerline);assert.deepEqual(track.outerEdge,original.outerEdge);
  assert.deepEqual(track.checkpoints[0].pos,track.startLine.pos);assert.equal(track.featureIndices.checkpoints[0],track.featureIndices.start);
  assert.equal(new Set(track.featureIndices.checkpoints).size,track.checkpoints.length);
  for(const pos of track.startPositions){const hit=nearestOnTrack(pos,track);assert.ok(hit.distance+10<hit.halfWidth,'both cars start inside the same real ribbon');}
  const route=new PresentationRoute(track),origin=43,end=route.roulette(origin,1);
  assert.ok(Math.hypot(end.x-track.startLine.pos.x,end.y-track.startLine.pos.y)<1e-7,'the visible draw lands on the authoritative line');
  assert.ok(Math.abs(end.nx-track.startLine.normal.x)+Math.abs(end.ny-track.startLine.normal.y)<1e-7,'finish orientation agrees with the car heading');
  const wrapped=route.at(route.length*4+123),local=route.at(123);
  assert.ok(Math.hypot(wrapped.x-local.x,wrapped.y-local.y)<1e-7);
}
assert.ok(starts.size>8,'the draw has multiple possible landing places');assert.equal(JSON.stringify(original),before,'randomizing does not deform the drawing');
}
assert.equal(rouletteTravel(0),0);assert.ok(Math.abs(rouletteTravel(1)-1)<1e-12);
/** Estime la vitesse de la roulette à partir de deux instants voisins. */
const speed=(t:number)=>(rouletteTravel(t+.00001)-rouletteTravel(t))/.00001;
assert.ok(Math.abs(speed(.05)-speed(.2))<1e-7,'initial cruise speed is constant');
let previous=Infinity;
for(let i=25;i<100;i++){const v=speed(i/100);assert.ok(v>=0&&v<previous,'roulette only slows and never reverses');previous=v;}
assert.ok(speed(.999)<.00002,'the final position arrives smoothly');

let now=1_000_000;
const state=createInitialState(),rules=new GameRules(state,{/* Enregistre le retour des règles pour pouvoir vérifier les événements produits. */ feedback(){},/* Applique la phase demandée à l’état contrôlé du test. */ transition(phase){state.phase=phase;},/* Remplace la diffusion réseau inutile dans ce test de règles locales. */ broadcastFull(){}},/* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ ()=>now);
const presentation={startedAt:now+120,originIndex:0},chosen=randomizeRaceStart(source,/* Fixe le départ du scénario de présentation pour rendre ses assertions reproductibles. */ ()=>.73);
rules.startRace(chosen,true,presentation);const positions=structuredClone([state.cars.A.pos,state.cars.B.pos]);
const physics=new PhysicsLoop(state,rules,/* Laisse cette notification sans effet dans le scénario local. */ ()=>{},/* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ ()=>now);
for(const elapsed of [0,100,1000,TRACK_REVEAL_MS,TRACK_REVEAL_MS+FINISH_ROULETTE_MS,TRACK_PRESENTATION_MS-1]){
  now=presentation.startedAt+elapsed;assert.ok(presentingTrack(state,now));
  rules.beginRace();physics.step(now);assert.equal(state.phase,'READY');
  assert.deepEqual([state.cars.A.pos,state.cars.B.pos],positions,'no driving or placement before the line settles');
}
now=presentation.startedAt+TRACK_PRESENTATION_MS;assert.equal(presentingTrack(state,now),false);rules.beginRace();
assert.equal(state.phase,'RACE');assert.equal(state.sessionStartAt,now+3000);assert.equal(state.trackPresentation,null);
assert.deepEqual(state.track?.startLine,chosen.startLine);
rules.resetToLobby();assert.equal(state.trackPresentation,null);rules.startTutorial('table');assert.equal(state.trackPresentation,null,'the tutorial preset is immediate');
rules.resetToLobby();rules.startTangibleTest();assert.equal(state.trackPresentation,null,'the small-player tangible test keeps its immediate preset');
assert.equal(presentationFrame(presentation,presentation.startedAt+TRACK_REVEAL_MS-1).stage,'reveal');
assert.equal(presentationFrame(presentation,presentation.startedAt+TRACK_REVEAL_MS).stage,'roulette');
assert.equal(presentationFrame(presentation,presentation.startedAt+TRACK_REVEAL_MS+FINISH_ROULETTE_MS).stage,'lock');
console.log('Track creation: random finish, coordinated features, distance sampling, smooth deceleration, authoritative timing and preset modes passed');
