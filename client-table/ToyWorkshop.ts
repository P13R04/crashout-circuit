import type { SceneryLayout, SceneryAnchor } from './SceneryLayout.js';
import { plate } from './neon.js';
type Ctx=CanvasRenderingContext2D;
const TAU=Math.PI*2;
interface ToyPose { x:number;y:number;angle:number;scale:number; }

/** A lovingly assembled miniature racing set, with tools and toys that have a purpose. */
export class ToyWorkshop {
  private planes:ToyPose[]=[];
  private garage:ToyPose|null=null;
  paint(c:Ctx,layout:SceneryLayout):void {
    this.planes=[];this.garage=null;
    layout.anchors.forEach((p,i)=>{
      const s=Math.min(1,p.room/(i===0?155:100));
      c.save();c.translate(p.x,p.y);c.rotate(p.angle);c.scale(s,s);
      if(i===0){
        this.garage={x:p.x,y:p.y,angle:p.angle,scale:s};
        this.paintGarage(c);
      }else if(i%3===1){
        this.paintPlane(c);this.planes.push({x:p.x,y:p.y,angle:p.angle,scale:s});
        this.pencil(c,-20,55,.2,'#e2b34a');this.marble(c,-50,-38,9,'#9bbfb7');
      }else if(i%3===2)this.paintBox(c);
      else{
        this.pencil(c,0,0,-.25,'#ba6153');this.pencil(c,17,26,.16,'#65879c');
        this.marble(c,-54,-29,13,'#e0b666');this.marble(c,-26,-38,10,'#779caa');
        this.paintWrench(c,45,-26);
      }
      c.restore();
    });
  }

  private paintGarage(c:Ctx):void {
    // Die-cut cardboard base, a real miniature pit lane and a red roof at the rear.
    plate(c,-135,-85,270,178,16,'#042a3a80');
    plate(c,-136,-91,270,178,16,'#49787d','#91b6a2');
    c.strokeStyle='#bfd4aa60';c.lineWidth=1;c.setLineDash([5,5]);c.strokeRect(-127,-80,252,157);c.setLineDash([]);
    c.fillStyle='#243e53';c.fillRect(-126,-12,250,76);
    c.fillStyle='#f0d28b';for(let x=-113;x<120;x+=27)c.fillRect(x,53,15,2);
    for(const x of [-70,30]){c.strokeStyle='#bbd7be80';c.lineWidth=1;c.strokeRect(x-31,4,61,38);}
    // The service building has a sloped moulded roof, skylights and roll-up door rails.
    plate(c,-116,-77,212,63,6,'#753e38','#f29d6e');
    const roof=c.createLinearGradient(0,-80,0,-19);roof.addColorStop(0,'#e58b54');roof.addColorStop(.48,'#ce6243');roof.addColorStop(.5,'#f0a174');roof.addColorStop(1,'#ad493e');
    plate(c,-117,-79,214,58,6,roof,'#e9a279');
    for(let x=-105;x<91;x+=18){c.strokeStyle='#783a334f';c.lineWidth=1;c.beginPath();c.moveTo(x,-74);c.lineTo(x,-27);c.stroke();}
    for(const x of [-64,45]){
      plate(c,x-22,-63,44,25,3,'#294c64','#e2b18a');c.fillStyle='#96c6c6';c.fillRect(x-19,-60,38,3);
      c.strokeStyle='#a7d6c75c';c.lineWidth=1;c.beginPath();c.moveTo(x,-59);c.lineTo(x,-40);c.stroke();
    }
    plate(c,-120,-23,220,9,2,'#edc27b','#ffe0a0');
    for(let i=0;i<20;i++){c.fillStyle=i%2?'#e9d6a8':'#354e58';c.fillRect(-109+i*10,-22,6,4);}
    this.miniCar(c,-70,24,'#d5ac51');this.miniCar(c,29,24,'#789eae');
    // A little loading gantry with rails, bolts and a moving grabber.
    for(const x of [-110,105]){
      plate(c,x-5,-3,10,70,2,'#bdac79','#e0cc93');
      c.fillStyle='#173747';for(const y of [5,58])c.fillRect(x-1,y,2,3);
    }
    plate(c,-112,65,224,7,2,'#274b60','#80abb0');
    for(let x=-97;x<100;x+=15){c.strokeStyle='#e2c78066';c.lineWidth=1;c.beginPath();c.moveTo(x,67);c.lineTo(x+6,70);c.stroke();}
    // Spare wheels in a rack and a miniature fuel pump.
    plate(c,105,-69,19,42,3,'#2b4d62','#91b0b4');
    for(let y=-61;y<-25;y+=12){c.fillStyle='#132938';c.beginPath();c.arc(114,y,4,0,TAU);c.fill();c.fillStyle='#9cbbbc';c.beginPath();c.arc(114,y,1.4,0,TAU);c.fill();}
    plate(c,-121,6,16,26,3,'#d99d50','#f3ce80');plate(c,-118,9,10,7,1,'#234459','#90b0ad');
    c.strokeStyle='#152e3c';c.lineWidth=2;c.beginPath();c.moveTo(-105,17);c.bezierCurveTo(-94,17,-97,34,-106,30);c.stroke();
  }

  private miniCar(c:Ctx,x:number,y:number,color:string):void {
    c.save();c.translate(x,y);
    for(const yy of [-12,9]){plate(c,-18,yy,10,4,1,'#0d2939');plate(c,10,yy,10,4,1,'#0d2939');}
    const paint=c.createLinearGradient(0,-9,0,9);paint.addColorStop(0,'#d8e7cb');paint.addColorStop(.2,color);paint.addColorStop(1,'#31546b');
    plate(c,-23,-9,48,18,6,paint,'#adcbbb');
    plate(c,-9,-7,20,14,4,'#183748','#9bbebb');c.fillStyle='#86b2b9';c.fillRect(-7,-5,15,2);
    c.fillStyle='#f3d89a';c.fillRect(14,-1.5,9,3);c.fillRect(-21,-1.5,9,3);
    c.restore();
  }

  private paintPlane(c:Ctx):void {
    c.save();c.translate(3,7);c.fillStyle='#06293877';c.beginPath();c.ellipse(0,0,48,39,0,0,TAU);c.fill();c.restore();
    // Main wing, two-tone fuselage, tailplane and clear cockpit: recognisable from above.
    plate(c,-4,-51,19,102,5,'#bd6d4e','#f4b97d');
    c.fillStyle='#efd29c';c.fillRect(0,-48,4,96);c.fillRect(-3,-35,17,5);c.fillRect(-3,30,17,5);
    plate(c,-40,-21,11,42,3,'#aa6050','#eab17f');
    c.fillStyle='#e6ca8d';c.fillRect(-39,-19,3,38);
    const body=c.createLinearGradient(0,-9,0,9);body.addColorStop(0,'#ecc999');body.addColorStop(.45,'#d28359');body.addColorStop(1,'#8e4d42');
    c.fillStyle=body;c.strokeStyle='#e7ac79';c.lineWidth=1;c.beginPath();c.moveTo(45,0);c.bezierCurveTo(43,-13,7,-10,-37,-4);c.lineTo(-45,0);c.lineTo(-37,4);c.bezierCurveTo(7,10,43,13,45,0);c.closePath();c.fill();c.stroke();
    plate(c,0,-6,18,12,6,'#1b4152','#97c4c2');c.fillStyle='#93c8c9';c.fillRect(5,-4,9,2);
    c.fillStyle='#f6d8a2';c.beginPath();c.arc(32,0,5,0,TAU);c.fill();
    c.strokeStyle='#663b34';c.lineWidth=1;c.beginPath();c.moveTo(-29,0);c.lineTo(-7,0);c.stroke();
  }

  private paintBox(c:Ctx):void {
    c.save();c.rotate(-.09);
    plate(c,-91,-61,182,122,4,'#102f3d80');
    plate(c,-95,-66,184,122,4,'#b89b70','#e2c695');
    plate(c,-84,-55,162,100,3,'#6c7868','#d2ba8c');
    // A vacuum-formed tray with three cars, spare wheels and a screwdriver.
    for(let row=0;row<2;row++)for(let col=0;col<2;col++){
      plate(c,-77+col*76,-48+row*46,68,39,7,'#405f5b','#b6bea05a');
      this.miniCar(c,-43+col*76,-28+row*46,['#b67454','#8ea999','#b9a061','#7199ac'][row*2+col]);
    }
    c.fillStyle='#e0c18c';c.fillRect(-91,-63,176,6);c.fillRect(-91,47,176,6);
    for(let x=-83;x<82;x+=12){c.strokeStyle='#957b5840';c.lineWidth=.7;c.beginPath();c.moveTo(x,-61);c.lineTo(x+4,-57);c.stroke();}
    this.pencil(c,-16,76,-.06,'#c49b4b');this.paintWrench(c,109,-12);
    c.restore();
  }
  private pencil(c:Ctx,x:number,y:number,a:number,color:string):void {
    c.save();c.translate(x,y);c.rotate(a);
    plate(c,-65,-4,124,9,1,'#0a2b3b55');plate(c,-66,-6,120,9,1,color,'#d9c38e');
    c.fillStyle='#edd1a0';c.beginPath();c.moveTo(54,-6);c.lineTo(73,-1.5);c.lineTo(54,3);c.closePath();c.fill();
    c.fillStyle='#293f40';c.beginPath();c.moveTo(67,-3);c.lineTo(73,-1.5);c.lineTo(67,0);c.closePath();c.fill();
    c.fillStyle='#d3c8aa';c.fillRect(-65,-6,11,9);c.fillStyle='#ac6c67';c.fillRect(-75,-6,10,9);c.restore();
  }
  private marble(c:Ctx,x:number,y:number,r:number,color:string):void {
    c.fillStyle='#082d3d70';c.beginPath();c.ellipse(x+3,y+4,r,r*.7,0,0,TAU);c.fill();
    const glass=c.createRadialGradient(x-r*.3,y-r*.4,0,x,y,r);glass.addColorStop(0,'#dbe5ca');glass.addColorStop(.3,color);glass.addColorStop(1,'#204d5b');
    c.fillStyle=glass;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.strokeStyle='#d9e6cd80';c.lineWidth=1;c.beginPath();c.arc(x,y,r*.72,2.6,4.7);c.stroke();
    c.fillStyle='#eaf4d8';c.beginPath();c.ellipse(x-r*.35,y-r*.4,r*.18,r*.1,-.6,0,TAU);c.fill();
  }
  private paintWrench(c:Ctx,x:number,y:number):void {
    c.save();c.translate(x,y);c.rotate(.4);c.strokeStyle='#0c2f3d77';c.lineWidth=9;c.beginPath();c.moveTo(2,-18);c.lineTo(2,25);c.stroke();
    c.strokeStyle='#9eb6ae';c.lineWidth=6;c.beginPath();c.moveTo(0,-18);c.lineTo(0,25);c.stroke();
    c.lineWidth=4;c.beginPath();c.arc(0,-23,8,.2,Math.PI-.2);c.stroke();c.beginPath();c.arc(0,29,6,0,TAU);c.stroke();c.restore();
  }

  draw(c:Ctx,time:number,reduced:boolean):void {
    const t=reduced?0:time;
    for(const p of this.planes){
      c.save();c.translate(p.x,p.y);c.rotate(p.angle);c.scale(p.scale,p.scale);c.translate(46,0);
      c.save();c.rotate(t/130);c.fillStyle='#d1c4a57a';c.beginPath();c.ellipse(0,0,2,24,0,0,TAU);c.fill();c.restore();
      c.fillStyle='#edd3a2';c.beginPath();c.arc(0,0,3,0,TAU);c.fill();c.restore();
    }
    if(this.garage){
      const p=this.garage,u=(Math.sin(t/2300)*.5+.5),x=-82+u*150;
      c.save();c.translate(p.x,p.y);c.rotate(p.angle);c.scale(p.scale,p.scale);
      // A purposeful toy gantry traverses its rail, lowers and opens its jaws.
      const down=(Math.sin(t/1150)*.5+.5)*13;
      plate(c,x-10,62,20,12,3,'#cdad65','#ffe0a0');
      c.strokeStyle='#c9c6a4';c.lineWidth=2;c.beginPath();c.moveTo(x,62);c.lineTo(x,44-down);c.stroke();
      c.beginPath();c.moveTo(x-5,39-down);c.lineTo(x-9,46-down);c.lineTo(x-5,50-down);c.moveTo(x+5,39-down);c.lineTo(x+9,46-down);c.lineTo(x+5,50-down);c.stroke();
      c.fillStyle='#e7c167';for(let i=0;i<4;i++)c.fillRect(-110+i*7,-16,3,reduced?2:2+Math.sin(t/470-i)*.7);
      c.restore();
    }
  }
}
