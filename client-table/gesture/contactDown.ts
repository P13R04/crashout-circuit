/**
 * Aiguillage d'un contact posé : boutons, postes, tangibles, tracé de carte, bonus et prise de bord.
 * Liens : client-table/gesture/gestureTypes.ts, server/layout.ts, client-table/Renderer.ts.
 * Fonctions appelées par les méthodes de GestureRecognizer (server/GestureRecognizer.ts), qui garde l'état et délègue ici.
 */
import { presentingTrack } from '../../server/trackPresentation.js';
import { LOGICAL_W, PANELS, padLocal, panelWidth, PANEL_H, PEDAL_LOCAL, POWER_BTN_LOCAL, worldToLocal, steerArea as steerAreaForState, inTangibleDepot, inNeutralUi } from '../../server/layout.js';
import { trackTangent, nearestTrackEdge } from '../../server/geometry.js';
import { RESULT_BUTTON, START_TABLE_BUTTON, START_PC_BUTTON, START_TUTORIAL_BUTTON, START_TANGIBLE_TEST_BUTTON, PAUSE_BUTTON, MAP_GENERATE_BUTTON, RACE_START_BUTTON } from '../Renderer.js';
import { inTutorialCard, tutorialButtonAt, tutorialIdentifying } from '../TutorialOverlay.js';
import { tangibleTouchPose, TANGIBLE_CONTACT_GRACE_MS } from '../../server/tangibleTouch.js';
import { tangibleDefinition } from '../../server/tangibles.js';
import { tuning } from '../gestureTuning.js';
import { MAX_CONTACTS } from './gestureConstants.js';
import type { Contact } from './gestureTypes.js';
import type { GestureRecognizer } from '../GestureRecognizer.js';

/** Attribue le nouveau doigt à une commande, un tracé ou un geste libre en respectant les priorités de la partie. */
export function onDown(recognizer: GestureRecognizer, e: PointerEvent): void {
  e.preventDefault();
  recognizer.lastDownTs = e.timeStamp;
  if (recognizer.contacts.size >= MAX_CONTACTS && !recognizer.contacts.has(e.pointerId)) return; // touch budget
  const state = recognizer.state;
  if (!state) return;
  recognizer.syncState();
  try { recognizer.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }

  const p = recognizer.toLogical(e);
  const c: Contact = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, zone: 'free', consumed: false, startedAt: performance.now() };
  recognizer.contacts.set(c.id, c);
  recognizer.view.debug.contacts = recognizer.contacts.size;

  /** Teste si le contact courant se trouve dans les limites du bouton demandé. */
  const hit = (b: { x: number; y: number; w: number; h: number }) =>
    p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

  // 0 — lobby: start button
  if (state.phase === 'LOBBY') {
    if (hit(START_TABLE_BUTTON) || state.developerTools && hit(START_PC_BUTTON)) {
      c.zone = 'result';
      recognizer.send({ type: 'StartGame', mode: hit(START_PC_BUTTON) ? 'pc' : 'table' });
    } else if (state.developerTools && hit(START_TANGIBLE_TEST_BUTTON)) {
      c.zone = 'result'; recognizer.send({ type: 'StartTangibleTest' });
    } else if (hit(START_TUTORIAL_BUTTON)) {
      // Starting with a mouse must keep the four real stations and touch lessons.
      c.zone = 'result';
      recognizer.send({ type: 'StartTutorial', mode: recognizer.view.tutorialMode });
    } else c.zone = 'rejected';
    return;
  }

  // 1 — result screen button
  if (state.phase === 'RESULT') {
    const b = RESULT_BUTTON;
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      c.zone = 'result';
      recognizer.send({ type: 'NewGame' });
    } else c.zone = 'rejected';
    return;
  }

  // 2 — MAP: cyan places P1, rose places P2, then cyan draws before rose.
  if (state.phase === 'MAP') {
    const generate = MAP_GENERATE_BUTTON;
    if (state.mapStrokes.A && state.mapStrokes.B && p.x >= generate.x && p.x <= generate.x + generate.w && p.y >= generate.y && p.y <= generate.y + generate.h) {
      c.zone = 'result'; recognizer.send({ type: 'GenerateTrack' }); return;
    }
    if (!state.mapTargets) {
      c.zone = 'target';
      recognizer.placeDividerPoint(p);
      return;
    }
    const team = recognizer.mapStrokeStartTeam(state, p);
    if (!team) { c.zone = 'rejected'; return; }
    c.zone = 'stroke';
    c.strokeTeam = team;
    for (const [key, s] of recognizer.view.strokes) if (s.team === team) recognizer.view.strokes.delete(key);
    c.strokeKey = ++recognizer.strokeSeq;
    recognizer.view.strokes.set(c.strokeKey, { team, pts: [p], done: false });
    return;
  }
  if (state.phase === 'READY') {
    if(presentingTrack(state,recognizer.view.now())){c.zone='rejected';return;}
    const b = RACE_START_BUTTON;
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      c.zone = 'result'; recognizer.send({ type: 'BeginRace' });
      return;
    } else if (!recognizer.pendingPlacement) { c.zone = 'rejected'; return; }
  }
  if (state.phase === 'RACE' || state.phase === 'PAUSED') {
    const b = PAUSE_BUTTON;
    const resume = RACE_START_BUTTON;
    const centralResume = state.phase === 'PAUSED' && p.x >= resume.x && p.x <= resume.x + resume.w && p.y >= resume.y && p.y <= resume.y + resume.h;
    if (centralResume || p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      c.zone = 'pause'; recognizer.send({ type: 'Pause' }); return;
    }

  }
  if (state.phase !== 'RACE' && !(state.phase === 'READY' && recognizer.pendingPlacement)) { c.zone = 'rejected'; return; }

  // 2b — tutorial: skip a lesson, or leave once everybody is done
  const tutorialButton = tutorialButtonAt(state, p);
  if (tutorialButton) {
    c.zone = 'result';
    recognizer.send(tutorialButton.kind === 'skip' ? { type: 'TutorialSkip', team: tutorialButton.team } : { type: 'TutorialRace' });
    return;
  }

  if(state.tutorial?.finished||inTutorialCard(state,p)){c.zone='rejected';return;}

  // 3 — pads and buttons of the corner panels
  for (const panel of PANELS) {
    const l = worldToLocal(panel, p.x, p.y);
    if (panel.role === 'pilot') {
      if (state.sessionMode === 'tangibles-test' && Math.abs(l.x) <= panelWidth('pilot',state.driveMode[panel.team]) / 2 && Math.abs(l.y) <= PANEL_H / 2) {
        c.zone = 'rejected'; return;
      }
      const steerArea = steerAreaForState(state.driveMode[panel.team]);
      if (Math.abs(l.x - steerArea.x) <= steerArea.w / 2 && Math.abs(l.y - steerArea.y) <= steerArea.h / 2) {
        if (recognizer.sticks.has(panel.team)) { c.zone = 'rejected'; return; }
        c.zone = 'steer';
        c.panel = panel;
        recognizer.sticks.set(panel.team, c.id);
        recognizer.updateSteer(c);
        return;
      }
      const isPedal = state.driveMode[panel.team] === 'pedal';
      if (isPedal && Math.abs(l.x - PEDAL_LOCAL.x) <= PEDAL_LOCAL.w / 2 && Math.abs(l.y - PEDAL_LOCAL.y) <= PEDAL_LOCAL.h / 2) {
        if (recognizer.pedals.has(panel.team)) { c.zone = 'rejected'; return; }
        c.zone = 'pedal';
        c.panel = panel;
        recognizer.pedals.set(panel.team, c.id);
        recognizer.view.localPedals[panel.team] = true;
        recognizer.sendCurrentInput(panel.team);
        return;
      }
    }
    const pad = padLocal(panel.role,state.driveMode[panel.team]);
    if (Math.hypot(l.x - pad.x, l.y - pad.y) <= pad.r + 6) {
      c.zone = 'pad';
      c.padKey = `${panel.team}-${panel.role}`;
      recognizer.padDown(c.padKey, panel.team, panel.role, c.id);
      return;
    }
    if (panel.role === 'copilot' && Math.hypot(l.x - POWER_BTN_LOCAL.x, l.y - POWER_BTN_LOCAL.y) <= POWER_BTN_LOCAL.r + 6) {
      c.zone = 'item'; recognizer.controls.power(panel.team); return;
    }
    // Rest of a panel: not a game surface
    if (Math.abs(l.x) <= panelWidth(panel.role,state.driveMode[panel.team]) / 2 && Math.abs(l.y) <= PANEL_H / 2) { c.zone = 'rejected'; return; }
  }

  if(tutorialIdentifying(state)){c.zone='rejected';return;}

  // The operator reserves fresh map contacts before any bonus, simulation or border gesture.
  const scale = LOGICAL_W / recognizer.canvas.getBoundingClientRect().width;
  const width = Math.max(e.width || 0, e.height || 0) * scale;
  recognizer.log('contact', { id: c.id, w: (e.width || 0) * scale, h: (e.height || 0) * scale, type: e.pointerType, palm: width > tuning.palmMaxPx });
  if (width > tuning.palmMaxPx) { c.zone = 'rejected'; return; }
  const pendingPlacement=recognizer.pendingPlacement;
  if(pendingPlacement){
    c.zone='tangible';
    if(e.pointerType==='mouse'){
      c.consumed=true;
      if(recognizer.placementMousePoint){
        const valid=!!tangibleTouchPose(tangibleDefinition(pendingPlacement.id)!.kind,recognizer.placementMousePoint,p,state.params);
        recognizer.view.tangibleTouch={points:[recognizer.placementMousePoint,p],valid};
        recognizer.sendTangiblePlacement(recognizer.placementMousePoint,p);
        recognizer.placementMousePoint=null;
      }else {recognizer.placementMousePoint=p;recognizer.view.tangibleTouch={points:[p],valid:false};}
    }else{
      if(recognizer.placementLatchTimer)clearTimeout(recognizer.placementLatchTimer);recognizer.placementLatchTimer=null;
      recognizer.placementRecent=recognizer.placementRecent.filter(/* Oublie les doigts trop anciens avant de chercher la paire du tangible. */ old=>old.releasedAt===undefined||performance.now()-old.releasedAt<=TANGIBLE_CONTACT_GRACE_MS);
      const retained=recognizer.placementRecent.filter(/* Évite de compter deux fois le même toucher bref lorsqu’il revient au même endroit. */ old=>old.releasedAt===undefined||Math.hypot(old.x-c.x,old.y-c.y)>22);
      if(retained.length!==recognizer.placementRecent.length&&recognizer.placementTimer){clearTimeout(recognizer.placementTimer);recognizer.placementTimer=null;}
      recognizer.placementRecent=retained;
      if(!recognizer.placementSent&&!recognizer.placementRejected)recognizer.placementRecent.push(c);
      recognizer.updateTangibleContacts();
    }
    return;
  }

  if(inTangibleDepot(p)||inNeutralUi(p)){c.zone='rejected';return;}

  // 3b — PC testing: simulated multi-finger gesture (toolbar buttons)
  // PC mode needs no toolbar button for the slingshot: with a slingshot armed, a plain
  // mouse press is the fork and the drag pulls the pouch.
  const pcAutoSling = !recognizer.sim && state.mapMode === 'pc' && e.pointerType === 'mouse'
    && recognizer.armedTeam('slingshot', p) !== null;
  if (recognizer.sim || pcAutoSling) {
    if (pcAutoSling || recognizer.sim?.kind === 'slingshot') {
      const team = recognizer.armedTeam('slingshot', p);
      if (!team) {
        c.zone = 'target';
        recognizer.sim = null;
        recognizer.onSimChange("Aucune équipe n'a armé de lance-pierre (POWER d'abord)");
        return;
      }
      c.zone = 'simsling';
      recognizer.simSling = { id: c.id, anchor: p };
      recognizer.updateSimSling(c);
      return;
    }
    c.zone = 'target';
    recognizer.simClick(p);
    return;
  }

  // Free contact: multi-finger gestures and border pull.
  c.zone = 'free';
  if (state.track) {
    const edge=nearestTrackEdge(p,state.track);
    if(edge){
      const tangent=trackTangent(state.track,edge.index),normal={x:-tangent.y,y:tangent.x},centre=state.track.centerline[edge.index];
      c.edgeSide=(edge.point.x-centre.x)*normal.x+(edge.point.y-centre.y)*normal.y<0?-1:1;
      c.outward={x:normal.x*c.edgeSide,y:normal.y*c.edgeSide};c.edgeIndex=edge.index;c.edgeBank=edge.bank;
    }
  }
  recognizer.rememberBonusContact(c);
  recognizer.updateSling();
  recognizer.scheduleEvaluation();
}
