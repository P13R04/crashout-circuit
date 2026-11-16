/** Affiche les commandes tactiles du pilote et le départ de l'essai local. */
import type { GameState } from '../../server/types.js';
import { actionButton, holdButton } from '../ui/press.js';
import type { PhoneSession } from '../session.js';

export class SoloScreen {
  readonly root = document.createElement('section');
  private readonly status = document.createElement('p');
  private readonly start;
  private readonly steering = document.createElement('div');
  private readonly left;
  private readonly right;
  private leftHeld = false;
  private rightHeld = false;
  private active = false;
  private readonly timer: number;

  constructor(private readonly session: PhoneSession) {
    this.root.className = 'solo-screen';
    this.steering.className = 'solo-steering';
    this.status.setAttribute('role', 'status');
    this.start = actionButton('Lancer la course', () => session.send({ type: 'StartSolo' }), 'primary');
    this.left = holdButton('← Gauche', held => { this.leftHeld = held; this.sendInput(); });
    this.right = holdButton('Droite →', held => { this.rightHeld = held; this.sendInput(); });
    this.steering.append(this.left.button, this.right.button);
    this.root.append(this.status, this.steering, this.start);
    this.timer = window.setInterval(() => this.sendInput(), 100);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.stop);
  }

  /** Suit la phase de course sans recréer une commande maintenue. */
  update(state: GameState): void {
    const remaining = Math.max(0, Math.ceil((state.sessionStartAt - this.session.sync.now()) / 1000));
    const live = state.phase === 'RACE', disabled = state.cars.A.disabled;
    const active = this.session.canPlay && live && !remaining && !disabled && !document.hidden;
    if (this.active && !active) this.stop();
    this.active = active;
    this.steering.hidden = !live || disabled;
    this.left.button.disabled = this.right.button.disabled = !active;
    this.start.disabled = !this.session.canPlay;
    const label = state.phase === 'LOBBY' ? 'Lancer la course' : 'Recommencer';
    if (this.start.textContent !== label) this.start.textContent = label;
    const hint = state.phase === 'PAUSED' ? 'Course en pause sur la table.'
      : state.phase === 'RESULT' ? 'Essai terminé.'
      : !live ? 'Regarde le circuit sur la table.'
      : disabled ? 'Sortie de piste. Tu peux recommencer.'
      : remaining ? `Départ dans ${remaining}…`
      : 'Maintiens une flèche pour tourner. La voiture avance seule.';
    if (this.status.textContent !== hint) this.status.textContent = hint;
  }

  /** Libère les commandes lorsque l'écran de test est retiré. */
  close(): void {
    this.stop();
    window.clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.stop);
  }

  /** Renouvelle la direction et l'avance pendant que le pilote regarde la table. */
  private sendInput(): void {
    if (!this.active || document.hidden) return;
    this.session.send({
      type: 'PilotInput', team: 'A', steer: Number(this.rightHeld) - Number(this.leftHeld), throttle: 1,
    });
  }

  /** Neutralise les entrées avant une coupure de visibilité ou un changement de phase. */
  private stop = (): void => {
    const wasActive = this.active;
    this.active = false;
    this.left.release();
    this.right.release();
    if (wasActive) this.session.send({ type: 'PilotInput', team: 'A', steer: 0, throttle: 0 });
  };

  /** Relâche les appuis dès que le téléphone quitte le premier plan. */
  private onVisibility = (): void => {
    if (document.hidden) this.stop();
    else if (this.session.state) this.update(this.session.state);
  };
}
