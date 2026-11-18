/**
 * Écran de préparation : choix de l'appareil de chaque poste (table, téléphone, manette Wii) avant la création du circuit.
 * Liens : server/net/tableCommands.ts, server/net/GameServer.ts, server/rules/session/trackCreation.ts.
 * Fonctions appelées par les méthodes de GameRules (server/rules/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { GameState, SeatDevice, SeatId, SetSeatDeviceMsg, SetWiimoteMsg } from '../../types.js';
import { isSeatId } from './playerSeats.js';
import type { GameRules } from '../GameRules.js';

const DEVICES: readonly SeatDevice[] = ['table', 'phone', 'wiimote'];

/** Vérifie qu'un appareil est permis pour ce poste : la manette Wii ne sert qu'à piloter. */
export function deviceAllowed(seat: SeatId, device: unknown): device is SeatDevice {
  return DEVICES.includes(device as SeatDevice) && (device !== 'wiimote' || seat.endsWith('-pilot'));
}

/** Indique si le joueur d'un poste annoncé hors de la table est prêt : téléphone connecté, ou manette Wii vérifiée sur la table. */
function seatReady(state: Pick<GameState, 'seats' | 'wiimotes'>, seat: SeatId, device: SeatDevice): boolean {
  if (device === 'table') return true;
  return device === 'wiimote' ? state.wiimotes[seat.startsWith('A-') ? 'A' : 'B'] !== null : state.seats[seat].connected;
}

/** Liste les postes annoncés sur téléphone ou manette dont le joueur n'est pas encore prêt. */
export function seatsWaiting(state: Pick<GameState, 'seats' | 'seatDevices' | 'wiimotes'>): SeatId[] {
  return (Object.keys(state.seatDevices) as SeatId[]).filter(seat => !seatReady(state, seat, state.seatDevices[seat]));
}

/** Enregistre la manette Wii que la table a ouverte pour une équipe, ou son absence. */
export function setWiimote(rules: GameRules, msg: SetWiimoteMsg): void {
  const number = msg.number;
  if (msg.team !== 'A' && msg.team !== 'B') return;
  if (number !== null && !(Number.isInteger(number) && number >= 1 && number <= 4)) return;
  if (rules.state.wiimotes[msg.team] === number) return;
  rules.state.wiimotes[msg.team] = number;
  rules.host.broadcastFull();
}

/** Ouvre l'écran de préparation depuis l'accueil ; un joueur déjà connecté garde son poste hors de la table. */
export function enterSetup(rules: GameRules): void {
  const s = rules.state;
  if (s.phase !== 'LOBBY') return;
  for (const seat of Object.keys(s.seatDevices) as SeatId[]) {
    if (s.seats[seat].taken && s.seatDevices[seat] === 'table') s.seatDevices[seat] = 'phone';
  }
  rules.host.transition('SETUP');
  rules.host.broadcastFull();
}

/** Enregistre l'appareil choisi pour un poste pendant la préparation. */
export function setSeatDevice(rules: GameRules, msg: SetSeatDeviceMsg): void {
  const s = rules.state;
  if (s.phase !== 'SETUP' || !isSeatId(msg.seat) || !deviceAllowed(msg.seat, msg.device)) return;
  if (s.seatDevices[msg.seat] === msg.device) return;
  s.seatDevices[msg.seat] = msg.device;
  rules.host.broadcastFull();
}

/** Ouvre la création du circuit, à condition que tous les joueurs annoncés hors de la table soient connectés. */
export function confirmSetup(rules: GameRules): void {
  if (rules.state.phase !== 'SETUP' || seatsWaiting(rules.state).length) return;
  rules.enterMap('table');
}
