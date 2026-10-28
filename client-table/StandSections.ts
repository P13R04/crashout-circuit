import type { Vec2 } from '../server/types.js';
import type { VenueFrame } from './SceneryLayout.js';

interface Footprint { points:Vec2[]; minX:number;maxX:number;minY:number;maxY:number; }
/** Includes end rails, rear canopies and front furniture, rather than only the seat centreline. */
export function standFootprint(a:VenueFrame,b:VenueFrame):Vec2[]{
  const at=(f:VenueFrame,d:number)=>({x:f.x+f.nx*(f.half+d),y:f.y+f.ny*(f.half+d)});
  return[at(a,18),at(b,18),at(b,136),at(a,136)];
}
function footprint(points:Vec2[]):Footprint {
  return{points,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
}
/** Convex SAT, with a small real-world aisle between separate sections. */
export function standFootprintsOverlap(a:readonly Vec2[],b:readonly Vec2[],gap=0):boolean {
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],length=Math.hypot(q.x-p.x,q.y-p.y);if(length<1e-5)continue;
    const nx=-(q.y-p.y)/length,ny=(q.x-p.x)/length;
    let minA=Infinity,maxA=-Infinity,minB=Infinity,maxB=-Infinity;
    for(const v of a){const d=v.x*nx+v.y*ny;minA=Math.min(minA,d);maxA=Math.max(maxA,d);}
    for(const v of b){const d=v.x*nx+v.y*ny;minB=Math.min(minB,d);maxB=Math.max(maxB,d);}
    if(maxA+gap<=minB+1e-6||maxB+gap<=minA+1e-6)return false;
  }
  return true;
}
function overlaps(a:Footprint,b:Footprint,gap:number):boolean {
  return !(a.maxX+gap<=b.minX||b.maxX+gap<=a.minX||a.maxY+gap<=b.minY||b.maxY+gap<=a.minY)&&standFootprintsOverlap(a.points,b.points,gap);
}
function unfolded(a:VenueFrame,b:VenueFrame,points:Vec2[]):boolean {
  if(a.tx*b.tx+a.ty*b.ty<.8)return false;
  const tx=a.tx+b.tx,ty=a.ty+b.ty;
  // An offset on the concave side of a tight bend can travel backwards despite
  // the road moving forwards. Split here before the terraces fold over themselves.
  if((points[1].x-points[0].x)*tx+(points[1].y-points[0].y)*ty<2)return false;
  if((points[2].x-points[3].x)*tx+(points[2].y-points[3].y)*ty<2)return false;
  let sign=0;
  for(let i=0;i<4;i++){
    const p=points[i],q=points[(i+1)%4],r=points[(i+2)%4],cross=(q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);
    if(Math.abs(cross)<1e-5)return false;
    if(sign&&cross*sign<0)return false;sign=Math.sign(cross);
  }
  return true;
}

/** Only map changes run this planner. Adjacent tiles may share an edge; every other volume is reserved. */
export function planStandSections(frames:VenueFrame[],allowed:(f:VenueFrame)=>boolean):VenueFrame[][] {
  const sections:VenueFrame[][]=[],committed:Footprint[]=[];
  let run:VenueFrame[]=[],pending:Footprint[]=[];
  const valid=frames.map(allowed);
  const finish=()=>{if(run.length>=6){sections.push(run);committed.push(...pending);}run=[];pending=[];};
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1],b=frames[i],points=standFootprint(a,b);
    if(!valid[i-1]||!valid[i]||!unfolded(a,b,points)){finish();continue;}
    const shape=footprint(points);
    // Bounding boxes discard distant sections before the polygon test. Only the
    // immediately preceding tile is exempt: it is the legitimate shared seam.
    const conflict=committed.some(other=>overlaps(shape,other,8))||pending.slice(0,-1).some(other=>overlaps(shape,other,.5));
    if(conflict){finish();continue;}
    if(!run.length)run.push(a);run.push(b);pending.push(shape);
  }
  finish();return sections;
}
