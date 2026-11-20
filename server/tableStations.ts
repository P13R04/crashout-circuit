/** Détermine les postes physiques et la surface de circuit de la manche. */
import type { GameState, SeatId, Team } from './types.js';
import { PANELS, PLAY_AREA, type PanelLayout, type Role } from './layout.js';

type StationState = Pick<GameState, 'wideTable' | 'seats'>;

export const WIDE_PLAY_AREA = { x0: 230, y0: 235, x1: 1680, y1: 980 };

/** Réserve le format du circuit à l'ouverture de la création pour toute la manche. */
export function lockTableFormat(state: GameState): void {
  state.wideTable = Object.values(state.seats).every(seat => seat.connected);
}

/** Vérifie si le téléphone remplace l'interface locale de ce rôle. */
export function isPhoneStation(state: StationState, team: Team, role: Role): boolean {
  const id: SeatId = `${team}-${role}`;
  return state.wideTable === true || state.seats?.[id]?.connected === true;
}

/** Donne les postes affichés et interactifs sur la table. */
export function tablePanels(state: StationState): PanelLayout[] {
  return PANELS.filter(panel => !isPhoneStation(state, panel.team, panel.role));
}

/** Donne les limites stables du tracé en fonction des postes pris au départ. */
export function playAreaFor(state: Pick<GameState, 'wideTable'>): typeof PLAY_AREA {
  return state.wideTable ? WIDE_PLAY_AREA : PLAY_AREA;
}
