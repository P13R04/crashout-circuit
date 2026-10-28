import type { TrackGeometry, Vec2 } from '../server/types.js';
import { planStandSections } from './StandSections.js';
import { insidePanel, inTangibleDepot } from '../server/layout.js';

export interface VenueFrame extends Vec2 { tx:number; ty:number; nx:number; ny:number; half:number; distance:number; index:number; }
export interface SceneryAnchor extends Vec2 { room:number; angle:number; seed:number; }
export interface SceneryLayout { frames:VenueFrame[]; stands:VenueFrame[][]; anchors:SceneryAnchor[]; track:TrackGeometry|null; }

export type SceneryPresentation='race'|'lobby'|'map';
export interface DecorRect {x:number;y:number;w:number;h:number;}
/** Shared by placement and the final clip, including animation that extends beyond a prop. */
export function sceneryReservations(mode:SceneryPresentation):readonly DecorRect[]{
  if(mode==='lobby')return[{x:590,y:155,w:740,h:770}];
  if(mode==='map')return[{x:155,y:195,w:1600,h:690},{x:600,y:0,w:720,h:265},{x:600,y:815,w:720,h:265}];
  return[];
}
function distanceToRect(p:Vec2,r:DecorRect):number {
  const dx=Math.max(r.x-p.x,0,p.x-r.x-r.w),dy=Math.max(r.y-p.y,0,p.y-r.y-r.h);
  return dx||dy?Math.hypot(dx,dy):-Math.min(p.x-r.x,r.x+r.w-p.x,p.y-r.y,r.y+r.h-p.y);
}
function menuScenery(mode:SceneryPresentation):SceneryLayout {
  const slots=mode==='map'?[[1440,100,64],[110,340,36],[1810,270,30],[1440,980,64],[110,740,36],[1810,815,30]]:[[380,300,110],[1540,300,110],[380,540,120],[1540,540,120],[380,780,110],[1540,780,110]];
  const reserved=sceneryReservations(mode);
  const anchors=slots.map(([x,y,wanted],seed)=>{
    const p={x,y},room=Math.min(wanted,...reserved.map(r=>distanceToRect(p,r)-12));
    return{...p,room,angle:seed%2?.12:-.12,seed};
  }).filter(p=>p.room>=24&&!insidePanel(p,p.room)&&!inTangibleDepot(p));
  return{frames:[],stands:[],anchors,track:null};
}
/** Conservative occupied strip: terraces, fence furniture, flags and overhangs. */
export function standClearance(p:Vec2,stands:VenueFrame[][]):number {
  let best=Infinity;
  for(const run of stands)for(let i=1;i<run.length;i++){
    const a=venuePoint(run[i-1],78),b=venuePoint(run[i],78),dx=b.x-a.x,dy=b.y-a.y;
    const u=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    best=Math.min(best,Math.hypot(p.x-a.x-dx*u,p.y-a.y-dy*u)-64);
  }
  return best;
}

/** Stable through network snapshots and temporary pulls: the venue belongs to the original drawing. */
export function sceneryKey(track:TrackGeometry|null):number {
  if(!track)return 0;
  let hash=2166136261;
  const points=track.baseCenterline.length?track.baseCenterline:track.centerline;
  for(let i=0;i<points.length;i++){
    const p=points[i];
    hash=Math.imul(hash^Math.round(p.x*8),16777619);
    hash=Math.imul(hash^Math.round(p.y*8),16777619);
    hash=Math.imul(hash^Math.round(track.widths[i]*8),16777619);
  }
  return hash|0;
}

export function roadClearance(p:Vec2,track:TrackGeometry):number {
  const points=track.baseCenterline.length?track.baseCenterline:track.centerline;
  let best=Infinity;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    const d=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)-(track.widths[i]*(1-t)+track.widths[(i+1)%points.length]*t)/2;
    best=Math.min(best,d);
  }
  return best;
}
export function venuePoint(f:VenueFrame,offset:number,along=0):Vec2 {
  return{x:f.x+f.nx*(f.half+offset)+f.tx*along,y:f.y+f.ny*(f.half+offset)+f.ty*along};
}
function clearUi(p:Vec2,margin:number):boolean {
  return p.x>135+margin&&p.x<1775-margin&&p.y>24+margin&&p.y<1056-margin&&!insidePanel(p,margin)&&!inTangibleDepot(p);
}

/** Arc-length sampling makes seat spacing and fences independent of point density. */
export function layoutScenery(track:TrackGeometry|null,mode:SceneryPresentation=track?'race':'lobby'):SceneryLayout {
  if(mode!=='race'||!track)return menuScenery(mode==='race'?'lobby':mode);
  const points=track.baseCenterline.length?track.baseCenterline:track.centerline;
  const area=points.reduce((v,p,i)=>{const q=points[(i+1)%points.length];return v+p.x*q.y-q.x*p.y;},0),sign=area>=0?1:-1;
  const frames:VenueFrame[]=[];let distance=0,next=0;
  for(let i=0;i<points.length;i++){
    const p=points[i],q=points[(i+1)%points.length],dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);if(d<.001)continue;
    while(next<distance+d){
      const u=(next-distance)/d,tx=dx/d,ty=dy/d;
      frames.push({x:p.x+dx*u,y:p.y+dy*u,tx,ty,nx:ty*sign,ny:-tx*sign,half:(track.widths[i]*(1-u)+track.widths[(i+1)%points.length]*u)/2,distance:next,index:frames.length});next+=14;
    }
    distance+=d;
  }
  const stands=planStandSections(frames,f=>{
    const front=venuePoint(f,42),back=venuePoint(f,110);
    return clearUi(front,8)&&clearUi(back,12)&&roadClearance(front,track)>28&&roadClearance(back,track)>65;
  });
  // Large recognisable props get real empty space, never arbitrary dots on the road.
  const candidates:SceneryAnchor[]=[];
  for(let y=240;y<=840;y+=60)for(let x=240;x<=1680;x+=60){
    const p={x,y},room=Math.min(roadClearance(p,track),standClearance(p,stands),y-170,910-y,x-145,1770-x)-10;
    if(room>=52&&clearUi(p,room))candidates.push({...p,room,angle:0,seed:candidates.length});
  }
  candidates.sort((a,b)=>b.room-a.room);
  const anchors:SceneryAnchor[]=[];
  for(const p of candidates){
    if(anchors.every(a=>Math.hypot(a.x-p.x,a.y-p.y)>a.room+p.room+20))anchors.push({...p,angle:((p.seed%5)-2)*.06});
    if(anchors.length===7)break;
  }
  return{frames,stands,anchors,track};
}
