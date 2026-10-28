import type { GameState } from './types.js';
/** The first POWER owns the single table-wide gesture reservation. */
export function armedPickup(state:GameState){
  for(const team of ['A','B'] as const){const car=state.cars[team];if(car.itemArmed&&car.heldItem)return{team,kind:car.heldItem,version:car.itemArmVersion??0};}
  return null;
}
export const RESPAWN_COUNTDOWN_MS=3000;
