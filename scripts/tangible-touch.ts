/**
 * Vérifie la pose des tangibles par contacts, la consommation de l’annonce et sa priorité sur les gestes de
 * bonus.
 * Liens : server/GameRules.ts, server/PhysicsLoop.ts, server/MapGenerator.ts, server/tangibleTouch.ts,
 * server/types.ts.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import { createInitialState, GameRules } from '../server/GameRules.js';
import { PhysicsLoop } from '../server/PhysicsLoop.js';
import { tangibleTouchPose, TANGIBLE_WAIT_MS } from '../server/tangibleTouch.js';
import { generatePreset } from '../server/MapGenerator.js';
import type { TangibleTouchPlacedMsg } from '../server/types.js';

const dom=globalThis as Record<string,unknown>;
dom.document={/* Remplace la recherche d’élément HTML lorsque le scénario utilise seulement un canvas simulé. */ getElementById:()=>null,/* Fournit un élément minimal permettant d’initialiser le rendu hors navigateur. */ createElement:()=>({/* Fournit le contexte Canvas de contrôle à la place du dessin réel. */ getContext:()=>null,style:{}})};
const {GestureRecognizer}=await import('../client-table/GestureRecognizer.js');
const {createView}=await import('../client-table/view.js');
/** Laisse passer le délai nécessaire aux confirmations tactiles du scénario. */
const sleep=(ms:number)=>new Promise(/* Attend le délai nécessaire au traitement asynchrone du scénario. */ r=>setTimeout(r,ms));
let passed=0;
/** Enregistre ou exécute le scénario et l’ajoute au bilan de vérification. */
async function test(name:string,run:()=>void|Promise<void>){await run();console.log(`  ✓ ${name}`);passed++;}
/** Prépare l’état, l’horloge et les dépendances contrôlées nécessaires au scénario. */
function rig(){
  const s=createInitialState(),clock={now:1_000_000};
  const rules=new GameRules(s,{/* Applique la phase demandée à l’état contrôlé du test. */ transition:p=>{s.phase=p;},/* Remplace la diffusion réseau inutile dans ce test de règles locales. */ broadcastFull(){},/* Enregistre le retour des règles pour pouvoir vérifier les événements produits. */ feedback(){}},/* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ ()=>clock.now);
  rules.startRace(generatePreset(),true);rules.setTangiblePlacementMode('touch');
  /** Pose le tangible avec les coordonnées du scénario en passant par les règles serveur. */
  const place=(id:1|2|3,a={x:880,y:540},b={x:980,y:540},token=s.tangiblePlacement?.token??0)=>
    rules.onTangibleTouchPlaced({type:'TangibleTouchPlaced',t:clock.now,id,token,a,b});
  return{s,clock,rules,place,/* Lit l’autorisation de pose encore présente dans l’état serveur du test. */ pending:()=>s.tangiblePlacement};
}
/** Relie les règles de tangibles à une reconnaissance tactile et une horloge de test. */
function gestures(){
  const r=rig(),view=createView(/* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ ()=>r.clock.now);view.state=r.s;
  r.s.phase='RACE';r.s.track=null;r.s.cars.A.heldItem='boost';r.s.cars.A.itemArmed=true;r.s.cars.A.itemArmExpiry=r.clock.now+60_000;
  const handlers:Record<string,(e:unknown)=>void>={},sent:Array<Record<string,unknown>>=[];
  const canvas={/* Conserve le gestionnaire du navigateur simulé pour pouvoir lui rejouer un événement. */ addEventListener:(key:string,fn:(e:unknown)=>void)=>{handlers[key]=fn;},/* Remplace la capture du navigateur, inutile lorsque les événements sont rejoués directement. */ setPointerCapture(){},/* Fournit les dimensions fixes du canvas de test pour convertir les contacts. */ getBoundingClientRect:()=>({left:0,top:0,width:1920,height:1080})};
  const g=new GestureRecognizer(canvas as never,view,/* Collecte la commande produite pour la comparer aux résultats attendus. */ msg=>sent.push(msg));
  /** Construit ou rejoue un événement synthétique avec les paramètres demandés par le scénario. */
  const event=(type:string,id:number,x:number,y:number,pointerType='touch',width=1)=>
    handlers[type]({type,pointerId:id,clientX:x,clientY:y,pointerType,width,height:width,timeStamp:r.clock.now,/* Remplace l’annulation de l’événement natif dans le navigateur simulé. */ preventDefault(){}});
  /** Rejoue la pose d’un doigt dans le gestionnaire de contacts du test. */
  const down=(id:number,x:number,y:number,type='touch',width=1)=>event('pointerdown',id,x,y,type,width);
  /** Rejoue le déplacement d’un doigt maintenu dans le scénario. */
  const move=(id:number,x:number,y:number)=>event('pointermove',id,x,y);
  /** Rejoue le retrait d’un doigt pour terminer sa commande ou son geste. */
  const up=(id:number,x:number,y:number)=>event('pointerup',id,x,y);
  /** Rejoue une interruption système du contact sans la confondre avec un geste confirmé. */
  const cancel=(id:number)=>event('pointercancel',id,900,540);
  /** Annonce le tangible puis synchronise la reconnaissance avant les contacts du scénario. */
  const announce=(id:1|2|3=1)=>{r.rules.prepareTangiblePlacement(id);g.syncState();};
  return{...r,view,g,sent,down,move,up,cancel,announce};
}

/** Vérifie les préconditions d’une annonce de pose tactile par l’opérateur. */
await test('a grant requires Oz’s explicit touch mode, a valid object and a ready/racing session',()=>{
  const r=rig();r.rules.setTangiblePlacementMode('manual');r.rules.prepareTangiblePlacement(1);assert.equal(r.s.tangiblePlacement,null);
  r.rules.setTangiblePlacementMode('touch');r.rules.prepareTangiblePlacement(4);assert.equal(r.s.tangiblePlacement,null);
  r.s.phase='PAUSED';r.rules.prepareTangiblePlacement(1);assert.equal(r.s.tangiblePlacement,null);
  r.s.phase='READY';r.rules.prepareTangiblePlacement(1);assert.equal(r.pending()?.id,1);assert.ok(Object.values(r.s.tangibles).every(/* Vérifie que les trois tangibles commencent rangés et inactifs. */ t=>t.status==='parked'&&!t.active),'starting stock is parked, not charged');
  r.rules.onTangibleControl({type:'TangibleControl',id:1,t:0,action:'configure'});assert.equal(r.pending()?.id,1,'obsolete configure packet cannot cancel a valid grant');
});
/** Vérifie le centre, la perpendicularité du mur et les dimensions physiques quel que soit l’ordre des doigts. */
await test('midpoint and orthogonal wall direction stay exact, order-independent and physically sized',()=>{
  const r=rig(),p=r.s.params,a={x:880,y:500},b={x:960,y:580};
  const wall=tangibleTouchPose('wall',a,b,p)!;
  assert.deepEqual(tangibleTouchPose('wall',b,a,p),wall);
  assert.equal(wall.x,920/1920);assert.equal(wall.y,.5);assert.equal(wall.angle,135);
  assert.equal(tangibleTouchPose('pylon',a,b,p)?.angle,0);
  r.rules.prepareTangiblePlacement(1);r.place(1,a,b);assert.equal(r.s.walls[0].lengthPx,p.wallLengthPx);
  assert.equal(r.s.walls[0].widthPx,p.wallWidthPx);assert.equal(r.s.walls[0].angle,135);
});
/** Vérifie qu’aucun contact invalide ni jeton ancien ne peut confirmer ou déplacer un objet. */
await test('invalid contacts, stale tokens and wrong ids cannot consume or forge a placement; replay cannot move it',()=>{
  const r=rig();r.rules.prepareTangiblePlacement(1);const token=r.pending()!.token;
  r.place(2);r.place(1,undefined,undefined,token+1);
  for(const [a,b] of [[{x:NaN,y:540},{x:980,y:540}],[{x:900,y:540},{x:901,y:540}],[{x:600,y:540},{x:1500,y:540}],[{x:-20,y:540},{x:80,y:540}],[{x:100,y:100},{x:200,y:100}]])r.place(1,a,b);
  assert.equal(r.pending()?.token,token);assert.equal(r.s.walls.length,0);
  r.place(1);assert.equal(r.s.tangiblePlacement,null);const before=JSON.stringify(r.s.tangibles);
  r.place(1,{x:1000,y:600},{x:1100,y:600},token);
  assert.equal(JSON.stringify(r.s.tangibles),before);assert.equal(r.s.tangiblePlacement,null);
  r.rules.onTangibleRemoved({type:'TangibleRemoved',id:1,t:0});assert.equal(r.s.walls.length,0);
  r.rules.prepareTangiblePlacement(1);assert.notEqual(r.pending()?.token,token);
  r.place(1,undefined,undefined,token);assert.equal(r.s.walls.length,0);
});
/** Vérifie les champs électriques neutres et leur arc réellement dommageable. */
await test('pylons remain neutral electrical fields and form the real damaging arc',()=>{
  const r=rig();r.rules.prepareTangiblePlacement(2);r.place(2,{x:850,y:540},{x:950,y:540});
  r.rules.prepareTangiblePlacement(3);r.place(3,{x:1050,y:540},{x:1150,y:540});
  assert.equal(r.s.arcs.length,1);assert.equal(r.s.arcs[0].team,null);
  for(const team of ['A','B'] as const){const car=r.s.cars[team];car.pos={x:1000,y:540};car.invulnUntil=0;r.rules.afterMove(team,car.pos,r.clock.now);assert.ok(car.hp<r.s.params.hpMax,'neutral arc damages either team');}
});
/** Vérifie l’expiration et les annulations d’annonce sans effacer les objets déjà posés. */
await test('waiting expires in READY too; pause, reset and mode changes invalidate the grant without deleting placed objects',()=>{
  const r=rig();r.rules.prepareTangiblePlacement(1);const token=r.pending()!.token;
  r.clock.now+=TANGIBLE_WAIT_MS;new PhysicsLoop(r.s,r.rules,/* Laisse cette notification sans effet dans le scénario local. */ ()=>{},/* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ ()=>r.clock.now).step(r.clock.now);assert.equal(r.s.tangiblePlacement,null);
  r.rules.prepareTangiblePlacement(1);r.s.phase='RACE';r.rules.togglePause();assert.equal(r.s.tangiblePlacement,null);
  r.rules.togglePause();r.rules.prepareTangiblePlacement(1);r.place(1);r.rules.prepareTangiblePlacement(2);
  r.rules.setTangiblePlacementMode('manual');assert.equal(r.s.tangiblePlacement,null);assert.equal(r.s.walls.length,1);
  r.rules.setTangiblePlacementMode('touch');r.rules.prepareTangiblePlacement(2);r.rules.resetToLobby();assert.equal(r.s.tangiblePlacement,null);assert.equal(r.s.tangiblePlacementMode,'touch');
  r.rules.startRace();r.rules.prepareTangiblePlacement(1);assert.notEqual(r.pending()?.token,token);
});
/** Vérifie que l’attente de tangible bloque les autres gestes sans consommer le bonus armé. */
await test('the reserved interval blocks gameplay gestures without spending the armed bonus',()=>{
  const r=rig();r.s.phase='RACE';r.s.cars.A.heldItem='boost';r.rules.onPower('A');r.rules.prepareTangiblePlacement(1);
  const gate={type:'BoostGate' as const,t:0,team:'A' as const,a:{x:880,y:540},b:{x:1000,y:540}};
  r.rules.onBoostGate(gate);r.rules.onBorderPull({type:'BorderPull',t:0,team:'A',at:{x:960,y:400},dx:0,dy:60} as never);
  assert.equal(r.s.boostGates.length,0);assert.equal(r.s.deformations.length,0);assert.equal(r.s.cars.A.itemArmed,true);
  r.rules.cancelTangiblePlacement();r.rules.onBoostGate(gate);assert.equal(r.s.boostGates.length,1);
});
/** Vérifie une confirmation unique et rapide malgré le tremblement des contacts et un bonus déjà armé. */
await test('two new fingers place once in about 90 ms despite jitter, ahead of the armed boost',async()=>{
  const r=gestures();r.announce();r.down(1,880,540);r.down(2,980,540);
  for(let i=0;i<5;i++){await sleep(15);r.move(1,881+i*.1,540);r.move(2,981+i*.1,540);}
  await sleep(45);const placements=r.sent.filter(/* Isole les confirmations de pose par les doigts pour vérifier le résultat de ce scénario. */ m=>m.type==='TangibleTouchPlaced');assert.equal(placements.length,1);
  const msg=placements[0] as unknown as TangibleTouchPlacedMsg;r.rules.onTangibleTouchPlaced(msg);r.g.syncState();
  assert.equal(r.s.walls[0].angle,90);r.up(1,881,540);r.up(2,981,540);await sleep(200);
  assert.equal(r.sent.filter(/* Isole les créations de zone d’accélération pour vérifier le résultat de ce scénario. */ m=>m.type==='BoostGate').length,0);assert.equal(r.sent.filter(/* Isole les confirmations de pose par les doigts pour vérifier le résultat de ce scénario. */ m=>m.type==='TangibleTouchPlaced').length,1);
});
/** Vérifie que les anciens doigts sont exclus de l’annonce suivante sans bloquer POWER ni la réparation. */
await test('old contacts cannot join the next grant, while copilot POWER and repair pads remain independent',async()=>{
  const r=gestures();r.down(1,880,540);r.announce();r.down(2,980,540);await sleep(130);assert.equal(r.sent.length,0);
  r.up(1,880,540);r.up(2,980,540);
  const {panelOf,localToWorld,padLocal,POWER_BTN_LOCAL}=await import('../server/layout.js');
  const panel=panelOf('A','copilot'),pad=padLocal('copilot'),at=localToWorld(panel,pad.x,pad.y),power=localToWorld(panel,POWER_BTN_LOCAL.x,POWER_BTN_LOCAL.y);
  r.down(3,at.x,at.y);r.down(4,power.x,power.y);r.up(4,power.x,power.y);
  r.down(5,880,540);r.down(6,980,540);await sleep(130);
  assert.equal(r.sent.filter(/* Isole les confirmations de pose par les doigts pour vérifier le résultat de ce scénario. */ m=>m.type==='TangibleTouchPlaced').length,1);assert.equal(r.sent.filter(/* Isole les armements de bonus pour vérifier le résultat de ce scénario. */ m=>m.type==='Power').length,1);
  r.up(3,at.x,at.y);assert.deepEqual(r.sent.filter(/* Isole les changements d’appui de réparation pour vérifier le résultat de ce scénario. */ m=>m.type==='PadHold').map(/* Extrait les maintiens et relâchements des pads pour vérifier leur indépendance des poses. */ m=>m.on),[true,false]);r.g.releaseAll();
});
/** Vérifie qu’une prise ambiguë ou annulée ne retombe jamais sur un autre geste de jeu. */
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
/** Vérifie la pose avant le départ et sa géométrie équivalente avec deux clics de souris. */
await test('READY accepts contact placement; mouse testing uses two clicks with the same geometry',async()=>{
  const r=gestures();r.s.phase='READY';r.announce(2);r.down(1,880,400);r.down(2,980,400);await sleep(130);
  assert.equal(r.sent[0]?.type,'TangibleTouchPlaced');r.g.releaseAll();
  r.s.phase='RACE';r.announce(1);r.down(3,880,400,'mouse');r.up(3,880,400);r.down(3,980,400,'mouse');r.up(3,980,400);
  assert.equal(r.sent.filter(/* Isole les confirmations de pose par les doigts pour vérifier le résultat de ce scénario. */ m=>m.type==='TangibleTouchPlaced').length,2);r.g.releaseAll();
});
/** Vérifie le rangement neutre et la possibilité de replacer immédiatement le même objet. */
await test('dropping into the neutral depot disables the object and it can be placed again immediately',()=>{
  const r=rig();r.rules.prepareTangiblePlacement(1);r.place(1);assert.equal(r.s.walls.length,1);
  r.rules.prepareTangiblePlacement(1);assert.equal(r.s.walls.length,0,'announcing a reposition takes the object off the road');
  r.place(1,{x:1794,y:425},{x:1894,y:425});assert.equal(r.s.tangibles[1].status,'parked');assert.equal(r.s.tangibles[1].active,false);
  r.rules.onTangibleControl({type:'TangibleControl',id:1,t:0,action:'activate'});assert.equal(r.s.walls.length,0,'depot is always neutral');
  r.rules.prepareTangiblePlacement(1);r.place(1);assert.equal(r.s.walls.length,1,'no charge or cooldown is needed');
});
/** Vérifie qu’une traction continue peut ouvrir un passage autour du mur sans dépasser sa limite. */
await test('one continuous pull grows past a wall length, remains bounded and gives real clearance around a crosswise wall',()=>{
  const r=rig();r.s.phase='RACE';const track=r.s.track!,index=Math.floor(track.centerline.length/4),at=track.outerEdge[index],base=track.baseCenterline[index],distance=Math.hypot(at.x-base.x,at.y-base.y),out={x:(at.x-base.x)/distance,y:(at.y-base.y)/distance};
  const widths=[...track.widths];
  for(const amount of [25,70,140,220]){r.rules.onBorderPull({type:'BorderPull',t:0,team:'A',x:at.x,y:at.y,dx:out.x*amount,dy:out.y*amount,gestureId:'continuous',end:amount===220});r.clock.now+=300;}
  r.clock.now+=500;r.rules.updateTrackDeformations(r.clock.now);
  assert.equal(r.s.deformations.length,1);const point=track.centerline[index],shift=Math.hypot(point.x-base.x,point.y-base.y);
  assert.ok(shift>r.s.params.wallLengthPx+20,'enough displacement to steer around the crosswise wall');assert.ok(shift<=r.s.params.trackDeformMaxShiftPx+1e-6,'bounded shift');
  assert.deepEqual(track.widths,widths,'the road moves without inflating');
  const before=JSON.stringify(r.s.deformations);r.rules.onBorderPull({type:'BorderPull',t:0,team:'A',x:at.x,y:at.y,dx:out.x*30,dy:out.y*30,gestureId:'continuous'});assert.equal(JSON.stringify(r.s.deformations),before,'a released gesture cannot be resumed by a delayed packet');
  for(let k=0;k<5;k++){r.rules.onBorderPull({type:'BorderPull',t:0,team:'A',x:at.x,y:at.y,dx:out.x*220,dy:out.y*220,gestureId:`repeat-${k}`});r.clock.now+=100;r.rules.updateTrackDeformations(r.clock.now);}
  for(let i=0;i<track.centerline.length;i++)assert.ok(Math.hypot(track.centerline[i].x-track.baseCenterline[i].x,track.centerline[i].y-track.baseCenterline[i].y)<=r.s.params.trackDeformMaxShiftPx+1e-5,'repeated pulls cannot stack beyond the maximum');
});
/** Vérifie qu’une paire de touches brèves décalées reste acceptée dans la marge temporelle. */
await test('two brief touch taps may arrive sequentially within the grace window',async()=>{
  const r=gestures();r.announce();r.down(1,880,540);r.up(1,880,540);await sleep(450);
  r.down(2,980,540);r.up(2,980,540);await sleep(140);
  assert.equal(r.sent.filter(/* Isole les confirmations de pose par les doigts pour vérifier le résultat de ce scénario. */ m=>m.type==='TangibleTouchPlaced').length,1);r.g.releaseAll();
});
/** Vérifie qu’un doigt trop ancien ne peut se joindre à un autre geste. */
await test('a lone touch is forgotten after the grace window and cannot combine with a later gesture',async()=>{
  const r=gestures();r.announce();r.down(1,880,540);r.up(1,880,540);await sleep(1700);
  r.down(2,980,540);r.up(2,980,540);await sleep(140);
  assert.equal(r.sent.length,0);r.g.releaseAll();
});
console.log(`\n${passed} touch-placement scenarios passed`);
process.exit(0);
