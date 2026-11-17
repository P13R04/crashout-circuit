/** Pilote le salon de l’instance choisie avec la session hôte du navigateur. */
import { playerTeam, roleLabel, SEAT_IDS, TEAM_LABEL } from '../client-shared/seatLabels.js';
import { THEMES } from '../server/protocol/theme.js';
import type { GameState, Phase } from '../server/types.js';

type Snapshot = Pick<GameState, 'phase' | 'seats' | 'theme' | 'soloTest' | 'wideTable'>
  & Pick<GameState['params'], 'difficulty' | 'lapsToWin' | 'sessionMaxSeconds'> & { room: string };

const phaseLabel: Record<Phase, string> = { LOBBY: 'Accueil', MAP: 'Dessin', READY: 'Prêt',
  RACE: 'Course', PAUSED: 'En pause', RESULT: 'Résultat' };
const form = document.querySelector<HTMLFormElement>('#settings')!;
const room = document.querySelector('#room')!;
const status = document.querySelector('#status')!;
const join = document.querySelector<HTMLAnchorElement>('#join')!;
const seats = document.querySelector('#seats')!;
const commands = [...document.querySelectorAll<HTMLButtonElement>('[data-command]')];
const select = form.elements.namedItem('theme') as HTMLSelectElement;
for (const theme of THEMES) select.add(new Option(theme.name, theme.id));
let current: Snapshot | null = null, busy = false, editing = false, seatKey = '';

function apply(value: Snapshot): void {
  current = value;
  room.textContent = `Salon ${value.room} · ${phaseLabel[value.phase]}${value.wideTable ? ' · circuit agrandi' : ''}`;
  join.href = '/play?room=' + value.room;
  if (!editing) {
    for (const key of ['theme', 'difficulty', 'lapsToWin', 'sessionMaxSeconds'] as const) {
      (form.elements.namedItem(key) as HTMLInputElement).value = String(value[key]);
    }
  }
  for (const control of commands) {
    const action = control.dataset.command;
    control.disabled = busy || ((action === 'tutorial' || action === 'quickRace') && (value.soloTest || value.phase !== 'LOBBY'))
      || (action === 'pause' && value.phase !== 'RACE' && value.phase !== 'PAUSED');
  }
  const next = JSON.stringify(value.seats);
  if (seatKey === next) return;
  seatKey = next;
  const rows = SEAT_IDS.map(id => {
    const seat = value.seats[id], row = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${TEAM_LABEL[playerTeam(id)]} · ${roleLabel(id)} · ${seat.connected ? 'Connecté' : seat.taken ? 'Réservé' : 'Libre'}${seat.name ? ' · ' + seat.name : ''}`;
    const kick = document.createElement('button');
    kick.type = 'button';
    kick.textContent = 'Déconnecter';
    kick.setAttribute('aria-label', `Déconnecter · ${roleLabel(id)} ${TEAM_LABEL[playerTeam(id)]}`);
    kick.disabled = !seat.taken;
    kick.addEventListener('click', () => void send({ action: 'kick', seat: id }));
    row.append(text, kick);
    return row;
  });
  seats.replaceChildren(...rows);
}

async function refresh(): Promise<void> {
  if (busy) return;
  try {
    const response = await fetch('/api/admin', { cache: 'no-store' });
    if (!response.ok) throw Error();
    const data = await response.json() as Snapshot;
    if (!busy) apply(data);
    if (status.textContent === 'Connexion au salon…' || status.textContent === 'Accès hôte ou connexion indisponible.') status.textContent = '';
  } catch { status.textContent = 'Accès hôte ou connexion indisponible.'; }
}

async function send(message: Record<string, unknown>): Promise<void> {
  if (!current || busy) return;
  busy = true;
  apply(current);
  try {
    const response = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...message, room: current.room }) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    status.textContent = 'Commande appliquée.';
    if (message.action === 'settings') editing = false;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Commande indisponible.';
  } finally {
    busy = false;
    await refresh();
  }
}

for (const button of commands) button.addEventListener('click', () => {
  if (button.dataset.command !== 'reset' || window.confirm('Libérer toutes les places et revenir à l’accueil ?')) {
    void send({ action: button.dataset.command });
  }
});
form.addEventListener('input', () => { editing = true; });
form.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(form);
  void send({ action: 'settings', theme: data.get('theme'), difficulty: data.get('difficulty'),
    lapsToWin: Number(data.get('lapsToWin')), sessionMaxSeconds: Number(data.get('sessionMaxSeconds')) });
});
void refresh();
window.setInterval(() => { if (!document.hidden) void refresh(); }, 1500);
