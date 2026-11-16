/**
 * Reconnaissance du bonus armé : contacts récents, équipe propriétaire et choix entre lance-pierre et portail de boost.
 * Liens : server/rules/armedPickup.ts, client-table/gesture/gestureTuning.ts.
 * Fonctions appelées par les méthodes de GestureRecognizer (server/GestureRecognizer.ts), qui garde l'état et délègue ici.
 */
import type { Team, Vec2 } from '../../../server/types.js';
import { nearestStationTeam } from '../../../server/layout.js';
import { TANGIBLE_CONTACT_GRACE_MS } from '../../../server/tangibles/tangibleTouch.js';
import { tuning } from '../gestureTuning.js';
import { BOOST_MIN_PX } from '../gestureConstants.js';
import type { Contact } from '../gestureTypes.js';
import type { GestureRecognizer } from '../GestureRecognizer.js';

/** Mémorise un contact récent pour accepter les gestes dont les doigts arrivent légèrement décalés. */
export function rememberBonusContact(recognizer: GestureRecognizer, c:Contact): void {
  if(recognizer.pendingPlacement||recognizer.bonusCommitted)return;
  const now=performance.now();
  recognizer.bonusRecent=recognizer.bonusRecent.filter(/* Conserve les contacts de bonus encore utilisables dans la marge de temps. */ old=>!old.consumed&&(old.releasedAt===undefined||now-old.releasedAt<=TANGIBLE_CONTACT_GRACE_MS));
  // Only an already identified fork can reacquire a lost anchor. Two close taps
  // (or two contacts sharing a reused pointerId) must remain two distinct samples.
  const replacement=recognizer.slingContacts?.find(/* Retrouve un appui fixe brièvement levé près de la nouvelle pose du même doigt. */ old=>old.releasedAt!==undefined&&old.id!==recognizer.slingPuller&&Math.hypot(old.x-c.x,old.y-c.y)<40);
  if(replacement){
    c.sx=replacement.sx;c.sy=replacement.sy;
    const index=recognizer.bonusRecent.indexOf(replacement);
    if(index>=0)recognizer.bonusRecent[index]=c;else recognizer.bonusRecent.push(c);
    if(recognizer.slingContacts?.includes(replacement)){
      recognizer.slingContacts[recognizer.slingContacts.indexOf(replacement)]=c;recognizer.slingIds=recognizer.slingContacts.map(/* Conserve les identifiants des doigts reconnus comme membres du lance-pierre. */ v=>v.id);
      if(recognizer.slingReleaseTimer){clearTimeout(recognizer.slingReleaseTimer);recognizer.slingReleaseTimer=null;}
    }
  }else recognizer.bonusRecent.push(c);
  recognizer.bonusRecent=recognizer.bonusRecent.slice(-6);
}

/** Annule les gestes devenus périmés lorsqu’un bonus, une annonce ou une phase change. */
export function syncState(recognizer: GestureRecognizer): void {
  const expected=recognizer.expectedBonus,key=expected?`${expected.team}-${expected.kind}-${expected.version}`:null;
  if(key!==recognizer.bonusKey){
    // POWER is authoritative, but its network echo must not discard fingers
    // that landed just after the button press. Never adopt a previous cast.
    const adopting=key!==null&&recognizer.bonusKey===null&&!recognizer.bonusCommitted;
    const fresh=adopting?recognizer.bonusRecent.filter(/* Conserve les contacts récents non consommés lors de l’arrivée de la confirmation d’armement. */ c=>!c.consumed&&performance.now()-c.startedAt<=1200):[];
    recognizer.bonusKey=key;recognizer.bonusRecent=fresh;recognizer.bonusCommitted=false;recognizer.cancelSling();
    if(recognizer.settleTimer)clearTimeout(recognizer.settleTimer);recognizer.settleTimer=null;
    for(const c of recognizer.contacts.values())if(c.zone==='free'&&!fresh.includes(c)&&!recognizer.borderPull?.ids.includes(c.id)){c.zone='rejected';c.consumed=true;}
    if(fresh.length){recognizer.updateSling();scheduleEvaluation(recognizer);}
  }
  const token=recognizer.pendingPlacement?.token??null;
  if(token===recognizer.placementToken)return;
  recognizer.placementToken=token;
  recognizer.placementRecent=[];recognizer.placementRejected=false;recognizer.placementSent=false;
  if(recognizer.placementLatchTimer)clearTimeout(recognizer.placementLatchTimer);recognizer.placementLatchTimer=null;
  if(token!==null)recognizer.borderPull=null;
  if(recognizer.placementTimer)clearTimeout(recognizer.placementTimer);
  recognizer.placementTimer=null;recognizer.placementMousePoint=null;recognizer.view.tangibleTouch=null;
  if(token!==null){
    if(recognizer.settleTimer)clearTimeout(recognizer.settleTimer);
    recognizer.settleTimer=null;
    recognizer.cancelSling();recognizer.simSling=null;recognizer.view.sling=null;
    recognizer.simulate(null);
  }
  for(const c of recognizer.contacts.values())if(['free','tangible','simsling'].includes(c.zone)){
    c.consumed=true;c.zone='rejected';
  }
}

/** Repousse l’examen des contacts pour laisser aux autres doigts le temps de se poser. */
export function scheduleEvaluation(recognizer: GestureRecognizer): void {
  if (recognizer.settleTimer) clearTimeout(recognizer.settleTimer);
  recognizer.settleTimer = setTimeout(/* Examine les doigts après leur stabilisation au lieu de décider au premier contact. */ () => { recognizer.settleTimer = null; evaluate(recognizer); }, tuning.settleMs);
}

/** Vérifie que le geste demandé correspond au bonus partagé actuellement armé. */
export function armedTeam(recognizer: GestureRecognizer, kind: 'slingshot' | 'boost', at: Vec2): Team | null {
  const state = recognizer.state;
  if (!state) return null;
  const armed = (['A', 'B'] as Team[]).filter(/* Retrouve l’équipe dont le stock armé correspond au geste attendu. */ t => {
    const car = state.cars[t];
    return car.itemArmed && (state.testMode.allItems || car.heldItem === kind);
  });
  if (armed.length === 0) return null;
  return nearestStationTeam(at);
}

/**
 * Choisit entre la prise du bord, le lance-pierre et la zone d’accélération à partir des contacts disponibles.
 * Les contacts réservés par updateSling restent exclus du boost pendant la formation du lance-pierre.
 */
function evaluate(recognizer: GestureRecognizer): void {
  syncState(recognizer);
  const state = recognizer.state;
  if (!state || state.phase !== 'RACE' || recognizer.slingIds || recognizer.pendingPlacement) return;
  if(recognizer.expectedBonus?.kind!=='boost'||recognizer.bonusCommitted||recognizer.borderPull)return;
  const now=performance.now(),candidates=recognizer.bonusRecent.filter(/* Conserve les prises libres et les doigts récemment levés qui peuvent encore former une paire. */ c=>!c.consumed&&(c.releasedAt===undefined||now-c.releasedAt<=TANGIBLE_CONTACT_GRACE_MS));
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
    const a=candidates[i],b=candidates[j],d=Math.hypot(a.x-b.x,a.y-b.y);
    if(d<BOOST_MIN_PX||d>tuning.boostMaxPx)continue;
    // A drifting finger is not a border drag. Reserve deformation only for
    // two coherent outward movements; small placement corrections still boost.
    /** Mesure la traction du doigt dans la direction extérieure au bord qu’il a saisi. */
    const outward=(c:Contact)=>c.outward?(c.x-c.sx)*c.outward.x+(c.y-c.sy)*c.outward.y:0;
    const da=outward(a),db=outward(b);
    if(a.edgeBank&&a.edgeBank===b.edgeBank&&Math.min(da,db)>=4&&(da+db)/2>=24)continue;
    const team=armedTeam(recognizer, 'boost',{x:(a.x+b.x)/2,y:(a.y+b.y)/2});if(!team)return;
    recognizer.log('boost',{team,gap:d});
    recognizer.send({type:'BoostGate',team,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y}});
    /** Consomme la paire reconnue pour éviter un second bonus avec les mêmes contacts. */
    recognizer.bonusRecent.forEach(c=>{c.consumed=true;});recognizer.bonusCommitted=true;return;
  }
}
