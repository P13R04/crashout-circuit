/**
 * Dessine la révélation progressive de la piste et la ligne de départ qui tourne puis ralentit sur le
 * circuit.
 * Liens : server/types.ts, client-table/view.ts, server/trackPresentation.ts, client-table/neon.ts.
 * Référencé par client-table/Renderer.ts, scripts/track-creation.ts.
 */
import type { TrackGeometry, TrackPresentation, Vec2 } from '../server/types.js';
import type { LocalStroke } from './view.js';
import { TEAM_COLOR } from './view.js';
import { presentationFrame, rouletteTravel, smooth } from '../server/trackPresentation.js';
import { glow } from './neon.js';

/** Désigne le contexte Canvas 2D partagé par les fonctions de dessin du module. */
type Ctx=CanvasRenderingContext2D;
/** Décrit la position et les axes d’une coupe de chaussée utilisée par la roulette. */
export interface RoadPose extends Vec2 { nx:number;ny:number;half:number; }
/** Dessine la révélation progressive de la piste et la ligne de départ qui tourne puis ralentit sur le circuit. */
export class PresentationRoute {
  readonly cumulative=[0];
  readonly length:number;
  private normals:Vec2[]=[];
  private vertices:RoadPose[]=[];
  /** Prépare les longueurs et les normales du circuit pour ses animations de présentation. */
  constructor(readonly track:TrackGeometry){
    const c=track.centerline,n=c.length;
    for(let i=0;i<n;i++){
      const p=c[(i+n-1)%n],q=c[(i+1)%n],l=Math.hypot(q.x-p.x,q.y-p.y)||1;
      this.normals.push({x:-(q.y-p.y)/l,y:(q.x-p.x)/l});
      this.cumulative.push(this.cumulative[i]+Math.hypot(q.x-c[i].x,q.y-c[i].y));
    }
    this.length=this.cumulative[n];
    this.vertices=c.map(/* Associe chaque point central à sa normale et à la demi-largeur de chaussée. */ (p,i)=>({...p,nx:this.normals[i].x,ny:this.normals[i].y,half:track.widths[i]/2}));
  }
  /** Retrouve la position et les axes de chaussée à la distance demandée sur la boucle. */
  at(distance:number):RoadPose {
    const c=this.track.centerline,n=c.length,d=((distance%this.length)+this.length)%this.length;
    let lo=0,hi=n-1;
    while(lo<hi){const mid=(lo+hi+1)>>1;if(this.cumulative[mid]<=d)lo=mid;else hi=mid-1;}
    const i=lo,j=(i+1)%n,u=(d-this.cumulative[i])/(this.cumulative[i+1]-this.cumulative[i]||1);
    const nx=this.normals[i].x*(1-u)+this.normals[j].x*u,ny=this.normals[i].y*(1-u)+this.normals[j].y*u,norm=Math.hypot(nx,ny)||1;
    return{x:c[i].x+(c[j].x-c[i].x)*u,y:c[i].y+(c[j].y-c[i].y)*u,nx:nx/norm,ny:ny/norm,half:(this.track.widths[i]*(1-u)+this.track.widths[j]*u)/2};
  }
  /** Place la ligne mobile entre son point de départ visuel et le départ finalement tiré. */
  roulette(originIndex:number,progress:number):RoadPose {
    const origin=this.cumulative[originIndex],target=this.cumulative[this.track.featureIndices.start];
    const travel=this.length*2+((target-origin+this.length)%this.length);
    return this.at(origin+travel*rouletteTravel(progress));
  }
  /** Construit le masque qui ne découvre que la portion déjà révélée du circuit. */
  clipReveal(ctx:Ctx,originIndex:number,progress:number):void {
    let remaining=this.length*progress;
    ctx.beginPath();
    for(let k=0;k<this.track.centerline.length&&remaining>0;k++){
      const i=(originIndex+k)%this.track.centerline.length,start=this.cumulative[i],len=this.cumulative[i+1]-start;
      if(len<=0)continue;
      const a=this.vertices[i],b=remaining>=len?this.vertices[(i+1)%this.vertices.length]:this.at(start+remaining);
      const ah=a.half+32,bh=b.half+32;
      ctx.moveTo(a.x+a.nx*ah,a.y+a.ny*ah);ctx.lineTo(b.x+b.nx*bh,b.y+b.ny*bh);
      ctx.lineTo(b.x-b.nx*bh,b.y-b.ny*bh);ctx.lineTo(a.x-a.nx*ah,a.y-a.ny*ah);ctx.closePath();
      remaining-=len;
    }
    ctx.clip();
  }
}

/** Dessine la révélation progressive de la piste et la ligne de départ qui tourne puis ralentit sur le circuit. */
export class TrackCreation {
  private route:PresentationRoute|null=null;
  private version=-1;
  /** Recalcule le repérage par distance seulement lorsque la géométrie de la piste change. */
  private prepare(track:TrackGeometry,version:number):PresentationRoute {
    if(!this.route||this.version!==version){this.route=new PresentationRoute(track);this.version=version;}
    return this.route;
  }
  /** Compose la révélation et la roulette à partir de l’horloge partagée et du revêtement en cache. */
  draw(ctx:Ctx,track:TrackGeometry,version:number,presentation:TrackPresentation,now:number,reduced:boolean,color:string,strokes:Iterable<LocalStroke>,drawDeck:()=>void):void {
    const route=this.prepare(track,version),f=presentationFrame(presentation,now);
    const origin=presentation.originIndex,reveal=reduced?smooth((now-presentation.startedAt)/220):f.reveal;
    if(f.stage==='reveal'){
      // Retain the players' lines while the finished material replaces them.
      ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=4;ctx.globalAlpha=(1-f.reveal)*.7;
      for(const stroke of strokes){
        if(!stroke.done||stroke.pts.length<2)continue;
        ctx.strokeStyle=TEAM_COLOR[stroke.team];ctx.beginPath();/* Redessine le tracé du joueur pendant son remplacement progressif par la vraie piste. */ stroke.pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
      }
      ctx.restore();
      if(reveal>0){
        ctx.save();
        if(reduced)ctx.globalAlpha=reveal;
        else if(reveal<1)route.clipReveal(ctx,origin,reveal);
        drawDeck();ctx.restore();
        if(!reduced&&reveal<1)this.scan(ctx,route.at(route.cumulative[origin]+route.length*reveal),color);
      }
      return;
    }
    drawDeck();
    if(f.stage==='roulette'){
      if(!reduced){
        for(const lag of [.035,.018]){
          const p=route.roulette(origin,Math.max(0,f.spin-lag));
          ctx.save();ctx.globalAlpha=lag>.02?.1:.2;this.crossbar(ctx,p,color,3);ctx.restore();
        }
      }
      this.finish(ctx,route.roulette(origin,reduced?1:f.spin),color,0);
      if(reduced)this.progress(ctx,f.spin,color);
    }else this.finish(ctx,route.roulette(origin,1),color,reduced?0:Math.sin(f.lock*Math.PI));
  }
  /** Dessine une coupe transversale de la chaussée à la pose indiquée. */
  private crossbar(ctx:Ctx,p:RoadPose,color:string,width:number):void {
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='butt';ctx.beginPath();ctx.moveTo(p.x-p.nx*p.half,p.y-p.ny*p.half);ctx.lineTo(p.x+p.nx*p.half,p.y+p.ny*p.half);ctx.stroke();
  }
  /** Ajoute la lumière du front qui révèle progressivement le circuit. */
  private scan(ctx:Ctx,p:RoadPose,color:string):void {
    ctx.save();ctx.shadowColor=color;ctx.shadowBlur=14;this.crossbar(ctx,p,color,5);this.crossbar(ctx,p,'#f3fffa',1.5);ctx.shadowBlur=0;
    for(const side of [-1,1])glow(ctx,p.x+p.nx*p.half*side,p.y+p.ny*p.half*side,24,color,.5);
    ctx.restore();
  }
  /** Dessine le damier mobile puis sa fixation lumineuse au terme de la roulette. */
  private finish(ctx:Ctx,p:RoadPose,color:string,lock:number):void {
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.ny,p.nx));
    ctx.shadowColor=color;ctx.shadowBlur=10+lock*9;ctx.fillStyle='#071018';ctx.fillRect(-p.half,-12,p.half*2,24);ctx.shadowBlur=0;
    const cells=Math.max(2,Math.ceil(p.half*2/10)),size=p.half*2/cells;
    for(let x=0;x<cells;x++)for(let row=0;row<2;row++){ctx.fillStyle=(x+row)%2?'#18242a':'#e6f4ed';ctx.fillRect(-p.half+x*size,-9+row*9,size,9);}
    ctx.strokeStyle=color;ctx.lineWidth=2;
    for(const side of [-1,1]){
      const x=side*(p.half+5);ctx.beginPath();ctx.moveTo(x,-16);ctx.lineTo(x,16);ctx.stroke();
      if(lock>0){ctx.globalAlpha=lock*.65;ctx.beginPath();ctx.arc(x,0,12+lock*17,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    }
    ctx.restore();
  }
  /** Dessine l’indication discrète de progression de la présentation. */
  private progress(ctx:Ctx,p:number,color:string):void {
    ctx.save();ctx.strokeStyle='#253c48';ctx.lineWidth=4;ctx.beginPath();ctx.arc(960,540,18,0,Math.PI*2);ctx.stroke();ctx.strokeStyle=color;ctx.beginPath();ctx.arc(960,540,18,-Math.PI/2,-Math.PI/2+Math.PI*2*p);ctx.stroke();ctx.restore();
  }
}
