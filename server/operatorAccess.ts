import { randomBytes, randomInt, timingSafeEqual } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

const COOKIE='crashout_operator';
const SESSION_MS=12*60*60*1000;
/** Local operator access: the code is printed in the host terminal, never in participant state. */
export class OperatorAccess {
  readonly code:string;
  private sessions=new Map<string,number>();
  constructor(code?:string,private now:()=>number=Date.now){
    this.code=code?.trim()||String(randomInt(100000,1000000));
  }
  private token(cookie?:string):string|undefined {return cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);}
  authorized(req:Pick<IncomingMessage,'headers'>):boolean {
    const token=this.token(req.headers.cookie);if(!token)return false;
    const until=this.sessions.get(token);if(!until||until<=this.now()){this.sessions.delete(token);return false;}return true;
  }
  async handle(req:IncomingMessage,res:ServerResponse):Promise<void>{
    const reply=(status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    if(req.method==='GET'){reply(200,{authorized:this.authorized(req)});return;}
    if(req.method==='DELETE'){
      const token=this.token(req.headers.cookie);if(token)this.sessions.delete(token);
      res.setHeader('Set-Cookie',`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);reply(200,{authorized:false});return;
    }
    if(req.method!=='POST'){reply(405,{error:'Méthode non autorisée.'});return;}
    if(!req.headers['content-type']?.startsWith('application/json')){reply(415,{error:'Requête invalide.'});return;}
    let raw='';
    try{
      for await(const chunk of req){raw+=chunk.toString();if(raw.length>1024){reply(413,{error:'Requête trop longue.'});return;}}
      const value=JSON.parse(raw),candidate=Buffer.from(typeof value.code==='string'?value.code.trim():'');
      const expected=Buffer.from(this.code);
      if(candidate.length!==expected.length||!timingSafeEqual(candidate,expected)){reply(401,{error:'Code incorrect. Réessayez.'});return;}
    }catch{reply(400,{error:'Requête invalide.'});return;}
    for(const [token,until]of this.sessions)if(until<=this.now())this.sessions.delete(token);
    if(this.sessions.size>=32)this.sessions.delete(this.sessions.keys().next().value!);
    const token=randomBytes(24).toString('base64url');this.sessions.set(token,this.now()+SESSION_MS);
    res.setHeader('Set-Cookie',`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS/1000}`);
    reply(200,{authorized:true});
  }
}
