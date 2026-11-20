/**
 * Affiche les objets partagés et leurs commandes après la pose sur la table.
 * Liens : CopilotAction.ts, server/tangibles/tangibles.ts.
 */
import type { GameState } from '../../server/types.js';
import { TANGIBLES, type TangibleId } from '../../server/tangibles/tangibles.js';
import { actionButton } from '../ui/press.js';
import type { PhoneSession } from '../session.js';
import type { CopilotAction } from './CopilotAction.js';

export class TangibleCards {
  readonly root = document.createElement('section');
  private readonly cards;

  constructor(private readonly session: PhoneSession, private readonly action: CopilotAction) {
    this.root.className = 'tangible-cards';
    const title = document.createElement('h2');
    title.textContent = 'Objets de la table';
    this.cards = TANGIBLES.map(def => this.makeCard(def.id, def.kind === 'wall' ? def.name : `Pilier ${def.id - 1}`));
    this.root.append(title, ...this.cards.map(card => card.root));
  }

  /** Affiche la pose et les possibilités d'action selon l'état reçu de la table. */
  update(state: GameState, enabled: boolean): void {
    const pending = state.tangiblePlacement;
    const canCommand = enabled && !this.action.waiting;
    for (const card of this.cards) {
      const staged = state.tangibles[card.id];
      const placed = staged?.status === 'placed';
      const detail = placed ? staged.active ? 'Posé · actif' : 'Posé · inactif' : 'Dans la réserve';
      if (detail !== card.status.textContent) card.status.textContent = detail;
      card.control.hidden = card.remove.hidden = !placed;
      card.control.disabled = card.remove.disabled = !canCommand || pending?.id === card.id;
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
    const control = actionButton('Activer', () => {
      const active = !this.session.state?.tangibles[id]?.active;
      this.action.run(() => this.session.send({ type: 'TangibleControl', id, action: active ? 'activate' : 'deactivate' }),
        state => state.tangibles[id]?.status === 'placed' && state.tangibles[id].active === active);
    });
    const remove = actionButton('Retirer', () => {
      this.action.run(() => this.session.send({ type: 'TangibleRemoved', id }),
        state => state.tangibles[id]?.status === 'parked');
    });
    remove.setAttribute('aria-label', `Retirer · ${name}`);
    const actions = document.createElement('div');
    actions.append(control, remove);
    root.append(label, status, actions);
    return { root, id, status, control, remove };
  }
}
