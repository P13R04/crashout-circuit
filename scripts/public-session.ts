import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {GameServer} from '../server/GameServer.js';
import {StateSync} from '../client-shared/net.js';
import {OzController} from '../client-oz/OzController.js';
import type {GameState} from '../server/types.js';

const server=http.createServer((_req,res)=>{res.writeHead(200);res.end();});
const wss=new WebSocketServer({server}),game=new GameServer(wss);
const sockets:WebSocket[]=[];
server.listen(0,'127.0.0.1');await once(server,'listening');
const port=(server.address() as {port:number}).port;
const connect=async(path:string)=>{
 const ws=new WebSocket(`ws://127.0.0.1:${port}${path}`);sockets.push(ws);
 const sync=new StateSync();let state:GameState|null=null;
 ws.on('message',bytes=>{const m=JSON.parse(bytes.toString());if(m.type==='State')state=sync.apply(m.state,m.t);});
 await once(ws,'open');
 const send=(message:Record<string,unknown>)=>ws.send(JSON.stringify({t:Date.now(),...message}));
 const flush=async()=>{const pong=new Promise<void>(resolve=>{const on=(bytes:Buffer)=>{if(JSON.parse(bytes.toString()).type==='Pong'){ws.off('message',on);resolve();}};ws.on('message',on);});send({type:'Ping'});await pong;};
 const waitForState=async(predicate:(s:GameState)=>boolean)=>{
  if(state&&predicate(state))return;
  await new Promise<void>((resolve,reject)=>{
   const on=()=>{if(state&&predicate(state)){clearTimeout(timer);ws.off('message',on);resolve();}};
   const timer=setTimeout(()=>{ws.off('message',on);reject(Error('Expected state was not received'));},2000);ws.on('message',on);
  });
 };
 return{ws,send,flush,waitForState,get state(){return state;}};
};
try{
 const table=await connect('/ws/table?debug=1&sim=1&test=1');await table.flush();assert.equal(table.state!.developerTools,false);
 for(const command of [{type:'StartTangibleTest',developerTools:true},{type:'StartGame',mode:'pc'},{type:'StartTutorial',mode:'pc'},{type:'TestToggle',flag:'invincible',on:true},{type:'DeveloperTools',on:true}]){table.send(command);await table.flush();}
 assert.equal(game.getState().phase,'LOBBY');assert.equal(game.getState().sessionMode,'race');assert.deepEqual(game.getState().testMode,{invincible:false,allItems:false});
 const oz=await connect('/ws/oz');await oz.flush();assert.ok(oz.state,'direct operator URL connects without a code or cookie');
 for(const command of [{type:'StartTangibleTest'},{type:'StartTutorial',mode:'table'},{type:'StartGame',mode:'table'}]){oz.send(command);await oz.flush();}
 assert.equal(game.getState().phase,'LOBBY','direct access still keeps game/test controls with the table');
 table.send({type:'StartTutorial',mode:'table'});await table.flush();await oz.flush();
 assert.equal(oz.state!.phase,'RACE');assert.ok(oz.state!.tutorial);assert.ok(oz.state!.track!.centerline.length>100,'Oz receives the real tutorial circuit');
 const controller=new OzController(()=>true);controller.setConnected(true);controller.applyState(oz.state!);assert.equal(controller.enabled,true,'tutorial enables the same tangible controls as racing');
 oz.send({type:'TangiblePlacementMode',mode:'touch'});await oz.flush();
 for(const [id,x]of [[1,900],[2,1000],[3,1200]] as const){
  oz.send({type:'TangiblePrepare',id});await oz.flush();await table.flush();
  const pending=table.state!.tangiblePlacement!;assert.equal(pending.id,id);
  table.send({type:'TangibleTouchPlaced',id,token:pending.token,a:{x:x-40,y:540},b:{x:x+40,y:540}});await table.flush();await oz.flush();
  assert.equal(oz.state!.tangibles[id].status,'placed');assert.equal(oz.state!.tangibles[id].active,true);
 }
 assert.equal(oz.state!.walls.length,1);assert.equal(oz.state!.arcs.length,1,'both tutorial pylons form their real arc');
 oz.send({type:'TangibleControl',id:2,action:'deactivate'});await oz.waitForState(s=>!s.tangibles[2].active);assert.equal(oz.state!.arcs.length,0);
 oz.send({type:'TangibleControl',id:2,action:'activate'});await oz.waitForState(s=>s.tangibles[2].active);assert.equal(oz.state!.arcs.length,1);
 oz.send({type:'TangibleRemoved',id:1});await oz.waitForState(s=>s.tangibles[1].status==='parked');assert.equal(oz.state!.walls.length,0);
 oz.send({type:'TangiblePrepare',id:1});await oz.flush();oz.send({type:'TangiblePlacementCancel'});await oz.flush();assert.equal(oz.state!.tangiblePlacement,null);
 await new Promise(resolve=>setTimeout(resolve,80));await oz.flush();assert.ok(oz.state!.track!.centerline.length>100,'track survives compact network snapshots');
 const reconnected=await connect('/ws/oz');await reconnected.flush();assert.ok(reconnected.state!.tutorial);assert.ok(reconnected.state!.track!.centerline.length>100,'joining the tutorial late also receives its full circuit');
 game.rules.resetToLobby();table.send({type:'StartGame',mode:'table'});await table.flush();assert.equal(game.getState().phase,'MAP','normal racing remains accessible');
 console.log('Public session: direct Oz access, tutorial circuit/reconnection, touch placement of all three objects, activation/removal/cancel and test commands blocked passed');
}finally{game.physics.stop();for(const ws of sockets)ws.terminate();await new Promise<void>(resolve=>wss.close(()=>server.close(()=>resolve())));}
