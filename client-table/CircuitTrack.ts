import type { TrackGeometry } from '../server/types.js';
import { visibleTrackEdges } from '../client-shared/trackVisibility.js';
import { noise } from './neon.js';
import { racingGrid } from './RaceGrid.js';
import { materialWash } from './CircuitMaterials.js';
import type { CircuitTheme } from './themes.js';

type Ctx = CanvasRenderingContext2D;
/** Three materials, exact shared road geometry. Deck/texture/curbs rebuild only on deformation. */
export class CircuitTrack {
  private layer: HTMLCanvasElement | null = null;
  private surface: HTMLCanvasElement | null = null;
  private version = -1;
  private edges: Path2D[] = [];
  builds = 0;
  constructor(private theme: CircuitTheme) {}

  draw(ctx: Ctx, track: TrackGeometry, version: number, time: number, reduced: boolean): void {
    if (!this.layer || this.layer.width !== ctx.canvas.width || this.layer.height !== ctx.canvas.height || version !== this.version) {
      this.layer ??= document.createElement('canvas');
      this.layer.width = ctx.canvas.width; this.layer.height = ctx.canvas.height;
      this.surface ??= document.createElement('canvas');this.surface.width=ctx.canvas.width;this.surface.height=ctx.canvas.height;
      const c = this.layer.getContext('2d')!; c.scale(this.layer.width / 1920, this.layer.height / 1080);
      const visible = visibleTrackEdges(track);
      this.edges = [track.outerEdge, track.innerEdge].map((edge, bank) => {
        const path = new Path2D();
        edge.forEach((p, i) => {
          const j = (i + 1) % edge.length;
          if (!visible[bank][i] || !visible[bank][j]) return;
          if (!i || !visible[bank][i - 1]) path.moveTo(p.x, p.y);
          path.lineTo(edge[j].x, edge[j].y);
        });
        return path;
      });
      this.paint(c, track, visible); this.version = version; this.builds++;
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.layer, 0, 0); ctx.restore();
    // Plastic edge reflectors only: F1 paint and mud never become moving neon rails.
    if (this.theme === 'toy') {
      ctx.save(); ctx.strokeStyle = '#fff6bd'; ctx.lineWidth = 2; ctx.globalAlpha = .55;
      ctx.setLineDash([6, 280]); ctx.lineDashOffset = reduced ? 0 : -time * .028;
      this.edges.forEach(p => ctx.stroke(p)); ctx.restore();
    }
  }

  private band(ctx: Ctx, track: TrackGeometry, color: string | CanvasGradient, extra = 0): void {
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    track.centerline.forEach((p, i, c) => {
      const j = (i + 1) % c.length;
      ctx.lineWidth = Math.max(1, (track.widths[i] + track.widths[j]) / 2 + extra);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(c[j].x, c[j].y); ctx.stroke();
    });
  }

  private paint(ctx: Ctx, track: TrackGeometry, visibility:boolean[][]): void {
    const toy=this.theme==='toy',mud=this.theme==='mayhem';
    ctx.save();ctx.translate(2,toy?12:5);this.band(ctx,track,'#06101266',toy?22:26);ctx.restore();
    if(toy){
      ctx.save();ctx.translate(1,7);this.band(ctx,track,'#78472e',11);ctx.restore();
      this.band(ctx,track,'#c78240',10);this.band(ctx,track,'#142d3d',3);
    }else this.band(ctx,track,mud?'#332f22':'#979e87',mud?18:20);
    const surface=this.surface!.getContext('2d')!;surface.scale(this.surface!.width/1920,this.surface!.height/1080);
    const road=surface.createLinearGradient(260,180,1600,990);
    const colors=toy?['#486a7d','#2b495d','#3c5c71']:mud?['#827149','#635a3c','#7c6a43']:['#4a5050','#3d4548','#464d4d'];
    colors.forEach((color,i)=>road.addColorStop(i/2,color));this.band(surface,track,road);
    // The exact road union masks every material detail, including open crossings.
    surface.globalCompositeOperation='source-atop';materialWash(surface,this.theme);
    const c=track.centerline;
    const tangent=(i:number)=>{const a=c[(i-1+c.length)%c.length],b=c[(i+1)%c.length],d=Math.hypot(b.x-a.x,b.y-a.y)||1;return{x:(b.x-a.x)/d,y:(b.y-a.y)/d};};
    // Long, connected wear lines follow curvature instead of random disconnected scratches.
    for(const side of [-1,1]){
      surface.beginPath();
      c.forEach((p,i)=>{
        const t=tangent(i),off=side*track.widths[i]*(toy?.23:mud?.18:.2),x=p.x-t.y*off,y=p.y+t.x*off;
        if(i)surface.lineTo(x,y);else surface.moveTo(x,y);
      });surface.closePath();
      surface.strokeStyle=toy?'#0a233969':mud?'#302e2170':'#171e2228';surface.lineWidth=toy?3:mud?6:4;surface.stroke();
      surface.strokeStyle=toy?'#b1cbd146':mud?'#a295653d':'#171e221c';surface.lineWidth=toy?.8:mud?1.3:8;surface.stroke();
    }
    let travelled=0,next=0,seed=0;
    for(let i=0;i<c.length;i++){
      const p=c[i],q=c[(i+1)%c.length],dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy);if(len<.01)continue;
      while(next<travelled+len){
        const f=(next-travelled)/len,x=p.x+dx*f,y=p.y+dy*f,half=track.widths[i]/2,angle=Math.atan2(dy,dx);
        surface.save();surface.translate(x,y);surface.rotate(angle);
        if(toy){
          // Injection mould seams, seam highlights and clip sockets in real plastic.
          surface.fillStyle='#0c273c70';surface.fillRect(-1,-half,1.7,half*2);
          surface.fillStyle='#c7dcdb36';surface.fillRect(1,-half,1,half*2);
          for(const side of [-1,1]){
            surface.fillStyle='#183b4e';surface.fillRect(7,side*half*.82-2,10,4);
            surface.fillStyle='#bbcfbd5c';surface.fillRect(9,side*half*.82-1,5,1);
          }
          surface.strokeStyle='#d2e7e415';surface.lineWidth=.7;surface.beginPath();surface.moveTo(20,-half*.6);surface.bezierCurveTo(33,-half*.55,40,half*.4,66,half*.6);surface.stroke();
        }else if(mud){
          // Wide churned shoulders and diagonal tread blocks, all clipped to real dirt.
          for(const side of [-1,1]){
            surface.fillStyle='#292d2350';surface.beginPath();surface.ellipse(10,side*half*.83,20,6,noise(seed)*.4,0,Math.PI*2);surface.fill();
            surface.strokeStyle='#b19c6442';surface.lineWidth=1.5;
            surface.beginPath();for(let j=0;j<7;j++){const xx=j*5;surface.moveTo(xx,side*half*.22);surface.lineTo(xx+3,side*half*.22+5);}surface.stroke();
          }
          if(seed%4===1){
            surface.fillStyle='#263c3677';surface.beginPath();surface.ellipse(26,(noise(seed*19)-.5)*half,24+noise(seed)*16,7+noise(seed+2)*6,.12,0,Math.PI*2);surface.fill();
            surface.strokeStyle='#c9bf8750';surface.lineWidth=.7;surface.beginPath();surface.ellipse(23,(noise(seed*19)-.5)*half-2,19,3,.1,Math.PI,Math.PI*2);surface.stroke();
          }
          for(let j=0;j<13;j++){
            surface.fillStyle=j%3?'#c5ad702d':'#22291e77';surface.beginPath();surface.ellipse(noise(seed*31+j)*64,(noise(seed*47+j*13)-.5)*half*2,1+noise(j)*2.1,1,noise(j*3),0,Math.PI*2);surface.fill();
          }
        }else{
          // Tarmac repairs and worn braking rubber remain quieter than gameplay effects.
          if(seed%5===2){surface.fillStyle='#202b2e1c';surface.fillRect(4,-half*.7,54,half*.5);surface.strokeStyle='#bcc4b41c';surface.lineWidth=.7;surface.strokeRect(4,-half*.7,54,half*.5);}
          const before=tangent((i-3+c.length)%c.length),after=tangent((i+3)%c.length),bend=Math.abs(before.x*after.y-before.y*after.x);
          if(bend>.2){
            surface.strokeStyle='#0e191e38';surface.lineWidth=2;surface.lineCap='round';
            for(const side of [-1,1]){surface.beginPath();surface.moveTo(-20,side*11);surface.quadraticCurveTo(10,side*11,39,side*11+bend*7);surface.stroke();}
          }
          surface.fillStyle='#d7d7bd16';for(let j=0;j<4;j++)surface.fillRect(noise(seed*23+j)*64,(noise(seed*37+j)-.5)*half*2,.7,.7);
        }
        surface.restore();next+=toy?96:mud?66:90;seed++;
      }travelled+=len;
    }
    if(this.theme==='classic'){
      surface.strokeStyle='#eeeece99';surface.lineWidth=1.5;surface.lineJoin='round';
      for(const points of racingGrid(track)){
        surface.beginPath();points.forEach((p,i)=>i?surface.lineTo(p.x,p.y):surface.moveTo(p.x,p.y));surface.stroke();
      }
    }
    surface.globalCompositeOperation='source-over';
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(this.surface!,0,0);ctx.restore();
    ctx.lineCap='butt';ctx.lineJoin='round';
    for(const edge of this.edges){
      ctx.setLineDash([]);ctx.lineWidth=toy?11:mud?7:14;
      ctx.strokeStyle=toy?'#f0ae48':mud?'#a18b55':'#d9dccb';ctx.stroke(edge);
      if(!mud){
        ctx.strokeStyle=toy?'#d87145':'#b95449';ctx.setLineDash(toy?[80,80]:[18,18]);ctx.stroke(edge);ctx.setLineDash([]);
      }else{
        ctx.strokeStyle='#433d28';ctx.lineWidth=2;ctx.setLineDash([4,9,12,7]);ctx.stroke(edge);ctx.setLineDash([]);
      }
      ctx.lineWidth=toy?1.4:.8;ctx.strokeStyle=toy?'#ffe4a796':mud?'#d8bd742b':'#202d2e65';ctx.stroke(edge);
    }
    // Directional bevel glints, recessed joins and exposed edge clips anchor the toy track.
    for(const [bank,edge] of [track.outerEdge,track.innerEdge].entries()){
      const visible=visibility[bank];
      for(let i=0;i<edge.length;i++){
        const j=(i+1)%edge.length;if(!visible[i]||!visible[j])continue;
        const p=edge[i],q=edge[j],t=tangent(i),light=Math.max(0,((p.x-c[i].x)+(p.y-c[i].y))/(track.widths[i]*.7));
        ctx.strokeStyle=toy?`rgba(255,232,183,${.15+light*.45})`:mud?'#e0c4861a':`rgba(235,239,219,${light*.32})`;ctx.lineWidth=toy?2:1;
        ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
        if(toy&&i%9===0){
          ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(t.y,t.x));
          ctx.fillStyle='#b97139';ctx.fillRect(-4,-7,8,14);ctx.strokeStyle='#f3d08c';ctx.lineWidth=.8;ctx.strokeRect(-3,-6,6,12);ctx.fillStyle='#384d4e';ctx.fillRect(-1,-2,2,4);ctx.restore();
        }
      }
    }
    this.finish(ctx,track);
  }

  private finish(ctx: Ctx, track: TrackGeometry): void {
    const sl = track.startLine;
    let nearest = 0;
    track.centerline.forEach((p, i) => { if (Math.hypot(p.x - sl.pos.x, p.y - sl.pos.y) < Math.hypot(track.centerline[nearest].x - sl.pos.x, track.centerline[nearest].y - sl.pos.y)) nearest = i; });
    const half = track.widths[nearest] / 2, n = Math.max(2, Math.ceil(half * 2 / 10)), size = half * 2 / n;
    ctx.save(); ctx.translate(sl.pos.x, sl.pos.y); ctx.rotate(Math.atan2(sl.normal.y, sl.normal.x));
    ctx.fillStyle = '#171f23'; ctx.fillRect(-half, -12, half * 2, 24);
    for (let x = 0; x < n; x++) for (let row = 0; row < 2; row++) {
      ctx.fillStyle = (x + row) % 2 ? '#252b2c' : this.theme === 'mayhem' ? '#d3b889' : '#fff5dc';
      ctx.fillRect(-half + x * size, -10 + row * 10, size, 10);
    }
    ctx.restore();
  }
}
