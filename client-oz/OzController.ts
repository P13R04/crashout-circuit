/**
 * Suit les modifications locales des tangibles, leur confirmation par le serveur et les annulations de la
 * console.
 * Liens : server/layout.ts, server/types.ts, server/tangibles.ts, client-shared/tangibleGeometry.ts.
 * Référencé par client-oz/main.ts, scripts/acceptance.ts, scripts/public-session.ts.
 */
import type { GameState, Tangible, Team } from '../server/types.js';
import { tangibleArc, tangibleDefinition, validTangiblePose, type TangibleId } from '../server/tangibles.js';
import { type TangiblePose } from '../client-shared/tangibleGeometry.js';
import { depotPose, inTangibleDepot } from '../server/layout.js';

/** Conserve la pose d’un tangible avant une modification ou signale son absence. */
type Snapshot = Tangible | undefined;
/** Associe l’objet modifié à la pose à restaurer lors d’une annulation. */
interface Edit { id: TangibleId; before: Snapshot }
/** Copie une pose pour conserver un état indépendant des prochaines modifications. */
const clone = (t: Snapshot): Snapshot => t && { ...t };
/** Compare les champs utiles de deux tangibles pour reconnaître une confirmation du serveur. */
const equal = (a: Snapshot, b: Snapshot) => a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.angle === b.angle && a.active === b.active && a.status === b.status && a.dockTeam === b.dockTeam);

/** Suit les modifications locales des tangibles, leur confirmation par le serveur et les annulations de la console. */
export class OzController {
  state: GameState | null = null;
  selectedId: TangibleId = 1;
  preparing = false;
  draftAngle = 0;
  notice = '';
  connected = false;
  private synchronized = false;
  private history: Edit[] = [];
  private pending = new Map<TangibleId, { value: Snapshot; at: number }>();
  private authoritative: GameState | null = null;
  private grouping = false;
  private groupRecorded = false;
  private firstPylonPlaced = false;

  /** Conserve l’envoi de commandes, la notification de changement et l’horloge locale du contrôleur. */
  constructor(private send: (type: string, params: Record<string, unknown>) => boolean,
    private changed: () => void = /* Ne déclenche aucune notification tant qu’aucun observateur n’est fourni au contrôleur. */ () => {}, private now = /* Fournit l’horloge locale utilisée pour borner l’attente des confirmations. */ () => performance.now()) {}

  /** Autorise les commandes seulement après synchronisation d’une connexion pendant une phase qui possède un circuit. */
  get enabled(): boolean { return this.connected && this.synchronized && !!this.state && ['READY', 'RACE', 'PAUSED'].includes(this.state.phase); }
  /** Indique si une modification locale peut encore être annulée. */
  get canUndo(): boolean { return this.history.length > 0; }

  /** Actualise la connexion et supprime les gestes ou modifications en attente lors d’une coupure. */
  setConnected(connected: boolean): void {
    this.connected = connected;
    this.synchronized = false;
    if (!connected) {
      this.preparing = false; this.pending.clear(); this.history = []; this.endGesture();
      if (this.authoritative) this.state = this.authoritative;
    }
    this.changed();
  }

  /** Réconcilie les modifications locales avec l’état reçu et réinitialise la sélection au retour aux menus. */
  applyState(state: GameState): void {
    this.synchronized = true;
    if (state.phase === 'LOBBY' || state.phase === 'MAP') {
      this.pending.clear(); this.history = []; this.preparing = false; this.firstPylonPlaced = false; this.endGesture();
      this.selectedId = 1; this.draftAngle = 0; this.notice = '';
    }
    this.authoritative = state;
    for (const [id, p] of this.pending) {
      if (equal(state.tangibles[id], p.value)) this.pending.delete(id);
      else if (this.now() - p.at > 1500) {
        this.pending.delete(id); this.history = [];
        this.notice = 'Position resynchronisée avec la table. Vérifiez l’objet.';
      }
    }
    this.project();
    if (state.tangibles[2]?.status === 'placed') this.firstPylonPlaced = true;
    if (!this.enabled) { this.preparing = false; this.endGesture(); }
    this.changed();
  }

  /** Superpose les modifications locales aux poses confirmées pour garder un aperçu réactif. */
  private project(): void {
    if (!this.authoritative) return;
    const tangibles = { ...this.authoritative.tangibles };
    for (const [id, p] of this.pending) {
      if (p.value) tangibles[id] = p.value;
      else delete tangibles[id];
    }
    const arc = tangibleArc(tangibles, this.authoritative.params);
    this.state = { ...this.authoritative, tangibles,
      arcs: arc ? [{ ...arc, disabledUntil: this.authoritative.arcs.find(/* Retrouve l’ancienne désactivation de l’arc pour la conserver dans l’aperçu local. */ a => a.id === arc.id)?.disabledUntil ?? 0 }] : [] };
  }

  /** Sélectionne un tangible à poser et initialise son angle de prévisualisation. */
  prepare(id: TangibleId): void {
    if (!this.enabled) return;
    this.endGesture(); this.selectedId = id;
    this.preparing = true;
    this.draftAngle = this.state?.tangibles[id]?.angle ?? 0;
    this.notice = ''; this.changed();
  }
  /** Choisit l’objet manipulé sans engager une nouvelle préparation de pose. */
  select(id: TangibleId): void {
    this.selectedId = id; this.preparing = false; this.notice = ""; this.changed();
  }
  /** Annule la préparation locale et termine le regroupement du geste. */
  cancelPreparation(): void { this.preparing = false; this.endGesture(); this.changed(); }
  /** Regroupe les modifications continues du geste dans une seule entrée d’annulation. */
  beginGesture(): void { this.grouping = true; this.groupRecorded = false; }
  /** Termine le regroupement des modifications du geste courant. */
  endGesture(): void { this.grouping = false; this.groupRecorded = false; }

  /** Valide la pose, l’envoie au serveur et conserve un aperçu local jusqu’à confirmation. */
  private edit(id: TangibleId, pose: TangiblePose, active: boolean, record = true): boolean {
    const definition = tangibleDefinition(id);
    if (!this.enabled || !this.state || !definition) return false;
    const before = this.state.tangibles[id];
    if (!validTangiblePose(definition.kind, pose, this.state.params)) {
      this.notice = 'Gardez l’objet hors des postes joueurs et des bords.';
      this.changed(); return false;
    }
    const parked=inTangibleDepot({x:pose.x*this.state.params.logicalWidth,y:pose.y*this.state.params.logicalHeight});
    const value: Tangible = { ...pose, angle: ((pose.angle % 360) + 360) % 360,
      active:parked?false:active, kind: definition.kind, team: null, dockTeam: null, status: parked?'parked':'placed',
      placementOrigin: { ...pose } };
    if (equal(before, value)) { this.notice = ''; this.changed(); return true; }
    if (!this.send('TangibleMoved', { id, x: value.x, y: value.y, angle: value.angle, active })) return false;
    if (record && (!this.grouping || !this.groupRecorded)) {
      this.history.push({ id, before: before?.status !== 'placed' ? undefined : clone(before) });
      if (this.history.length > 100) this.history.shift();
      if (this.grouping) this.groupRecorded = true;
    }
    this.pending.set(id, { value, at: this.now() }); this.project();
    this.notice = ''; this.changed(); return true;
  }

  /** Confirme l’objet préparé et propose le second pilier lors de la première pose de paire. */
  place(pose: TangiblePose): boolean {
    if (!this.preparing) return false;
    const id = this.selectedId, first = id === 2 && !this.firstPylonPlaced;
    if (!this.edit(id, pose, true)) return false;
    this.preparing = false;
    if (id === 2) this.firstPylonPlaced = true;
    if (first && this.state?.tangibles[3]?.status === 'parked') this.prepare(3);
    this.changed(); return true;
  }

  /** Déplace l’objet en conservant son activation si sa pose précédente était déjà sur la piste. */
  move(id: TangibleId, pose: TangiblePose): boolean {
    return this.edit(id, pose, this.state?.tangibles[id]?.status==='placed' ? this.state.tangibles[id].active : true);
  }
  /** Tourne le mur sélectionné en conservant son centre ou l’angle de sa préparation. */
  rotate(degrees: number): void {
    if (!this.enabled || this.selectedId !== 1) return;
    if (this.preparing) {
      this.draftAngle = (this.draftAngle + degrees + 360) % 360; this.changed(); return;
    }
    const t = this.state?.tangibles[1];
    if (t?.status === 'placed') this.edit(1, { ...t, angle: t.angle + degrees }, t.active);
  }
  /** Range l’objet sélectionné dans la réserve neutre. */
  dock(team: Team): void {
    if (!this.enabled || !this.state) return;
    const id = this.selectedId, kind = tangibleDefinition(id)!.kind;
    if (!this.send('TangibleControl', { id, action: 'dock', team })) return;
    const value: Tangible = {...depotPose(id),kind,team:null,dockTeam:null,status:'parked',active:false};
    this.preparing = false; this.endGesture(); this.history = [];
    this.pending.set(id, { value, at: this.now() }); this.project(); this.notice = ''; this.changed();
  }
  /** Signale le retrait ou la remise en place d’un objet sans redéfinir son type. */
  presence(active?: boolean): void {
    if (!this.enabled) return;
    this.preparing = false; this.endGesture();
    const id = this.selectedId, t = this.state?.tangibles[id];
    if (!t || t.status!=='placed') { this.notice = 'Posez d’abord cet objet.'; this.changed(); return; }
    const on = active ?? !t.active;
    if (!this.send('TangibleControl', { id, action: on ? 'activate' : 'deactivate' })) return;
    if (t.status === 'placed') {
      this.history.push({ id, before: clone(t) });
      if (this.history.length > 100) this.history.shift();
    }
    this.pending.set(id, { value: { ...t, active: on }, at: this.now() }); this.project();
    this.notice = ''; this.changed();
  }
  /** Rétablit la pose enregistrée avant la dernière modification regroupée. */
  undo(): void {
    if (!this.enabled) return;
    this.preparing = false; this.endGesture();
    const last = this.history[this.history.length - 1];
    if (!last) return;
    if (last.before) {
      if (!this.edit(last.id, last.before, last.before.active, false)) return;
    } else {
      if (!this.send('TangibleRemoved', { id: last.id })) return;
      this.pending.set(last.id, { value: {...depotPose(last.id),kind:tangibleDefinition(last.id)!.kind,team:null,dockTeam:null,status:'parked',active:false}, at: this.now() }); this.project();
    }
    this.history.pop(); this.selectedId = last.id; this.notice = 'Dernière manipulation annulée.'; this.changed();
  }
}

/** Interprète les chiffres, l’annulation et les raccourcis de manipulation sans prendre les commandes du navigateur. */
export function ozShortcut(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  if (e.altKey || e.metaKey) return null;
  if (e.ctrlKey) return e.key.toLowerCase() === 'z' && !e.shiftKey ? 'undo' : null;
  if (e.code === 'Digit1' || e.code === 'Numpad1' || e.key==='1' || e.key==='&') return 'wall';
  if (e.code === 'Digit2' || e.code === 'Numpad2' || e.key==='2' || e.key==='é') return 'pylon1';
  if (e.code === 'Digit3' || e.code === 'Numpad3' || e.key==='3' || e.key==='"') return 'pylon2';
  return ({ r: 'view', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'presence', Delete: 'remove', Escape: 'cancel' } as Record<string, string>)[e.key.length === 1 ? e.key.toLowerCase() : e.key] ?? null;
}
