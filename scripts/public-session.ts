/**
 * Vérifie l’accès direct à Oz, le contrôle des objets dans le tutoriel et le refus des commandes de test en
 * séance publique.
 * Liens : server/GameServer.ts, client-shared/net.ts, client-oz/OzController.ts, server/types.ts.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {GameServer} from '../server/GameServer.js';
import {StateSync} from '../client-shared/net.js';
import {OzController} from '../client-oz/OzController.js';
import type {GameState} from '../server/types.js';

const server=http.createServer(/* Fournit le serveur HTTP minimal nécessaire aux vrais WebSocket de test. */ (_req,res)=>{res.writeHead(200);res.end();});
const wss=new WebSocketServer({server}),game=new GameServer(wss);
const sockets:WebSocket[]=[];
server.listen(0,'127.0.0.1');await once(server,'listening');
const port=(server.address() as {port:number}).port;
/** Ouvre un client WebSocket sans code et reconstitue les états avec StateSync. */
const connect=async(path:string)=>{
 const ws=new WebSocket(`ws://127.0.0.1:${port}${path}`);sockets.push(ws);
 const sync=new StateSync();let state:GameState|null=null;
 /** Reconstitue les snapshots reçus pour vérifier la présence du circuit dans la console. */
 ws.on('message',bytes=>{const m=JSON.parse(bytes.toString());if(m.type==='State')state=sync.apply(m.state,m.t);});
 await once(ws,'open');
 /** Transmet la commande construite par le scénario au composant étudié. */
 const send=(message:Record<string,unknown>)=>ws.send(JSON.stringify({t:Date.now(),...message}));
 /** Envoie un Ping et attend son retour pour laisser passer les commandes déjà envoyées. */
 const flush=async()=>{const pong=new Promise<void>(/* Installe la confirmation du Ping avant de poursuivre les assertions réseau. */ resolve=>{/* Résout l’attente lorsque le message ou l’état réseau attendu est disponible. */ const on=(bytes:Buffer)=>{if(JSON.parse(bytes.toString()).type==='Pong'){ws.off('message',on);resolve();}};ws.on('message',on);});send({type:'Ping'});await pong;};
 /** Attend la confirmation de l’état demandé sans confondre le retour du Ping avec un nouveau snapshot. */
 const waitForState=async(predicate:(s:GameState)=>boolean)=>{
  if(state&&predicate(state))return;
  await new Promise<void>(/* Attend le prédicat de confirmation tout en conservant une limite de temps. */ (resolve,reject)=>{
   /** Résout l’attente lorsque le message ou l’état réseau attendu est disponible. */
   const on=()=>{if(state&&predicate(state)){clearTimeout(timer);ws.off('message',on);resolve();}};
   const timer=setTimeout(/* Retire l’écoute puis refuse l’attente si l’état demandé n’a jamais été reçu. */ ()=>{ws.off('message',on);reject(Error('Expected state was not received'));},2000);ws.on('message',on);
  });
 };
 return{ws,send,flush,waitForState,/* Expose le dernier état reçu par le client de test. */ get state(){return state;}};
};
try{
 const table=await connect('/ws/table?debug=1&sim=1&test=1');await table.flush();assert.equal(table.state!.developerTools,false);
 for(const command of [{type:'StartTangibleTest',developerTools:true},{type:'StartGame',mode:'pc'},{type:'StartTutorial',mode:'pc'},{type:'TestToggle',flag:'invincible',on:true},{type:'DeveloperTools',on:true}]){table.send(command);await table.flush();}
 assert.equal(game.getState().phase,'LOBBY');assert.equal(game.getState().sessionMode,'race');assert.deepEqual(game.getState().testMode,{invincible:false,allItems:false});
 const oz=await connect('/ws/oz');await oz.flush();assert.ok(oz.state,'direct operator URL connects without a code or cookie');
 for(const command of [{type:'StartTangibleTest'},{type:'StartTutorial',mode:'table'},{type:'StartGame',mode:'table'}]){oz.send(command);await oz.flush();}
 assert.equal(game.getState().phase,'LOBBY','direct access still keeps game/test controls with the table');
 table.send({type:'StartTutorial'});await table.flush();await oz.flush();
 assert.equal(oz.state!.phase,'RACE');assert.ok(oz.state!.tutorial);assert.ok(oz.state!.track!.centerline.length>100,'Oz receives the real tutorial circuit');
 // Le lancement public sans mode explicite doit attendre les quatre clés, même avec une ancienne URL de diagnostic.
 assert.equal(table.state!.mapMode,'table');
 assert.equal(table.state!.tutorial!.steps[0],'identify');
 assert.deepEqual(game.getState().tutorial!.teams,{A:{step:0,sub:0},B:{step:0,sub:0}});
 table.send({type:'PilotInput',team:'A',throttle:1,steer:-1});
 table.send({type:'PilotInput',team:'A',throttle:1,steer:1});await table.flush();
 assert.equal(game.getState().tutorial!.teams.A.step,0,'driving cannot bypass station identification');
 table.send({type:'PadHold',team:'A',role:'pilot',on:true});
 table.send({type:'PadHold',team:'A',role:'pilot',on:false});
 table.send({type:'PadHold',team:'A',role:'copilot',on:true});
 table.send({type:'PadHold',team:'A',role:'copilot',on:false});await table.flush();
 assert.equal(game.getState().tutorial!.teams.A.step,1,'successive key touches identify the first team');
 assert.equal(game.getState().tutorial!.teams.B.step,0,'the other team still has to identify both stations');
 table.send({type:'PadHold',team:'B',role:'pilot',on:true});await table.flush();
 assert.equal(game.getState().tutorial!.teams.B.step,0,'three keys cannot start the tutorial');
 table.send({type:'PadHold',team:'B',role:'copilot',on:true});
 await table.waitForState(/* Attend le snapshot confirmant la dernière clé et le passage à la conduite. */ s=>s.tutorial!.teams.B.step===1);
 assert.ok(game.getState().sessionStartAt>Date.now()+2000,'the fourth key starts a fresh three-second countdown');
 for(const role of ['pilot','copilot'] as const)table.send({type:'PadHold',team:'B',role,on:false});
 await table.flush();
 const controller=new OzController(/* Autorise l’envoi fictif du contrôleur pour vérifier son activation dans le tutoriel. */ ()=>true);controller.setConnected(true);controller.applyState(oz.state!);assert.equal(controller.enabled,true,'tutorial enables the same tangible controls as racing');
 oz.send({type:'TangiblePlacementMode',mode:'touch'});await oz.flush();
 for(const [id,x]of [[1,900],[2,1000],[3,1200]] as const){
  oz.send({type:'TangiblePrepare',id});await oz.flush();await table.flush();
  const pending=table.state!.tangiblePlacement!;assert.equal(pending.id,id);
  table.send({type:'TangibleTouchPlaced',id,token:pending.token,a:{x:x-40,y:540},b:{x:x+40,y:540}});await table.flush();await oz.flush();
  assert.equal(oz.state!.tangibles[id].status,'placed');assert.equal(oz.state!.tangibles[id].active,true);
 }
 assert.equal(oz.state!.walls.length,1);assert.equal(oz.state!.arcs.length,1,'both tutorial pylons form their real arc');
 oz.send({type:'TangibleControl',id:2,action:'deactivate'});await oz.waitForState(/* Reconnaît la désactivation du pilier dans le snapshot reçu. */ s=>!s.tangibles[2].active);assert.equal(oz.state!.arcs.length,0);
 oz.send({type:'TangibleControl',id:2,action:'activate'});await oz.waitForState(/* Reconnaît la réactivation du pilier dans le snapshot reçu. */ s=>s.tangibles[2].active);assert.equal(oz.state!.arcs.length,1);
 oz.send({type:'TangibleRemoved',id:1});await oz.waitForState(/* Reconnaît le rangement du mur dans la réserve après son retrait. */ s=>s.tangibles[1].status==='parked');assert.equal(oz.state!.walls.length,0);
 oz.send({type:'TangiblePrepare',id:1});await oz.flush();oz.send({type:'TangiblePlacementCancel'});await oz.flush();assert.equal(oz.state!.tangiblePlacement,null);
 await new Promise(/* Attend le délai nécessaire au traitement asynchrone du scénario. */ resolve=>setTimeout(resolve,80));await oz.flush();assert.ok(oz.state!.track!.centerline.length>100,'track survives compact network snapshots');
 const reconnected=await connect('/ws/oz');await reconnected.flush();assert.ok(reconnected.state!.tutorial);assert.ok(reconnected.state!.track!.centerline.length>100,'joining the tutorial late also receives its full circuit');
 game.rules.resetToLobby();table.send({type:'StartGame',mode:'table'});await table.flush();assert.equal(game.getState().phase,'MAP','normal racing remains accessible');
 console.log('Public session: four-key tutorial start/countdown, direct Oz access, tutorial circuit/reconnection, touch placement of all three objects, activation/removal/cancel and test commands blocked passed');
}finally{game.physics.stop();for(const ws of sockets)ws.terminate();await new Promise<void>(/* Attend le nettoyage des deux serveurs avant de terminer le scénario. */ resolve=>wss.close(/* Ferme le serveur HTTP lorsque les WebSocket du scénario sont arrêtés. */ ()=>server.close(/* Termine l’attente lorsque le serveur local est complètement fermé. */ ()=>resolve())));}
