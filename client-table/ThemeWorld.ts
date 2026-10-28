import type { TrackGeometry } from '../server/types.js';
import type { CircuitTheme } from './themes.js';
import { noise, glow } from './neon.js';
import { layoutScenery, sceneryKey } from './SceneryLayout.js';
import { materialWash } from './CircuitMaterials.js';
import { F1Venue } from './F1Venue.js';
import { ToyWorkshop } from './ToyWorkshop.js';
import { MayhemFestival } from './MayhemFestival.js';
type Ctx=CanvasRenderingContext2D;

/** Detailed, track-aware venues. Original-map scenery stays cached during temporary deformations. */
export class ThemeWorld {
  private floor:HTMLCanvasElement|null=null;
  private scene:HTMLCanvasElement|null=null;
  private fog:HTMLCanvasElement|null=null;
  private key:number|null=null;
  private venue:F1Venue|ToyWorkshop|MayhemFestival;
  builds=0;
  constructor(private theme:CircuitTheme){
    this.venue=theme==='classic'?new F1Venue():theme==='toy'?new ToyWorkshop():new MayhemFestival();
  }
  draw(ctx:Ctx,time:number,reduced:boolean,mapping:boolean,track:TrackGeometry|null=null):void {
    if(!this.floor)this.prepareFloor();
    const key=sceneryKey(track);
    if(this.key!==key){
      this.scene??=document.createElement('canvas');this.scene.width=1920;this.scene.height=1080;
      this.venue.paint(this.scene.getContext('2d')!,layoutScenery(track));this.key=key;this.builds++;
    }
    const t=reduced?0:time;
    ctx.drawImage(this.floor!,0,0,1920,1080);
    // Ground-plane atmosphere: moving shadows for F1, warm low dust for Mayhem.
    if(this.theme==='classic'){
      ctx.save();ctx.globalAlpha=.2;
      for(let i=0;i<3;i++){
        const x=(t*.004+i*760)%2700-390,y=270+noise(i*43)*520;
        ctx.drawImage(this.fog!,x-260,y-120,540,270);
      }ctx.restore();
    }else if(this.theme==='mayhem'){
      glow(ctx,750,290,430,'#a77b40',.12,.7);glow(ctx,1350,800,380,'#ad6638',.13,.7);
      ctx.save();
      for(let i=0;i<7;i++){
        const age=(t/17000+i*.147)%1,x=230+noise(i*31)*1350+age*120,y=230+noise(i*17)*600+Math.sin(age*4+i)*25;
        ctx.globalAlpha=.15*Math.sin(age*Math.PI);ctx.drawImage(this.fog!,x-160,y-90,320,180);
      }ctx.restore();
    }
    ctx.save();ctx.globalAlpha=mapping?.36:1;
    ctx.drawImage(this.scene!,0,0,1920,1080);this.venue.draw(ctx,t,reduced);ctx.restore();
    if(mapping){ctx.fillStyle='#0a17284d';ctx.fillRect(0,0,1920,1080);}
  }
  private prepareFloor():void {
    this.floor=document.createElement('canvas');this.floor.width=1440;this.floor.height=810;
    const c=this.floor.getContext('2d')!;c.scale(.75,.75);
    const toy=this.theme==='toy',classic=this.theme==='classic';
    const base=c.createLinearGradient(0,0,1700,1080);
    base.addColorStop(0,toy?'#356a70':classic?'#435d43':'#564b32');
    base.addColorStop(.5,toy?'#28525f':classic?'#344c38':'#3a3b29');
    base.addColorStop(1,toy?'#193d50':classic?'#2a4232':'#262e25');
    c.fillStyle=base;c.fillRect(0,0,1920,1080);
    if(classic){
      c.save();c.rotate(-.24);c.fillStyle='#c6c68a0a';
      for(let x=-300;x<2300;x+=104)c.fillRect(x,-100,52,1600);c.restore();
      materialWash(c,'grass');
    }else if(toy){
      materialWash(c,'desk');
      // A stitched cutting mat and warm tabletop edge ground the miniature scale.
      c.strokeStyle='#a7c6a119';c.lineWidth=1;c.setLineDash([2,4]);c.strokeRect(157,188,1604,704);c.setLineDash([]);
      c.strokeStyle='#8db3a509';c.lineWidth=.6;c.beginPath();
      for(let x=180;x<1760;x+=44){c.moveTo(x,191);c.lineTo(x,890);}
      for(let y=230;y<890;y+=44){c.moveTo(160,y);c.lineTo(1760,y);}c.stroke();
      for(let x=180;x<1760;x+=22){c.fillStyle='#bcceac36';c.fillRect(x,187,1,x%44===4?9:5);c.fillRect(x,891,1,5);}
      const vignette=c.createRadialGradient(960,540,220,960,540,1100);vignette.addColorStop(0,'#071f3000');vignette.addColorStop(1,'#081f346b');c.fillStyle=vignette;c.fillRect(0,0,1920,1080);
    }else{
      materialWash(c,'festival');
      // Large overlapping stains and churn marks, not an empty brown flat fill.
      for(let i=0;i<38;i++){
        const x=noise(i*19)*1920,y=noise(i*47)*1080,r=30+noise(i*11)*100;
        const mud=c.createRadialGradient(x,y,0,x,y,r);mud.addColorStop(0,i%3?'#161f2240':'#b0975b18');mud.addColorStop(1,'#26332400');c.fillStyle=mud;c.fillRect(x-r,y-r,r*2,r*2);
      }
      for(let i=0;i<22;i++){
        c.save();c.translate(noise(i*29)*1920,noise(i*67)*1080);c.rotate(i*.7);
        c.strokeStyle=i%2?'#141f1e22':'#ac96551c';c.lineWidth=2;c.setLineDash([2,5]);
        for(const side of [-1,1]){c.beginPath();c.ellipse(0,side*9,60+noise(i)*90,26,0,.2,2.8);c.stroke();}c.restore();
      }
    }
    this.fog=document.createElement('canvas');this.fog.width=this.fog.height=192;
    const f=this.fog.getContext('2d')!,fog=f.createRadialGradient(96,96,2,96,96,94);
    fog.addColorStop(0,classic?'#0a1b16b0':'#c4af7980');fog.addColorStop(.5,classic?'#0b211655':'#b9a27322');fog.addColorStop(1,'#061b1900');f.fillStyle=fog;f.fillRect(0,0,192,192);
  }
}
