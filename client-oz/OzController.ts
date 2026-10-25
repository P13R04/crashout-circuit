import type { GameState, Tangible } from '../server/types.js';
import { tangibleArc, tangibleDefinition, validTangiblePose, type TangibleId } from '../server/tangibles.js';
import type { TangiblePose } from '../client-shared/tangibleGeometry.js';

type Snapshot = Tangible | undefined;
interface Edit { id: TangibleId; before: Snapshot }
const clone = (t: Snapshot): Snapshot => t && { ...t };
const equal = (a: Snapshot, b: Snapshot) => a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.angle === b.angle && a.active === b.active);

/** Operator commands, optimistic state and undo, independent of the DOM. */
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

  constructor(private send: (type: string, params: Record<string, unknown>) => boolean,
    private changed: () => void = () => {}, private now = () => performance.now()) {}

  get enabled(): boolean { return this.connected && this.synchronized && !!this.state && ['READY', 'RACE', 'PAUSED'].includes(this.state.phase); }
  get canUndo(): boolean { return this.history.length > 0; }

  setConnected(connected: boolean): void {
    this.connected = connected;
    this.synchronized = false;
    if (!connected) {
      this.preparing = false; this.pending.clear(); this.history = []; this.endGesture();
      if (this.authoritative) this.state = this.authoritative;
    }
    this.changed();
  }

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
    if (state.tangibles[2]) this.firstPylonPlaced = true;
    if (!this.enabled) { this.preparing = false; this.endGesture(); }
    this.changed();
  }

  private project(): void {
    if (!this.authoritative) return;
    const tangibles = { ...this.authoritative.tangibles };
    for (const [id, p] of this.pending) {
      if (p.value) tangibles[id] = p.value;
      else delete tangibles[id];
    }
    const arc = tangibleArc(tangibles, this.authoritative.params);
    this.state = { ...this.authoritative, tangibles,
      arcs: arc ? [{ ...arc, disabledUntil: this.authoritative.arcs.find(a => a.id === arc.id)?.disabledUntil ?? 0 }] : [] };
  }

  prepare(id: TangibleId): void {
    if (!this.enabled) return;
    this.endGesture(); this.selectedId = id; this.preparing = true;
    this.draftAngle = this.state?.tangibles[id]?.angle ?? 0;
    this.notice = ''; this.changed();
  }
  select(id: TangibleId): void {
    this.selectedId = id; this.preparing = false; this.changed();
  }
  cancelPreparation(): void { this.preparing = false; this.endGesture(); this.changed(); }
  beginGesture(): void { this.grouping = true; this.groupRecorded = false; }
  endGesture(): void { this.grouping = false; this.groupRecorded = false; }

  private edit(id: TangibleId, pose: TangiblePose, active: boolean, record = true): boolean {
    const definition = tangibleDefinition(id);
    if (!this.enabled || !this.state || !definition) return false;
    if (!validTangiblePose(definition.kind, pose, this.state.params)) {
      this.notice = 'Position impossible : gardez tout l’objet dans la surface de jeu, hors des postes joueurs.';
      this.changed(); return false;
    }
    const value: Tangible = { ...pose, angle: ((pose.angle % 360) + 360) % 360,
      active, kind: definition.kind, team: null, dockTeam: null, status: 'placed' };
    const before = this.state.tangibles[id];
    if (equal(before, value)) { this.notice = ''; this.changed(); return true; }
    if (!this.send('TangibleMoved', { id, x: value.x, y: value.y, angle: value.angle, active })) return false;
    if (record && (!this.grouping || !this.groupRecorded)) {
      this.history.push({ id, before: clone(before) });
      if (this.history.length > 100) this.history.shift();
      if (this.grouping) this.groupRecorded = true;
    }
    this.pending.set(id, { value, at: this.now() }); this.project();
    this.notice = ''; this.changed(); return true;
  }

  place(pose: TangiblePose): boolean {
    if (!this.preparing) return false;
    const id = this.selectedId, first = id === 2 && !this.firstPylonPlaced;
    if (!this.edit(id, pose, true)) return false;
    this.preparing = false;
    if (id === 2) this.firstPylonPlaced = true;
    if (first && !this.state?.tangibles[3]?.active) this.prepare(3);
    this.changed(); return true;
  }

  move(id: TangibleId, pose: TangiblePose): boolean {
    return this.edit(id, pose, this.state?.tangibles[id]?.active ?? false);
  }
  rotate(degrees: number): void {
    if (!this.enabled || this.selectedId !== 1) return;
    if (this.preparing) {
      this.draftAngle = (this.draftAngle + degrees + 360) % 360; this.changed(); return;
    }
    const t = this.state?.tangibles[1];
    if (t?.active) this.edit(1, { ...t, angle: t.angle + degrees }, true);
  }
  presence(active?: boolean): void {
    if (!this.enabled) return;
    this.preparing = false; this.endGesture();
    const t = this.state?.tangibles[this.selectedId];
    if (!t) { this.notice = 'Préparez l’objet avec son raccourci, puis cliquez sur la carte.'; this.changed(); return; }
    this.edit(this.selectedId, t, active ?? !t.active);
  }
  undo(): void {
    if (!this.enabled) return;
    this.preparing = false; this.endGesture();
    const last = this.history[this.history.length - 1];
    if (!last) return;
    if (last.before) {
      if (!this.edit(last.id, last.before, last.before.active, false)) return;
    } else {
      if (!this.send('TangibleRemoved', { id: last.id })) return;
      this.pending.set(last.id, { value: undefined, at: this.now() }); this.project();
    }
    this.history.pop(); this.selectedId = last.id; this.notice = 'Dernière manipulation annulée.'; this.changed();
  }
}

/** Physical number keys also work unshifted on AZERTY. */
export function ozShortcut(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  if (e.altKey || e.metaKey) return null;
  if (e.ctrlKey) return e.key.toLowerCase() === 'z' && !e.shiftKey ? 'undo' : null;
  if (e.code === 'Digit1' || e.code === 'Numpad1') return 'pylon1';
  if (e.code === 'Digit2' || e.code === 'Numpad2') return 'pylon2';
  return ({ m: 'wall', r: 'view', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'presence', Delete: 'remove', Escape: 'cancel' } as Record<string, string>)[e.key.length === 1 ? e.key.toLowerCase() : e.key] ?? null;
}
