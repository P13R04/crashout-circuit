/** Libellés partagés par le choix de place et l'accueil de la table. */
import type { SeatId, Team } from '../server/types.js';

export const TEAM_LABEL: Record<Team, string> = { A: 'Cyan', B: 'Rose' };
export const SEAT_IDS: readonly SeatId[] = ['A-pilot', 'A-copilot', 'B-pilot', 'B-copilot'];

/** Renvoie le nom français du rôle associé au poste. */
export function roleLabel(seat: SeatId): string {
  return seat.endsWith('-pilot') ? 'Pilote' : 'Copilote';
}

/** Renvoie l'équipe identifiée par la clé du poste. */
export function playerTeam(seat: SeatId): Team {
  return seat.startsWith('A-') ? 'A' : 'B';
}
