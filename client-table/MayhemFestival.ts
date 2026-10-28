import type { SceneryLayout, SceneryAnchor, VenueFrame } from './SceneryLayout.js';
import { venuePoint } from './SceneryLayout.js';
import { glow, plate, noise } from './neon.js';
type Ctx=CanvasRenderingContext2D;
const TAU=Math.PI*2;
interface SparkSite{x:number;y:number;seed:number;}
function tyre(c:Ctx,x:number,y:number,r:number):void {
  c.fillStyle='#111a18';c.strokeStyle='#6a6d532f';c.lineWidth=1;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.stroke();
  c.fillStyle='#3d4032';c.beginPath();c.arc(x,y,r*.43,0,TAU);c.fill();
  c.strokeStyle='#82816859';c.lineWidth=.7;c.beginPath();c.arc(x,y-1,r*.7,Math.PI,Math.PI*2);c.stroke();
}

/** A rough, occupied demolition festival. Every light belongs to a stage, rig or workshop. */
export class MayhemFestival {
  private stage:SceneryAnchor|null=null;
  private lamps:VenueFrame[]=[];
  private welds:SparkSite[]=[];
  private smoke:HTMLCanvasElement|null=null;
  paint(c:Ctx,layout:SceneryLayout):void {
    this.stage=layout.anchors[0]??null;this.lamps=[];this.welds=[];
    glow(c,0,0,1,'#b8d8ce',0);glow(c,0,0,1,'#d89b4d',0); // prepare the weld texture before animation starts
    for(const run of layout.stands){
      for(let i=1;i<run.length;i++){
        const a=run[i-1],b=run[i],p=venuePoint(a,42),q=venuePoint(b,42),r=venuePoint(b,88),s=venuePoint(a,88);
        c.fillStyle='#3b3b2d';c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.lineTo(r.x,r.y);c.lineTo(s.x,s.y);c.closePath();c.fill();
        // Uneven timber terraces behind a double row of tyres.
        for(const offset of [48,63,78]){
          const p=venuePoint(a,offset),q=venuePoint(b,offset);
          c.strokeStyle='#8c795057';c.lineWidth=3;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();
        }
      }
      for(const f of run){
        const p=venuePoint(f,27);tyre(c,p.x,p.y,6.5);
        if(f.index%2===0){const q=venuePoint(f,37);tyre(c,q.x,q.y,5.5);}
        if(f.index%3===0){
          for(let row=0;row<3;row++){
            const p=venuePoint(f,51+row*13);c.fillStyle=['#b48d62','#7f9c89','#98716a'][(f.index+row)%3];
            c.beginPath();c.arc(p.x,p.y,2.4,0,TAU);c.fill();c.fillStyle='#d1ac7c8c';c.fillRect(p.x-1,p.y-2,2,1.5);
          }
        }
        if(f.index%12===0)this.lamps.push(f);
        if(f.index%23===0){
          const p=venuePoint(f,99);c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(f.ty,f.tx));
          c.fillStyle='#c37b40';c.beginPath();c.moveTo(-16,-14);c.lineTo(15,-14);c.lineTo(12,18);c.lineTo(0,14);c.lineTo(-15,18);c.closePath();c.fill();
          c.strokeStyle='#e1bd75';c.lineWidth=1;c.beginPath();c.moveTo(-15,-12);c.lineTo(14,-12);c.stroke();
          c.strokeStyle='#343b26';c.lineWidth=3;c.beginPath();c.moveTo(-7,-6);c.lineTo(7,8);c.moveTo(7,-6);c.lineTo(-7,8);c.stroke();c.restore();
        }
        // Corrugated advertisements are just scratched hazard motifs, no repeated prose.
        if(f.index%17===0){
          const p=venuePoint(f,42);c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(f.ty,f.tx));
          plate(c,-26,-6,52,12,1,'#986d37','#c3a168');
          c.strokeStyle='#302d20';c.lineWidth=4;c.beginPath();for(let x=-24;x<26;x+=12){c.moveTo(x,-5);c.lineTo(x+8,5);}c.stroke();c.restore();
        }
      }
    }
    layout.anchors.forEach((p,i)=>{
      c.save();c.translate(p.x,p.y);c.rotate(p.angle);const s=Math.min(1,p.room/(i===0?175:i%3===2?130:150));c.scale(s,s);
      if(i===0)this.paintStage(c);
      else if(i%3===1){this.paintWrecks(c);this.paintBench(c,65,45);}
      else if(i%3===2)this.paintVendor(c);
      else{this.paintWrecks(c);this.paintBench(c,65,45);}
      c.restore();
      if(i>0&&i%3!==2)this.welds.push({x:p.x+Math.cos(p.angle)*65*s-Math.sin(p.angle)*45*s,y:p.y+Math.sin(p.angle)*65*s+Math.cos(p.angle)*45*s,seed:i});
    });
    if(!this.smoke){
      this.smoke=document.createElement('canvas');this.smoke.width=this.smoke.height=192;
      const s=this.smoke.getContext('2d')!,g=s.createRadialGradient(96,96,4,96,96,94);
      g.addColorStop(0,'#d5b58b85');g.addColorStop(.45,'#b49a7339');g.addColorStop(1,'#a99b7800');s.fillStyle=g;s.fillRect(0,0,192,192);
    }
  }

  private paintStage(c:Ctx):void {
    plate(c,-140,-90,280,174,6,'#20292480');
    plate(c,-135,-94,270,166,4,'#464131','#8a805a');
    for(let y=-83;y<66;y+=9){c.strokeStyle='#bb9e6622';c.lineWidth=1;c.beginPath();c.moveTo(-128,y);c.lineTo(128,y);c.stroke();}
    for(const x of [-113,113]){
      plate(c,x-18,-70,36,97,2,'#151e1b','#827657');
      for(const y of [-49,-13,16]){
        c.fillStyle='#101b19';c.strokeStyle='#555b45';c.lineWidth=2;c.beginPath();c.arc(x,y,y===16?7:12,0,TAU);c.fill();c.stroke();
        c.strokeStyle='#81836455';c.lineWidth=.8;c.beginPath();c.arc(x,y,6,0,TAU);c.stroke();
      }
    }
    // Roof truss and battered central screen; the icon reads as a demolition arena.
    plate(c,-88,-82,176,70,1,'#18231f','#9c8a61');
    c.strokeStyle='#4b5944';c.lineWidth=2;c.strokeRect(-82,-76,164,58);
    c.strokeStyle='#bd7f46';c.lineWidth=5;c.beginPath();c.moveTo(-22,-66);c.lineTo(22,-26);c.moveTo(22,-66);c.lineTo(-22,-26);c.stroke();
    tyre(c,0,-46,19);c.strokeStyle='#c2a264';c.lineWidth=2;c.beginPath();c.moveTo(-10,-56);c.lineTo(10,-36);c.moveTo(10,-56);c.lineTo(-10,-36);c.stroke();
    for(const y of [-91,36]){
      c.strokeStyle='#9c8f64';c.lineWidth=2;c.beginPath();c.moveTo(-137,y);c.lineTo(137,y);c.moveTo(-137,y+8);c.lineTo(137,y+8);c.stroke();
      c.strokeStyle='#80724d';c.lineWidth=1;c.beginPath();for(let x=-135;x<132;x+=17){c.moveTo(x,y);c.lineTo(x+17,y+8);c.moveTo(x,y+8);c.lineTo(x+17,y);}c.stroke();
    }
    for(const side of [-1,1]){
      plate(c,side*126-8,43,16,25,2,'#594d34','#c0a56b');
      c.fillStyle='#17221e';c.beginPath();c.arc(side*126,52,4,0,TAU);c.fill();
    }
    // Scratched chevrons on the stage lip, worn cables and discarded cases.
    c.fillStyle='#b89a50';c.fillRect(-128,69,256,6);c.strokeStyle='#2f3223';c.lineWidth=5;c.beginPath();for(let x=-126;x<128;x+=18){c.moveTo(x,70);c.lineTo(x+7,74);}c.stroke();
    c.strokeStyle='#19231f';c.lineWidth=2;c.beginPath();c.moveTo(-75,8);c.bezierCurveTo(10,25,-40,60,70,49);c.stroke();
    for(const x of [-48,44])plate(c,x-20,-2,40,17,2,'#2e3528','#7c7d55');
  }
  private wreck(c:Ctx,x:number,y:number,angle:number,color:string):void {
    c.save();c.translate(x,y);c.rotate(angle);
    for(const yy of [-17,12])for(const xx of [-28,16])plate(c,xx,yy,13,7,2,'#101c1a','#6f7152');
    const metal=c.createLinearGradient(0,-14,0,14);metal.addColorStop(0,'#b3a079');metal.addColorStop(.25,color);metal.addColorStop(1,'#3c4433');
    c.fillStyle=metal;c.strokeStyle='#a48d5c';c.lineWidth=.8;c.beginPath();c.moveTo(-39,-11);c.lineTo(-18,-15);c.lineTo(25,-13);c.lineTo(39,-5);c.lineTo(37,10);c.lineTo(8,15);c.lineTo(-34,12);c.closePath();c.fill();c.stroke();
    plate(c,-12,-12,30,24,3,'#263c35','#8d966d');c.strokeStyle='#b2a87b';c.lineWidth=1;c.beginPath();c.moveTo(-10,-10);c.lineTo(14,9);c.moveTo(14,-9);c.lineTo(-10,10);c.stroke();
    c.fillStyle='#8e6944';c.fillRect(24,-8,10,11);c.fillStyle='#b1a577';c.fillRect(-34,-4,8,2);
    c.strokeStyle='#283d2f80';c.beginPath();c.moveTo(22,-11);c.lineTo(17,-3);c.lineTo(29,4);c.stroke();c.restore();
  }
  private paintWrecks(c:Ctx):void {
    // A compact salvage pile with actual vehicle silhouettes, not rectangles as confetti.
    this.container(c,-23,-52,0);
    this.wreck(c,-33,-11,.18,'#8c654b');this.wreck(c,11,20,-.4,'#6c8070');this.wreck(c,-15,-13,-.25,'#ac8c51');
    for(let i=0;i<7;i++)tyre(c,-76+i*13,60+Math.sin(i)*4,7);
    for(const [x,y] of [[-67,-44],[59,-31],[60,-12]]){
      plate(c,x-8,y-8,16,16,2,'#6e6943','#a29a68');c.strokeStyle='#303f2d';c.lineWidth=2;c.beginPath();c.moveTo(x-7,y-4);c.lineTo(x+7,y-4);c.moveTo(x-7,y+4);c.lineTo(x+7,y+4);c.stroke();
    }
  }
  private container(c:Ctx,x:number,y:number,kind:number):void {
    c.save();c.translate(x,y);c.rotate(kind?.06:-.05);
    plate(c,-57,-22,114,44,1,'#31382880');plate(c,-59,-25,114,44,1,kind?'#7b8557':'#a4633e','#aa956c');
    c.strokeStyle='#202e2255';c.lineWidth=2;for(let x=-52;x<52;x+=8){c.beginPath();c.moveTo(x,-21);c.lineTo(x,15);c.stroke();}
    c.fillStyle='#c5b57a22';c.fillRect(-52,-22,103,2);c.fillStyle='#342e2180';c.fillRect(14,-6,22,8);c.restore();
  }
  private paintBench(c:Ctx,x:number,y:number):void {
    plate(c,x-22,y-12,44,27,1,'#1a2821','#a58c5c');
    plate(c,x-18,y-10,36,20,1,'#887651','#c0aa71');
    c.strokeStyle='#c0bc8c';c.lineWidth=2;c.beginPath();c.moveTo(x-12,y-5);c.lineTo(x+13,y+6);c.stroke();
    c.strokeStyle='#233126';c.lineWidth=2;c.beginPath();c.moveTo(x+12,y+10);c.bezierCurveTo(x+42,y+18,x+19,y+31,x+34,y+36);c.stroke();
    plate(c,x+26,y+12,15,23,2,'#85724a','#b3a368');
    c.fillStyle='#bac3a0';c.fillRect(x+30,y+15,7,4);
  }
  private paintVendor(c:Ctx):void {
    // Striped canvas shelter with guy ropes and a battered catering trailer.
    for(const x of [-89,89])for(const y of [-61,61]){c.strokeStyle='#8b8f6290';c.lineWidth=1;c.beginPath();c.moveTo(x*.82,y*.8);c.lineTo(x,y);c.stroke();tyre(c,x,y,3);}
    const roof=c.createLinearGradient(0,-48,0,48);roof.addColorStop(0,'#a28b52');roof.addColorStop(.5,'#d1ac62');roof.addColorStop(1,'#817042');
    plate(c,-77,-51,154,102,5,roof,'#bfb07d');
    c.save();c.beginPath();c.roundRect(-76,-50,152,100,4);c.clip();c.fillStyle='#a44c31';for(let x=-76;x<76;x+=30)c.fillRect(x,-50,14,100);c.restore();
    c.strokeStyle='#e0bd7b78';c.lineWidth=2;c.beginPath();c.moveTo(-71,0);c.lineTo(71,0);c.stroke();
    this.container(c,0,69,1);plate(c,-43,53,86,20,1,'#273b2e','#b0a470');
    for(let x=-35;x<=35;x+=17){c.fillStyle='#c1a76c';c.fillRect(x,59,9,6);}
  }

  draw(c:Ctx,time:number,reduced:boolean):void {
    const t=reduced?0:time,opacity=c.globalAlpha;
    // Warm bulbs and ground-directed floodlights belong to the spectator ring.
    for(const f of this.lamps){
      const p=venuePoint(f,98),a=Math.atan2(f.ty,f.tx),pulse=reduced?.7:.65+.15*Math.sin(t/1700+f.index);
      c.save();c.translate(p.x,p.y);c.rotate(a);
      c.strokeStyle='#242e21';c.lineWidth=1;c.beginPath();c.moveTo(-45,-3);c.quadraticCurveTo(0,10,45,-3);c.stroke();
      for(let i=0;i<7;i++){
        const x=-39+i*13,y=5*(1-(x/43)**2);c.fillStyle=i%3?'#cfad65':'#a9764b';c.globalAlpha=opacity*pulse;c.beginPath();c.arc(x,y,1.8,0,TAU);c.fill();
      }
      c.globalAlpha=opacity;plate(c,-5,-13,10,7,1,'#a4a06a','#d1c38e');
      glow(c,0,14,48,'#d89b4d',.16*pulse,.65);
      c.fillStyle='#dfbb7b12';c.beginPath();c.moveTo(-4,-5);c.lineTo(-40,36);c.lineTo(40,36);c.lineTo(4,-5);c.fill();c.restore();
    }
    if(this.stage){
      const p=this.stage,s=Math.min(1,p.room/175);
      c.save();c.translate(p.x,p.y);c.rotate(p.angle);c.scale(s,s);
      for(let i=0;i<16;i++){
        const h=reduced?5:3+(Math.sin(t/340+i*1.7)*.5+.5)*13;
        c.fillStyle=i%4?'#b49a53':'#e18a42';c.fillRect(-65+i*8,-12-h,4,h);
      }
      for(const side of [-1,1]){
        const a=(reduced?0:Math.sin(t/1600)*.35)*side;
        c.save();c.translate(side*105,-83);c.rotate(a);
        c.fillStyle='#e5c17b16';c.beginPath();c.moveTo(0,0);c.lineTo(-48,120);c.lineTo(48,120);c.closePath();c.fill();
        c.fillStyle='#d0b878';c.fillRect(-4,-3,8,4);c.restore();
        const cycle=(t+(side+1)*1700)%4800;
        if(!reduced&&cycle<1100){
          const f=cycle/1100,ox=side*126,oy=51;
          // Short stage pyrotechnics: no giant flash or red danger ring.
          glow(c,ox,oy,70,'#d89b4d',.25*(1-f));
          c.globalAlpha=opacity*(1-f)*.8;c.strokeStyle='#d7ae69';c.lineWidth=1.5;c.beginPath();
          for(let i=0;i<10;i++){
            const a=i*.61+side,d=f*(40+noise(i*17)*55);
            c.moveTo(ox+Math.cos(a)*d,oy+Math.sin(a)*d);c.lineTo(ox+Math.cos(a)*(d+5),oy+Math.sin(a)*(d+5));
          }c.stroke();c.globalAlpha=opacity;
        }
      }
      c.restore();
    }
    for(const site of this.welds){
      const cycle=(t+site.seed*317)%1900;
      if(!reduced&&cycle<900){
        const f=cycle/900;glow(c,site.x,site.y,24,'#b8d8ce',.35*(1-f));
        c.save();c.globalAlpha=opacity*.85*(1-f);c.lineWidth=1.3;
        for(let i=0;i<12;i++){
          const a=i*2.4+site.seed,d=4+f*(20+noise(i*13)*45),y=f*f*14;
          c.strokeStyle=i%3?'#e2b366':'#d2e4c5';c.beginPath();c.moveTo(site.x+Math.cos(a)*d,site.y+Math.sin(a)*d+y);c.lineTo(site.x+Math.cos(a)*(d+4),site.y+Math.sin(a)*(d+4)+y);c.stroke();
        }c.restore();
      }
      for(let i=0;i<2;i++){
        const age=((t/4700+site.seed*.17+i*.5)%1),size=20+age*85;
        c.save();c.globalAlpha=opacity*Math.sin(age*Math.PI)*.2;c.drawImage(this.smoke!,site.x-size/2+age*40,site.y-size/2-age*16,size*1.3,size);c.restore();
      }
    }
  }
}
