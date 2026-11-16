/**
 * Traduit les commandes des téléphones dans l'équipe et le rôle attribués par le serveur.
 * Liens : server/net/GameServer.ts, server/rules/session/playerSeats.ts.
 */
import type { ClientMessage, SeatId, Team } from '../types.js';
import type { GameRules } from '../rules/GameRules.js';

/** Déduit l'équipe d'une place attribuée. */
export function seatTeam(seat: SeatId): Team {
  return seat.startsWith('A-') ? 'A' : 'B';
}

/** Distingue les commandes de conduite des commandes du copilote. */
export function isPilotSeat(seat: SeatId): boolean {
  return seat.endsWith('-pilot');
}

/** Applique une commande mobile autorisée et signale un éventuel appui de réparation. */
export function handlePlayerCommand(rules: GameRules, seat: SeatId, msg: ClientMessage): boolean {
  const team = seatTeam(seat);
  const pilot = isPilotSeat(seat);
  switch (msg.type) {
    case 'PilotInput':
      if (pilot) rules.onPilotInput(team, msg);
      break;
    case 'ToggleDriveMode':
      if (pilot) rules.toggleDriveMode(team);
      break;
    case 'Power':
      if (!pilot) rules.onPower(team, { ...msg, team, role: 'copilot' });
      break;
    case 'PadHold':
      if (typeof msg.on !== 'boolean') return false;
      rules.onPadHold({ ...msg, team, role: pilot ? 'pilot' : 'copilot' });
      return msg.on;
  }
  return false;
}

/** Neutralise les entrées lors d'une déconnexion ou d'un transfert de place. */
export function releasePlayerControls(rules: GameRules, seat: SeatId): void {
  const pad = rules.state.repairPads[seat];
  if (isPilotSeat(seat)) rules.inputs[pad.team] = { throttle: 0, steer: 0 };
  pad.held = false;
  pad.startedAt = 0;
}
