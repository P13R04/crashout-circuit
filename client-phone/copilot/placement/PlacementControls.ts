/**
 * Assemble les commandes accessibles pour viser et poser sans tracé ni capteur.
 * Liens : AccessiblePlacement.ts, PlacementMap.ts.
 */
import type { ItemKind, RemotePlacementTarget } from '../../../server/types.js';
import type { TangibleId } from '../../../server/tangibles/tangibles.js';
import { actionButton } from '../../ui/press.js';
import type { TiltAim } from './TiltAim.js';
import { TILT_HINTS } from './placementStatus.js';

export type PlacementTool = TangibleId | ItemKind;

type Actions = {
  choose(tool: PlacementTool): void;
  along(percent: number): void;
  offset(delta: number): void;
  rotate(delta: number): void;
  width(delta: number): void;
  power(power: number): void;
  tilt(): void;
};

const TOOLS = [[1, 'Mur'], [2, 'Pilier 1'], [3, 'Pilier 2'], ['boost', 'Zone de boost'], ['slingshot', 'Lance-pierre']] as const;

export class PlacementControls {
  readonly tools = document.createElement('div');
  readonly instruction = document.createElement('p');
  readonly precision = document.createElement('details');
  readonly sensor = document.createElement('div');
  readonly sensorStatus = document.createElement('p');
  readonly enableTilt;
  readonly secureLink = document.createElement('a');
  private readonly certificate = document.createElement('a');
  private readonly choices;
  private readonly position = document.createElement('input');
  private readonly force = document.createElement('input');
  private readonly rotate;
  private readonly width;
  private readonly offset;
  private readonly forceField;

  constructor(actions: Actions) {
    this.tools.className = this.sensor.className = 'placement-buttons';
    this.instruction.className = 'placement-instruction';
    this.choices = TOOLS.map(([id, label]) => ({ id, button: actionButton(label, () => actions.choose(id)) }));
    this.tools.append(...this.choices.map(choice => choice.button));

    this.position.type = this.force.type = 'range';
    this.position.min = this.force.min = '0';
    this.position.max = this.force.max = '100';
    this.position.value = '0';
    this.force.value = '50';
    this.position.addEventListener('input', () => {
      const percent = Number(this.position.value);
      this.setPosition(percent);
      actions.along(percent);
    });
    this.force.addEventListener('input', () => actions.power(Number(this.force.value) / 100));
    const summary = document.createElement('summary');
    summary.textContent = 'Viser avec les commandes';
    this.offset = pair('Décaler à gauche', 'Décaler à droite', delta => actions.offset(delta * 15));
    this.rotate = pair('Angle −15°', 'Angle +15°', delta => actions.rotate(delta * 15));
    this.width = pair('Réduire la largeur', 'Augmenter la largeur', delta => actions.width(delta * 20));
    this.forceField = labelledInput('Puissance du tir', this.force);
    this.precision.append(summary, labelledInput('Position le long du circuit', this.position), this.offset.root,
      this.rotate.root, this.width.root, this.forceField);

    this.enableTilt = actionButton('Activer l’inclinaison', actions.tilt);
    this.secureLink.className = 'spectator-link';
    this.secureLink.rel = 'noreferrer';
    this.secureLink.textContent = 'Ouvrir en HTTPS pour l’inclinaison';
    this.certificate.className = 'spectator-link';
    this.certificate.textContent = 'Télécharger le certificat local';
    this.certificate.href = '/certificat-local.cer';
    this.sensorStatus.setAttribute('role', 'status');
    this.sensor.append(this.enableTilt, this.certificate, this.secureLink, this.sensorStatus);
  }

  /** Synchronise les boutons, les curseurs et les outils disponibles. */
  update(tool: PlacementTool | null, target: RemotePlacementTarget | null, enabled: boolean,
    canUse: (tool: PlacementTool) => boolean): void {
    for (const { id, button } of this.choices) {
      const pressed = String(id === tool);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
      button.disabled = !enabled || !canUse(id);
    }
    this.precision.hidden = !target;
    const hint = tool === 1 || tool === 'boost' ? 'Tracez un segment sur la carte, puis confirmez son aperçu.'
      : tool === 2 || tool === 3 ? 'Touchez la carte pour poser le pilier.'
      : tool === null ? 'Pincez la carte avec deux doigts pour régler le zoom.' : '';
    if (hint !== this.instruction.textContent) this.instruction.textContent = hint;
    this.sensor.hidden = this.forceField.hidden = tool !== 'slingshot';
    this.rotate.root.hidden = tool !== 1 && tool !== 'slingshot';
    this.width.root.hidden = tool !== 'boost';
    this.position.disabled = this.force.disabled = !enabled;
    for (const button of [...this.offset.buttons, ...this.rotate.buttons, ...this.width.buttons]) button.disabled = !enabled;
    if (target?.kind === 'slingshot') updateRange(this.force, Math.round(target.power * 100));
  }

  /** Positionne le curseur après une sélection directe sur la carte. */
  setPosition(percent: number): void { updateRange(this.position, percent); }

  /** Replace le focus parmi les outils disponibles lorsque le bouton de confirmation disparaît. */
  focusTool(tool: PlacementTool): void {
    const choice = this.choices.find(item => item.id === tool && !item.button.disabled)
      ?? this.choices.find(item => !item.button.disabled);
    choice?.button.focus();
  }

  /** Propose la visée par capteur quand le contexte le permet, avec un chemin HTTPS si disponible. */
  updateTilt(status: TiltAim['status'], secureUrl: string, enabled: boolean): void {
    if (this.sensor.hidden) return;
    const secure = window.isSecureContext;
    this.secureLink.hidden = this.certificate.hidden = secure || !secureUrl;
    if (!this.secureLink.hidden && this.secureLink.href !== secureUrl) this.secureLink.href = secureUrl;
    this.enableTilt.hidden = !secure || status === 'ready';
    this.enableTilt.disabled = !enabled || status === 'permission' || status === 'waiting' || status === 'ready';
    const message = secure ? TILT_HINTS[status]
      : secureUrl ? 'Ouvrez la session en HTTPS pour activer le capteur.'
      : 'Cette session ne propose pas de lien HTTPS pour le capteur. Vous pouvez viser avec les commandes.';
    if (message !== this.sensorStatus.textContent) this.sensorStatus.textContent = message;
  }
}

/** Associe les boutons opposés qui règlent le même paramètre. */
function pair(minus: string, plus: string, change: (step: number) => void) {
  const root = document.createElement('div');
  root.className = 'placement-buttons';
  const buttons = [actionButton(minus, () => change(-1)), actionButton(plus, () => change(1))];
  root.append(...buttons);
  return { root, buttons };
}

/** Expose le libellé avec l'input natif pour le clavier et les lecteurs d'écran. */
function labelledInput(text: string, input: HTMLInputElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'placement-range';
  label.append(text, input);
  return label;
}

/** Ajoute l'unité de lecture aux contrôles natifs. */
function updateRange(input: HTMLInputElement, percent: number): void {
  const value = String(percent), description = `${value} %`;
  if (input.value !== value) input.value = value;
  if (input.getAttribute('aria-valuetext') !== description) input.setAttribute('aria-valuetext', description);
}
