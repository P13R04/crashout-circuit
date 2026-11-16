/**
 * Classe les contacts de la table et reconnaît les commandes des postes, le dessin, les bonus, les tangibles
 * et la déformation.
 * Liens : server/layout.ts, server/geometry.ts, client-table/renderer/Renderer.ts, server/track/trackPresentation.ts,
 * server/rules/armedPickup.ts et les utilitaires importés ci-dessous.
 * Référencé par client-table/main.ts, scripts/acceptance.ts.
 * Façade : les contacts, les minuteurs et les écouteurs du canvas restent ici ; la logique de chaque geste est découpée dans client-table/gesture/ (chaque méthode délègue à une fonction du même nom).
 */
import { armedPickup } from '../../server/rules/armedPickup.js';
import { createControls } from '../../client-shared/controls.js';
import type { GameState, Team, Vec2 } from '../../server/types.js';
import { type Role } from '../../server/layout.js';
import { type View } from '../view.js';
import type { Contact, Send } from './gestureTypes.js';
import * as contactDown from './contactDown.js';
import * as contactRelease from './contactRelease.js';
import * as mapDrawing from './actions/mapDrawing.js';
import * as pilotControls from './actions/pilotControls.js';
import * as bonusEvaluation from './actions/bonusEvaluation.js';
import * as slingGesture from './actions/slingGesture.js';
import * as borderPullGesture from './actions/borderPullGesture.js';
import * as placementTouch from './actions/placementTouch.js';
import * as mouseSimulation from './actions/mouseSimulation.js';

// Réexports : les noms publics gardent leur chemin d’import.
export { MAX_CONTACTS } from './gestureConstants.js';

/** Classe les contacts de la table et reconnaît les commandes des postes, le dessin, les bonus, les tangibles et la déformation. */
export class GestureRecognizer {
  controls = createControls(/* Transmet les commandes de l’adaptateur commun au lecteur réseau fourni à la reconnaissance. */ msg => this.send(msg));

  contacts = new Map<number, Contact>();

  strokeSeq = 0;

  padTouches = new Map<string, Set<number>>();

  /** team → pointerId of the finger holding that team's steering pad. */
  sticks = new Map<Team, number>();

  /** team → pointerId of the finger holding that team's acceleration pedal. */
  pedals = new Map<Team, number>();

  lastInput: Record<Team, { throttle: number; steer: number }> = {
    A: { throttle: 0, steer: 0 }, B: { throttle: 0, steer: 0 },
  };

  settleTimer: ReturnType<typeof setTimeout> | null = null;

  pullSequence = 0;

  borderPull: { ids:number[]; gestureId:string; start:Vec2; outward:Vec2; team:Team; lastSent:number; index:number } | null = null;

  placementRecent: Contact[] = [];

  placementRejected = false;

  placementSent = false;

  placementLatchTimer: ReturnType<typeof setTimeout> | null = null;

  placementToken: number | null = null;

  placementTimer: ReturnType<typeof setTimeout> | null = null;

  placementMousePoint: Vec2 | null = null;

  /** event.timeStamp of the latest pointerdown, to measure finger→frame latency. */
  lastDownTs = 0;

  /**
   * Mouse-friendly stand-ins for the multi-finger gestures: arm the simulation from a
   * button, then click on the table — 1 click for the 3-finger slingshot, 2 clicks
   * (the two fingers) for the boost gate. The normal armed-item rules still apply.
   */
  sim: { kind: 'slingshot' | 'boost'; first?: Vec2 } | null = null;

  /** Active touch slingshot: its three contacts and, once decided, the pulling one. */
  slingIds: number[] | null = null;

  slingContacts: Contact[] | null = null;

  slingReleaseTimer: ReturnType<typeof setTimeout> | null = null;

  bonusKey: string | null = null;

  bonusRecent: Contact[] = [];

  bonusCommitted = false;

  slingPuller: number | null = null;

  /** L’équipe est figée à partir des deux premiers appuis : bleu seulement si les deux sont côté bleu. */
  slingTeam: Team | null = null;

  /** Mouse stand-in: the press (fork) point and the dragging pointer. */
  simSling: { id: number; anchor: Vec2 } | null = null;

  /** Ne produit aucun changement d’interface tant qu’aucun lecteur de simulation n’est branché. */
  onSimChange: (hint: string) => void = () => {};

  /** Branche les contacts du canvas et le renouvellement des entrées pilotes sur la vue et l’envoi de commandes. */
  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly view: View,
    readonly send: Send,
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
  get state(): GameState | null { return this.view.state; }

  /** Expose le bonus armé seulement lorsque la course et les priorités permettent son geste. */
  get expectedBonus(){
    return this.state?.phase==='RACE'&&!this.pendingPlacement?armedPickup(this.state):null;
  }

  /** Retrouve l’annonce de tangible encore valable pendant une phase qui permet sa pose. */
  get pendingPlacement() {
    const s=this.state, p=s?.tangiblePlacement;
    return s?.tangiblePlacementMode==='touch' && p && ['READY','RACE'].includes(s.phase) && p.expiresAt>this.view.now() ? p : null;
  }

  lastLog = { kind: '', at: 0 };

  /** Attribue le nouveau doigt à une commande, un tracé ou un geste libre en respectant les priorités de la partie. */
  onDown(e: PointerEvent): void { contactDown.onDown(this, e); }
  /** Convertit le contact du navigateur en coordonnées de la table indépendamment de la résolution d’affichage. */
  toLogical(e: PointerEvent): Vec2 { return contactRelease.toLogical(this, e); }
  /** Actualise la direction, le tracé, la pose ou la traction correspondant au doigt déplacé. */
  onMove(e: PointerEvent): void { contactRelease.onMove(this, e); }
  /** Relâche la commande ou confirme le geste associé au doigt levé en distinguant une annulation système. */
  onUp(e: PointerEvent): void { contactRelease.onUp(this, e); }
  /** Enregistre les points P1 et P2 puis demande leur validation au serveur. */
  placeDividerPoint(p: Vec2): void { mapDrawing.placeDividerPoint(this, p); }
  /** Retrouve l’équipe autorisée à commencer le tracé sur le point touché. */
  mapStrokeStartTeam(state: GameState, p: Vec2): Team | null { return mapDrawing.mapStrokeStartTeam(this, state, p); }
  /** Convertit la position du doigt sur la bande du pilote en direction normalisée. */
  updateSteer(c: Contact): void { pilotControls.updateSteer(this, c); }
  /** Relâche la direction de l’équipe et efface sa prévisualisation locale. */
  releaseStick(team: Team): void { pilotControls.releaseStick(this, team); }
  /** Relâche la pédale et transmet la nouvelle commande de conduite de l’équipe. */
  releasePedal(team: Team): void { pilotControls.releasePedal(this, team); }
  /** Regroupe la direction et la pédale actuelles pour les envoyer au serveur. */
  sendCurrentInput(team: Team, force?: boolean): void { pilotControls.sendCurrentInput(this, team, force); }
  /** Renouvelle les commandes des doigts encore maintenus pour éviter leur expiration côté serveur. */
  streamInputs(): void { pilotControls.streamInputs(this); }
  /** Compte les doigts d’un même bouton de réparation et envoie seulement le début réel de l’appui. */
  padDown(key: string, team: Team, role: Role, id: number): void { pilotControls.padDown(this, key, team, role, id); }
  /** Relâche le bouton de réparation seulement lorsque son dernier doigt est retiré. */
  padUp(key: string, id: number): void { pilotControls.padUp(this, key, id); }
  /** Relâche toutes les commandes et efface les gestes locaux lors d’une interruption ou d’un changement d’écran. */
  releaseAll(): void { pilotControls.releaseAll(this); }
  /** Mémorise un contact récent pour accepter les gestes dont les doigts arrivent légèrement décalés. */
  rememberBonusContact(c:Contact): void { bonusEvaluation.rememberBonusContact(this, c); }
  /** Annule les gestes devenus périmés lorsqu’un bonus, une annonce ou une phase change. */
  syncState(): void { bonusEvaluation.syncState(this); }
  /** Repousse l’examen des contacts pour laisser aux autres doigts le temps de se poser. */
  scheduleEvaluation(): void { bonusEvaluation.scheduleEvaluation(this); }
  /** Vérifie que le geste demandé correspond au bonus partagé actuellement armé. */
  armedTeam(kind: 'slingshot' | 'boost', at: Vec2): Team | null { return bonusEvaluation.armedTeam(this, kind, at); }
  /** Identifie les deux appuis fixes et le doigt mobile puis actualise la trajectoire du lance-pierre. */
  updateSling(): void { slingGesture.updateSling(this); }
  /** Envoie le tir lorsque le doigt qui tient la poche est relâché avec une traction suffisante. */
  releaseSling(cancelled: boolean): void { slingGesture.releaseSling(this, cancelled); }
  /** Ajoute une décision de reconnaissance au journal local de diagnostic. */
  log(kind: string, detail: Record<string, number | string | boolean>): void { slingGesture.log(this, kind, detail); }
  /** Abandonne la traction et ses confirmations différées sans consommer de bonus. */
  cancelSling(): void { slingGesture.cancelSling(this); }
  /** Associe deux contacts au même bord visible de piste avant de démarrer la traction. */
  tryBorderPull(c: Contact): void { borderPullGesture.tryBorderPull(this, c); }
  /** Actualise la déformation maintenue et signale la fin du geste au serveur. */
  streamBorderPull(end:boolean): void { borderPullGesture.streamBorderPull(this, end); }
  /** Envoie une seule confirmation de pose après validation des deux contacts. */
  sendTangiblePlacement(a: Vec2, b: Vec2): void { placementTouch.sendTangiblePlacement(this, a, b); }
  /** Regroupe les contacts récents du tangible et programme la confirmation si la prise est suffisamment stable. */
  updateTangibleContacts(): void { placementTouch.updateTangibleContacts(this); }
  /** Choisit le geste de test à reproduire avec une souris lorsque les outils de développement sont actifs. */
  simulate(kind: 'slingshot' | 'boost' | null): void { mouseSimulation.simulate(this, kind); }
  /** Accumule les deux clics servant de contacts à une zone d’accélération simulée. */
  simClick(p: Vec2): void { mouseSimulation.simClick(this, p); }
  /** Construit la fourche et la poche virtuelles pendant la traction à la souris. */
  updateSimSling(c: Contact): void { mouseSimulation.updateSimSling(this, c); }
  /** Valide la traction simulée puis envoie le même message qu’un geste tactile. */
  releaseSimSling(c: Contact): void { mouseSimulation.releaseSimSling(this, c); }
}
