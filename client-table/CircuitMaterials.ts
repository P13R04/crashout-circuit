import { noise } from './neon.js';
import type { CircuitTheme } from './themes.js';
const textures=new Map<string,HTMLCanvasElement>();
/** Small authored material tiles, baked once. Surface noise never moves or shimmers. */
export function circuitMaterial(kind:CircuitTheme|'grass'|'desk'|'festival'):HTMLCanvasElement {
  const cached=textures.get(kind);if(cached)return cached;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const c=canvas.getContext('2d')!;
  const road=kind==='classic'||kind==='mayhem'||kind==='toy';
  for(let i=0;i<(road?7000:4500);i++){
    const x=noise(i*7)*256,y=noise(i*13)*256,n=noise(i*31);
    if(kind==='toy')c.fillStyle=i%3?'#d6f2f009':'#03152b10';
    else if(kind==='classic')c.fillStyle=i%3?'#050d122e':'#d3d5c822';
    else if(kind==='grass')c.fillStyle=i%3?'#132b1f26':'#bbc68d1c';
    else if(kind==='desk')c.fillStyle=i%3?'#001b2c12':'#abd5c30c';
    else c.fillStyle=i%3?'#171c1532':'#d2b78a1f';
    c.fillRect(x,y,.4+n*(kind==='mayhem'?2.3:1.1),.5+noise(i*17)*1.3);
  }
  if(kind==='mayhem'||kind==='festival')for(let i=0;i<160;i++){
    const x=noise(i*47)*256,y=noise(i*79)*256;
    c.fillStyle=i%3?'#211f1950':'#c0a87825';c.beginPath();c.ellipse(x,y,1+noise(i)*3,.7+noise(i+1)*2,i,0,Math.PI*2);c.fill();
  }
  if(kind==='toy')for(let y=0;y<256;y+=3){c.fillStyle='#c4dfe905';c.fillRect(0,y,256,.5);}
  if(kind==='desk')for(let x=0;x<256;x+=4){c.fillStyle='#a6cbb008';c.fillRect(x,0,.7,256);}
  textures.set(kind,canvas);return canvas;
}
export function materialWash(c:CanvasRenderingContext2D,kind:Parameters<typeof circuitMaterial>[0],alpha=1):void {
  const pattern=c.createPattern(circuitMaterial(kind),'repeat');if(!pattern)return;
  c.save();c.globalAlpha*=alpha;c.fillStyle=pattern;c.fillRect(0,0,1920,1080);c.restore();
}
