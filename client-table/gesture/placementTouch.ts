/**
 * Pose tactile des tangibles : regroupement des deux contacts et confirmation envoyée au serveur.
 * Liens : server/tangibleTouch.ts, server/tangibles.ts.
 * Fonctions appelées par les méthodes de GestureRecognizer (server/GestureRecognizer.ts), qui garde l'état et délègue ici.
 */
import type { Vec2 } from '../../server/types.js';
import { tangibleTouchPose, TANGIBLE_SETTLE_MS } from '../../server/tangibleTouch.js';
import { tangibleDefinition } from '../../server/tangibles.js';
import type { GestureRecognizer } from '../GestureRecognizer.js';

/** Envoie une seule confirmation de pose après validation des deux contacts. */
export function sendTangiblePlacement(recognizer: GestureRecognizer, a: Vec2,b: Vec2): void {
  const pending=recognizer.pendingPlacement, s=recognizer.state;
  if(!pending||!s||recognizer.placementSent)return;
  const definition=tangibleDefinition(pending.id);
  if(!definition||!tangibleTouchPose(definition.kind,a,b,s.params))return;
  for(const c of recognizer.contacts.values())if(c.zone==='tangible')c.consumed=true;
  recognizer.placementSent=true;
  recognizer.send({type:'TangibleTouchPlaced',id:pending.id,token:pending.token,a:{...a},b:{...b}});
}

/** Regroupe les contacts récents du tangible et programme la confirmation si la prise est suffisamment stable. */
export function updateTangibleContacts(recognizer: GestureRecognizer): void {
  const pending=recognizer.pendingPlacement,s=recognizer.state;
  if(!pending||!s)return;
  const touches=recognizer.placementRecent;
  if(touches.length>2){/* Consomme les contacts ambigus pour qu’ils ne déclenchent aucun autre geste. */ touches.forEach(c=>{c.consumed=true;});recognizer.placementRejected=true;}
  const points=recognizer.placementMousePoint?[recognizer.placementMousePoint]:touches.map(/* Prépare les coordonnées des doigts de l’aperçu tangible. */ c=>({x:c.x,y:c.y}));
  const definition=tangibleDefinition(pending.id)!;
  const valid=points.length===2&&!!tangibleTouchPose(definition.kind,points[0],points[1],s.params);
  recognizer.view.tangibleTouch={points,valid};
  if(touches.length!==2||!valid||recognizer.placementRejected||recognizer.placementSent||touches.some(/* Écarte une paire dont un contact a déjà servi à une autre confirmation. */ c=>c.consumed)){
    if(recognizer.placementTimer)clearTimeout(recognizer.placementTimer);
    recognizer.placementTimer=null;return;
  }
  if(recognizer.placementTimer)return; // Small touch jitter must not postpone placement forever.
  const token=pending.token;
  recognizer.placementTimer=setTimeout(/* Confirme la paire restée stable si le même jeton de pose est toujours attendu. */ ()=>{
    recognizer.placementTimer=null;
    if(recognizer.pendingPlacement?.token===token && !recognizer.placementRejected && !recognizer.placementSent && touches.every(/* Vérifie que les deux doigts appartiennent encore à la prise en attente. */ c=>recognizer.placementRecent.includes(c)&&!c.consumed))
      sendTangiblePlacement(recognizer, touches[0],touches[1]);
  },TANGIBLE_SETTLE_MS);
}
