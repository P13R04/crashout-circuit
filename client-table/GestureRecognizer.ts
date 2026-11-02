/**
 * Classe les contacts de la table et reconnaît les commandes des postes, le dessin, les bonus, les tangibles
 * et la déformation.
 * Liens : server/layout.ts, server/geometry.ts, client-table/Renderer.ts, server/trackPresentation.ts,
 * server/armedPickup.ts et les utilitaires importés ci-dessous.
 * Référencé par client-table/main.ts, scripts/acceptance.ts.
 */
import { presentingTrack } from '../server/trackPresentation.js';
import { armedPickup } from '../server/armedPickup.js';
import { createControls } from '../client-shared/controls.js';
import type { GameState, Team, Vec2 } from '../server/types.js';
import {
  LOGICAL_W, LOGICAL_H, PANELS, padLocal, panelWidth, PANEL_H, STEER_AREA_LOCAL, PEDAL_LOCAL, POWER_BTN_LOCAL, worldToLocal, steerArea as steerAreaForState, inTangibleDepot, inNeutralUi, type PanelLayout,
  insidePanel, nearestStationTeam, checkDivider, inPlayArea, type Role,
} from '../server/layout.js';
import { slingshotShot, trackTangent, nearestTrackEdge } from '../server/geometry.js';
import { RESULT_BUTTON, START_TABLE_BUTTON, START_PC_BUTTON, START_TUTORIAL_BUTTON, START_TANGIBLE_TEST_BUTTON, PAUSE_BUTTON, MAP_GENERATE_BUTTON, RACE_START_BUTTON} from './Renderer.js';
import { inTutorialCard, tutorialButtonAt, tutorialIdentifying } from './TutorialOverlay.js';
import { showDividerRefusal, showMapError, showMapNotice, type View } from './view.js';
import { activeMapTeam, inMapAnchor, mapEndpointError, mapStrokeEndpoints } from '../server/mapCreation.js';
import { tangibleTouchPose, TANGIBLE_SETTLE_MS, TANGIBLE_CONTACT_GRACE_MS } from '../server/tangibleTouch.js';
import { tangibleDefinition } from '../server/tangibles.js';
import { tuning } from './gestureTuning.js';
import { recordGesture } from './GestureLog.js';

export const MAX_CONTACTS = 10;
// Settle delay, sling cluster / pouch thresholds, boost span and palm width are in
// gestureTuning.ts (adjustable from the URL); the rest are fixed here.
const SIM_FORK_HALF_PX = 38;    // mouse stand-in: virtual anchors either side of the pull axis
const BOOST_MIN_PX = 0;
const PULL_MIN_PX = 20;
const PULL_MAX_PX = 220;
const PULL_PAIR_MAX_PX = 260;
const PULL_EDGE_INDEX_GAP = 32;

/** Décrit l’usage réservé à un contact afin de ne pas mélanger commandes et gestes libres. */
type Zone = 'tangible' | 'simsling' | 'steer' | 'pedal' | 'item' | 'pad' | 'stroke' | 'target' | 'result' | 'pause' | 'mode' | 'free' | 'rejected';

/** Suit un doigt, sa zone et son déplacement depuis sa pose jusqu’à sa consommation. */
interface Contact {
  id: number;
  x: number; y: number;
  sx: number; sy: number;
  zone: Zone;
  consumed: boolean;
  padKey?: string;
  panel?: PanelLayout;
  steer?: number;
  strokeTeam?: Team;
  strokeKey?: number; // unique per drawn stroke (a mouse reuses the same pointerId)
  outward?: Vec2; // border candidate: unit vector away from the centerline
  edgeIndex?: number;
  edgeSide?: number;
  edgeBank?: 'outer'|'inner';
  startedAt: number;
  releasedAt?: number;
}

/** Décrit l’envoi d’une commande déjà reconnue vers le réseau ou le double de test. */
type Send = (msg: { type: string } & Record<string, unknown>) => void;

/** Classe les contacts de la table et reconnaît les commandes des postes, le dessin, les bonus, les tangibles et la déformation. */
export class GestureRecognizer {
  private controls = createControls(/* Transmet les commandes de l’adaptateur commun au lecteur réseau fourni à la reconnaissance. */ msg => this.send(msg));
  private contacts = new Map<number, Contact>();
  private strokeSeq = 0;
  private padTouches = new Map<string, Set<number>>();
  /** team → pointerId of the finger holding that team's steering pad. */
  private sticks = new Map<Team, number>();
  /** team → pointerId of the finger holding that team's acceleration pedal. */
  private pedals = new Map<Team, number>();
  private lastInput: Record<Team, { throttle: number; steer: number }> = {
    A: { throttle: 0, steer: 0 }, B: { throttle: 0, steer: 0 },
  };
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private pullSequence = 0;
  private borderPull: { ids:number[]; gestureId:string; start:Vec2; outward:Vec2; team:Team; lastSent:number; index:number } | null = null;
  private placementRecent: Contact[] = [];
  private placementRejected = false;
  private placementSent = false;
  private placementLatchTimer: ReturnType<typeof setTimeout> | null = null;
  private placementToken: number | null = null;
  private placementTimer: ReturnType<typeof setTimeout> | null = null;
  private placementMousePoint: Vec2 | null = null;
  /** event.timeStamp of the latest pointerdown, to measure finger→frame latency. */
  lastDownTs = 0;

  /**
   * Mouse-friendly stand-ins for the multi-finger gestures: arm the simulation from a
   * button, then click on the table — 1 click for the 3-finger slingshot, 2 clicks
   * (the two fingers) for the boost gate. The normal armed-item rules still apply.
   */
  private sim: { kind: 'slingshot' | 'boost'; first?: Vec2 } | null = null;
  /** Active touch slingshot: its three contacts and, once decided, the pulling one. */
  private slingIds: number[] | null = null;
  private slingContacts: Contact[] | null = null;
  private slingReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  private bonusKey: string | null = null;
  private bonusRecent: Contact[] = [];
  private bonusCommitted = false;
  private slingPuller: number | null = null;
  /** L’équipe est figée à partir des deux premiers appuis : bleu seulement si les deux sont côté bleu. */
  private slingTeam: Team | null = null;
  /** Mouse stand-in: the press (fork) point and the dragging pointer. */
  private simSling: { id: number; anchor: Vec2 } | null = null;
  /** Ne produit aucun changement d’interface tant qu’aucun lecteur de simulation n’est branché. */
  onSimChange: (hint: string) => void = () => {};

  /** Choisit le geste de test à reproduire avec une souris lorsque les outils de développement sont actifs. */
  simulate(kind: 'slingshot' | 'boost' | null): void {
    this.sim = kind ? { kind } : null;
    this.onSimChange(!kind ? '' : kind === 'slingshot'
      ? 'Maintenez le clic sur la fourche, tirez en arrière, relâchez pour tirer'
      : 'Touchez deux points pour placer le boost');
  }

  /** Accumule les deux clics servant de contacts à une zone d’accélération simulée. */
  private simClick(p: Vec2): void {
    const sim = this.sim;
    if (!sim || sim.kind !== 'boost') return;
    if (!sim.first) { sim.first = p; this.onSimChange('Cliquez le 2e point du portail'); return; }
    const d = Math.hypot(p.x - sim.first.x, p.y - sim.first.y);
    const mid = { x: (p.x + sim.first.x) / 2, y: (p.y + sim.first.y) / 2 };
    const team = this.armedTeam('boost', mid);
    if (!team) this.onSimChange("Aucune équipe n'a armé de boost (POWER d'abord)");
    else if (d > tuning.boostMaxPx) this.onSimChange('Rapprochez les deux points');
    else { this.controls.gesture('boost', team, sim.first, p); this.onSimChange(''); }
    this.sim = null;
  }

  /** Branche les contacts du canvas et le renouvellement des entrées pilotes sur la vue et l’envoi de commandes. */
  constructor(
    private canvas: HTMLCanvasElement,
    private view: View,
    private send: Send,
  ) {
    const opts = { passive: false } as const;
    /** Classe le contact nouvellement posé sur la table. */
    canvas.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    /** Actualise le geste ou la commande du doigt déplacé. */
    canvas.addEventListener('pointermove', (e) => this.onMove(e), opts);
    /** Termine le geste du doigt normalement levé. */
    canvas.addEventListener('pointerup', (e) => this.onUp(e), opts);
    /** Abandonne le geste lorsque le navigateur annule le pointeur. */
    canvas.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    /** Relâche les commandes lorsqu’une capture du pointeur est perdue. */
    canvas.addEventListener('lostpointercapture', (e) => this.onUp(e), opts);
    /** Empêche le menu contextuel de gêner les contacts du jeu. */
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // A held steering touch also sends a heartbeat. The server uses it to
    // neutralise a lost touch or a broken connection safely.
    /** Renouvelle régulièrement les entrées maintenues des pilotes. */
    setInterval(() => this.streamInputs(), 1000 / 60);
  }

  /** Donne accès au dernier état de jeu synchronisé dans la vue de la table. */
  private get state(): GameState | null { return this.view.state; }

  /** Expose le bonus armé seulement lorsque la course et les priorités permettent son geste. */
  private get expectedBonus(){
    return this.state?.phase==='RACE'&&!this.pendingPlacement?armedPickup(this.state):null;
  }

  /** Mémorise un contact récent pour accepter les gestes dont les doigts arrivent légèrement décalés. */
  private rememberBonusContact(c:Contact):void {
    if(this.pendingPlacement||this.bonusCommitted)return;
    const now=performance.now();
    this.bonusRecent=this.bonusRecent.filter(/* Conserve les contacts de bonus encore utilisables dans la marge de temps. */ old=>!old.consumed&&(old.releasedAt===undefined||now-old.releasedAt<=TANGIBLE_CONTACT_GRACE_MS));
    // Only an already identified fork can reacquire a lost anchor. Two close taps
    // (or two contacts sharing a reused pointerId) must remain two distinct samples.
    const replacement=this.slingContacts?.find(/* Retrouve un appui fixe brièvement levé près de la nouvelle pose du même doigt. */ old=>old.releasedAt!==undefined&&old.id!==this.slingPuller&&Math.hypot(old.x-c.x,old.y-c.y)<40);
    if(replacement){
      c.sx=replacement.sx;c.sy=replacement.sy;
      const index=this.bonusRecent.indexOf(replacement);
      if(index>=0)this.bonusRecent[index]=c;else this.bonusRecent.push(c);
      if(this.slingContacts?.includes(replacement)){
        this.slingContacts[this.slingContacts.indexOf(replacement)]=c;this.slingIds=this.slingContacts.map(/* Conserve les identifiants des doigts reconnus comme membres du lance-pierre. */ v=>v.id);
        if(this.slingReleaseTimer){clearTimeout(this.slingReleaseTimer);this.slingReleaseTimer=null;}
      }
    }else this.bonusRecent.push(c);
    this.bonusRecent=this.bonusRecent.slice(-6);
  }

  /** Retrouve l’annonce de tangible encore valable pendant une phase qui permet sa pose. */
  private get pendingPlacement() {
    const s=this.state, p=s?.tangiblePlacement;
    return s?.tangiblePlacementMode==='touch' && p && ['READY','RACE'].includes(s.phase) && p.expiresAt>this.view.now() ? p : null;
  }

  /** Annule les gestes devenus périmés lorsqu’un bonus, une annonce ou une phase change. */
  syncState(): void {
    const expected=this.expectedBonus,key=expected?`${expected.team}-${expected.kind}-${expected.version}`:null;
    if(key!==this.bonusKey){
      // POWER is authoritative, but its network echo must not discard fingers
      // that landed just after the button press. Never adopt a previous cast.
      const adopting=key!==null&&this.bonusKey===null&&!this.bonusCommitted;
      const fresh=adopting?this.bonusRecent.filter(/* Conserve les contacts récents non consommés lors de l’arrivée de la confirmation d’armement. */ c=>!c.consumed&&performance.now()-c.startedAt<=1200):[];
      this.bonusKey=key;this.bonusRecent=fresh;this.bonusCommitted=false;this.cancelSling();
      if(this.settleTimer)clearTimeout(this.settleTimer);this.settleTimer=null;
      for(const c of this.contacts.values())if(c.zone==='free'&&!fresh.includes(c)&&!this.borderPull?.ids.includes(c.id)){c.zone='rejected';c.consumed=true;}
      if(fresh.length){this.updateSling();this.scheduleEvaluation();}
    }
    const token=this.pendingPlacement?.token??null;
    if(token===this.placementToken)return;
    this.placementToken=token;
    this.placementRecent=[];this.placementRejected=false;this.placementSent=false;
    if(this.placementLatchTimer)clearTimeout(this.placementLatchTimer);this.placementLatchTimer=null;
    if(token!==null)this.borderPull=null;
    if(this.placementTimer)clearTimeout(this.placementTimer);
    this.placementTimer=null;this.placementMousePoint=null;this.view.tangibleTouch=null;
    if(token!==null){
      if(this.settleTimer)clearTimeout(this.settleTimer);
      this.settleTimer=null;
      this.cancelSling();this.simSling=null;this.view.sling=null;
      this.simulate(null);
    }
    for(const c of this.contacts.values())if(['free','tangible','simsling'].includes(c.zone)){
      c.consumed=true;c.zone='rejected';
    }
  }

  /** Envoie une seule confirmation de pose après validation des deux contacts. */
  private sendTangiblePlacement(a: Vec2,b: Vec2): void {
    const pending=this.pendingPlacement, s=this.state;
    if(!pending||!s||this.placementSent)return;
    const definition=tangibleDefinition(pending.id);
    if(!definition||!tangibleTouchPose(definition.kind,a,b,s.params))return;
    for(const c of this.contacts.values())if(c.zone==='tangible')c.consumed=true;
    this.placementSent=true;
    this.send({type:'TangibleTouchPlaced',id:pending.id,token:pending.token,a:{...a},b:{...b}});
  }

  /** Regroupe les contacts récents du tangible et programme la confirmation si la prise est suffisamment stable. */
  private updateTangibleContacts(): void {
    const pending=this.pendingPlacement,s=this.state;
    if(!pending||!s)return;
    const touches=this.placementRecent;
    if(touches.length>2){/* Consomme les contacts ambigus pour qu’ils ne déclenchent aucun autre geste. */ touches.forEach(c=>{c.consumed=true;});this.placementRejected=true;}
    const points=this.placementMousePoint?[this.placementMousePoint]:touches.map(/* Prépare les coordonnées des doigts de l’aperçu tangible. */ c=>({x:c.x,y:c.y}));
    const definition=tangibleDefinition(pending.id)!;
    const valid=points.length===2&&!!tangibleTouchPose(definition.kind,points[0],points[1],s.params);
    this.view.tangibleTouch={points,valid};
    if(touches.length!==2||!valid||this.placementRejected||this.placementSent||touches.some(/* Écarte une paire dont un contact a déjà servi à une autre confirmation. */ c=>c.consumed)){
      if(this.placementTimer)clearTimeout(this.placementTimer);
      this.placementTimer=null;return;
    }
    if(this.placementTimer)return; // Small touch jitter must not postpone placement forever.
    const token=pending.token;
    this.placementTimer=setTimeout(/* Confirme la paire restée stable si le même jeton de pose est toujours attendu. */ ()=>{
      this.placementTimer=null;
      if(this.pendingPlacement?.token===token && !this.placementRejected && !this.placementSent && touches.every(/* Vérifie que les deux doigts appartiennent encore à la prise en attente. */ c=>this.placementRecent.includes(c)&&!c.consumed))
        this.sendTangiblePlacement(touches[0],touches[1]);
    },TANGIBLE_SETTLE_MS);
  }

  /** Convertit le contact du navigateur en coordonnées de la table indépendamment de la résolution d’affichage. */
  private toLogical(e: PointerEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * LOGICAL_W, y: ((e.clientY - r.top) / r.height) * LOGICAL_H };
  }

  // --- Aiguillage des contacts vers les boutons, postes et gestes ---

  /** Attribue le nouveau doigt à une commande, un tracé ou un geste libre en respectant les priorités de la partie. */
  private onDown(e: PointerEvent): void {
    e.preventDefault();
    this.lastDownTs = e.timeStamp;
    if (this.contacts.size >= MAX_CONTACTS && !this.contacts.has(e.pointerId)) return; // touch budget
    const state = this.state;
    if (!state) return;
    this.syncState();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    const p = this.toLogical(e);
    const c: Contact = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, zone: 'free', consumed: false, startedAt: performance.now() };
    this.contacts.set(c.id, c);
    this.view.debug.contacts = this.contacts.size;

    /** Teste si le contact courant se trouve dans les limites du bouton demandé. */
    const hit = (b: { x: number; y: number; w: number; h: number }) =>
      p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

    // 0 — lobby: start button
    if (state.phase === 'LOBBY') {
      if (hit(START_TABLE_BUTTON) || state.developerTools && hit(START_PC_BUTTON)) {
        c.zone = 'result';
        this.send({ type: 'StartGame', mode: hit(START_PC_BUTTON) ? 'pc' : 'table' });
      } else if (state.developerTools && hit(START_TANGIBLE_TEST_BUTTON)) {
        c.zone = 'result'; this.send({ type: 'StartTangibleTest' });
      } else if (hit(START_TUTORIAL_BUTTON)) {
        // Starting with a mouse must keep the four real stations and touch lessons.
        c.zone = 'result';
        this.send({ type: 'StartTutorial', mode: this.view.tutorialMode });
      } else c.zone = 'rejected';
      return;
    }

    // 1 — result screen button
    if (state.phase === 'RESULT') {
      const b = RESULT_BUTTON;
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        c.zone = 'result';
        this.send({ type: 'NewGame' });
      } else c.zone = 'rejected';
      return;
    }

    // 2 — MAP: cyan places P1, rose places P2, then cyan draws before rose.
    if (state.phase === 'MAP') {
      const generate = MAP_GENERATE_BUTTON;
      if (state.mapStrokes.A && state.mapStrokes.B && p.x >= generate.x && p.x <= generate.x + generate.w && p.y >= generate.y && p.y <= generate.y + generate.h) {
        c.zone = 'result'; this.send({ type: 'GenerateTrack' }); return;
      }
      if (!state.mapTargets) {
        c.zone = 'target';
        this.placeDividerPoint(p);
        return;
      }
      const team = this.mapStrokeStartTeam(state, p);
      if (!team) { c.zone = 'rejected'; return; }
      c.zone = 'stroke';
      c.strokeTeam = team;
      for (const [key, s] of this.view.strokes) if (s.team === team) this.view.strokes.delete(key);
      c.strokeKey = ++this.strokeSeq;
      this.view.strokes.set(c.strokeKey, { team, pts: [p], done: false });
      return;
    }
    if (state.phase === 'READY') {
      if(presentingTrack(state,this.view.now())){c.zone='rejected';return;}
      const b = RACE_START_BUTTON;
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        c.zone = 'result'; this.send({ type: 'BeginRace' });
        return;
      } else if (!this.pendingPlacement) { c.zone = 'rejected'; return; }
    }
    if (state.phase === 'RACE' || state.phase === 'PAUSED') {
      const b = PAUSE_BUTTON;
      const resume = RACE_START_BUTTON;
      const centralResume = state.phase === 'PAUSED' && p.x >= resume.x && p.x <= resume.x + resume.w && p.y >= resume.y && p.y <= resume.y + resume.h;
      if (centralResume || p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        c.zone = 'pause'; this.send({ type: 'Pause' }); return;
      }

    }
    if (state.phase !== 'RACE' && !(state.phase === 'READY' && this.pendingPlacement)) { c.zone = 'rejected'; return; }

    // 2b — tutorial: skip a lesson, or leave once everybody is done
    const tutorialButton = tutorialButtonAt(state, p);
    if (tutorialButton) {
      c.zone = 'result';
      this.send(tutorialButton.kind === 'skip' ? { type: 'TutorialSkip', team: tutorialButton.team } : { type: 'TutorialRace' });
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
          if (this.sticks.has(panel.team)) { c.zone = 'rejected'; return; }
          c.zone = 'steer';
          c.panel = panel;
          this.sticks.set(panel.team, c.id);
          this.updateSteer(c);
          return;
        }
        const isPedal = state.driveMode[panel.team] === 'pedal';
        if (isPedal && Math.abs(l.x - PEDAL_LOCAL.x) <= PEDAL_LOCAL.w / 2 && Math.abs(l.y - PEDAL_LOCAL.y) <= PEDAL_LOCAL.h / 2) {
          if (this.pedals.has(panel.team)) { c.zone = 'rejected'; return; }
          c.zone = 'pedal';
          c.panel = panel;
          this.pedals.set(panel.team, c.id);
          this.view.localPedals[panel.team] = true;
          this.sendCurrentInput(panel.team);
          return;
        }
      }
      const pad = padLocal(panel.role,state.driveMode[panel.team]);
      if (Math.hypot(l.x - pad.x, l.y - pad.y) <= pad.r + 6) {
        c.zone = 'pad';
        c.padKey = `${panel.team}-${panel.role}`;
        this.padDown(c.padKey, panel.team, panel.role, c.id);
        return;
      }
      if (panel.role === 'copilot' && Math.hypot(l.x - POWER_BTN_LOCAL.x, l.y - POWER_BTN_LOCAL.y) <= POWER_BTN_LOCAL.r + 6) {
        c.zone = 'item'; this.controls.power(panel.team); return;
      }
      // Rest of a panel: not a game surface
      if (Math.abs(l.x) <= panelWidth(panel.role,state.driveMode[panel.team]) / 2 && Math.abs(l.y) <= PANEL_H / 2) { c.zone = 'rejected'; return; }
    }

    if(tutorialIdentifying(state)){c.zone='rejected';return;}

    // The operator reserves fresh map contacts before any bonus, simulation or border gesture.
    const scale = LOGICAL_W / this.canvas.getBoundingClientRect().width;
    const width = Math.max(e.width || 0, e.height || 0) * scale;
    this.log('contact', { id: c.id, w: (e.width || 0) * scale, h: (e.height || 0) * scale, type: e.pointerType, palm: width > tuning.palmMaxPx });
    if (width > tuning.palmMaxPx) { c.zone = 'rejected'; return; }
    const pendingPlacement=this.pendingPlacement;
    if(pendingPlacement){
      c.zone='tangible';
      if(e.pointerType==='mouse'){
        c.consumed=true;
        if(this.placementMousePoint){
          const valid=!!tangibleTouchPose(tangibleDefinition(pendingPlacement.id)!.kind,this.placementMousePoint,p,state.params);
          this.view.tangibleTouch={points:[this.placementMousePoint,p],valid};
          this.sendTangiblePlacement(this.placementMousePoint,p);
          this.placementMousePoint=null;
        }else {this.placementMousePoint=p;this.view.tangibleTouch={points:[p],valid:false};}
      }else{
        if(this.placementLatchTimer)clearTimeout(this.placementLatchTimer);this.placementLatchTimer=null;
        this.placementRecent=this.placementRecent.filter(/* Oublie les doigts trop anciens avant de chercher la paire du tangible. */ old=>old.releasedAt===undefined||performance.now()-old.releasedAt<=TANGIBLE_CONTACT_GRACE_MS);
        const retained=this.placementRecent.filter(/* Évite de compter deux fois le même toucher bref lorsqu’il revient au même endroit. */ old=>old.releasedAt===undefined||Math.hypot(old.x-c.x,old.y-c.y)>22);
        if(retained.length!==this.placementRecent.length&&this.placementTimer){clearTimeout(this.placementTimer);this.placementTimer=null;}
        this.placementRecent=retained;
        if(!this.placementSent&&!this.placementRejected)this.placementRecent.push(c);
        this.updateTangibleContacts();
      }
      return;
    }

    if(inTangibleDepot(p)||inNeutralUi(p)){c.zone='rejected';return;}

    // 3b — PC testing: simulated multi-finger gesture (toolbar buttons)
    // PC mode needs no toolbar button for the slingshot: with a slingshot armed, a plain
    // mouse press is the fork and the drag pulls the pouch.
    const pcAutoSling = !this.sim && state.mapMode === 'pc' && e.pointerType === 'mouse'
      && this.armedTeam('slingshot', p) !== null;
    if (this.sim || pcAutoSling) {
      if (pcAutoSling || this.sim?.kind === 'slingshot') {
        const team = this.armedTeam('slingshot', p);
        if (!team) {
          c.zone = 'target';
          this.sim = null;
          this.onSimChange("Aucune équipe n'a armé de lance-pierre (POWER d'abord)");
          return;
        }
        c.zone = 'simsling';
        this.simSling = { id: c.id, anchor: p };
        this.updateSimSling(c);
        return;
      }
      c.zone = 'target';
      this.simClick(p);
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
    this.rememberBonusContact(c);
    this.updateSling();
    this.scheduleEvaluation();
  }

  /** Actualise la direction, le tracé, la pose ou la traction correspondant au doigt déplacé. */
  private onMove(e: PointerEvent): void {
    this.syncState();
    const c = this.contacts.get(e.pointerId);
    if (!c) return;
    e.preventDefault();
    const p = this.toLogical(e);
    c.x = p.x; c.y = p.y;

    if(this.borderPull?.ids.includes(c.id)){
      this.streamBorderPull(false);
    }else if(c.zone==='tangible'&&!c.consumed){
      this.updateTangibleContacts();
    } else if (c.zone === 'steer') {
      this.updateSteer(c);
    } else if (c.zone === 'stroke') {
      const s = this.view.strokes.get(c.strokeKey ?? -1);
      const last = s?.pts[s.pts.length - 1];
      if (s && last && Math.hypot(p.x - last.x, p.y - last.y) >= 2) s.pts.push(p);
    } else if (c.zone === 'simsling') {
      this.updateSimSling(c);
    } else if (c.zone === 'free' && !c.consumed) {
      this.updateSling();
      // the fingers of a slingshot are never a border pull
      if (c.outward && !c.consumed && (!this.slingContacts||this.view.sling?.idle)) this.tryBorderPull(c);
    }
  }

  /** Relâche la commande ou confirme le geste associé au doigt levé en distinguant une annulation système. */
  private onUp(e: PointerEvent): void {
    this.syncState();
    const c = this.contacts.get(e.pointerId);
    if (!c) return;
    if(c.zone==='free'&&e.type==='pointerup'){const p=this.toLogical(e);c.x=p.x;c.y=p.y;this.updateSling();}
    if(c.zone==='free')c.releasedAt=performance.now();
    if(c.zone==='tangible'&&e.type==='pointerup'){const p=this.toLogical(e);c.x=p.x;c.y=p.y;}
    if(this.borderPull?.ids.includes(c.id)){if(e.type==='pointerup'){const at=this.toLogical(e);c.x=at.x;c.y=at.y;}this.streamBorderPull(true);this.borderPull=null;}
    this.contacts.delete(c.id);
    this.view.debug.contacts = this.contacts.size;
    if(c.zone==='tangible'){
      c.releasedAt=performance.now();
      if(e.type!=='pointerup'){
        this.placementRejected=true;/* Empêche les contacts d’une prise annulée d’être reconnus comme un bonus. */ this.placementRecent.forEach(t=>{t.consumed=true;});
      }
      this.updateTangibleContacts();
      if(this.placementRecent.length===1&&!this.placementRejected){
        this.placementLatchTimer=setTimeout(/* Efface les derniers contacts de pose après leur petit délai de maintien visuel. */ ()=>{this.placementRecent=[];this.view.tangibleTouch=null;this.placementLatchTimer=null;},TANGIBLE_CONTACT_GRACE_MS);
      }
      const active=[...this.contacts.values()].some(/* Vérifie si un autre doigt de pose est toujours maintenu sur la table. */ t=>t.zone==='tangible');
      if(!active&&this.placementRejected){this.placementRecent=[];this.placementRejected=false;}
      else if(!active&&!this.placementTimer&&this.placementRecent.length===2&&!this.placementSent){this.placementRecent=[];}
    }

    if (c.zone === 'pad' && c.padKey) this.padUp(c.padKey, c.id);
    if (c.zone === 'steer' && c.panel) this.releaseStick(c.panel.team);
    if (c.zone === 'pedal' && c.panel) this.releasePedal(c.panel.team);
    if (c.zone === 'stroke') {
      const s = this.view.strokes.get(c.strokeKey ?? -1);
      if (s) {
        s.done = true;
        const targets = this.state?.mapTargets?.[s.team];
        // pointerup can contain the final movement; never validate using an older move.
        const end = this.toLogical(e);
        s.pts.push(end);
        const error = e.type === 'pointercancel' || e.type === 'lostpointercapture'
          ? 'mapCancelled' : targets ? mapEndpointError(s.pts, ...targets) : 'mapCancelled';
        if (error) {
          s.rejectedAt = performance.now();
          showMapError(this.view, error, s.team);
        } else {
          if (targets && mapStrokeEndpoints(s.pts[0], ...targets)[0] === targets[1]) s.pts.reverse();
          s.submitting = true;
          this.send({ type: 'StrokeDraw', creator: s.team, pts: s.pts });
        }
      }
    }
    if (c.zone === 'simsling') this.releaseSimSling(c);
    if (this.slingContacts?.includes(c)){
      if(this.slingPuller===c.id)this.releaseSling(e.type!=='pointerup');
      // Un lance-pierre n’est actif que tant que ses trois doigts sont réellement posés :
      // lever un appui fixe annule immédiatement la fourche au lieu de laisser un geste bloqué.
      else this.releaseSling(true);
    }else if(e.type!=='pointerup')this.bonusRecent=this.bonusRecent.filter(/* Retire le contact qui ne doit plus rejoindre une autre prise de bonus. */ v=>v!==c);
    if (c.zone === 'free') this.scheduleEvaluation();
  }

  // --- Création du circuit : pose des points P1 et P2 ---

  /** Enregistre les points P1 et P2 puis demande leur validation au serveur. */
  private placeDividerPoint(p: Vec2): void {
    const view = this.view;
    if (view.dividerSubmitting) return;
    if (!inPlayArea(p)) { showDividerRefusal(view, 'outOfZone'); return; }
    const first = view.pendingDivider[0];
    if (!first) {
      view.pendingDivider = [{ ...p }];
      view.mapNotice = null;
      return;
    }
    const verdict = checkDivider(first, p);
    if (verdict !== 'ok') { showDividerRefusal(view, verdict); return; }
    view.dividerSubmitting = true;
    view.mapNotice = null;
    this.send({ type: 'MapDivider', a: first, b: { ...p } });
  }

  // --- Direction et pédale du pilote ---

  /** Convertit la position du doigt sur la bande du pilote en direction normalisée. */
  private updateSteer(c: Contact): void {
    if (!c.panel) return;
    const local = worldToLocal(c.panel, c.x, c.y);
    // Match the keyboard: either half of the strip is a full left/right turn.
    // Only the zone changes as the finger crosses the centre.
    c.steer = local.x <= steerAreaForState(this.state?.driveMode[c.panel.team]).x ? -1 : 1;
    this.view.sticks[c.panel.team] = { x: c.steer, y: 0, active: true };
  }

  /** Relâche la direction de l’équipe et efface sa prévisualisation locale. */
  private releaseStick(team: Team): void {
    this.sticks.delete(team);
    this.view.sticks[team] = { x: 0, y: 0, active: false };
    this.sendCurrentInput(team);
  }

  /** Relâche la pédale et transmet la nouvelle commande de conduite de l’équipe. */
  private releasePedal(team: Team): void {
    this.pedals.delete(team);
    this.view.localPedals[team] = false;
    this.sendCurrentInput(team);
  }

  /** Renvoie l’accélération correspondant au mode de conduite et à l’appui local sur la pédale. */
  private currentThrottle(team: Team): number {
    const isPedal = this.state?.driveMode[team] === 'pedal';
    return isPedal ? (this.pedals.has(team) ? 1 : 0) : 1;
  }

  /** Regroupe la direction et la pédale actuelles pour les envoyer au serveur. */
  private sendCurrentInput(team: Team, force = false): void {
    const stick = this.view.sticks[team];
    this.sendInput(team, this.currentThrottle(team), stick.active ? stick.x : 0, force);
  }

  /** Renouvelle les commandes des doigts encore maintenus pour éviter leur expiration côté serveur. */
  private streamInputs(): void {
    for (const team of ['A', 'B'] as Team[]) {
      if (!this.view.sticks[team].active && !this.pedals.has(team)) continue;
      this.sendCurrentInput(team, true);
    }
  }

  /** Évite les envois trop rapprochés tout en renouvelant les commandes inchangées qui restent maintenues. */
  private sendInput(team: Team, throttle: number, steer: number, force = false): void {
    const last = this.lastInput[team];
    if (!force && last.throttle === throttle && last.steer === steer) return;
    this.lastInput[team] = { throttle, steer };
    this.controls.steer(team, steer, throttle);
  }

  // --- Appuis de réparation ---

  /** Compte les doigts d’un même bouton de réparation et envoie seulement le début réel de l’appui. */
  private padDown(key: string, team: Team, role: Role, id: number): void {
    let set = this.padTouches.get(key);
    if (!set) { set = new Set(); this.padTouches.set(key, set); }
    const first = set.size === 0;
    set.add(id);
    if (first) {
      this.view.localPads[key] = true;
      this.send({ type: 'PadHold', team, role, on: true });
    }
  }

  /** Relâche le bouton de réparation seulement lorsque son dernier doigt est retiré. */
  private padUp(key: string, id: number): void {
    const set = this.padTouches.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) {
      this.view.localPads[key] = false;
      const [team, role] = key.split('-') as [Team, Role];
      this.send({ type: 'PadHold', team, role, on: false });
    }
  }

  /** Relâche toutes les commandes et efface les gestes locaux lors d’une interruption ou d’un changement d’écran. */
  releaseAll(): void {
    this.bonusRecent=[];this.cancelSling();
    this.placementRecent=[];this.placementRejected=false;
    if(this.placementLatchTimer)clearTimeout(this.placementLatchTimer);this.placementLatchTimer=null;
    if(this.borderPull){this.streamBorderPull(true);this.borderPull=null;}
    if(this.placementTimer)clearTimeout(this.placementTimer);
    this.placementTimer=null;this.placementMousePoint=null;this.view.tangibleTouch=null;
    if(this.settleTimer)clearTimeout(this.settleTimer);
    this.settleTimer=null;
    this.cancelSling();this.simSling=null;this.view.sling=null;
    this.view.dividerSubmitting = false;
    for (const [key, stroke] of this.view.strokes) {
      if (!this.state?.mapStrokes[stroke.team]) this.view.strokes.delete(key);
    }
    for (const key of [...this.padTouches.keys()]) {
      const [team, role] = key.split('-') as [Team, Role];
      this.view.localPads[key] = false;
      this.send({ type: 'PadHold', team, role, on: false });
    }
    this.padTouches.clear();
    for (const team of ['A', 'B'] as Team[]) {
      this.pedals.delete(team);
      this.view.localPedals[team] = false;
    }
    for (const team of ['A', 'B'] as Team[]) {
      this.releaseStick(team);
      this.lastInput[team] = { throttle: 1e9, steer: 1e9 }; // force the neutral frame out
      this.sendCurrentInput(team);
    }
    this.contacts.clear();
    this.view.debug.contacts = 0;
  }

  // --- Reconnaissance du bonus armé, dont la zone d’accélération ---

  /** Repousse l’examen des contacts pour laisser aux autres doigts le temps de se poser. */
  private scheduleEvaluation(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(/* Examine les doigts après leur stabilisation au lieu de décider au premier contact. */ () => { this.settleTimer = null; this.evaluate(); }, tuning.settleMs);
  }

  /** Vérifie que le geste demandé correspond au bonus partagé actuellement armé. */
  private armedTeam(kind: 'slingshot' | 'boost', at: Vec2): Team | null {
    const state = this.state;
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
  private evaluate(): void {
    this.syncState();
    const state = this.state;
    if (!state || state.phase !== 'RACE' || this.slingIds || this.pendingPlacement) return;
    if(this.expectedBonus?.kind!=='boost'||this.bonusCommitted||this.borderPull)return;
    const now=performance.now(),candidates=this.bonusRecent.filter(/* Conserve les prises libres et les doigts récemment levés qui peuvent encore former une paire. */ c=>!c.consumed&&(c.releasedAt===undefined||now-c.releasedAt<=TANGIBLE_CONTACT_GRACE_MS));
    for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
      const a=candidates[i],b=candidates[j],d=Math.hypot(a.x-b.x,a.y-b.y);
      if(d<BOOST_MIN_PX||d>tuning.boostMaxPx)continue;
      // A drifting finger is not a border drag. Reserve deformation only for
      // two coherent outward movements; small placement corrections still boost.
      /** Mesure la traction du doigt dans la direction extérieure au bord qu’il a saisi. */
      const outward=(c:Contact)=>c.outward?(c.x-c.sx)*c.outward.x+(c.y-c.sy)*c.outward.y:0;
      const da=outward(a),db=outward(b);
      if(a.edgeBank&&a.edgeBank===b.edgeBank&&Math.min(da,db)>=4&&(da+db)/2>=24)continue;
      const team=this.armedTeam('boost',{x:(a.x+b.x)/2,y:(a.y+b.y)/2});if(!team)return;
      this.log('boost',{team,gap:d});
      this.send({type:'BoostGate',team,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y}});
      /** Consomme la paire reconnue pour éviter un second bonus avec les mêmes contacts. */
      this.bonusRecent.forEach(c=>{c.consumed=true;});this.bonusCommitted=true;return;
    }
  }

  // --- Lance-pierre : fourche, traction et relâchement ---

  /**
 * Identifie les deux appuis fixes et le doigt mobile puis actualise la trajectoire du lance-pierre.
 *
   * Three reserved fingers, with a tolerant fork landing window, form the sling.
   * The landing order says nothing about the roles (fingers land within a few ms of
   * each other): the pouch is the finger that has clearly travelled the most, the
   * other two are the fork. The choice is not final — a finger that merely slid while
   * settling loses it as soon as another one is pulled much farther. Until one finger
   * dominates, no role is shown. The shot is fired on release.
   */
  private updateSling(): void {
    const state = this.state;
    if (!state || state.phase !== 'RACE' || this.pendingPlacement || this.expectedBonus?.kind!=='slingshot' || this.borderPull || this.bonusCommitted) { this.cancelSling(); return; }

    if (!this.slingIds) {
      const candidates = this.bonusRecent.filter(c=>!c.consumed&&c.releasedAt===undefined);
      let free: Contact[] | null = null;
      // Cherche un vrai groupe local au lieu de laisser trois doigts éloignés (deux joueurs)
      // bloquer tout le geste.
      for(let i=0;i<candidates.length&&!free;i++)for(let j=i+1;j<candidates.length&&!free;j++)for(let k=j+1;k<candidates.length;k++){
        const triple=[candidates[i],candidates[j],candidates[k]];
        const cx=triple.reduce((n,c)=>n+c.sx,0)/3,cy=triple.reduce((n,c)=>n+c.sy,0)/3;
        if(Math.max(...triple.map(c=>Math.hypot(c.sx-cx,c.sy-cy)))<=tuning.slingClusterPx){free=triple;break;}
      }
      if (!free) return;
      const cx = (free[0].sx + free[1].sx + free[2].sx) / 3;
      const cy = (free[0].sy + free[1].sy + free[2].sy) / 3;
      const spread = Math.max(...free.map(/* Mesure l’écart initial de chaque doigt au centre du groupe pour contrôler son regroupement. */ c => Math.hypot(c.sx - cx, c.sy - cy)));
      if (spread > tuning.slingClusterPx) { this.logOnce('clusterTooWide', { spread, limit: tuning.slingClusterPx }); return; }
      // Les deux premiers doigts déterminent la couleur ; s’ils ne sont pas tous les deux
      // dans la moitié cyan, la fourche est rose. On ne laisse donc jamais un groupe lointain voler le geste.
      const firstTwo={x:(free[0].sx+free[1].sx)/2,y:(free[0].sy+free[1].sy)/2};
      const armedTeam=this.armedTeam('slingshot', firstTwo);
      if (!armedTeam) return;
      // La couleur suit le côté des deux premières poses lorsque ce côté possède l’objet armé;
      // sinon on garde l’équipe autorisée par le serveur plutôt que de créer un tir invalide.
      this.slingTeam=nearestStationTeam(firstTwo)==='A'&&nearestStationTeam({x:free[0].sx,y:free[0].sy})==='A'&&nearestStationTeam({x:free[1].sx,y:free[1].sy})==='A'?'A':armedTeam;
      this.log('cluster', { spread, limit: tuning.slingClusterPx });
      this.slingContacts=free;
      this.slingIds = free.map(/* Retient les identifiants des trois contacts du lance-pierre. */ c => c.id);
      this.slingPuller = null;
    }

    const cs = this.slingContacts??[];
    if (cs.length !== 3) { this.cancelSling(); return; }
    /** Mesure le déplacement d’un doigt depuis sa position initiale pour reconnaître la poche mobile. */
    const disp = (c: Contact) => Math.hypot(c.x - c.sx, c.y - c.sy);

    const far = [...cs].sort(/* Classe les doigts du plus déplacé au moins déplacé pour identifier la poche. */ (a, b) => disp(b) - disp(a));
    // A finger takes (or takes back) the pouch role only when it left its spot while
    // both others stayed comparatively still; otherwise the previous choice is kept.
    if (disp(far[0]) >= tuning.slingRoleMinPx && disp(far[0]) >= disp(far[1]) * tuning.slingDominance) {
      if (this.slingPuller !== far[0].id) this.log('puller', { id: far[0].id, move: disp(far[0]), next: disp(far[1]), ratio: disp(far[1]) ? disp(far[0]) / disp(far[1]) : 99 });
      this.slingPuller = far[0].id;
    }

    const puller = cs.find(/* Retrouve le contact qui possède déjà le rôle de poche mobile. */ c => c.id === this.slingPuller) ?? null;
    const anchors = puller ? cs.filter(/* Conserve les deux autres doigts comme appuis fixes de la fourche. */ c => c !== puller) : cs.slice(0, 2);
    const a: Vec2 = { x: (anchors[0].x + anchors[1].x) / 2, y: (anchors[0].y + anchors[1].y) / 2 };
    const pouch: Vec2 = puller ? { x: puller.x, y: puller.y } : { x: cs[2].x, y: cs[2].y };
    this.view.sling = {
      team: this.slingTeam,
      anchors: [{ x: anchors[0].x, y: anchors[0].y }, { x: anchors[1].x, y: anchors[1].y }],
      pouch,
      idle: !puller,
      shot: slingshotShot(a, pouch, state.params),
    };
  }

  /**
   * Envoie le tir lorsque le doigt qui tient la poche est relâché avec une traction suffisante.
   * Seul le relâchement de la poche déclenche le tir ; les pertes brèves des appuis sont tolérées et une traction trop courte garde le bonus armé.
   */
  private releaseSling(cancelled: boolean): void {
    const state = this.state;
    const sling = this.view.sling;
    for(const c of this.slingContacts??[])c.consumed=true;
    this.cancelSling();
    if (sling && state) {
      const result = cancelled ? 'cancelled' : sling.idle ? 'noPouch' : !sling.shot.valid ? 'shortPull' : 'fired';
      this.log('release', { result, pull: sling.shot.pull, min: state.params.slingMinPullPx });
    }
    if (cancelled || !state || !sling || sling.idle || !sling.shot.valid) return;
    const anchor = { x: (sling.anchors[0].x + sling.anchors[1].x) / 2, y: (sling.anchors[0].y + sling.anchors[1].y) / 2 };
    const team = this.slingTeam;
    if (team){this.bonusCommitted=!state.tutorial;this.controls.gesture('slingshot', team, anchor, { ...sling.pouch });}
  }

  private lastLog = { kind: '', at: 0 };

  /** Ajoute une décision de reconnaissance au journal local de diagnostic. */
  private log(kind: string, detail: Record<string, number | string | boolean>): void {
    recordGesture(this.view.debug.gestures, kind, detail);
    this.lastLog = { kind, at: performance.now() };
  }

  /** Évite d’enregistrer en boucle la même décision de reconnaissance. */
  private logOnce(kind: string, detail: Record<string, number | string | boolean>): void {
    if (this.lastLog.kind === kind && performance.now() - this.lastLog.at < 1000) return;
    this.log(kind, detail);
  }

  /** Abandonne la traction et ses confirmations différées sans consommer de bonus. */
  private cancelSling(): void {
    if(this.slingReleaseTimer)clearTimeout(this.slingReleaseTimer);this.slingReleaseTimer=null;this.slingContacts=null;
    this.slingIds = null;
    this.slingPuller = null;
    this.slingTeam = null;
    if (!this.simSling) this.view.sling = null;
  }

  /** Construit la fourche et la poche virtuelles pendant la traction à la souris. */
  private updateSimSling(c: Contact): void {
    const state = this.state;
    if (!state || !this.simSling) return;
    const anchor = this.simSling.anchor;
    const pouch: Vec2 = { x: c.x, y: c.y };
    const shot = slingshotShot(anchor, pouch, state.params);
    // Virtual anchors either side of the pull axis, so the elastic looks like a Y
    const nx = -shot.dir.y, ny = shot.dir.x;
    this.view.sling = {
      team: this.armedTeam('slingshot', anchor),
      anchors: [
        { x: anchor.x + nx * SIM_FORK_HALF_PX, y: anchor.y + ny * SIM_FORK_HALF_PX },
        { x: anchor.x - nx * SIM_FORK_HALF_PX, y: anchor.y - ny * SIM_FORK_HALF_PX },
      ],
      pouch,
      idle: shot.pull < 4,
      shot,
    };
  }

  /** Valide la traction simulée puis envoie le même message qu’un geste tactile. */
  private releaseSimSling(c: Contact): void {
    const state = this.state;
    const sim = this.simSling;
    this.simSling = null;
    this.view.sling = null;
    if (!state || !sim) return;
    const shot = slingshotShot(sim.anchor, { x: c.x, y: c.y }, state.params);
    if (!shot.valid) {
      this.onSimChange(`Tirez plus en arrière (au moins ${state.params.slingMinPullPx} px)`);
      return; // the simulation stays armed: try again
    }
    const team = this.armedTeam('slingshot', sim.anchor);
    if (team) this.controls.gesture('slingshot', team, sim.anchor, { x: c.x, y: c.y });
    this.sim = null;
    this.onSimChange('');
  }

  // Déformation du circuit : prise du bord à deux doigts et déplacement envoyé au serveur.
  /** Associe deux contacts au même bord visible de piste avant de démarrer la traction. */
  private tryBorderPull(c: Contact): void {
    const state = this.state;
    if (!state || state.phase !== 'RACE' || this.pendingPlacement || (this.slingContacts&&!this.view.sling?.idle)) return;
    const candidates=[...this.contacts.values()].filter(/* Retient les doigts libres ayant saisi un bord de piste sans avoir consommé un autre geste. */ c=>c.zone==='free'&&!c.consumed&&c.outward&&c.edgeIndex!==undefined);
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
      const reserved=!!this.expectedBonus;
      if(score<(reserved?24:14)||Math.min(progressA,progressB)<(reserved?4:-12))continue;
      if(!best||score>best.score)best={a,b,index,outward,score};
    }
    if(!best)return;const {a,b,index,outward}=best;
    const start=(a.edgeBank==='inner'?state.track!.innerEdge:state.track!.outerEdge)[index];
    this.cancelSling();
    this.borderPull={ids:[a.id,b.id],gestureId:`${Date.now()}-${++this.pullSequence}`,start:{...start},outward,team:nearestStationTeam(start),lastSent:-Infinity,index};
    a.consumed=true;b.consumed=true;this.streamBorderPull(false);
  }

  /** Actualise la déformation maintenue et signale la fin du geste au serveur. */
  private streamBorderPull(end:boolean): void {
    const pull=this.borderPull,s=this.state;if(!pull||!s||s.phase!=='RACE'||this.pendingPlacement)return;
    const pair=pull.ids.map(/* Retrouve les deux contacts qui maintiennent la déformation en cours. */ id=>this.contacts.get(id));if(pair.some(/* Interrompt la déformation si l’un de ses doigts n’existe plus. */ c=>!c))return;
    const now=performance.now();if(!end&&now-pull.lastSent<32)return;
    const dx=pair.reduce(/* Additionne les déplacements horizontaux des deux doigts pour leur traction moyenne. */ (sum,c)=>sum+c!.x-c!.sx,0)/2,dy=pair.reduce(/* Additionne les déplacements verticaux des deux doigts pour leur traction moyenne. */ (sum,c)=>sum+c!.y-c!.sy,0)/2;
    const amount=Math.max(PULL_MIN_PX,Math.min(s.params.trackDeformMaxShiftPx??PULL_MAX_PX,dx*pull.outward.x+dy*pull.outward.y));
    this.send({type:'BorderPull',x:pull.start.x,y:pull.start.y,dx:pull.outward.x*amount,dy:pull.outward.y*amount,team:pull.team,gestureId:pull.gestureId,index:pull.index,end});
    pull.lastSent=now;
  }

  /** Retrouve l’équipe autorisée à commencer le tracé sur le point touché. */
  private mapStrokeStartTeam(state: GameState, p: Vec2): Team | null {
    if (!state.mapTargets) return null;
    const team = activeMapTeam(state);
    if (!team) return null;
    // A second finger must not erase the current stroke or submit a second copy.
    if ([...this.view.strokes.values()].some(/* Refuse un second dessin de la même équipe tant que son premier tracé reste actif ou en confirmation. */ s => s.team === team && (!s.done || s.submitting))) {
      showMapNotice(this.view, 'Terminez le tracé en cours.', '#ffd400');
      return null;
    }
    const [start, end] = state.mapTargets[team];
    if (!inMapAnchor(p, start) && !inMapAnchor(p, end)) {
      showMapError(this.view, 'mapWrongStart', team);
      return null;
    }
    this.view.mapNotice = null;
    return team;
  }
}
