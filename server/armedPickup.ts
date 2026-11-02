/**
 * Retrouve le bonus réservé sur la table et fournit la durée des feux de reprise après réparation.
 * Liens : server/types.ts.
 * Référencé notamment par client-table/GestureRecognizer.ts, client-table/HUD.ts, client-table/Renderer.ts.
 */
import type { GameState } from './types.js';
/** Retrouve le seul stock armé dont le geste est réservé sur la table. */
export function armedPickup(state:GameState){
  for(const team of ['A','B'] as const){const car=state.cars[team];if(car.itemArmed&&car.heldItem)return{team,kind:car.heldItem,version:car.itemArmVersion??0};}
  return null;
}
export const RESPAWN_COUNTDOWN_MS=3000;
