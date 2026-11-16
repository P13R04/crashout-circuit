/**
 * Affiche le choix de séance, d'équipe et de rôle sur téléphone.
 * Liens : client-phone/session.ts, client-shared/seatLabels.ts.
 */
import { TEAM_LABEL, playerTeam, roleLabel, SEAT_IDS } from '../client-shared/seatLabels.js';
import type { Phase, Seat, SeatId, Team } from '../server/types.js';
import { PilotScreen } from './pilot/PilotScreen.js';
import { actionButton as button } from './ui/press.js';
import { PhoneSession } from './session.js';

const title = document.querySelector<HTMLHeadingElement>('#title')!;
const notice = document.querySelector<HTMLParagraphElement>('#notice')!;
const screen = document.querySelector<HTMLElement>('#screen')!;
const initial = new URLSearchParams(location.search).get('room') ?? '';
const session = new PhoneSession(render);
const WAITING: Record<Phase, string> = {
  LOBBY: 'En attente du départ sur la table.',
  MAP: 'Les équipes dessinent le circuit sur la table.',
  READY: 'Le circuit est prêt. Attendez le départ sur la table.',
  RACE: 'Partie en cours.',
  PAUSED: 'Partie en pause.',
  RESULT: 'Partie terminée. Consultez le résultat sur la table.',
};
let team: Team | null = null;
let screenKey = '';

let pilot: PilotScreen | null = null;

/** Ajoute un pictogramme et un statut textuel à un choix d'équipe ou de rôle. */
function choice(label: string, icon: string, detail: string, color: Team, action: () => void, disabled: boolean) {
  const el = button(label, action, 'choice');
  const symbol = document.createElement('span');
  symbol.className = 'team-icon';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = icon;
  const status = document.createElement('small');
  status.textContent = detail;
  el.prepend(symbol);
  el.append(status);
  el.dataset.team = color;
  el.disabled = disabled;
  return el;
}

/** Affiche un formulaire lorsque le QR code n'a pas fourni de code valide. */
function codeForm(): HTMLElement {
  const form = document.createElement('form');
  const label = document.createElement('label');
  label.htmlFor = 'room';
  label.textContent = 'Code affiché sur la table';
  const input = document.createElement('input');
  input.id = 'room';
  input.value = initial;
  input.autocapitalize = 'characters';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = 5;
  input.required = true;
  const submit = button('Rejoindre', () => {}, 'primary');
  submit.type = 'submit';
  form.append(label, input, submit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    void session.open(input.value);
  });
  return form;
}

/** Affiche les équipes et indique combien de postes sont disponibles. */
function teams(seats: Record<SeatId, Seat>, enabled: boolean): HTMLElement[] {
  return (['A', 'B'] as const).map(t => {
    const free = SEAT_IDS.filter(id => playerTeam(id) === t && !seats[id].taken).length;
    const detail = free === 0 ? 'Équipe complète' : `${free} place${free === 1 ? '' : 's'} libre${free === 1 ? '' : 's'}`;
    return choice(`Équipe ${TEAM_LABEL[t]}`, t === 'A' ? '◆' : '●', detail, t, () => { team = t; render(); },
      free === 0 || !enabled);
  });
}

/** Affiche les rôles libres et indique les places réservées hors ligne. */
function roles(seats: Record<SeatId, Seat>, selected: Team, enabled: boolean): HTMLElement[] {
  const choices = SEAT_IDS.filter(id => playerTeam(id) === selected).map(id => {
    const detail = seats[id].connected ? 'Pris' : seats[id].taken ? 'Réservé' : 'Libre';
    return choice(roleLabel(id), id.endsWith('-pilot') ? '◈' : '✚', detail, selected,
      () => session.join(id), !enabled || seats[id].taken);
  });
  return [...choices, button('Changer d’équipe', () => { team = null; render(); })];
}

/** Affiche la place attribuée, l'avancement et l'action de changement avant le départ. */
function showSeat(seat: SeatId, state: Phase): void {
  const selected = playerTeam(seat);
  document.body.dataset.team = selected;
  title.textContent = `${roleLabel(seat)} · Équipe ${TEAM_LABEL[selected]}`;
  const info = document.createElement('p');
  info.className = 'detail';
  info.textContent = WAITING[state];
  screen.replaceChildren(info);
  if (['LOBBY', 'MAP', 'READY'].includes(state)) {
    const change = button('Changer de place', () => session.leave());
    change.disabled = !session.online || session.pending === 'leave';
    screen.append(change);
  }
}

/** Actualise uniquement la partie de l'interface concernée par les changements d'état. */
function render(): void {
  if (notice.textContent !== session.notice) notice.textContent = session.notice;
  const { state, seat, room, online, pending } = session;
  if (seat?.endsWith('-pilot') && state && (state.soloTest || state.phase === 'RACE' || state.phase === 'PAUSED' || state.phase === 'RESULT')) {
    if (!pilot) {
      const team = playerTeam(seat);
      pilot = new PilotScreen(session, team, state.soloTest);
      title.textContent = state.soloTest ? 'Pilote solo' : `Pilote · Équipe ${TEAM_LABEL[team]}`;
      document.body.dataset.team = team;
      screen.replaceChildren(pilot.root);
    }
    pilot.update(state);
    return;
  }
  if (pilot) {
    pilot.close();
    pilot = null;
    screenKey = '';
  }
  const key = JSON.stringify([room, team, online, seat, pending, state?.soloTest, seat ? state?.phase : state?.seats]);
  if (key === screenKey) return;
  screenKey = key;
  delete document.body.dataset.team;
  if (!room) {
    title.textContent = 'Rejoindre la partie';
    screen.replaceChildren(codeForm());
  } else if (!state) {
    title.textContent = 'Connexion à la séance';
    screen.replaceChildren();
  } else if (seat) {
    showSeat(seat, state.phase);
  } else if (state.soloTest) {
    title.textContent = 'Essai pilote solo';
    const taken = state.seats['A-pilot'].taken;
    screen.replaceChildren(choice('Rejoindre comme pilote', '◈', taken ? 'Réservé' : 'Libre', 'A',
      () => session.join('A-pilot'), taken || !online || pending !== null));
  } else if (team) {
    document.body.dataset.team = team;
    title.textContent = `Choisir un rôle · ${TEAM_LABEL[team]}`;
    screen.replaceChildren(...roles(state.seats, team, online && pending === null));
  } else {
    title.textContent = 'Choisir une équipe';
    screen.replaceChildren(...teams(state.seats, online));
  }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) session.resume(); });
render();
if (initial) void session.open(initial);
