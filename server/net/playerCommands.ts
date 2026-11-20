/**
 * Traduit les commandes des téléphones dans l'équipe et le rôle attribués par le serveur.
 * Liens : server/net/GameServer.ts, server/rules/session/playerSeats.ts.
 */
import type { ClientMessage, SeatId, Team } from '../types.js';
import { isThemeId } from '../protocol/theme.js';
import type { GameRules } from '../rules/GameRules.js';
import { tangibleDefinition } from '../tangibles/tangibles.js';

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
  if (msg.type === 'StartSolo') {
    if (seat === 'A-pilot') rules.startSolo();
    return false;
  }
  if (rules.state.soloTest && seat === 'A-pilot' && msg.type === 'SetTheme' && rules.state.developerTools && isThemeId(msg.theme)) {
    rules.state.theme = msg.theme;
    rules.host.broadcastFull();
    return false;
  }
  if (rules.state.soloTest && msg.type !== 'PilotInput' && msg.type !== 'ToggleDriveMode') return false;
  const team = seatTeam(seat);
  const pilot = isPilotSeat(seat);
  switch (msg.type) {
    case 'SetAccessibility':
      if (!pilot && typeof msg.on === 'boolean' && Boolean(rules.state.seats[seat].accessible) !== msg.on) {
        rules.state.seats[seat].accessible = msg.on;
        rules.host.broadcastFull();
      }
      break;
    case 'PilotInput':
      if (pilot) rules.onPilotInput(team, msg);
      break;
    case 'ToggleDriveMode':
      if (pilot) rules.toggleDriveMode(team);
      break;
    case 'Power':
      if (!pilot) rules.onPower(team, { ...msg, team, role: 'copilot' });
      break;
    case 'TangibleControl':
    case 'TangibleRemoved':
      if (!pilot) applyCopilotTangible(rules, msg);
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

/** Autorise les commandes des objets déjà posés et protège les poses Oz en cours. */
function applyCopilotTangible(rules: GameRules, msg: Extract<ClientMessage,
  { type: 'TangibleControl' | 'TangibleRemoved' }>): void {
  if (!tangibleDefinition(msg.id) || rules.state.tangiblePlacement?.id === msg.id) return;
  if (msg.type === 'TangibleRemoved') rules.onTangibleRemoved(msg);
  else if (msg.action === 'activate' || msg.action === 'deactivate') rules.onTangibleControl(msg);
}
