/** Données publiques utiles au rendu de la course, indépendantes du transport. */
import type { Car, GameParams, GameState, Tangible, Team } from './gameState.js';

export type RaceCar = Pick<Car, 'pos' | 'angle' | 'speed' | 'lap' | 'hp' | 'disabled' | 'respawnUntil' | 'boostUntil' | 'ghostUntil'>;
export type RaceViewState = Pick<GameState, 'phase' | 'theme' | 'soloTest' | 'track' | 'trackVersion' | 'pausedAt' | 'winner'
  | 'sessionStartAt' | 'raceDeadline' | 'walls' | 'arcs' | 'boostGates' | 'stones' | 'pickups'> & {
  cars: Record<Team, RaceCar>;
  tangibles: Record<number, Pick<Tangible, 'x' | 'y' | 'kind' | 'active' | 'status'>>;
  params: Pick<GameParams, 'logicalWidth' | 'logicalHeight' | 'wallWidthPx' | 'stoneRadiusPx' | 'lapsToWin' | 'hpMax'>;
};
