import type { View } from './view.js';
import { tangibleDefinition } from '../server/tangibles.js';
import { tangibleTouchPose } from '../server/tangibleTouch.js';

/** A neutral two-contact cue and physical-size preview; no duplicated instructions. */
export function drawTangibleTouchPreview(ctx: CanvasRenderingContext2D,view: View): void {
  const s=view.state,pending=s?.tangiblePlacement;
  if(!s||s.tangiblePlacementMode!=='touch'||!pending||pending.expiresAt<=view.now()||!['READY','RACE'].includes(s.phase))return;
  const definition=tangibleDefinition(pending.id);if(!definition)return;
  const points=view.tangibleTouch?.points??[],color=points.length>1&&!view.tangibleTouch?.valid?'#ff8d77':'#a4f4ef';
  ctx.save();ctx.strokeStyle=color;ctx.fillStyle='#081620c9';ctx.lineWidth=2;
  if(points.length===0){
    ctx.translate(960,125);ctx.beginPath();ctx.roundRect(-58,-34,116,68,14);ctx.fill();ctx.stroke();
    if(definition.kind==='wall')ctx.strokeRect(-28,-8,56,16);
    else{ctx.beginPath();ctx.arc(0,0,13,0,Math.PI*2);ctx.stroke();}
    const dots=definition.kind==='wall'?[[0,-23],[0,23]]:[[-35,0],[35,0]];
    for(const [x,y] of dots){ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.stroke();}
  }else{
    for(const p of points.slice(0,3)){
      ctx.beginPath();ctx.arc(p.x,p.y,15,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.stroke();
    }
    if(points.length===2){
      ctx.setLineDash([5,6]);ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);ctx.lineTo(points[1].x,points[1].y);ctx.stroke();ctx.setLineDash([]);
      const pose=tangibleTouchPose(definition.kind,points[0],points[1],s.params);
      if(pose){
        ctx.translate(pose.x*s.params.logicalWidth,pose.y*s.params.logicalHeight);ctx.rotate(pose.angle*Math.PI/180);
        ctx.fillStyle='#9ef4ed25';
        const length=definition.kind==='wall'?s.params.wallLengthPx:s.params.pylonBasePx;
        const width=definition.kind==='wall'?s.params.wallWidthPx:s.params.pylonBasePx;
        ctx.fillRect(-length/2,-width/2,length,width);ctx.strokeRect(-length/2,-width/2,length,width);
      }
    }
  }
  ctx.restore();
}
