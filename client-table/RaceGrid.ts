import type { TrackGeometry,Vec2 } from '../server/types.js';
import { nearestOnTrack,isInsideTrackRibbon } from '../server/geometry.js';

/** Decorative start boxes are a local coordinate system carried along the real road. */
export function racingGrid(track:TrackGeometry):Vec2[][] {
  const c=track.centerline,n=c.length;if(n<3)return[];
  const cumulative=[0];
  for(let i=0;i<n;i++)cumulative.push(cumulative[i]+Math.hypot(c[(i+1)%n].x-c[i].x,c[(i+1)%n].y-c[i].y));
  const total=cumulative[n];if(total<1)return[];
  const hit=nearestOnTrack(track.startLine.pos,track),a=c[hit.index],b=c[(hit.index+1)%n];
  const start=cumulative[hit.index]+Math.hypot(hit.closest.x-a.x,hit.closest.y-a.y);
  const forward={x:track.startLine.normal.y,y:-track.startLine.normal.x};
  const direction=(b.x-a.x)*forward.x+(b.y-a.y)*forward.y>=0?1:-1;
  const at=(behind:number,lane:number,side:number):Vec2=>{
    const d=((start-direction*behind)%total+total)%total;
    let i=0;while(i<n-1&&cumulative[i+1]<d)i++;
    const p=c[i],q=c[(i+1)%n],length=cumulative[i+1]-cumulative[i],u=(d-cumulative[i])/(length||1);
    const tx=(q.x-p.x)/(length||1)*direction,ty=(q.y-p.y)/(length||1)*direction;
    const half=(track.widths[i]*(1-u)+track.widths[(i+1)%n]*u)/2;
    const across=lane*half*.43+side*Math.min(12,half*.2);
    return{x:p.x+(q.x-p.x)*u-ty*across,y:p.y+(q.y-p.y)*u+tx*across};
  };
  const marks:Vec2[][]=[];
  for(let row=0;row<3;row++)for(const lane of [-1,1]){
    const front=40+row*38+(lane>0?14:0),points:Vec2[]=[];
    for(let d=20;d>=0;d-=2)points.push(at(front+d,lane,-1));
    for(let step=1;step<=8;step++)points.push(at(front,lane,-1+step/4));
    for(let d=2;d<=20;d+=2)points.push(at(front+d,lane,1));
    // At an acute kink, omit a box that cannot fit, rather than drawing on the grass.
    if(points.every(p=>isInsideTrackRibbon(p,track,8)))marks.push(points);
  }
  return marks;
}
