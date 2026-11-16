/**
 * Déformation de la piste : prise du bord à deux doigts et flux des tractions.
 * Liens : server/geometry.ts, server/layout.ts.
 * Fonctions appelées par les méthodes de GestureRecognizer (server/GestureRecognizer.ts), qui garde l'état et délègue ici.
 */
import type { Vec2 } from '../../../server/types.js';
import { nearestStationTeam } from '../../../server/layout.js';
import { trackTangent } from '../../../server/geometry.js';
import { PULL_MIN_PX, PULL_MAX_PX, PULL_PAIR_MAX_PX, PULL_EDGE_INDEX_GAP } from '../gestureConstants.js';
import type { Contact } from '../gestureTypes.js';
import type { GestureRecognizer } from '../GestureRecognizer.js';

// Déformation du circuit : prise du bord à deux doigts et déplacement envoyé au serveur.
/** Associe deux contacts au même bord visible de piste avant de démarrer la traction. */
export function tryBorderPull(recognizer: GestureRecognizer, c: Contact): void {
  const state = recognizer.state;
  if (!state || state.phase !== 'RACE' || recognizer.pendingPlacement || (recognizer.slingContacts&&!recognizer.view.sling?.idle)) return;
  const candidates=[...recognizer.contacts.values()].filter(/* Retient les doigts libres ayant saisi un bord de piste sans avoir consommé un autre geste. */ c=>c.zone==='free'&&!c.consumed&&c.outward&&c.edgeIndex!==undefined);
  const n=state.track?.centerline.length??0;if(!n)return;
  let best:{a:Contact;b:Contact;index:number;outward:Vec2;score:number}|null=null;
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
    const a=candidates[i],b=candidates[j];
    if(a.edgeBank!==b.edgeBank||Math.hypot(a.sx-b.sx,a.sy-b.sy)>PULL_PAIR_MAX_PX)continue;
    const gap=((b.edgeIndex!-a.edgeIndex!+n*1.5)%n)-n/2;if(Math.abs(gap)>PULL_EDGE_INDEX_GAP)continue;
    const index=(Math.round(a.edgeIndex!+gap/2)+n)%n,tangent=trackTangent(state.track!,index),side=a.edgeSide??1;
    const outward={x:-tangent.y*side,y:tangent.x*side};
    const progressA=(a.x-a.sx)*a.outward!.x+(a.y-a.sy)*a.outward!.y,progressB=(b.x-b.sx)*b.outward!.x+(b.y-b.sy)*b.outward!.y;
    const score=(progressA+progressB)/2;
    const reserved=!!recognizer.expectedBonus;
    if(score<(reserved?24:14)||Math.min(progressA,progressB)<(reserved?4:-12))continue;
    if(!best||score>best.score)best={a,b,index,outward,score};
  }
  if(!best)return;const {a,b,index,outward}=best;
  const start=(a.edgeBank==='inner'?state.track!.innerEdge:state.track!.outerEdge)[index];
  recognizer.cancelSling();
  recognizer.borderPull={ids:[a.id,b.id],gestureId:`${Date.now()}-${++recognizer.pullSequence}`,start:{...start},outward,team:nearestStationTeam(start),lastSent:-Infinity,index};
  a.consumed=true;b.consumed=true;streamBorderPull(recognizer, false);
}

/** Actualise la déformation maintenue et signale la fin du geste au serveur. */
export function streamBorderPull(recognizer: GestureRecognizer, end:boolean): void {
  const pull=recognizer.borderPull,s=recognizer.state;if(!pull||!s||s.phase!=='RACE'||recognizer.pendingPlacement)return;
  const pair=pull.ids.map(/* Retrouve les deux contacts qui maintiennent la déformation en cours. */ id=>recognizer.contacts.get(id));if(pair.some(/* Interrompt la déformation si l’un de ses doigts n’existe plus. */ c=>!c))return;
  const now=performance.now();if(!end&&now-pull.lastSent<32)return;
  const dx=pair.reduce(/* Additionne les déplacements horizontaux des deux doigts pour leur traction moyenne. */ (sum,c)=>sum+c!.x-c!.sx,0)/2,dy=pair.reduce(/* Additionne les déplacements verticaux des deux doigts pour leur traction moyenne. */ (sum,c)=>sum+c!.y-c!.sy,0)/2;
  const amount=Math.max(PULL_MIN_PX,Math.min(s.params.trackDeformMaxShiftPx??PULL_MAX_PX,dx*pull.outward.x+dy*pull.outward.y));
  recognizer.send({type:'BorderPull',x:pull.start.x,y:pull.start.y,dx:pull.outward.x*amount,dy:pull.outward.y*amount,team:pull.team,gestureId:pull.gestureId,index:pull.index,end});
  pull.lastSent=now;
}
