/**
 * Vérifie les niveaux de vitesse, les tours et le chronomètre, y compris après pause ou retour à l’accueil.
 * Liens : server/GameRules.ts, server/PhysicsLoop.ts, server/config.ts, server/types.ts.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import {createInitialState,GameRules} from '../server/GameRules.js';
import {PhysicsLoop} from '../server/PhysicsLoop.js';
import {config} from '../server/config.js';
import type {Difficulty} from '../server/types.js';
/** Prépare l’état, l’horloge et les dépendances contrôlées nécessaires au scénario. */
const rig=()=>{const s=createInitialState(),clock={now:1_000_000};const rules=new GameRules(s,{/* Applique la phase demandée à l’état contrôlé du test. */ transition:p=>{s.phase=p;},/* Remplace la diffusion réseau inutile dans ce test de règles locales. */ broadcastFull(){},/* Enregistre le retour des règles pour pouvoir vérifier les événements produits. */ feedback(){}},/* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ ()=>clock.now);return{s,clock,rules};};
const r=rig();assert.equal(r.s.params.difficulty,'easy');assert.equal(r.s.params.sessionMaxSeconds,0);
r.rules.startRace();r.clock.now+=3_600_000;r.rules.checkEnd(r.clock.now);assert.equal(r.s.phase,'RACE','no timer means no time-based finish');
for(const [difficulty,scale] of [['easy',.5],['medium',.75],['hard',1]] as const){
  for(const pedal of [false,true]){const q=rig();q.rules.updateRaceSettings({type:'RaceSettings',t:0,difficulty});q.rules.startRace();q.s.driveMode.A=pedal?'pedal':'auto';q.rules.inputs.A.throttle=1;q.s.track!.widths.fill(10000);q.clock.now=q.s.sessionStartAt;
    const physics=new PhysicsLoop(q.s,q.rules,/* Laisse cette notification sans effet dans le scénario local. */ ()=>{},/* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ ()=>q.clock.now);for(let i=0;i<90;i++){q.clock.now+=1000/60;physics.step(q.clock.now);}
    assert.ok(Math.abs(q.s.cars.A.speed-(pedal?config.vMaxPedal:config.vMaxFwd)*scale)<1e-6,`${difficulty} respects its speed ratio`);
  }
}
const q=rig();q.rules.updateRaceSettings({type:'RaceSettings',t:0,lapsToWin:2,sessionMaxSeconds:60});q.rules.startRace();q.clock.now=q.s.sessionStartAt+30_000;q.rules.togglePause();const end=q.s.raceDeadline;q.clock.now+=20_000;q.rules.togglePause();assert.equal(q.s.raceDeadline,end+20_000,'pause freezes the countdown');q.clock.now=q.s.raceDeadline-1;q.rules.checkEnd(q.clock.now);assert.equal(q.s.phase,'RACE');q.clock.now++;q.rules.checkEnd(q.clock.now);assert.equal(q.s.phase,'RESULT');
const laps=rig();laps.rules.updateRaceSettings({type:'RaceSettings',t:0,lapsToWin:2});laps.rules.startRace();laps.clock.now=laps.s.sessionStartAt; laps.s.cars.A.lap=1;laps.rules.checkEnd(laps.clock.now);assert.equal(laps.s.phase,'RACE');laps.s.cars.A.lap=2;laps.rules.checkEnd(laps.clock.now);assert.equal(laps.s.winner,'A');
const invalid=rig(),before=JSON.stringify(invalid.s.params);invalid.rules.updateRaceSettings({type:'RaceSettings',t:0,lapsToWin:0,difficulty:'hard'});invalid.rules.updateRaceSettings({type:'RaceSettings',t:0,sessionMaxSeconds:-1});invalid.rules.updateRaceSettings({type:'RaceSettings',t:0,difficulty:'unknown' as Difficulty});assert.equal(JSON.stringify(invalid.s.params),before,'invalid settings never partially apply');invalid.rules.updateRaceSettings({type:'RaceSettings',t:0,lapsToWin:5,difficulty:'medium'});invalid.rules.resetToLobby();assert.equal(invalid.s.params.lapsToWin,5);assert.equal(invalid.s.params.difficulty,'medium');
console.log('Race settings: default, six speed ratios, laps, timer, pause, validation and reset passed');
