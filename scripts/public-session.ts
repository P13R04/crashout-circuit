import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {GameServer} from '../server/GameServer.js';
import {OperatorAccess} from '../server/operatorAccess.js';
import type {GameState} from '../server/types.js';

let now=Date.now();const access=new OperatorAccess('654321',()=>now);
const server=http.createServer((req,res)=>{void access.handle(req,res);});
const wss=new WebSocketServer({server}),game=new GameServer(wss,{authorizeOperator:req=>access.authorized(req)});
const sockets:WebSocket[]=[];
server.listen(0,'127.0.0.1');await once(server,'listening');
const port=(server.address() as {port:number}).port,base=`http://127.0.0.1:${port}`;
const connect=async(path:string,cookie?:string)=>{
 const ws=new WebSocket(`ws://127.0.0.1:${port}${path}`,cookie?{headers:{Cookie:cookie}}:undefined);sockets.push(ws);
 let state:GameState|null=null;const snapshots:GameState[]=[];
 ws.on('message',bytes=>{const m=JSON.parse(bytes.toString());if(m.type==='State'){state=m.state;snapshots.push(m.state);}});
 await once(ws,'open');
 const send=(message:Record<string,unknown>)=>ws.send(JSON.stringify({t:Date.now(),...message}));
 const flush=async()=>{const pong=new Promise<void>(resolve=>{const on=(bytes:Buffer)=>{if(JSON.parse(bytes.toString()).type==='Pong'){ws.off('message',on);resolve();}};ws.on('message',on);});send({type:'Ping'});await pong;};
 return{ws,send,flush,snapshots,get state(){return state;}};
};
try{
 const denied=new WebSocket(`ws://127.0.0.1:${port}/ws/oz`);sockets.push(denied);let messages=0;denied.on('message',()=>messages++);
 const closed=await once(denied,'close');assert.equal(closed[0],4401);assert.equal(messages,0,'the operator state is never sent before access is granted');
 const anon=await fetch(base);assert.deepEqual(await anon.json(),{authorized:false});
 const wrong=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'000000'})});assert.equal(wrong.status,401);
 const ok=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'654321'})});assert.equal(ok.status,200);
 const cookie=ok.headers.get('set-cookie')!.split(';')[0];assert.ok(ok.headers.get('set-cookie')!.includes('HttpOnly'));assert.equal(JSON.stringify(await ok.json()).includes('654321'),false);
 const confirmed=await fetch(base,{headers:{Cookie:cookie}});assert.deepEqual(await confirmed.json(),{authorized:true});
 const table=await connect('/ws/table?debug=1&sim=1&test=1');await table.flush();assert.equal(table.state!.developerTools,false);
 for(const command of [{type:'StartTangibleTest',developerTools:true},{type:'StartGame',mode:'pc'},{type:'StartTutorial',mode:'pc'},{type:'TestToggle',flag:'invincible',on:true},{type:'DeveloperTools',on:true}]){table.send(command);await table.flush();}
 assert.equal(game.getState().phase,'LOBBY');assert.equal(game.getState().sessionMode,'race');assert.deepEqual(game.getState().testMode,{invincible:false,allItems:false});
 const oz=await connect('/ws/oz',cookie);await oz.flush();assert.ok(oz.state);assert.equal(JSON.stringify(oz.state).includes('654321'),false);
 oz.send({type:'StartTangibleTest'});await oz.flush();assert.equal(game.getState().phase,'LOBBY','operator access does not grant game/test controls');
 table.send({type:'StartTutorial',mode:'table'});await table.flush();assert.equal(game.getState().phase,'RACE');assert.ok(game.getState().tutorial,'the regular four-player tutorial remains accessible');
 game.rules.resetToLobby();table.send({type:'StartGame',mode:'table'});await table.flush();assert.equal(game.getState().phase,'MAP','normal racing remains accessible');
 now+=12*60*60*1000+1;assert.equal(access.authorized({headers:{cookie}}),false,'expired operator access requires a new code entry');
 console.log('Public session: operator login, private WebSocket, expired cookies, test commands blocked and normal tutorial/race available passed');
}finally{game.physics.stop();for(const ws of sockets)ws.terminate();await new Promise<void>(resolve=>wss.close(()=>server.close(()=>resolve())));}
