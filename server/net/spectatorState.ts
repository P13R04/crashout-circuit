/** Limite la diffusion publique aux données de course nécessaires au rendu. */
import type { Car, GameState } from '../types.js';
import type { RaceCar, RaceViewState } from '../protocol/raceView.js';

function carView(car: Car): RaceCar {
  const { pos, angle, speed, lap, hp, disabled, respawnUntil, boostUntil, ghostUntil } = car;
  return { pos, angle, speed, lap, hp, disabled, respawnUntil, boostUntil, ghostUntil };
}

export function spectatorState(state: GameState, track: boolean): RaceViewState {
  const { phase, theme, soloTest, trackVersion, pausedAt, winner, sessionStartAt, raceDeadline,
    walls, arcs, boostGates, stones, pickups, params } = state;
  const { logicalWidth, logicalHeight, wallWidthPx, stoneRadiusPx, lapsToWin, hpMax } = params;
  const tangibles: RaceViewState['tangibles'] = {};
  for (const [id, item] of Object.entries(state.tangibles)) {
    const { x, y, kind, active, status } = item;
    if (kind === 'pylon' && status === 'placed') tangibles[Number(id)] = { x, y, kind, active, status };
  }
  return { phase, theme, soloTest, trackVersion, pausedAt, winner, sessionStartAt, raceDeadline,
    track: track ? state.track : null, walls, arcs, boostGates, stones, pickups, tangibles,
    cars: { A: carView(state.cars.A), B: carView(state.cars.B) },
    params: { logicalWidth, logicalHeight, wallWidthPx, stoneRadiusPx, lapsToWin, hpMax } };
}
