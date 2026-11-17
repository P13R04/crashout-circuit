/** Commandes simples de réparation, armement et pose du copilote. */
import type { GameState, SeatId } from '../../server/types.js';
import { playerTeam } from '../../client-shared/seatLabels.js';
import { mobileLesson } from '../../client-shared/tutorialLessons.js';
import { createControls } from '../../client-shared/controls.js';
import { armedPickup } from '../../server/rules/armedPickup.js';
import { actionButton, holdButton } from '../ui/press.js';
import type { PhoneSession } from '../session.js';
import { TangibleCards } from './TangibleCards.js';

export class CopilotScreen {
  readonly root = document.createElement('section');
  private readonly stock = document.createElement('p');
  private readonly lesson = document.createElement('p');
  private readonly progress = document.createElement('progress');
  private readonly power;
  private readonly repair;
  private readonly tangibles;
  private ready = false;

  constructor(private readonly session: PhoneSession, private readonly seat: SeatId) {
    this.root.className = 'copilot-screen';
    const team = playerTeam(seat);
    const controls = createControls(msg => session.send(msg));
    this.power = actionButton('Armer le bonus', () => controls.power(team), 'primary power');
    this.repair = holdButton('Maintenir pour réparer', on => session.send({ type: 'PadHold', on, team, role: 'copilot' }));
    this.stock.setAttribute('role', 'status');
    this.lesson.setAttribute('role', 'status');
    this.lesson.className = 'tutorial-lesson';
    this.progress.max = 1;
    this.progress.setAttribute('aria-label', 'Progression de la réparation');
    this.tangibles = new TangibleCards(session, seat);
    this.root.append(this.lesson, this.stock, this.power, this.repair.button, this.progress, this.tangibles.root);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.repair.release);
  }

  /** Actualise les commandes et les retours sans perdre un appui maintenu. */
  update(state: GameState): void {
    const team = playerTeam(this.seat);
    const car = state.cars[team];
    const canPlay = this.session.canPlay && state.phase === 'RACE' && !document.hidden;
    const armed = armedPickup(state);
    const ready = canPlay && !!car.heldItem && !armed && !state.tangiblePlacement;
    if (ready && !this.ready) navigator.vibrate?.(45);
    this.ready = ready;
    this.power.disabled = !ready;
    const item = car.heldItem === 'boost' ? '⚡ Boost' : car.heldItem === 'slingshot' ? '◈ Lance-pierre' : 'Réserve vide';
    const lesson = mobileLesson(state, team, 'copilot');
    if (lesson !== this.lesson.textContent) this.lesson.textContent = lesson;
    this.lesson.hidden = !lesson;
    const info = state.phase === 'PAUSED' ? 'Partie en pause.'
      : car.itemArmed ? `${item} armé · Réalise le geste sur la table.`
      : armed ? `${item} · Un bonus est déjà armé.` : item;
    if (info !== this.stock.textContent) this.stock.textContent = info;
    this.repair.button.disabled = !canPlay;
    if (!canPlay) this.repair.release();
    this.progress.value = state.repairProgress[team];
    this.tangibles.update(state, canPlay);
  }

  /** Relâche la réparation et retire l'écran à la fin de la course. */
  close(): void {
    this.repair.release();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.repair.release);
    this.root.remove();
  }

  /** Relâche la réparation en arrière-plan et rétablit les commandes au retour. */
  private onVisibility = (): void => { if (this.session.state) this.update(this.session.state); };
}
