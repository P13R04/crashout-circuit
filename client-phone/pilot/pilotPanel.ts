/** Construit les éléments fixes du tableau de bord du pilote. */
import { THEMES } from '../../server/protocol/theme.js';

export function steeringWheel(): HTMLDivElement {
  const wheel = document.createElement('div');
  wheel.className = 'pilot-wheel';
  wheel.setAttribute('aria-hidden', 'true');
  for (const name of ['ring', 'spokes', 'hub', 'mark']) {
    const part = document.createElement('span');
    part.className = 'wheel-' + name;
    wheel.append(part);
  }
  return wheel;
}

export function themeControl(change: (theme: string) => void): HTMLLabelElement {
  const label = document.createElement('label');
  label.textContent = 'Ambiance';
  const select = document.createElement('select');
  for (const theme of THEMES) select.add(new Option(theme.name, theme.id));
  select.addEventListener('change', () => change(select.value));
  label.append(select);
  return label;
}

export function settingsMenu(...controls: HTMLElement[]): HTMLDetailsElement {
  const menu = document.createElement('details');
  menu.className = 'pilot-settings';
  const toggle = document.createElement('summary');
  toggle.textContent = 'Réglages';
  const panel = document.createElement('div');
  panel.append(...controls);
  menu.append(toggle, panel);
  return menu;
}
