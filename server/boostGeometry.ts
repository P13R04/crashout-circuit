import type { BoostGate, TrackGeometry, Vec2 } from './types.js';
import { closestOnSegment, dist, nearestOnTrack, segmentsIntersect } from './geometry.js';

export const BOOST_DEPTH = 60;

/** The gesture sets the width; the local road supplies the direction of travel. */
export function orientBoostGate(a: Vec2, b: Vec2, track: TrackGeometry | null) {
  const mid = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 }, length = dist(a,b);
  let forward = { x: -(b.y-a.y)/length, y: (b.x-a.x)/length };
  if (track && track.centerline.length > 2) {
    const nearest = nearestOnTrack(mid,track), points = track.centerline;
    let bestScore = Infinity;
    // Near a crossing, prefer the branch transverse to the two contacts. Distance
    // still dominates away from a junction, so a nearby curve cannot steal the gate.
    for (let i=0;i<points.length;i++) {
      const start=points[i],end=points[(i+1)%points.length];
      const d=dist(mid,closestOnSegment(mid,start,end));
      if(d>nearest.distance+8)continue;
      const size=dist(start,end);if(size<1e-6)continue;
      const tangent={x:(end.x-start.x)/size,y:(end.y-start.y)/size};
      const parallel=Math.abs((b.x-a.x)/length*tangent.x+(b.y-a.y)/length*tangent.y);
      const score=d*d+parallel*parallel*400;
      if(score<bestScore){bestScore=score;forward=tangent;}
    }
  }
  const across={x:forward.y,y:-forward.x};
  return { a:{x:mid.x-across.x*length/2,y:mid.y-across.y*length/2},
    b:{x:mid.x+across.x*length/2,y:mid.y+across.y*length/2},dir:forward,depth:BOOST_DEPTH };
}

/** Shared basis: local x spans the gate and local y always points forwards. */
export function boostFrame(g: Pick<BoostGate,'a'|'b'|'dir'|'depth'>) {
  const length=dist(g.a,g.b), safe=Math.max(length,1e-9);
  const across={x:(g.b.x-g.a.x)/safe,y:(g.b.y-g.a.y)/safe};
  const sign=g.dir && (-across.y*g.dir.x+across.x*g.dir.y)<0?-1:1;
  const forward={x:-across.y*sign,y:across.x*sign};
  return {across,forward,length,depth:g.depth??BOOST_DEPTH};
}

/** Swept collision includes all four sides, including a fast lateral crossing. */
export function hitsBoostGate(prev: Vec2, pos: Vec2, g: Pick<BoostGate,'a'|'b'|'dir'|'depth'>, margin=15): boolean {
  const {across,forward,length,depth}=boostFrame(g);
  if(length<1e-6)return false;
  const inBox=(p:Vec2)=>{
    const dx=p.x-g.a.x,dy=p.y-g.a.y,x=dx*across.x+dy*across.y,y=dx*forward.x+dy*forward.y;
    return x>=-margin&&x<=length+margin&&y>=-margin&&y<=depth+margin;
  };
  if(inBox(prev)||inBox(pos))return true;
  const points=[[-margin,-margin],[length+margin,-margin],[length+margin,depth+margin],[-margin,depth+margin]]
    .map(([x,y])=>({x:g.a.x+across.x*x+forward.x*y,y:g.a.y+across.y*x+forward.y*y}));
  return points.some((p,i)=>segmentsIntersect(prev,pos,p,points[(i+1)%points.length]));
}
