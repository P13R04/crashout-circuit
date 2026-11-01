/** Small looping demonstrations, confined to a lesson card rather than drawn as fake table contacts. */
import type { TutorialStepId } from '../server/types.js';
import { icon } from './icons.js';

export type GestureDemoId = TutorialStepId | 'watch' | 'impact' | 'deflect';
type Ctx = CanvasRenderingContext2D;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function drawGestureDemo(ctx: Ctx, id: GestureDemoId, now: number, color: string, sub = 0): void {
  // At zero (reduced motion) show a complete, legible pose instead of an empty first frame.
  const t = now === 0 ? .57 : (now % 4000) / 4000;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2;
  const line = (points: number[][], ink = color, width = 2) => {
    ctx.strokeStyle = ink; ctx.lineWidth = width; ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  };
  const finger = (x: number, y: number, landed = true) => {
    ctx.strokeStyle = landed ? '#f1fafc' : '#8b9eaa'; ctx.fillStyle = landed ? color + '44' : '#0c1820'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, landed ? 9 : 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (landed) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
  };
  const road = () => {
    ctx.fillStyle = '#23343d'; ctx.fillRect(-62, -25, 124, 50);
    line([[-62,-25],[62,-25]], '#7d959c'); line([[-62,25],[62,25]], '#7d959c');
    ctx.setLineDash([6,8]); line([[-62,0],[62,0]], '#c2d2d14d'); ctx.setLineDash([]);
  };
  const arrow = (x: number, y: number, rot = 0) => {
    ctx.save(); ctx.translate(x,y); ctx.rotate(rot); line([[-8,-5],[0,0],[-8,5]], color, 3); ctx.restore();
  };
  switch (id) {
    case 'watch':
      road();icon(ctx,'wheel',-48+t*96,0,27,color);break;
    case 'impact': {
      road();ctx.strokeStyle='#ff8b78';ctx.fillStyle='#ff795f22';ctx.lineWidth=2;ctx.beginPath();ctx.arc(20,0,22+3*Math.sin(t*6),0,Math.PI*2);ctx.fill();ctx.stroke();
      icon(ctx,'wheel',-50+t*86,t>.38?-27:0,26,color);break;
    }
    case 'deflect': {
      road();ctx.save();ctx.translate(17,0);ctx.rotate(-.55);ctx.fillStyle='#9eb3b7';ctx.fillRect(-5,-31,10,62);ctx.restore();
      const hit=t>.55;icon(ctx,'wheel',hit?4-(t-.55)*48:-48+t*96,hit?(t-.55)*40:0,26,color);break;
    }
    case 'sling': {
      const pull = clamp((t-.28)/.32), released = t > .73, y = 5 + pull * 30;
      line([[-32,-20],[0,released?5:y],[32,-20]], '#ffce66', 3);
      finger(-32,-20,t>.05); finger(32,-20,t>.15);
      if (!released) finger(0,y,t>.25);
      else { const py=5-(t-.73)*180; ctx.fillStyle='#ffce66';ctx.beginPath();ctx.arc(0,py,5,0,Math.PI*2);ctx.fill(); }
      arrow(0,-35,-Math.PI/2);
      break;
    }
    case 'boost': case 'boostCross':
      road();
      if(t>.32 || id==='boostCross') {
        line([[0,-25],[0,25]], '#ffce66', 5);
        arrow(22,0); arrow(38,0);
      }
      if(id==='boost') {finger(0,-22,t>.12);finger(0,22,t>.32);}
      else { icon(ctx,'wheel',-45+t*75,0,23,color); }
      break;
    case 'borderPull': {
      const pull=clamp((t-.3)/.45)*27;
      ctx.fillStyle='#23343d';ctx.beginPath();ctx.moveTo(-62,-24);ctx.quadraticCurveTo(-10,-35,62,-16);ctx.lineTo(62,25);ctx.quadraticCurveTo(-10,35+pull,-62,25);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#7d959c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-62,25);ctx.quadraticCurveTo(-10,35+pull,62,25);ctx.stroke();
      finger(-15,29+pull*.6,t>.1);finger(10,29+pull*.6,t>.21);arrow(-2,47,Math.PI/2);
      break;
    }
    case 'wall': case 'pylon': {
      const wall=id==='wall', placed=t>.3, approach=placed?0:(.3-t)*35;
      ctx.fillStyle=placed?'#91d7dc35':'#273d47';ctx.strokeStyle='#b1d3d6';ctx.lineWidth=2;
      if(wall) {ctx.beginPath();ctx.roundRect(-46,-15,92,30,4);ctx.fill();ctx.stroke();line([[-33,-8],[-20,8]],'#ffce66');line([[-9,-8],[4,8]],'#ffce66');line([[15,-8],[28,8]],'#ffce66');}
      else {ctx.beginPath();ctx.arc(0,0,18,0,Math.PI*2);ctx.fill();ctx.stroke();icon(ctx,'bolt',0,0,22,'#b6f4ee');}
      finger(wall?0:-34-approach,wall?-28-approach:0,t>.12);finger(wall?0:34+approach,wall?28+approach:0,t>.3);
      // The wall's long edge is perpendicular to the axis between the fingers.
      if(placed) {ctx.setLineDash([3,5]);ctx.strokeStyle=color+'88';ctx.beginPath();ctx.ellipse(0,0,wall?59:48,wall?39:34,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
      if(id==='pylon') {for(let i=0;i<2;i++){ctx.fillStyle=(sub&(1<<i))?'#61f4ba':'#50616c';ctx.beginPath();ctx.arc(-7+i*14,47,3,0,Math.PI*2);ctx.fill();}}
      break;
    }
    case 'depot':
      ctx.fillStyle='#1a3038';ctx.strokeStyle='#7b9da7';ctx.beginPath();ctx.roundRect(14,-37,48,74,8);ctx.fill();ctx.stroke();
      ctx.fillStyle=color+'44';ctx.strokeStyle=color;ctx.beginPath();ctx.roundRect(-54+t*73,-8,36,16,3);ctx.fill();ctx.stroke();
      arrow(-4,-20);icon(ctx,'bolt',38,19,19,'#92aab2');break;
    case 'arc':
      icon(ctx,'bolt',-48,0,25,'#b6f4ee');icon(ctx,'bolt',48,0,25,'#b6f4ee');
      line([[-32,0],[-22,-8],[-8,7],[5,-7],[17,5],[32,0]],'#b6f4ee',3);
      icon(ctx,'wheel',-28+t*56,26,21,color);break;
    case 'repair': case 'identify':
      for(let i=0;i<2;i++){
        const x=i===0?-34:34,on=id==='identify'?!!(sub&(1<<i)):t>.1+i*.16;
        ctx.strokeStyle=on?color:'#526974';ctx.fillStyle=on?color+'22':'#15252e';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(x,0,22,0,Math.PI*2);ctx.fill();ctx.stroke();icon(ctx,on&&id==='identify'?'check':'wrench',x,0,23,on?color:'#b6c4cc');
        if(id==='repair'&&t>.28){ctx.strokeStyle='#61f4ba';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,0,26,-Math.PI/2,-Math.PI/2+clamp((t-.28)/.5)*Math.PI*2);ctx.stroke();}
      }
      line([[-9,0],[9,0]],'#7d959c');break;
    case 'steer':
      ctx.strokeStyle='#526974';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-60,-25,120,50,12);ctx.stroke();
      arrow(-38,0,Math.PI);arrow(38,0);finger(Math.sin(t*Math.PI*2)*42,0);break;
    case 'power': case 'boostPower':
      icon(ctx,'power',0,0,49,t>.3?'#ffce66':color);if(t>.3){ctx.strokeStyle='#ffce66';ctx.beginPath();ctx.arc(0,0,34,0,Math.PI*2);ctx.stroke();}else finger(20,25);break;
    case 'pedal':icon(ctx,'pedal',0,0,50,color);break;
    case 'pickup': case 'boostPickup':
      road();icon(ctx,id==='pickup'?'target':'bolt',32,0,25,'#ffce66');icon(ctx,'wheel',-48+t*78,0,26,color);break;
  }
  ctx.restore();
}
