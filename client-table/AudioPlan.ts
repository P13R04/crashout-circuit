import type { GameState, Team } from '../server/types.js';
export interface AudioSettings { enabled:boolean; effects:number; ambience:number; music:number; }
export const AUDIO_STORAGE_KEY='crashout.audio';
export const DEFAULT_AUDIO:AudioSettings={enabled:true,effects:.7,ambience:.22,music:.12};
export function audioSettings(value:unknown):AudioSettings {
  const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const volume=(key:'effects'|'ambience'|'music')=>typeof v[key]==='number'&&Number.isFinite(v[key])?Math.max(0,Math.min(1,v[key] as number)):DEFAULT_AUDIO[key];
  return{enabled:typeof v.enabled==='boolean'?v.enabled:true,effects:volume('effects'),ambience:volume('ambience'),music:volume('music')};
}
export interface AudioCue { kind:string; team?:Team; x?:number; }
interface CarAudio { lap:number; countdown:number|null; repair:number; low:boolean; }
/** Derives sparse audible transitions. No checkpoint spam, timer backlog or replay on initial connection. */
export class AudioTimeline {
  private phase:GameState['phase']|null=null;
  private countdown:number|null=null;
  private cars:Partial<Record<Team,CarAudio>>={};
  private placement:number|null=null;
  private pendingId:number|null=null;
  reset():void {this.phase=null;this.countdown=null;this.cars={};this.placement=null;this.pendingId=null;}
  step(s:GameState,now:number):AudioCue[]{
    const cues:AudioCue[]=[],emit=(kind:string,team?:Team,x?:number)=>cues.push({kind,team,x});
    const previous=this.phase,active=s.phase==='RACE';
    if(previous&&previous!==s.phase){
      if(s.phase==='PAUSED')emit('pause');
      else if(previous==='PAUSED'&&active)emit('resume');
      else if(s.phase==='READY')emit('raceReady');
      else if(s.phase==='RESULT')emit('raceFinish');
      else if(s.phase==='MAP')emit('mapBegin');
    }
    if(active){
      const count=Math.max(0,Math.ceil((s.sessionStartAt-now)/1000));
      if(count>0&&count<=3&&count!==this.countdown)emit('countdown');
      if(count===0&&this.countdown!==null&&this.countdown>0)emit('go');
      this.countdown=count;
    }else if(s.phase!=='PAUSED')this.countdown=null;
    for(const team of ['A','B'] as const){
      const car=s.cars[team],prev=this.cars[team];
      const count=car.respawnUntil>0?Math.max(0,Math.ceil((car.respawnUntil-(s.phase==='PAUSED'?s.pausedAt:now))/1000)):null;
      const progress=s.repairProgress[team],quarter=progress>0?Math.min(4,Math.floor(progress*4)+1):0,low=car.hp>0&&car.hp<=30;
      if(active){
        if(count!==null&&count>0&&count<=3&&prev?.countdown!==count)emit('countdown',team,car.pos.x);
        if(count===0&&prev?.countdown&&prev.countdown>0)emit('go',team,car.pos.x);
        if(prev&&car.lap>prev.lap)emit(car.lap===s.params.lapsToWin-1?'finalLap':'lap',team,car.pos.x);
        if(prev&&low&&!prev.low)emit('lowHealth',team,car.pos.x);
        if(quarter>0&&quarter!==prev?.repair)emit(quarter===1?'repairBegin':'repairProgress',team,car.pos.x);
        if(quarter===0&&prev?.repair&&!(car.respawnUntil>now)&&car.hp< s.params.hpMax)emit('repairInterrupted',team,car.pos.x);
      }
      this.cars[team]={lap:car.lap,countdown:count,repair:quarter,low};
    }
    const placement=s.tangiblePlacement?.token??null;
    if(placement!==null&&placement!==this.placement)emit('placementWaiting');
    if(placement===null&&this.placement!==null&&this.pendingId!==null&&s.tangibles[this.pendingId]?.status!=='placed'&&['RACE','READY'].includes(s.phase))emit('placementCancelled');
    this.placement=placement;this.pendingId=s.tangiblePlacement?.id??null;this.phase=s.phase;
    return cues;
  }
}
/** Prevents simultaneous contacts and repeated snapshots from piling up sounds. */
export class CueGate {
  private last=new Map<string,number>();
  accept(family:string,now:number,interval:number):boolean {
    if(now-(this.last.get(family)??-Infinity)<interval)return false;
    this.last.set(family,now);return true;
  }
  clear():void{this.last.clear();}
}
