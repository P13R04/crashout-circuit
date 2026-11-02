/**
 * Vérifie le suivi du circuit, les collisions et la réparation du mode d’essai à voitures autonomes.
 * Liens : server/GameRules.ts, server/PhysicsLoop.ts, server/MapGenerator.ts, server/geometry.ts,
 * server/config.ts et les utilitaires importés ci-dessous.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import { createInitialState, GameRules } from '../server/GameRules.js';
import { PhysicsLoop } from '../server/PhysicsLoop.js';
import { config } from '../server/config.js';
import { generate, selfCrossings } from '../server/MapGenerator.js';
import { dist, nearestOnTrack, wrapAngle } from '../server/geometry.js';
import type { Team, Vec2 } from '../server/types.js';

let passed = 0;
/** Enregistre ou exécute le scénario et l’ajoute au bilan de vérification. */
function test(name: string, run: () => void): void { run(); passed++; console.log(`  ✓ ${name}`); }
/** Prépare l’état, l’horloge et les dépendances contrôlées nécessaires au scénario. */
function rig(begin = true) {
  const state = createInitialState(), clock = { now: 1_000_000 };
  state.params.difficulty='hard'; // Preserve the reference-speed scenarios; ratios have dedicated tests.
  const feedback: Array<{ kind: string; team: Team }> = [];
  const rules = new GameRules(state, {
    /** Applique la phase demandée à l’état contrôlé du test. */
    transition: phase => { state.phase = phase; }, /* Remplace la diffusion réseau inutile dans ce test de règles locales. */ broadcastFull() {},
    /** Enregistre le retour des règles pour pouvoir vérifier les événements produits. */
    feedback: (kind, _x, _y, team) => feedback.push({ kind, team }),
  }, /* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ () => clock.now, /* Fixe le tirage aléatoire des bonus pour rendre l’essai autonome reproductible. */ () => .1);
  const physics = new PhysicsLoop(state, rules, /* Laisse cette notification sans effet dans le scénario local. */ () => {}, /* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ () => clock.now);
  /** Fait avancer le scénario d’un pas de physique avec son horloge contrôlée. */
  const step = () => { clock.now += 1000 / 60; physics.step(clock.now, 1 / 60); };
  /** Fait avancer l’horloge et la simulation pendant la durée demandée. */
  const advance = (ms: number) => { for (let i = 0; i < Math.ceil(ms / (1000 / 60)); i++) step(); };
  rules.startTangibleTest();
  if (begin) { rules.beginRace(); advance(5100); }
  return { state, rules, clock, feedback, step, advance };
}
/** Pose le tangible avec les coordonnées du scénario en passant par les règles serveur. */
function place(r: ReturnType<typeof rig>, id: 1|2|3, at: Vec2, angle = 0): void {
  r.rules.onTangibleControl({ type:'TangibleControl', t:0, id, action:'dock', team:'A' });
  r.rules.onTangibleControl({ type:'TangibleControl', t:0, id, action:'activate' });
  r.rules.onTangibleMoved({ type:'TangibleMoved', t:0, id, x:at.x/1920, y:at.y/1080, angle });
  assert.equal(r.state.tangibles[id]?.status, 'placed', 'fixture uses the real charged placement rule');
}

/** Vérifie l’attente du départ et le décalage des voitures dans la session autonome. */
test('separate preset session waits for PLAY; countdown and delayed second start stay physical', () => {
  const r = rig(false), initial = structuredClone(r.state.cars);
  assert.equal(r.state.phase,'READY'); assert.equal(r.state.sessionMode,'tangibles-test');
  assert.equal(r.state.mapMode,'table'); assert.equal(r.state.tutorial,null);
  assert.deepEqual(r.state.testMode,{invincible:false,allItems:false});
  r.advance(10_000); assert.deepEqual(r.state.cars,initial);
  r.rules.beginRace(); r.advance(2900); assert.deepEqual(r.state.cars,initial);
  r.advance(700);
  assert.ok(dist(r.state.cars.A.pos,initial.A.pos)>1);
  assert.deepEqual(r.state.cars.B.pos,initial.B.pos,'B starts two seconds after A');
  r.advance(2100); assert.ok(dist(r.state.cars.B.pos,initial.B.pos)>1);
});
/** Vérifie plusieurs tours autonomes sans victoire ni réparation superflue. */
test('automatic pilots complete many laps without ending the test or repairing healthy cars', () => {
  const r=rig(); let worst=0;
  for(let i=0;i<360*60;i++){
    r.step();
    if(i%6===0)for(const car of Object.values(r.state.cars))worst=Math.max(worst,nearestOnTrack(car.pos,r.state.track!).distance);
  }
  for(const car of Object.values(r.state.cars)){
    assert.equal(car.hp,100);assert.equal(car.disabled,false);assert.ok(car.lap>config.lapsToWin);
    assert.equal(r.state.repairPads[`${car.team}-pilot`].held,false);
    assert.ok(car.heldItem,'normal pickups remain stocked for the human copilot');
  }
  assert.ok(worst<25,`centre-line error ${worst.toFixed(1)} px`);
  assert.equal(r.state.phase,'RACE','no lap or five-minute limit in the test');
});
/** Vérifie le retour progressif au centre d’une voiture déviée sans la téléporter. */
test('a displaced and rotated vehicle steers back gradually with no positional snap', () => {
  const r=rig(),car=r.state.cars.A,track=r.state.track!,hit=nearestOnTrack(car.pos,track);
  const a=track.centerline[hit.index],b=track.centerline[(hit.index+1)%track.centerline.length];
  const angle=Math.atan2(b.y-a.y,b.x-a.x);
  car.pos={x:hit.closest.x-Math.sin(angle)*28,y:hit.closest.y+Math.cos(angle)*28};car.angle=angle+.3;car.speed=150;
  const start={...car.pos};r.step();
  assert.ok(dist(start,car.pos)<4,'movement comes only from velocity integration');
  r.advance(3000);assert.equal(car.disabled,false);
  assert.ok(nearestOnTrack(car.pos,track).distance<8);
});
/** Vérifie que le pilote autonome subit réellement le mur diagonal au lieu de l’éviter. */
test('diagonal wall causes the real damage and rebound; pilots do not anticipate it', () => {
  const r=rig(),track=r.state.track!,at=track.centerline[218],next=track.centerline[219];
  const angle=Math.atan2(next.y-at.y,next.x-at.x)*180/Math.PI+65;
  place(r,1,at,angle);
  const hit = new Set<Team>();let rebound=false;
  for(let i=0;i<8*60;i++){
    const before={A:r.state.cars.A.angle,B:r.state.cars.B.angle};const count=r.feedback.length;
    r.step();
    for(const event of r.feedback.slice(count))if(event.kind==='hit'){
      hit.add(event.team);
      rebound ||= Math.abs(wrapAngle(r.state.cars[event.team].angle-before[event.team]))>.1;
    }
    if(hit.size===2)break;
  }
  assert.equal(hit.size,2,'both cars hit the obstacle instead of avoiding it');
  assert.ok(rebound,'wall reflection changes heading before the next pilot correction');
  assert.ok(Object.values(r.state.cars).every(/* Vérifie que les deux voitures ont réellement perdu de la santé au contact électrique. */ c=>c.hp<100));
});
/** Vérifie les dégâts et le ralentissement des deux voitures autonomes dans les champs électriques. */
test('neutral electrical fields and the connecting arc hurt and slow both automatic cars', () => {
  const r=rig(),track=r.state.track!;
  place(r,2,track.centerline[217]);place(r,3,track.centerline[226]);
  assert.equal(r.state.arcs.length,1);
  const slowed=new Set<Team>();
  for(let i=0;i<10*60;i++){
    const speed={A:r.state.cars.A.speed,B:r.state.cars.B.speed};const count=r.feedback.length;
    r.step();
    for(const event of r.feedback.slice(count))if(event.kind==='electricHit'){
      const car=r.state.cars[event.team];
      assert.ok(car.hp<100);assert.ok(car.slowUntil>r.clock.now);
      assert.ok(car.speed<=speed[event.team]*.51+3,'electrical slow-down survives the controller');
      slowed.add(event.team);
    }
    if(slowed.size===2)break;
  }
  assert.equal(slowed.size,2);
});
/** Vérifie que seul le pad pilote est automatique pendant la réparation et que le copilote doit maintenir le sien. */
test('destruction holds only the pilot pad; the copilot must hold continuously to repair', () => {
  const r=rig(),car=r.state.cars.A;
  r.rules.damage(car,100,r.clock.now);const broken={...car.pos};r.advance(5000);
  assert.equal(car.disabled,true);assert.deepEqual(car.pos,broken);assert.equal(car.hp,0);
  assert.equal(r.state.repairPads['A-pilot'].held,true);assert.equal(r.state.repairPads['A-copilot'].held,false);
  assert.equal(r.state.repairProgress.A,0);
  r.rules.onPadHold({type:'PadHold',t:0,team:'A',role:'pilot',on:false});
  assert.equal(r.state.repairPads['A-pilot'].held,true,'client input cannot release the automatic pad');
  r.rules.onPadHold({type:'PadHold',t:0,team:'A',role:'copilot',on:true});r.advance(800);
  assert.ok(r.state.repairProgress.A>.3&&r.state.repairProgress.A<.5);
  r.rules.onPadHold({type:'PadHold',t:0,team:'A',role:'copilot',on:false});r.advance(100);
  assert.equal(r.state.repairProgress.A,0);
  r.rules.onPadHold({type:'PadHold',t:0,team:'A',role:'copilot',on:true});r.advance(2200);
  assert.equal(car.disabled,false);assert.equal(car.hp,config.repairHpRestore);
  assert.equal(r.state.repairPads['A-pilot'].held,false);
  const repaired={...car.pos};r.advance(1000);assert.deepEqual(car.pos,repaired);r.advance(3000);assert.ok(dist(repaired,car.pos)>20);
});
/** Vérifie la réparation humaine d’une voiture affaiblie sans soin automatique. */
test('low health can also be repaired by the human copilot; no automatic healing', () => {
  const r=rig(),car=r.state.cars.B;r.rules.damage(car,50,r.clock.now);r.advance(1000);
  assert.equal(car.hp,50);assert.equal(r.state.repairPads['B-pilot'].held,true);
  r.rules.onPadHold({type:'PadHold',t:0,team:'B',role:'copilot',on:true});r.advance(2100);
  assert.equal(car.hp,config.repairHpRestore);assert.equal(r.state.repairPads['B-pilot'].held,false);
});
/** Vérifie la reprise de la bonne direction après plusieurs réparations au checkpoint. */
test('repeated checkpoint repairs reacquire the forward route without affecting the other car', () => {
  const r=rig();
  for(let i=0;i<8;i++){
    r.advance(1700+i*600);r.rules.damage(r.state.cars.A,100,r.clock.now);r.advance(100);
    r.rules.onPadHold({type:'PadHold',t:0,team:'A',role:'copilot',on:true});r.advance(2300);
    r.rules.onPadHold({type:'PadHold',t:0,team:'A',role:'copilot',on:false});r.advance(3000);
    assert.equal(r.state.cars.A.disabled,false);assert.equal(r.state.cars.A.hp,config.repairHpRestore);
    assert.equal(r.state.cars.B.disabled,false);assert.equal(r.state.cars.B.hp,100);
  }
});
/** Vérifie la pause et la reprise de l’essai autonome avec relâchement des pads. */
test('pause freezes autonomous movement and releases pads; resume continues the same test', () => {
  const r=rig();r.rules.damage(r.state.cars.B,100,r.clock.now);r.advance(100);
  r.rules.togglePause();const cars=structuredClone(r.state.cars);
  r.advance(10_000);assert.deepEqual(r.state.cars,cars);assert.equal(r.state.repairPads['B-pilot'].held,false);
  r.rules.togglePause();r.advance(1000);
  assert.equal(r.state.sessionMode,'tangibles-test');assert.equal(r.state.repairPads['B-pilot'].held,true);
  assert.ok(dist(cars.A.pos,r.state.cars.A.pos)>20);
});
/** Vérifie l’absence de reprise manuelle ou de triche tout en conservant POWER et les gestes du copilote. */
test('pilot commands and PC cheats cannot override the test; the copilot keeps POWER and theft', () => {
  const r=rig();const inputs=structuredClone(r.rules.inputs),modes=structuredClone(r.state.driveMode);
  r.rules.onPilotInput('A',{type:'PilotInput',t:0,team:'A',throttle:0,steer:-1});r.rules.toggleDriveMode('A');
  assert.deepEqual(r.rules.inputs,inputs);assert.deepEqual(r.state.driveMode,modes);
  r.rules.onTestToggle({type:'TestToggle',t:0,flag:'invincible',on:true});
  assert.equal(r.state.testMode.invincible,false);
  r.state.cars.A.heldItem='boost';r.state.cars.B.heldItem=null;r.rules.onPower('A');
  r.rules.onBoostGate({type:'BoostGate',t:0,team:'B',a:{x:900,y:700},b:{x:1100,y:700}});
  assert.equal(r.state.cars.A.heldItem,null);assert.equal(r.state.boostGates[0].team,'B');
});
/** Vérifie le retour aux modes habituels sans conserver les appuis automatiques de réparation. */
test('return to lobby restores normal table, PC and tutorial sessions without automatic repair', () => {
  const r=rig();r.rules.resetToLobby();assert.equal(r.state.sessionMode,'race');
  r.rules.enterMap('pc');assert.equal(r.state.mapMode,'pc');assert.equal(r.state.phase,'MAP');
  r.rules.startRace();r.advance(3100);r.rules.damage(r.state.cars.A,100,r.clock.now);r.advance(1000);
  assert.equal(r.state.repairPads['A-pilot'].held,false,'normal multiplayer still needs a pilot');
  r.rules.resetToLobby();r.rules.startTutorial('table');assert.equal(r.state.sessionMode,'race');assert.ok(r.state.tutorial);
});
/** Vérifie le suivi de la bonne branche dans un huit et sur une piste déformée. */
test('a figure-eight crossing keeps its branch; local track deformations remain drivable', () => {
  const r=rig(false),a={x:560,y:540},b={x:1360,y:540};
  /** Construit une portion ondulée pour tester les courbes et les croisements du circuit. */
  const wave=(p:Vec2,q:Vec2)=>Array.from({length:121},/* Construit un point échantillonné de la courbe utilisée par le scénario. */ (_,i)=>{const t=i/120;return{x:p.x+(q.x-p.x)*t,y:540-170*Math.sin(2*Math.PI*t)};});
  const track=generate(wave(a,b),wave(b,a),a,b,b,a);assert.ok(selfCrossings(track.centerline).length);
  r.rules.startRace(track);r.advance(100_000);
  for(const car of Object.values(r.state.cars)){assert.equal(car.disabled,false);assert.ok(car.lap>1);}
  const edge=track.outerEdge[20],center=track.centerline[20],d=dist(edge,center);
  r.rules.onBorderPull({type:'BorderPull',t:0,team:'A',x:edge.x,y:edge.y,dx:(edge.x-center.x)/d*40,dy:(edge.y-center.y)/d*40});
  r.advance(12_000);for(const car of Object.values(r.state.cars))assert.equal(car.disabled,false);
});
console.log(`\n${passed} automatic-pilot scenarios passed`);
