/**
 * Affiche le stock, signale les ramassages et relie les commandes du copilote à sa place.
 * Liens : CopilotAction.ts, TangibleCards.ts, client-phone/main.ts.
 */
import type { Car, GameState, ItemKind, SeatId, Team } from '../../server/types.js';
import { PAD_LOCAL_COPILOT, POWER_BTN_LOCAL } from '../../server/layout.js';
import { playerTeam } from '../../client-shared/seatLabels.js';
import { mobileLesson } from '../../client-shared/tutorialLessons.js';
import { createControls } from '../../client-shared/controls.js';
import { drawPowerControl, drawRepairControl, powerInk, STATION_TEAM_COLOR } from '../../client-shared/ui/stationControls.js';
import { armedPickup } from '../../server/rules/armedPickup.js';
import { actionButton, holdButton } from '../ui/press.js';
import type { PhoneSession } from '../session.js';
import { CopilotAction } from './CopilotAction.js';
import { stationButton } from './stationButton.js';
import { TangibleCards } from './TangibleCards.js';
import { requestVibration } from './pickupVibration.js';
import { AccessiblePlacement } from './placement/AccessiblePlacement.js';

const ITEM_LABEL = { boost: '⚡ Boost', slingshot: '◈ Lance-pierre' } as const;
const PICKUP_ALERT_MS = 2_000;
const PICKUP_VIBRATION_MS = 150;

export class CopilotScreen {
  readonly root = document.createElement('section');
  private readonly stock = document.createElement('p');
  private readonly pickupAlert = document.createElement('p');
  private readonly actionStatus = document.createElement('p');
  private readonly lesson = document.createElement('p');
  private readonly progress = document.createElement('progress');
  private readonly action = new CopilotAction(() => this.refresh());
  private readonly power;
  private readonly drawPower;
  private readonly repair;
  private readonly drawRepair;
  private readonly tangibles;
  private readonly placement;
  private pickupTimeout: ReturnType<typeof setTimeout> | undefined;
  private visibleSince = -Infinity;
  private followingPickups = false;
  private lastPickupAt?: number;
  private repairHeld = false;

  constructor(private readonly session: PhoneSession, private readonly seat: SeatId) {
    this.root.className = 'copilot-screen';
    const team = playerTeam(seat);
    const controls = createControls(msg => session.send(msg));
    this.power = actionButton('POWER · Armer le bonus', () => {
      const previousVersion = this.session.state?.cars[team].itemArmVersion;
      if (previousVersion !== undefined) {
        this.action.run(() => controls.power(team), state => state.cars[team].itemArmVersion > previousVersion);
      }
    }, 'power');
    this.drawPower = stationButton(this.power, POWER_BTN_LOCAL.r);
    this.power.setAttribute('aria-describedby', 'copilot-stock');
    this.repair = holdButton('Maintenir pour réparer', on => {
      this.repairHeld = on;
      session.send({ type: 'PadHold', on, team, role: 'copilot' });
    });
    this.drawRepair = stationButton(this.repair.button, PAD_LOCAL_COPILOT.r);
    this.stock.id = 'copilot-stock';
    this.stock.setAttribute('role', 'status');
    this.pickupAlert.className = 'pickup-alert';
    this.pickupAlert.setAttribute('role', 'status');
    this.actionStatus.className = 'copilot-action';
    this.actionStatus.setAttribute('role', 'status');
    this.lesson.setAttribute('role', 'status');
    this.lesson.className = 'tutorial-lesson';
    this.progress.className = 'copilot-repair-progress';
    this.progress.max = 1;
    this.progress.setAttribute('aria-label', 'Progression de la réparation');
    this.tangibles = new TangibleCards(session, this.action);
    const buttons = document.createElement('div');
    buttons.className = 'copilot-controls';
    buttons.append(this.power, this.repair.button);
    const station = document.createElement('div'), stationHome = document.createElement('div');
    station.className = 'copilot-station';
    station.append(buttons, this.stock, this.pickupAlert, this.actionStatus, this.progress);
    stationHome.append(station);
    this.placement = new AccessiblePlacement(session, seat, station, stationHome);
    this.root.append(this.lesson, stationHome, this.placement.root, this.tangibles.root);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.suspend);
  }

  /** Actualise les commandes et les retours sans perdre un appui maintenu. */
  update(state: GameState): void {
    const team = playerTeam(this.seat);
    const car = state.cars[team];
    const canPlay = this.isActive() && state.phase === 'RACE';
    this.action.update(state, canPlay);
    const armed = armedPickup(state);
    const powerBlocked = !canPlay || !!armed || !!state.tangiblePlacement || this.action.waiting;
    this.power.disabled = !car.heldItem || powerBlocked;
    const item = car.heldItem ? ITEM_LABEL[car.heldItem] : 'Réserve vide';
    const stock = car.itemArmed ? `${item} armé` : car.heldItem ? `${item} en stock` : item;
    const detail = state.phase === 'PAUSED' ? 'Partie en pause.'
      : state.tangiblePlacement ? 'Pose en cours.'
      : car.itemArmed ? state.seats[this.seat]?.accessible ? 'Utilisez le bonus sur la carte ou la table.' : 'Réalisez le geste sur la table.'
      : armed && car.heldItem ? 'Un bonus adverse est déjà armé.' : '';
    const info = detail ? `${stock} · ${detail}` : stock;
    if (info !== this.stock.textContent) this.stock.textContent = info;
    const actionStatus = this.action.waiting ? 'En attente de confirmation…' : '';
    if (actionStatus !== this.actionStatus.textContent) this.actionStatus.textContent = actionStatus;
    const lesson = mobileLesson(state, team, 'copilot');
    if (lesson !== this.lesson.textContent) this.lesson.textContent = lesson;
    this.lesson.hidden = !lesson;
    this.repair.button.disabled = !canPlay;
    if (!canPlay) {
      this.repair.release();
      this.clearPickup();
    }
    this.progress.value = state.repairProgress[team];
    this.drawButtons(state, team, powerBlocked);
    this.updatePickup(car.lastPickup, canPlay);
    this.placement.update(state, this.isActive());
    this.tangibles.update(state, canPlay);
  }

  /** Dessine les mêmes commandes que sur la table à partir des états de la place. */
  private drawButtons(state: GameState, team: Team, powerBlocked: boolean): void {
    const car = state.cars[team], theme = state.theme, teamColor = STATION_TEAM_COLOR[team];
    const stocked = !!car.heldItem, armed = stocked && car.itemArmed;
    const ink = powerInk(teamColor, stocked, armed, powerBlocked);
    this.drawPower((ctx, disc) => drawPowerControl(ctx, disc, { theme, teamColor, ink, stocked, armed }));
    const held = this.repairHeld || state.repairPads[this.seat].held;
    this.drawRepair((ctx, disc) => drawRepairControl(ctx, disc, {
      theme, teamColor, held, disabledCar: car.disabled,
      partnerHeld: state.repairPads[`${team}-pilot`].held, progress: state.repairProgress[team],
    }));
  }

  /** Suit le dernier ramassage de l'équipe et initialise le suivi sans rejouer le stock existant. */
  private updatePickup(pickup: Car['lastPickup'], enabled: boolean): void {
    const changed = pickup && pickup.at !== this.lastPickupAt && pickup.at >= this.visibleSince;
    const shouldAlert = this.followingPickups && enabled && changed;
    this.lastPickupAt = pickup?.at;
    this.followingPickups = enabled;
    if (shouldAlert) this.showPickup(pickup.kind);
  }

  /** Signale le ramassage même si une pose Oz ou un bonus armé bloque POWER. */
  private showPickup(item: ItemKind): void {
    this.clearPickup();
    this.pickupAlert.textContent = `Bonus ramassé · ${ITEM_LABEL[item]}`;
    this.pickupTimeout = setTimeout(this.clearPickup, PICKUP_ALERT_MS);
    requestVibration(PICKUP_VIBRATION_MS);
  }

  /** Relâche la réparation et retire l'écran à la fin de la course. */
  close(): void {
    this.suspend();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.suspend);
    this.root.remove();
  }

  /** Vérifie la place confirmée et la visibilité courante du téléphone. */
  private isActive(): boolean {
    return this.session.canPlay && this.session.seat === this.seat && !document.hidden;
  }

  /** Efface l'alerte temporaire de ramassage. */
  private clearPickup = (): void => {
    clearTimeout(this.pickupTimeout);
    this.pickupTimeout = undefined;
    if (this.pickupAlert.textContent) this.pickupAlert.textContent = '';
  };

  /** Libère les commandes quand la page ou la partie est suspendue. */
  private suspend = (): void => {
    this.repair.release();
    this.action.clear();
    this.clearPickup();
    this.followingPickups = false;
    this.placement.close();
  };

  /** Écarte les ramassages reçus en retard après la mise en arrière-plan. */
  private onVisibility = (): void => {
    if (!document.hidden) this.visibleSince = this.session.sync.now();
    this.refresh();
  };

  /** Redessine depuis le dernier état serveur. */
  private refresh = (): void => { if (this.session.state) this.update(this.session.state); };
}
