import type { GameState,Vec2 } from '../server/types.js';
import type { View } from './view.js';
import { AUDIO_ASSETS,type AudioAsset } from './AudioAssets.js';
import { AudioTimeline,CueGate,DEFAULT_AUDIO,audioSettings,AUDIO_STORAGE_KEY,type AudioSettings } from './AudioPlan.js';

type Voice={source:AudioScheduledSourceNode;gain:GainNode;pan:StereoPannerNode};
type Loop=Voice&{source:AudioBufferSourceNode};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
/** One table speaker mix. Small clean signals are synthesized; physical textures are files. */
export class TableAudio {
  settings:AudioSettings={...DEFAULT_AUDIO};
  private audio:AudioContext|null=null;
  private master:GainNode|null=null;
  private buses:Record<'effects'|'ambience'|'music',GainNode>|null=null;
  private buffers=new Map<AudioAsset,AudioBuffer>();
  private loading:Promise<void>|null=null;
  private voices=new Set<Voice>();
  private loops=new Map<string,Loop>();
  private retiring=new Set<Loop>();
  private tension:Voice|null=null;
  private music:HTMLAudioElement|null=null;
  private musicNode:MediaElementAudioSourceNode|null=null;
  private musicWanted=false;
  private musicPlaying=false;
  private musicBlocked=false;
  private musicFailed=false;
  private focused=true;
  private online=true;
  private timeline=new AudioTimeline();
  private gate=new CueGate();
  private variant=0;
  private lastUpdate=-Infinity;
  private duckUntil=0;
  private phase:GameState['phase']|null=null;
  private slingReady=false;
  private slingPulling=false;
  private stopped=true;
  private failures=0;
  private resync=false;
  private slingSentAt=-Infinity;
  get diagnostics(){return{state:this.audio?.state??'locked',decoded:this.buffers.size,failed:this.failures,voices:this.voices.size,loops:this.loops.size+this.retiring.size,music:this.musicPlaying};}
  restore(storage:Pick<Storage,'getItem'>):void{
    try{this.settings=audioSettings(JSON.parse(storage.getItem(AUDIO_STORAGE_KEY)??'null'));}catch{this.settings={...DEFAULT_AUDIO};}
  }
  configure(next:Partial<AudioSettings>,storage?:Pick<Storage,'setItem'>):void {
    this.settings=audioSettings({...this.settings,...next});
    try{storage?.setItem(AUDIO_STORAGE_KEY,JSON.stringify(this.settings));}catch{/* Local audio still works. */}
    this.mix();if(!this.settings.enabled)this.stop();
  }
  /** Retried on real pointer/keyboard interactions; a blocked first resume is recoverable. */
  unlock():void {
    this.musicBlocked=false;
    try{
      if(!this.audio){
        this.audio=new AudioContext();this.master=this.audio.createGain();
        const limiter=this.audio.createDynamicsCompressor();limiter.threshold.value=-10;limiter.knee.value=8;limiter.ratio.value=8;limiter.attack.value=.004;limiter.release.value=.16;
        this.master.connect(limiter).connect(this.audio.destination);
        this.buses={effects:this.audio.createGain(),ambience:this.audio.createGain(),music:this.audio.createGain()};
        for(const bus of Object.values(this.buses))bus.connect(this.master);
        this.mix();
      }
      if(this.audio.state==='suspended')void this.audio.resume().catch(()=>{});
      if(this.settings.enabled&&!this.loading)this.loading=this.loadAssets();
    }catch{/* Web Audio is optional. */}
  }
  private async loadAssets():Promise<void>{
    await Promise.all((Object.entries(AUDIO_ASSETS) as [AudioAsset,string][]).filter(([id])=>id!=='music').map(async([id,url])=>{
      try{const response=await fetch(url);if(!response.ok)throw Error('audio');const buffer=await this.audio!.decodeAudioData(await response.arrayBuffer());this.buffers.set(id,buffer);}
      catch{this.failures++;}
    }));
  }
  private available():boolean{return !!this.audio&&this.audio.state==='running'&&this.settings.enabled&&this.focused&&this.online;}
  private mix():void {
    if(!this.audio||!this.master||!this.buses)return;
    const t=this.audio.currentTime,duck=t<this.duckUntil;
    this.master.gain.setTargetAtTime(this.settings.enabled&&this.focused&&this.online ? .72 : 0,t,.03);
    this.buses.effects.gain.setTargetAtTime(this.settings.effects,t,.025);
    this.buses.ambience.gain.setTargetAtTime(this.settings.ambience*(duck?.42:1),t,.12);
    this.buses.music.gain.setTargetAtTime(this.settings.music*(duck?.3:1),t,.12);
  }
  private duck():void{if(this.audio){this.duckUntil=this.audio.currentTime+.65;this.mix();}}
  private output(source:AudioScheduledSourceNode,volume:number,x=960,bus:'effects'|'ambience'='effects'):Voice {
    const c=this.audio!,gain=c.createGain(),pan=c.createStereoPanner();gain.gain.value=volume;pan.pan.value=clamp((x/1920-.5)*.9,-.45,.45);
    source.connect(gain).connect(pan).connect(this.buses![bus]);return{source,gain,pan};
  }
  private dispose(v:Voice):void{try{v.source.disconnect();v.gain.disconnect();v.pan.disconnect();}catch{/* Already stopped. */}}
  private keep(v:Voice):void {
    this.voices.add(v);v.source.onended=()=>{this.voices.delete(v);this.dispose(v);};
  }
  private tone(freq:number,duration=.1,volume=.09,x=960,delay=0,to?:number,type:OscillatorType='sine'):void {
    if(!this.available()||this.settings.effects===0||this.voices.size>=14)return;
    const c=this.audio!,start=c.currentTime+delay,end=start+duration,osc=c.createOscillator();osc.type=type;osc.frequency.setValueAtTime(freq,start);
    if(to)osc.frequency.exponentialRampToValueAtTime(to,end);
    const v=this.output(osc,0,x);v.gain.gain.setValueAtTime(.0001,start);v.gain.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),start+.005);v.gain.gain.exponentialRampToValueAtTime(.0001,end);
    this.keep(v);osc.start(start);osc.stop(end+.015);
  }
  private notes(notes:number[],x=960,volume=.085,step=.085):void{notes.forEach((n,i)=>this.tone(n,.15,volume,x,i*step));}
  private sample(id:AudioAsset,volume:number,x=960,rate=1):boolean{
    const buffer=this.buffers.get(id);if(!buffer||!this.available()||this.settings.effects===0||this.voices.size>=14)return false;
    const source=this.audio!.createBufferSource();source.buffer=buffer;source.playbackRate.value=rate;
    const v=this.output(source,volume,x);this.keep(v);source.start();return true;
  }
  /** Feedback happens once on confirmation. Similar simultaneous impacts share one voice. */
  feedback(kind:string,position?:Partial<Vec2>):void {
    if(!this.available()||this.phase==='PAUSED'&&!['ui','pause','resume'].includes(kind))return;
    const x=position?.x??960,t=this.audio!.currentTime;
    const family=['hit','stoneImpact','stoneHit'].includes(kind)?'impact':kind==='countdown'||kind==='go'?`${kind}-${Math.round(x/200)}`:kind;
    if(!this.gate.accept(family,t,kind==='trackDeformed'?.8:family==='impact'?.09:.065))return;
    if(kind.startsWith('map')&&!['mapAccepted','mapBegin'].includes(kind)){this.notes([210,170],x,.055);return;}
    switch(kind){
      case 'ui':this.tone(1050,.035,.045,x,0,760,'triangle');break;
      case 'mapBegin':case 'raceReady':this.notes([330,495],x,.065);break;
      case 'mapAccepted':this.notes([523,784],x);break;
      case 'pickup':this.notes([660,880],x);break;
      case 'itemArmed':this.notes([392,587,784],x,.095);break;
      case 'slingReady':this.notes([610,915],x,.05,.05);break;
      case 'stoneWarning':this.sample('sling',.35,x);this.tone(740,.08,.075,x);this.tone(740,.08,.07,x,.19);this.tone(880,.09,.08,x,.38);this.duck();break;
      case 'hit':this.sample(this.variant++%2?'light1':'light2',.42,x);break;
      case 'stoneHit':case 'stoneImpact':this.sample(this.variant++%2?'heavy1':'heavy2',.65,x,.85);this.duck();break;
      case 'electricHit':this.sample('zap',.4,x,1.15);this.duck();break;
      case 'wallPlaced':case 'pylonPlaced':this.sample('place',.36,x);break;
      case 'wallRemoved':case 'pylonRemoved':this.sample('off',.26,x,1.15);break;
      case 'arcFormed':this.sample('electricOn',.3,x);break;
      case 'arcBroken':this.sample('off',.25,x,.85);break;
      case 'boostGate':this.notes([290,435,650],x,.065,.055);break;
      case 'boostHit':this.sample('boost',.35,x,1.15);break;
      case 'repairBegin':this.notes([260,390],x,.045);break;
      case 'repairProgress':this.tone(450,.055,.035,x);break;
      case 'slingCancelled':case 'repairInterrupted':this.tone(240,.07,.04,x,0,180);break;
      case 'repairDone':this.notes([523,659,784],x,.08);break;
      case 'countdown':this.tone(440,.12,.11,x,0,undefined,'triangle');this.duck();break;
      case 'go':this.tone(880,.32,.12,x,0,undefined,'triangle');this.duck();break;
      case 'lap':this.notes([587,880],x,.075);break;
      case 'finalLap':this.notes([587,784,1046],x,.08);break;
      case 'lowHealth':this.notes([370,277],x,.06);break;
      case 'carDisabled':this.notes([330,247,165],x,.075,.1);this.duck();break;
      case 'fall':this.tone(380,.32,.06,x,0,130);break;
      case 'raceFinish':this.notes([392,523,659,784],960,.11,.13);this.duck();break;
      case 'pause':this.notes([440,330],x,.055);break;
      case 'resume':this.notes([330,440],x,.055);break;
      case 'placementWaiting':this.notes([440,660],960,.05,.06);break;
      case 'placementCancelled':this.tone(330,.1,.045,960,0,220);break;
      case 'trackDeformed':this.tone(185,.16,.035,x,0,260);break;
      case 'tutorialStep':this.notes([523,784],x,.065);break;
      case 'wallDestroyed':this.sample('heavy1',.45,x,.8);break;
      case 'ghost':this.tone(300,.25,.05,x,0,650);break;
    }
  }
  uiCommand(message:{type:string;[key:string]:unknown}):void {
    if(message.type==='Slingshot')this.slingSentAt=performance.now();
    if(['StartGame','StartTutorial','StartTangibleTest','BeginRace','GenerateTrack','Reset','NewGame','Pause','ToggleDriveMode','TestToggle','Power'].includes(message.type)||message.type==='PadHold'&&message.on===true)this.feedback('ui');
  }
  private loop(key:string,id:AudioAsset,volume:number,rate=1,x=960,bus:'effects'|'ambience'='effects'):void {
    const c=this.audio!;let loop=this.loops.get(key);
    if(volume<=0||!this.available()){if(loop){this.retiring.add(loop);loop.gain.gain.setTargetAtTime(0,c.currentTime,.045);try{loop.source.stop(c.currentTime+.2);}catch{}this.loops.delete(key);}return;}
    if(!loop){const buffer=this.buffers.get(id);if(!buffer)return;const source=c.createBufferSource();source.buffer=buffer;source.loop=true;loop=this.output(source,0,x,bus) as Loop;
      this.loops.set(key,loop);const owned=loop;source.onended=()=>{this.retiring.delete(owned);this.dispose(owned);};source.start();}
    loop.gain.gain.setTargetAtTime(volume,c.currentTime,.08);loop.source.playbackRate.setTargetAtTime(rate,c.currentTime,.09);loop.pan.pan.setTargetAtTime(clamp((x/1920-.5)*.9,-.45,.45),c.currentTime,.08);
  }
  private musicMix(wanted:boolean):void {
    this.musicWanted=wanted;
    if(!wanted){if(this.music&&!this.music.paused){this.music.pause();this.musicPlaying=false;}return;}
    if(this.musicBlocked||this.musicFailed)return;
    if(!this.music){
      const media=new Audio(AUDIO_ASSETS.music);media.loop=true;media.preload='none';this.music=media;
      this.musicNode=this.audio!.createMediaElementSource(media);this.musicNode.connect(this.buses!.music);
      media.addEventListener('error',()=>{this.failures++;this.musicPlaying=false;this.musicFailed=true;});
    }
    if(this.music.paused&&!this.musicPlaying){this.musicPlaying=true;void this.music.play().then(()=>{if(!this.musicWanted){this.music?.pause();this.musicPlaying=false;}}).catch(()=>{this.musicPlaying=false;this.musicBlocked=true;});}
  }
  update(view:Pick<View,'state'|'theme'|'sling'|'now'>,localNow=performance.now()):void {
    const s=view.state;if(!s)return;
    if(localNow-this.lastUpdate<40)return;this.lastUpdate=localNow;
    let cues=this.timeline.step(s,view.now());
    if(this.resync){this.timeline.reset();this.timeline.step(s,view.now());cues=[];this.resync=false;}
    if(!this.available()){if(!this.stopped)this.stop();this.phase=s.phase;return;}
    if(this.phase!==s.phase&&(s.phase==='PAUSED'||s.phase==='LOBBY'||s.phase==='RESULT'||s.phase==='MAP'))this.stop();
    this.stopped=false;this.phase=s.phase;this.mix();for(const cue of cues)this.feedback(cue.kind,{x:cue.x??960});
    const race=s.phase==='RACE'&&view.now()>=s.sessionStartAt,cyber=view.theme==='scrap'||view.theme==='neon';
    for(const team of ['A','B'] as const){
      const car=s.cars[team],speed=clamp(Math.abs(car.speed)/260,0,1.4),running=race&&cyber&&!car.disabled&&car.respawnUntil<=view.now()&&this.settings.effects>0;
      this.loop(`engine-${team}`,'reactor',running?.018+speed*.048:0,.75+speed*.65,car.pos.x);
    }
    const field=race&&Object.values(s.tangibles).some(t=>t.active&&t.status==='placed'&&t.kind==='pylon');
    this.loop('electric','electric',field&&this.settings.effects>0?.025:0,.85);
    const atmosphere=view.theme==='scrap'&&['LOBBY','MAP','READY','RACE'].includes(s.phase);
    this.loop('ambience','ambience',atmosphere&&this.settings.ambience>0?.26:0,1,960,'ambience');
    this.musicMix(atmosphere&&this.settings.music>0);
    const pulling=race&&!!view.sling&&!view.sling.idle,ready=pulling&&!!view.sling?.shot.valid;
    if(ready&&!this.slingReady)this.feedback('slingReady');
    if(this.slingPulling&&!view.sling&&race&&localNow-this.slingSentAt>1000)this.feedback('slingCancelled');
    this.slingReady=ready;this.slingPulling=pulling;
    if(pulling&&this.settings.effects>0){
      if(!this.tension){const osc=this.audio!.createOscillator();osc.type='sine';this.tension=this.output(osc,0);osc.start();}
      const pull=clamp((view.sling?.shot.pull??0)/Math.max(1,s.params.slingMaxPullPx),0,1);
      (this.tension.source as OscillatorNode).frequency.setTargetAtTime(190+pull*230,this.audio!.currentTime,.05);this.tension.gain.gain.setTargetAtTime(.008+pull*.012,this.audio!.currentTime,.035);
    }else this.stopTension();
  }
  private stopTension():void{if(this.tension){try{this.tension.source.stop();}catch{}this.dispose(this.tension);this.tension=null;}}
  stop():void {
    for(const v of this.voices){try{v.source.stop();}catch{}this.dispose(v);}this.voices.clear();
    for(const v of [...this.loops.values(),...this.retiring]){try{v.source.stop();}catch{}this.dispose(v);}this.loops.clear();this.retiring.clear();this.stopTension();this.musicMix(false);this.stopped=true;
  }
  focus(on:boolean):void{if(on&&!this.focused)this.resync=true;this.focused=on;if(!on)this.stop();this.mix();}
  connection(on:boolean):void{if(on&&!this.online)this.resync=true;this.online=on;if(!on)this.stop();this.mix();}
  preview():void{this.unlock();this.notes([660,880]);this.sample('light1',.3,960);}
}
export const tableAudio=new TableAudio();
export function unlock():void{tableAudio.unlock();}
export function playFeedback(kind:string,position?:Partial<Vec2>):void{tableAudio.feedback(kind,position);}
