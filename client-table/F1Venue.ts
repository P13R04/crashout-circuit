import type { SceneryLayout, VenueFrame, SceneryAnchor } from './SceneryLayout.js';
import { venuePoint } from './SceneryLayout.js';
import { plate, noise } from './neon.js';
type Ctx=CanvasRenderingContext2D;
const TAU=Math.PI*2;
function ribbon(c:Ctx,a:VenueFrame,b:VenueFrame,near:number,far:number,color:string):void {
  const p=venuePoint(a,near),q=venuePoint(b,near),r=venuePoint(b,far),s=venuePoint(a,far);
  c.fillStyle=color;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.lineTo(r.x,r.y);c.lineTo(s.x,s.y);c.closePath();c.fill();
}

/** A maintained heritage venue: terraces follow the drawing, paddock functions stay legible. */
export class F1Venue {
  private flags:VenueFrame[]=[];
  private crowds:VenueFrame[]=[];
  private pit:SceneryAnchor|null=null;
  paint(c:Ctx,layout:SceneryLayout):void {
    this.flags=[];this.crowds=[];this.pit=layout.anchors[0]??null;
    for(const run of layout.stands){
      // Gravel runoff, perimeter road, fence and stepped concrete terraces.
      for(let i=1;i<run.length;i++){
        const a=run[i-1],b=run[i];
        ribbon(c,a,b,14,38,'#9b9d7b70');ribbon(c,a,b,38,43,'#253b37');
        ribbon(c,a,b,47,112,'#102d2c80');ribbon(c,a,b,44,106,'#798780');
        for(let row=0;row<7;row++){
          ribbon(c,a,b,47+row*8,48.5+row*8,'#233e3b');
          ribbon(c,a,b,49+row*8,49.7+row*8,'#c3c7ac70');
        }
      }
      for(const f of run){
        for(let row=0;row<7;row++){
          const p=venuePoint(f,51+row*8),col=Math.floor(f.distance/150)%3;
          c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(f.ty,f.tx));
          if(f.index%9===0){c.fillStyle='#b5b69d';c.fillRect(-6,-3,12,6);} // access stair
          else for(const side of [-1,1]){
            plate(c,side*3.5-2.5,-3,5,5,1,['#a88f78','#6d9292','#a16e64'][col]);
            if(noise(f.index*17+row*37+side)>.17){
              c.fillStyle=['#c9c4a0','#526d77','#a89d8c','#3e5553'][(f.index+row)%4];
              c.beginPath();c.ellipse(side*3.5,0,2.1,1.9,0,0,TAU);c.fill();
              c.fillStyle='#d9c6a17d';c.beginPath();c.arc(side*3.5,-1.3,1.1,0,TAU);c.fill();
            }
          }
          c.restore();
        }
        const front=venuePoint(f,39),back=venuePoint(f,110);
        c.strokeStyle='#334e48';c.lineWidth=1;c.beginPath();c.moveTo(front.x,front.y);c.lineTo(front.x+f.nx*5,front.y+f.ny*5);c.stroke();
        if(f.index%3===0){c.fillStyle='#afba9c';c.fillRect(back.x-1,back.y-1,2,2);}
        if(f.index%17===0)this.flags.push(f);
        if(f.index%11===0)this.crowds.push(f);
      }
      // Short cantilevered roofs over the rear seats; gaps reveal the people below.
      for(let i=1;i<run.length;i++)if(Math.floor(run[i].distance/190)%3===1){
        const a=run[i-1],b=run[i];
        ribbon(c,a,b,80,111,'#0e292b70');ribbon(c,a,b,85,114,'#a5b4a3');
        ribbon(c,a,b,86,88,'#e3dfc875');ribbon(c,a,b,112,114,'#304f4d');
        if(i%2===0){const p=venuePoint(b,86),q=venuePoint(b,113);c.strokeStyle='#516f6588';c.lineWidth=.7;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();}
      }
      c.strokeStyle='#c0c4a97a';c.lineWidth=.8;
      for(const offset of [36,39]){
        c.beginPath();run.forEach((f,i)=>{const p=venuePoint(f,offset);if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);});c.stroke();
      }
    }
    if(this.pit)this.paintPit(c,this.pit);
    // One marshal pavilion near each end of the main grandstand, not random fans.
    for(const f of this.flags.filter((_,i)=>i%3===0)){
      const p=venuePoint(f,29);c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(f.ty,f.tx));
      plate(c,-11,-8,22,16,1,'#233b3c','#b6bca1');plate(c,-10,-7,20,6,1,'#b9bba0');
      c.fillStyle='#c38b4b';c.fillRect(-4,1,7,4);c.restore();
    }
  }

  private paintPit(c:Ctx,p:SceneryAnchor):void {
    const scale=Math.min(1,p.room/145);
    c.save();c.translate(p.x,p.y);c.rotate(p.angle);c.scale(scale,scale);
    plate(c,-135,-83,270,166,9,'#334b43','#789080');
    c.fillStyle='#b7b99920';for(let x=-125;x<135;x+=28)c.fillRect(x,27,16,1);
    // Paddock building: roof lips, ribbed skylights, two open service bays.
    plate(c,-116,-64,232,87,2,'#132d31','#85968b');
    plate(c,-116,-66,232,40,2,'#adb6a5','#d9d8bd');
    for(let x=-104;x<109;x+=14){c.strokeStyle='#5e7e7559';c.lineWidth=1;c.beginPath();c.moveTo(x,-63);c.lineTo(x,-29);c.stroke();}
    for(const x of [-85,-29,27,83]){
      plate(c,x-19,-56,38,17,1,'#486963','#d1d6ba70');
      c.fillStyle='#aac9bf55';c.fillRect(x-17,-54,34,2);
    }
    c.fillStyle='#c7c6aa';c.fillRect(-118,-27,236,5);
    for(let i=0;i<22;i++){c.fillStyle=i%2?'#234941':'#b2b7a1';c.fillRect(-113+i*10.5,-25,5,3);}
    for(const x of [-62,62]){
      plate(c,x-41,-15,82,32,1,'#102a2e','#748f7f');
      c.strokeStyle='#b7b58380';c.lineWidth=1;c.strokeRect(x-34,22,68,45);
      for(const side of [-1,1])for(const y of [26,48])plate(c,x+side*14-4,y,8,5,1,'#0a2026','#526b60');
      c.fillStyle=x<0?'#a3beb3':'#ae7964';
      c.beginPath();c.moveTo(x,64);c.lineTo(x-5,43);c.lineTo(x-8,33);c.lineTo(x-7,25);c.lineTo(x+7,25);c.lineTo(x+8,33);c.lineTo(x+5,43);c.closePath();c.fill();
      c.fillStyle='#0c2830';c.fillRect(x-3,36,6,9);
      plate(c,x-18,21,36,3,.5,'#ccd1b9');plate(c,x-16,53,32,3,.5,'#8fa796');
      // Trolley, loose tyres and a fuel rig make the apron recognisable.
      for(let i=0;i<3;i++){c.strokeStyle='#061e22';c.lineWidth=3;c.beginPath();c.arc(x+46,25+i*10,4,0,TAU);c.stroke();}
      plate(c,x-48,36,8,18,1,'#b5aa7a','#d7d5b5');c.strokeStyle='#2c3931';c.lineWidth=2;c.beginPath();c.moveTo(x-44,38);c.lineTo(x-35,24);c.stroke();
    }
    c.restore();
  }

  draw(c:Ctx,time:number,reduced:boolean):void {
    const t=reduced?0:time;
    for(const f of this.flags){
      const p=venuePoint(f,116),a=Math.atan2(f.ty,f.tx),wave=Math.sin(t/430+f.index)*3;
      c.save();c.translate(p.x,p.y);c.rotate(a);c.strokeStyle='#d1cfad';c.lineWidth=1;c.beginPath();c.moveTo(0,0);c.lineTo(15,0);c.stroke();
      c.fillStyle=f.index%2?'#b8c2a3':'#bb6353';c.beginPath();c.moveTo(1,0);c.bezierCurveTo(7,wave,12,-wave,18,wave);c.lineTo(18,12+wave);c.bezierCurveTo(12,10-wave,7,12+wave,1,11);c.closePath();c.fill();
      if(f.index%2){c.fillStyle='#25443b';for(let x=0;x<3;x++)for(let y=0;y<2;y++)if((x+y)%2)c.fillRect(2+x*5,2+y*5+wave*x/3,4,4);}
      c.restore();
    }
    // A handful of moving arms and camera flashes imply a crowd without simulating it.
    for(const f of this.crowds){
      const p=venuePoint(f,66),w=reduced?0:Math.sin(t/650+f.index)*1.5;
      c.strokeStyle='#d6c4a4a0';c.lineWidth=1.2;c.beginPath();c.moveTo(p.x-2,p.y);c.lineTo(p.x-4,p.y-3-w);c.moveTo(p.x+2,p.y);c.lineTo(p.x+4,p.y-3+w);c.stroke();
      const age=(t+f.index*237)%6800;
      if(!reduced&&age<85){c.fillStyle='#f1f2c7';c.fillRect(p.x-1,p.y-1,2,2);}
    }
  }
}
