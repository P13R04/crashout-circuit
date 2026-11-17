/** Affiche l'état et les commandes des objets partagés avec la table. */
import type { GameState, SeatId } from '../../server/types.js';
import { TANGIBLES, type TangibleId } from '../../server/tangibles/tangibles.js';
import { actionButton } from '../ui/press.js';
import type { PhoneSession } from '../session.js';

export class TangibleCards {
  readonly root = document.createElement('section');
  private readonly status = document.createElement('p');
  private readonly countdown = document.createElement('span');
  private readonly cancel;
  private readonly cards;

  constructor(private readonly session: PhoneSession, private readonly seat: SeatId) {
    this.root.className = 'tangible-cards';
    const title = document.createElement('h2');
    title.textContent = 'Objets de la table';
    this.status.setAttribute('role', 'status');
    this.countdown.setAttribute('aria-hidden', 'true');
    this.cancel = actionButton('Annuler la pose', () => this.session.send({ type: 'TangiblePlacementCancel' }));
    this.cards = TANGIBLES.map(def => this.makeCard(def.id, def.name));
    this.root.append(title, this.status, this.countdown, this.cancel, ...this.cards.map(card => card.root));
  }

  /** Affiche la pose et les possibilités d'action selon l'état reçu de la table. */
  update(state: GameState, enabled: boolean): void {
    const pending = state.tangiblePlacement;
    const mine = pending?.by === this.seat;
    const text = mine ? 'Pose en cours. Placez l’objet sur la table avec deux doigts.'
      : pending ? 'Pose en cours sur la table.'
      : state.tangiblePlacementMode === 'manual' ? 'La console Oz utilise la pose manuelle.' : '';
    if (this.status.textContent !== text) this.status.textContent = text;
    this.status.hidden = !text;
    this.cancel.hidden = !mine;
    this.cancel.disabled = !enabled;
    this.countdown.hidden = !mine;
    if (mine && pending) {
      const left = Math.max(0, Math.ceil((pending.expiresAt - this.session.sync.now()) / 1000));
      if (this.countdown.textContent !== `${left} s`) this.countdown.textContent = `${left} s`;
    }
    for (const card of this.cards) {
      const staged = state.tangibles[card.id];
      const placed = staged?.status === 'placed';
      const detail = placed ? staged.active ? 'Posé · actif' : 'Posé · inactif' : 'Dans la réserve';
      if (detail !== card.status.textContent) card.status.textContent = detail;
      card.place.disabled = !enabled || !!pending || state.tangiblePlacementMode !== 'touch';
      card.control.hidden = card.remove.hidden = !placed;
      card.control.disabled = card.remove.disabled = !enabled || pending?.id === card.id;
      const controlLabel = staged?.active ? 'Désactiver' : 'Activer';
      if (card.control.textContent !== controlLabel) card.control.textContent = controlLabel;
    }
  }

  /** Construit une carte d'objet qui garde les contrôles au même endroit. */
  private makeCard(id: TangibleId, name: string) {
    const root = document.createElement('article');
    const label = document.createElement('h3');
    const status = document.createElement('p');
    status.className = 'detail';
    label.textContent = name;
    const place = actionButton('Annoncer la pose', () => this.session.send({ type: 'TangiblePrepare', id }));
    const control = actionButton('Activer', () => {
      const active = this.session.state?.tangibles[id]?.active;
      this.session.send({ type: 'TangibleControl', id, action: active ? 'deactivate' : 'activate' });
    });
    const remove = actionButton('Retirer', () => this.session.send({ type: 'TangibleRemoved', id }));
    place.setAttribute('aria-label', `Annoncer la pose · ${name}`);
    remove.setAttribute('aria-label', `Retirer · ${name}`);
    const actions = document.createElement('div');
    actions.append(place, control, remove);
    root.append(label, status, actions);
    return { root, id, status, place, control, remove };
  }
}
