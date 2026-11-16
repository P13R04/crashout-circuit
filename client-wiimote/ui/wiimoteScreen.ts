/**
 * Affichage minimal du pilote Wii : manette, séance, place, direction en direct et recalibrage.
 * Liens : client-wiimote/ui/viewHints.ts (textes), client-wiimote/main.ts (câblage), client-wiimote/wiimote.css.
 * Les boutons de cet écran servent à la connexion et aux réglages ; on ne conduit qu'avec la manette.
 */
import { SEAT_IDS, TEAM_LABEL, playerTeam } from '../../client-shared/seatLabels.js';
import type { SeatId } from '../../server/types.js';
import type { TiltGrip } from '../steering/tiltAngle.js';
import { controllerHint, pressedLabel, sessionHint, type WiimoteView } from './viewHints.js';

export interface ScreenActions {
  connectController(): void;
  recalibrate(): void;
  openRoom(code: string): void;
  join(seat: SeatId): void;
  leave(): void;
  startSolo(): void;
  setGrip(grip: TiltGrip): void;
  setFlip(flip: boolean): void;
}

const PILOT_SEATS = SEAT_IDS.filter(id => id.endsWith('-pilot'));

/** Crée un élément avec classe et texte. */
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Crée un bouton qui n'envoie aucun formulaire. */
function button(label: string, action: () => void, className = ''): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

/** Remplace un texte seulement s'il change, pour ne pas réécrire le DOM à chaque lecture. */
function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export class WiimoteScreen {
  private readonly controllerHintText = element('p', 'hint');
  private readonly controllerLine = element('p', 'detail');
  private readonly connect: HTMLButtonElement;
  private readonly recalibrate: HTMLButtonElement;
  private readonly roomInput = element('input');
  private readonly seatButtons = new Map<SeatId, HTMLButtonElement>();
  private readonly leaveButton: HTMLButtonElement;
  private readonly start: HTMLButtonElement;
  private readonly startHint = element('p', 'detail');
  private readonly join: HTMLButtonElement;
  private readonly notice = element('p', 'notice');
  private readonly sessionText = element('p', 'hint');
  private readonly marker = element('div', 'marker');
  private readonly steerText = element('output', 'big');
  private readonly angleText = element('p', 'detail mono');
  private readonly accelText = element('p', 'detail mono');
  private readonly buttonsText = element('p', 'detail');
  private readonly grip = element('select');
  private readonly flip = element('input');

  constructor(root: HTMLElement, private readonly actions: ScreenActions, initialRoom: string, grip: TiltGrip, flip: boolean) {
    this.connect = button('Connecter la manette', actions.connectController, 'primary');
    this.recalibrate = button('Recalibrer le neutre (Home)', actions.recalibrate);
    this.leaveButton = button('Libérer la place', actions.leave);
    this.start = button('Lancer une partie solo', actions.startSolo, 'primary');
    this.join = button('Rejoindre', () => actions.openRoom(this.roomInput.value));
    this.roomInput.value = initialRoom;
    this.roomInput.maxLength = 5;
    this.roomInput.autocomplete = 'off';
    this.roomInput.spellcheck = false;
    this.roomInput.setAttribute('aria-label', 'Code de séance');
    root.append(this.controllerSection(), this.gameSection(), this.sessionSection(), this.drivingSection(), this.settingsSection(grip, flip));
  }

  /** Affiche l'état courant ; ne touche au DOM que pour ce qui a changé. */
  update(view: WiimoteView): void {
    setText(this.controllerHintText, controllerHint(view));
    const battery = view.battery === null ? '' : ` · batterie ${view.battery} %${view.lowBattery ? ' (faible)' : ''}`;
    setText(this.controllerLine, view.controller === 'connected' ? `${view.deviceName}${battery}` : 'Aucune manette');
    setText(this.connect, view.controller === 'lost' ? 'Reconnecter' : 'Connecter la manette');
    this.connect.hidden = view.controller === 'connected' || view.controller === 'unsupported';
    this.recalibrate.disabled = view.controller !== 'connected';
    this.updateSession(view);
    this.updateDriving(view);
  }

  /** Bloc de connexion de la manette. */
  private controllerSection(): HTMLElement {
    const section = element('section');
    section.append(element('h2', '', 'Manette'), this.controllerLine, this.controllerHintText, this.connect);
    return section;
  }

  /** Bloc du lancement d'une partie solo, actif seulement quand la manette est connectée. */
  private gameSection(): HTMLElement {
    const section = element('section');
    section.append(element('h2', '', 'Partie'), this.start, this.startHint);
    return section;
  }

  /** Bloc du code de séance et du choix de place. */
  private sessionSection(): HTMLElement {
    const section = element('section');
    const form = element('form', 'row');
    form.addEventListener('submit', event => { event.preventDefault(); this.actions.openRoom(this.roomInput.value); });
    this.join.type = 'submit';
    form.append(this.roomInput, this.join);
    const seats = element('div', 'row');
    for (const seat of PILOT_SEATS) {
      const label = `Pilote ${TEAM_LABEL[playerTeam(seat)]}`;
      const choice = button(label, () => this.actions.join(seat), 'choice');
      choice.dataset.team = playerTeam(seat);
      this.seatButtons.set(seat, choice);
      seats.append(choice);
    }
    section.append(element('h2', '', 'Séance'), form, seats, this.leaveButton, this.notice, this.sessionText);
    return section;
  }

  /** Bloc de la direction en direct et du recalibrage. */
  private drivingSection(): HTMLElement {
    const section = element('section');
    const meter = element('div', 'meter');
    meter.setAttribute('aria-hidden', 'true');
    meter.append(element('div', 'center'), this.marker);
    section.append(element('h2', '', 'Direction'), meter, this.steerText, this.angleText, this.accelText, this.buttonsText, this.recalibrate);
    return section;
  }

  /** Bloc des réglages d'essai : prise en main et sens de rotation. */
  private settingsSection(grip: TiltGrip, flip: boolean): HTMLElement {
    const details = element('details');
    for (const [value, label] of [['face', 'Face vers moi (volant)'], ['flat', 'À plat, face vers le haut']] as const) {
      const option = element('option', '', label);
      option.value = value;
      this.grip.append(option);
    }
    this.grip.value = grip;
    this.grip.addEventListener('change', () => this.actions.setGrip(this.grip.value as TiltGrip));
    this.flip.type = 'checkbox';
    this.flip.checked = flip;
    this.flip.addEventListener('change', () => this.actions.setFlip(this.flip.checked));
    const gripLabel = element('label', '', 'Prise en main ');
    gripLabel.append(this.grip);
    const flipLabel = element('label', '', ' Inverser le sens ');
    flipLabel.prepend(this.flip);
    details.append(element('summary', '', 'Réglages d’essai'), gripLabel, flipLabel);
    return details;
  }

  /** Met à jour la ligne de séance, les places et le message. */
  private updateSession(view: WiimoteView): void {
    setText(this.notice, view.notice);
    setText(this.sessionText, sessionHint(view));
    for (const [seat, node] of this.seatButtons) {
      node.disabled = !view.online || view.pending || view.seat !== null || view.seatsTaken[seat];
      node.classList.toggle('chosen', view.seat === seat);
    }
    const preRace = view.phase === null || ['LOBBY', 'MAP', 'READY'].includes(view.phase);
    this.leaveButton.hidden = view.seat === null;
    this.leaveButton.disabled = !preRace || view.pending;
    this.join.disabled = view.pending || view.seat !== null;
    this.roomInput.disabled = view.seat !== null;
    const restart = view.seat !== null && view.phase !== null && view.phase !== 'LOBBY';
    setText(this.start, restart ? 'Recommencer la partie solo' : 'Lancer une partie solo');
    this.start.disabled = view.controller !== 'connected' || view.launching;
    setText(this.startHint, view.controller === 'connected'
      ? 'Prend la place de pilote cyan et lance le circuit prédéfini à un seul joueur, comme avec le QR code du téléphone.'
      : 'Connecte la manette pour pouvoir lancer la partie.');
  }

  /** Met à jour la jauge et les mesures brutes utiles à la validation des axes. */
  private updateDriving(view: WiimoteView): void {
    const steer = view.steer ?? 0;
    this.marker.style.left = `${(steer + 1) * 50}%`;
    this.marker.classList.toggle('idle', view.steer === null);
    setText(this.steerText, view.steer === null ? '—' : steer.toFixed(2));
    setText(this.angleText, `angle ${view.angle === null ? '—' : `${view.angle.toFixed(1)}°`} · ${view.steeringStatus}`);
    const a = view.accel;
    setText(this.accelText, a ? `accéléromètre brut x ${a.x} · y ${a.y} · z ${a.z}` : 'accéléromètre brut —');
    setText(this.buttonsText, `boutons : ${pressedLabel(view.buttons)}`);
  }
}
