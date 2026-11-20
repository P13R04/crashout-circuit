/**
 * Gère l'option de place, les intentions sur la carte et les confirmations du serveur.
 * Liens : PlacementMap.ts, PlacementControls.ts, TiltAim.ts.
 */
import type { GameState, RemotePlacementTarget, SeatId } from '../../../server/types.js';
import { armedPickup } from '../../../server/rules/armedPickup.js';
import { prepareRemotePlacement } from '../../../server/rules/gameplay/remotePlacementGeometry.js';
import { actionButton } from '../../ui/press.js';
import type { PhoneSession } from '../../session.js';
import { PlacementMap, type MapGesture } from './PlacementMap.js';
import { PlacementControls, type PlacementTool } from './PlacementControls.js';
import { boostWidth, pointAlong, trackPercent, transverseAngle, wrapDegrees } from './placementInput.js';
import { TiltAim } from './TiltAim.js';
import { aimBearing, PlacementGesture } from './PlacementGesture.js';
import { describePreview, REASONS } from './placementStatus.js';

export class AccessiblePlacement {
  readonly root = document.createElement('section');
  private readonly toggle = document.createElement('input');
  private readonly dialog = document.createElement('dialog');
  private readonly preview = document.createElement('p');
  private readonly response = document.createElement('p');
  private readonly map = new PlacementMap(event => this.onGesture(event), () => this.refresh());
  private readonly tilt = new TiltAim(() => this.onTilt());
  private readonly gesture = new PlacementGesture(this.tilt);
  private readonly openMap = actionButton('Ouvrir la carte', () => this.showMap());
  private readonly confirm = actionButton('Confirmer', () => this.submit(), 'primary placement-confirm');
  private readonly cancel = actionButton('Annuler l’aperçu', () => this.clearDraft());
  private readonly controls = new PlacementControls({
    choose: tool => this.choose(tool),
    along: percent => this.pickAlong(percent, 0),
    offset: delta => this.pickAlong(this.along, this.lateral + delta),
    rotate: delta => {
      if (this.draft) this.edit({ ...this.draft, angle: wrapDegrees(this.draft.angle + delta) });
    },
    width: delta => {
      if (this.draft?.kind === 'boost' && this.state) {
        this.edit({ ...this.draft, width: boostWidth(this.draft.width + delta, this.state.params) });
      }
    },
    power: power => { if (this.draft?.kind === 'slingshot') this.edit({ ...this.draft, power }); },
    tilt: () => void this.tilt.enable(),
  });
  private state: GameState | null = null;
  private enabled = false;
  private draft: RemotePlacementTarget | null = null;
  private pending: { id: number; target: RemotePlacementTarget; restoreFocus: boolean } | null = null;
  private along = 0;
  private lateral = 0;

  constructor(private readonly session: PhoneSession, private readonly seat: SeatId,
    private readonly station: HTMLElement, private readonly stationHome: HTMLElement) {
    this.root.className = 'accessible-placement';
    this.toggle.type = 'checkbox';
    this.toggle.setAttribute('role', 'switch');
    this.toggle.addEventListener('change', () => this.session.send({ type: 'SetAccessibility', on: this.toggle.checked }));
    const label = document.createElement('label');
    label.className = 'accessibility-switch';
    label.append(this.toggle, 'Mode accessibilité');
    this.dialog.className = 'placement-dialog';
    this.dialog.setAttribute('aria-labelledby', 'placement-title');
    this.dialog.addEventListener('close', () => {
      if (this.dialog.open) return;
      this.stationHome.append(this.station);
      this.clearDraft();
    });
    this.preview.setAttribute('role', 'status');
    this.response.setAttribute('role', 'status');
    this.controls.precision.addEventListener('toggle', () => this.refresh());
    this.buildDialog();
    this.root.append(label, this.openMap, this.dialog);
  }

  /** Synchronise l'option de place et les contrôles avec la course et la connexion. */
  update(state: GameState, connected: boolean): void {
    this.state = state;
    const accessible = state.seats[this.seat]?.accessible === true;
    this.enabled = connected && accessible && state.phase === 'RACE' && !!state.track;
    this.toggle.checked = accessible;
    this.toggle.disabled = !connected;
    this.openMap.hidden = !accessible;
    this.openMap.disabled = !this.enabled;
    if (!accessible) this.close();
    if (!this.enabled) {
      this.map.cancel();
      this.tilt.stop();
    }
    this.receiveResult();
    this.refresh();
  }

  /** Ferme la carte et libère les événements de contact et d'orientation. */
  close(): void {
    this.map.cancel();
    this.tilt.stop();
    if (this.dialog.open) this.dialog.close();
  }

  /** Compose la boîte de dialogue et son ordre de navigation. */
  private buildDialog(): void {
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.id = 'placement-title';
    title.textContent = 'Carte du copilote';
    const close = actionButton('Fermer', () => this.close());
    close.setAttribute('aria-label', 'Fermer la carte');
    header.append(title, close);
    const decision = document.createElement('div');
    decision.className = 'placement-buttons';
    decision.append(this.confirm, this.cancel);
    this.dialog.append(header, this.controls.tools, this.controls.instruction, this.controls.sensor,
      this.map.canvas, this.preview, decision, this.response, this.controls.precision);
  }

  /** Ouvre la carte dans une surface modale et conserve les contrôles du poste à leur place. */
  private showMap(): void {
    if (!this.enabled || this.dialog.open) return;
    this.controls.tools.before(this.station);
    this.dialog.showModal();
    this.refresh();
  }

  /** Crée le brouillon de l'outil choisi avec un repère modifiable sur le circuit. */
  private choose(tool: PlacementTool, announce = true): void {
    const state = this.state, track = state?.track, armed = state && armedPickup(state);
    if (!state || !track || !this.enabled || !this.canUse(tool)) return;
    this.map.cancel();
    const pos = this.draft?.pos ?? pointAlong(track, this.along, this.lateral);
    if (!pos) return;
    if (tool === 'boost' && armed) {
      this.draft = { kind: tool, arm: armed, pos, angle: transverseAngle(track, pos), width: boostWidth(140, state.params) };
    } else if (tool === 'slingshot' && armed) {
      this.draft = { kind: tool, arm: armed, pos, angle: aimBearing(pos, state.params), power: .5 };
      this.controls.precision.open = false;
      void this.tilt.enable();
    } else if (typeof tool === 'number') {
      this.draft = { kind: 'tangible', id: tool, pos, angle: 0 };
    }
    if (announce) this.response.textContent = '';
    this.refresh();
  }

  /** Gère l'appui, le tracé et le relâchement d'un seul contact. */
  private onGesture(event: MapGesture): void {
    if (event.phase === 'cancel') {
      this.draft = this.gesture.cancel() ?? this.draft;
      this.refresh();
      return;
    }
    if (!this.enabled || this.pending || !this.draft || !this.state) return;
    if (event.phase === 'start') {
      if (this.draft.kind === 'slingshot' && this.tilt.status === 'inactive') void this.tilt.enable();
      this.gesture.begin(event.point, this.draft, this.state.params);
      this.response.textContent = '';
    }
    this.draft = this.gesture.project(event.point, this.state.params) ?? this.draft;
    if (event.phase === 'end' && this.gesture.active) {
      const release = this.gesture.release();
      if (release.action === 'short-press') this.draft = release.before;
      this.along = trackPercent(this.state.track!, this.draft.pos);
      this.lateral = 0;
      this.controls.setPosition(this.along);
      if (release.action === 'confirm') this.submit();
      else if (release.action === 'short-press') this.response.textContent = 'Maintenez le doigt sur la carte pour viser.';
      else if (release.action === 'manual-aim') this.response.textContent = 'Inclinaison indisponible. Activez-la ou ouvrez la visée avec les commandes.';
    }
    this.refresh();
  }

  /** Recalcule la trajectoire pendant le maintien. */
  private onTilt(): void {
    if (this.state) this.draft = this.gesture.projectTilt(this.state.params) ?? this.draft;
    this.refresh();
  }

  /** Soumet seulement une action valide et attend sa réponse avant un autre envoi. */
  private submit(): void {
    const target = this.draft, state = this.state;
    if (!state || !target || !this.enabled || this.gesture.active || this.pending) return;
    if ('reason' in prepareRemotePlacement(state, target)) return;
    const id = this.session.requestPlacement(target);
    if (id === null) return;
    this.pending = { id, target, restoreFocus: document.activeElement === this.confirm };
    this.response.textContent = 'Confirmation en cours…';
    this.refresh();
  }

  /** Annonce la réponse privée et passe au second pilier encore en réserve. */
  private receiveResult(): void {
    const pending = this.pending, result = this.session.lastPlacement;
    if (!pending) return;
    if (result?.requestId === pending.id) {
      this.pending = null;
      this.response.textContent = result.ok ? '✓ Action confirmée sur la table.' : `× ${REASONS[result.reason]}`;
      if (result.ok) {
        this.draft = null;
        this.selectNextPillar(pending.target);
      }
      if (pending.restoreFocus && this.dialog.open) {
        this.refresh();
        if (!result.ok && !this.confirm.disabled) this.confirm.focus();
        else this.controls.focusTool(toolOf(this.draft ?? pending.target));
      }
    } else if (!this.session.canPlay) {
      this.pending = null;
      this.response.textContent = 'Connexion interrompue. Vérifiez la table avant de réessayer.';
    }
  }

  /** Prépare l'autre pilier pour une seconde pose directe si celui-ci est encore en réserve. */
  private selectNextPillar(target: RemotePlacementTarget): void {
    if (target.kind !== 'tangible' || target.id === 1 || !this.dialog.open) return;
    const other = target.id === 2 ? 3 : 2;
    if (this.state?.tangibles[other]?.status !== 'placed') this.choose(other, false);
  }

  /** Efface la visée et remet à zéro une prise interrompue. */
  private clearDraft(): void {
    this.map.cancel();
    this.gesture.cancel();
    this.draft = null;
    if (!this.dialog.open) this.tilt.stop();
    this.refresh();
  }

  /** Filtre les outils selon la pose physique en cours et le stock armé. */
  private canUse(tool: PlacementTool): boolean {
    const state = this.state;
    if (!state || state.tangiblePlacement) return false;
    return typeof tool === 'number' ? state.tangiblePlacementMode === 'touch' : armedPickup(state)?.kind === tool;
  }

  /** Déplace la visée avec le curseur et les réglages latéraux. */
  private pickAlong(percent: number, offset: number): void {
    const draft = this.draft, track = this.state?.track;
    if (!draft || !track) return;
    const pos = pointAlong(track, percent, offset);
    if (!pos) return;
    this.along = percent;
    this.lateral = offset;
    const angle = draft.kind === 'boost' ? transverseAngle(track, pos) : draft.angle;
    this.edit({ ...draft, pos, angle });
  }

  /** Actualise le brouillon depuis une commande qui n'exige aucun geste maintenu. */
  private edit(target: RemotePlacementTarget): void {
    if (!this.enabled || this.gesture.active || this.pending) return;
    this.draft = target;
    this.response.textContent = '';
    this.refresh();
  }

  /** Affiche le plan, les réglages disponibles et la raison d'un refus éventuel. */
  private refresh(): void {
    const state = this.state;
    if (!this.dialog.open || !state) return;
    const target = this.draft, held = this.gesture.active, ready = this.enabled && !this.pending && !held;
    const tool = target && toolOf(target);
    const preview = target && prepareRemotePlacement(state, target);
    const message = !this.session.canPlay ? 'Connexion interrompue. Reconnexion en cours…'
      : !this.enabled ? REASONS.phase
      : target && preview ? describePreview(state, target, preview, held) : 'Choisissez un objet ou un bonus armé.';
    if (message !== this.preview.textContent) this.preview.textContent = message;
    this.controls.update(tool, target, ready, id => this.canUse(id));
    this.controls.updateTilt(this.tilt.status, this.session.secureJoinUrl, ready);
    this.confirm.hidden = !target || (target.kind === 'slingshot' && !this.controls.precision.open);
    this.cancel.hidden = !target;
    this.confirm.disabled = !ready || !preview || 'reason' in preview;
    this.cancel.disabled = !!this.pending;
    this.map.draw(state, target, preview, this.session.sync.now());
  }
}

/** Identifie le bouton correspondant au brouillon courant. */
function toolOf(target: RemotePlacementTarget): PlacementTool {
  return target.kind === 'tangible' ? target.id : target.kind;
}
