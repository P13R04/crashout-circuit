import type { TrackGeometry, Vec2 } from '../server/types.js';
import { insidePanel, inTangibleDepot } from '../server/layout.js';

export interface VenueFrame extends Vec2 { tx:number; ty:number; nx:number; ny:number; half:number; distance:number; index:number; }
export interface SceneryAnchor extends Vec2 { room:number; angle:number; seed:number; }
export interface SceneryLayout { frames:VenueFrame[]; stands:VenueFrame[][]; anchors:SceneryAnchor[]; track:TrackGeometry|null; }

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
export function layoutScenery(track:TrackGeometry|null):SceneryLayout {
  if(!track)return{frames:[],stands:[],anchors:[{x:960,y:540,room:180,angle:0,seed:0},{x:480,y:640,room:100,angle:-.2,seed:1},{x:1450,y:440,room:100,angle:.15,seed:2}],track:null};
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
  const stands:VenueFrame[][]=[];let run:VenueFrame[]=[];
  for(const f of frames){
    const front=venuePoint(f,42),back=venuePoint(f,110);
    const valid=clearUi(front,8)&&clearUi(back,12)&&roadClearance(front,track)>28&&roadClearance(back,track)>65;
    const prev=run.at(-1),aligned=!prev||f.tx*prev.tx+f.ty*prev.ty>.8;
    if(!valid||!aligned){if(run.length>=6)stands.push(run);run=[];}
    if(valid)run.push(f);
  }
  if(run.length>=6)stands.push(run);
  // Large recognisable props get real empty space, never arbitrary dots on the road.
  const candidates:SceneryAnchor[]=[];
  for(let y=240;y<=840;y+=60)for(let x=240;x<=1680;x+=60){
    const p={x,y},room=Math.min(roadClearance(p,track),y-170,910-y,x-145,1770-x);
    if(room>=52&&clearUi(p,Math.min(room,75)))candidates.push({...p,room,angle:0,seed:candidates.length});
  }
  candidates.sort((a,b)=>b.room-a.room);
  const anchors:SceneryAnchor[]=[];
  for(const p of candidates){
    if(anchors.every(a=>Math.hypot(a.x-p.x,a.y-p.y)>Math.min(180,a.room)+Math.min(150,p.room)+25))anchors.push({...p,angle:((p.seed%5)-2)*.06});
    if(anchors.length===7)break;
  }
  return{frames,stands,anchors,track};
}
