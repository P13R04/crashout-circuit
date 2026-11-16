/**
 * Direction et pédale du pilote, appuis de réparation et relâchement de tous les contacts.
 * Liens : client-shared/controls.ts, server/layout.ts.
 * Fonctions appelées par les méthodes de GestureRecognizer (server/GestureRecognizer.ts), qui garde l'état et délègue ici.
 */
import type { Team } from '../../../server/types.js';
import { worldToLocal, steerArea as steerAreaForState, type Role } from '../../../server/layout.js';
import type { Contact } from '../gestureTypes.js';
import type { GestureRecognizer } from '../GestureRecognizer.js';

/** Convertit la position du doigt sur la bande du pilote en direction normalisée. */
export function updateSteer(recognizer: GestureRecognizer, c: Contact): void {
  if (!c.panel) return;
  const local = worldToLocal(c.panel, c.x, c.y);
  // Match the keyboard: either half of the strip is a full left/right turn.
  // Only the zone changes as the finger crosses the centre.
  c.steer = local.x <= steerAreaForState(recognizer.state?.driveMode[c.panel.team]).x ? -1 : 1;
  recognizer.view.sticks[c.panel.team] = { x: c.steer, y: 0, active: true };
}

/** Relâche la direction de l’équipe et efface sa prévisualisation locale. */
export function releaseStick(recognizer: GestureRecognizer, team: Team): void {
  recognizer.sticks.delete(team);
  recognizer.view.sticks[team] = { x: 0, y: 0, active: false };
  sendCurrentInput(recognizer, team);
}

/** Relâche la pédale et transmet la nouvelle commande de conduite de l’équipe. */
export function releasePedal(recognizer: GestureRecognizer, team: Team): void {
  recognizer.pedals.delete(team);
  recognizer.view.localPedals[team] = false;
  sendCurrentInput(recognizer, team);
}

/** Renvoie l’accélération correspondant au mode de conduite et à l’appui local sur la pédale. */
function currentThrottle(recognizer: GestureRecognizer, team: Team): number {
  const isPedal = recognizer.state?.driveMode[team] === 'pedal';
  return isPedal ? (recognizer.pedals.has(team) ? 1 : 0) : 1;
}

/** Regroupe la direction et la pédale actuelles pour les envoyer au serveur. */
export function sendCurrentInput(recognizer: GestureRecognizer, team: Team, force = false): void {
  const stick = recognizer.view.sticks[team];
  sendInput(recognizer, team, currentThrottle(recognizer, team), stick.active ? stick.x : 0, force);
}

/** Renouvelle les commandes des doigts encore maintenus pour éviter leur expiration côté serveur. */
export function streamInputs(recognizer: GestureRecognizer): void {
  for (const team of ['A', 'B'] as Team[]) {
    if (!recognizer.view.sticks[team].active && !recognizer.pedals.has(team)) continue;
    sendCurrentInput(recognizer, team, true);
  }
}

/** Évite les envois trop rapprochés tout en renouvelant les commandes inchangées qui restent maintenues. */
function sendInput(recognizer: GestureRecognizer, team: Team, throttle: number, steer: number, force = false): void {
  const last = recognizer.lastInput[team];
  if (!force && last.throttle === throttle && last.steer === steer) return;
  recognizer.lastInput[team] = { throttle, steer };
  recognizer.controls.steer(team, steer, throttle);
}

/** Compte les doigts d’un même bouton de réparation et envoie seulement le début réel de l’appui. */
export function padDown(recognizer: GestureRecognizer, key: string, team: Team, role: Role, id: number): void {
  let set = recognizer.padTouches.get(key);
  if (!set) { set = new Set(); recognizer.padTouches.set(key, set); }
  const first = set.size === 0;
  set.add(id);
  if (first) {
    recognizer.view.localPads[key] = true;
    recognizer.send({ type: 'PadHold', team, role, on: true });
  }
}

/** Relâche le bouton de réparation seulement lorsque son dernier doigt est retiré. */
export function padUp(recognizer: GestureRecognizer, key: string, id: number): void {
  const set = recognizer.padTouches.get(key);
  if (!set) return;
  set.delete(id);
  if (set.size === 0) {
    recognizer.view.localPads[key] = false;
    const [team, role] = key.split('-') as [Team, Role];
    recognizer.send({ type: 'PadHold', team, role, on: false });
  }
}

/** Relâche toutes les commandes et efface les gestes locaux lors d’une interruption ou d’un changement d’écran. */
export function releaseAll(recognizer: GestureRecognizer): void {
  recognizer.bonusRecent=[];recognizer.cancelSling();
  recognizer.placementRecent=[];recognizer.placementRejected=false;
  if(recognizer.placementLatchTimer)clearTimeout(recognizer.placementLatchTimer);recognizer.placementLatchTimer=null;
  if(recognizer.borderPull){recognizer.streamBorderPull(true);recognizer.borderPull=null;}
  if(recognizer.placementTimer)clearTimeout(recognizer.placementTimer);
  recognizer.placementTimer=null;recognizer.placementMousePoint=null;recognizer.view.tangibleTouch=null;
  if(recognizer.settleTimer)clearTimeout(recognizer.settleTimer);
  recognizer.settleTimer=null;
  recognizer.cancelSling();recognizer.simSling=null;recognizer.view.sling=null;
  recognizer.view.dividerSubmitting = false;
  for (const [key, stroke] of recognizer.view.strokes) {
    if (!recognizer.state?.mapStrokes[stroke.team]) recognizer.view.strokes.delete(key);
  }
  for (const key of [...recognizer.padTouches.keys()]) {
    const [team, role] = key.split('-') as [Team, Role];
    recognizer.view.localPads[key] = false;
    recognizer.send({ type: 'PadHold', team, role, on: false });
  }
  recognizer.padTouches.clear();
  for (const team of ['A', 'B'] as Team[]) {
    recognizer.pedals.delete(team);
    recognizer.view.localPedals[team] = false;
  }
  for (const team of ['A', 'B'] as Team[]) {
    releaseStick(recognizer, team);
    recognizer.lastInput[team] = { throttle: 1e9, steer: 1e9 }; // force the neutral frame out
    sendCurrentInput(recognizer, team);
  }
  recognizer.contacts.clear();
  recognizer.view.debug.contacts = 0;
}
