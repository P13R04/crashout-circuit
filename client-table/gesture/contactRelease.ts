/**
 * Suivi d'un contact déplacé ou levé, et conversion des coordonnées du navigateur en coordonnées de table.
 * Liens : client-table/gesture/gestureTypes.ts.
 * Fonctions appelées par les méthodes de GestureRecognizer (server/GestureRecognizer.ts), qui garde l'état et délègue ici.
 */
import type { Vec2 } from '../../server/types.js';
import { LOGICAL_W, LOGICAL_H } from '../../server/layout.js';
import { showMapError } from '../view.js';
import { mapEndpointError, mapStrokeEndpoints } from '../../server/track/mapCreation.js';
import { TANGIBLE_CONTACT_GRACE_MS } from '../../server/tangibles/tangibleTouch.js';
import { START_WIIMOTE_BUTTON } from '../renderer/rendererButtons.js';
import { openWiimotePanel } from '../ui/wiimotePanelLink.js';
import type { GestureRecognizer } from './GestureRecognizer.js';

/** Convertit le contact du navigateur en coordonnées de la table indépendamment de la résolution d’affichage. */
export function toLogical(recognizer: GestureRecognizer, e: PointerEvent): Vec2 {
  const r = recognizer.canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * LOGICAL_W, y: ((e.clientY - r.top) / r.height) * LOGICAL_H };
}

/** Actualise la direction, le tracé, la pose ou la traction correspondant au doigt déplacé. */
export function onMove(recognizer: GestureRecognizer, e: PointerEvent): void {
  recognizer.syncState();
  const c = recognizer.contacts.get(e.pointerId);
  if (!c) return;
  e.preventDefault();
  const p = toLogical(recognizer, e);
  c.x = p.x; c.y = p.y;

  if(recognizer.borderPull?.ids.includes(c.id)){
    recognizer.streamBorderPull(false);
  }else if(c.zone==='tangible'&&!c.consumed){
    recognizer.updateTangibleContacts();
  } else if (c.zone === 'steer') {
    recognizer.updateSteer(c);
  } else if (c.zone === 'stroke') {
    const s = recognizer.view.strokes.get(c.strokeKey ?? -1);
    const last = s?.pts[s.pts.length - 1];
    if (s && last && Math.hypot(p.x - last.x, p.y - last.y) >= 2) s.pts.push(p);
  } else if (c.zone === 'simsling') {
    recognizer.updateSimSling(c);
  } else if (c.zone === 'free' && !c.consumed) {
    recognizer.updateSling();
    // the fingers of a slingshot are never a border pull
    if (c.outward && !c.consumed && (!recognizer.slingContacts||recognizer.view.sling?.idle)) recognizer.tryBorderPull(c);
  }
}

/** Relâche la commande ou confirme le geste associé au doigt levé en distinguant une annulation système. */
export function onUp(recognizer: GestureRecognizer, e: PointerEvent): void {
  recognizer.syncState();
  const c = recognizer.contacts.get(e.pointerId);
  if (!c) return;
  if(c.zone==='free'&&e.type==='pointerup'){const p=toLogical(recognizer, e);c.x=p.x;c.y=p.y;recognizer.updateSling();}
  if(c.zone==='free')c.releasedAt=performance.now();
  if(c.zone==='tangible'&&e.type==='pointerup'){const p=toLogical(recognizer, e);c.x=p.x;c.y=p.y;}
  if(recognizer.borderPull?.ids.includes(c.id)){if(e.type==='pointerup'){const at=toLogical(recognizer, e);c.x=at.x;c.y=at.y;}recognizer.streamBorderPull(true);recognizer.borderPull=null;}
  if (c.zone === 'wiimote' && e.type === 'pointerup') {
    const at = toLogical(recognizer, e), b = START_WIIMOTE_BUTTON;
    if (at.x >= b.x && at.x <= b.x + b.w && at.y >= b.y && at.y <= b.y + b.h) openWiimotePanel();
  }
  recognizer.contacts.delete(c.id);
  recognizer.view.debug.contacts = recognizer.contacts.size;
  if(c.zone==='tangible'){
    c.releasedAt=performance.now();
    if(e.type!=='pointerup'){
      recognizer.placementRejected=true;/* Empêche les contacts d’une prise annulée d’être reconnus comme un bonus. */ recognizer.placementRecent.forEach(t=>{t.consumed=true;});
    }
    recognizer.updateTangibleContacts();
    if(recognizer.placementRecent.length===1&&!recognizer.placementRejected){
      recognizer.placementLatchTimer=setTimeout(/* Efface les derniers contacts de pose après leur petit délai de maintien visuel. */ ()=>{recognizer.placementRecent=[];recognizer.view.tangibleTouch=null;recognizer.placementLatchTimer=null;},TANGIBLE_CONTACT_GRACE_MS);
    }
    const active=[...recognizer.contacts.values()].some(/* Vérifie si un autre doigt de pose est toujours maintenu sur la table. */ t=>t.zone==='tangible');
    if(!active&&recognizer.placementRejected){recognizer.placementRecent=[];recognizer.placementRejected=false;}
    else if(!active&&!recognizer.placementTimer&&recognizer.placementRecent.length===2&&!recognizer.placementSent){recognizer.placementRecent=[];}
  }

  if (c.zone === 'pad' && c.padKey) recognizer.padUp(c.padKey, c.id);
  if (c.zone === 'steer' && c.panel) recognizer.releaseStick(c.panel.team);
  if (c.zone === 'pedal' && c.panel) recognizer.releasePedal(c.panel.team);
  if (c.zone === 'stroke') {
    const s = recognizer.view.strokes.get(c.strokeKey ?? -1);
    if (s) {
      s.done = true;
      const targets = recognizer.state?.mapTargets?.[s.team];
      // pointerup can contain the final movement; never validate using an older move.
      const end = toLogical(recognizer, e);
      s.pts.push(end);
      const error = e.type === 'pointercancel' || e.type === 'lostpointercapture'
        ? 'mapCancelled' : targets ? mapEndpointError(s.pts, ...targets) : 'mapCancelled';
      if (error) {
        s.rejectedAt = performance.now();
        showMapError(recognizer.view, error, s.team);
      } else {
        if (targets && mapStrokeEndpoints(s.pts[0], ...targets)[0] === targets[1]) s.pts.reverse();
        s.submitting = true;
        recognizer.send({ type: 'StrokeDraw', creator: s.team, pts: s.pts });
      }
    }
  }
  if (c.zone === 'simsling') recognizer.releaseSimSling(c);
  if (recognizer.slingContacts?.includes(c)){
    // Les navigateurs ne garantissent pas l’ordre des pointerup : après une traction
    // valide, relâcher l’un des trois doigts (la poche ou un appui) tire donc aussitôt.
    // Sans poche identifiée, la prise est simplement abandonnée.
    recognizer.releaseSling(recognizer.slingPuller===null || e.type!=='pointerup');
  }else if(e.type!=='pointerup')recognizer.bonusRecent=recognizer.bonusRecent.filter(/* Retire le contact qui ne doit plus rejoindre une autre prise de bonus. */ v=>v!==c);
  if (c.zone === 'free') recognizer.scheduleEvaluation();
}
