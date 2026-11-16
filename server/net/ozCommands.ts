/**
 * Limite la console Oz aux commandes des tangibles.
 * Liens : server/net/GameServer.ts, server/rules/GameRules.ts.
 */
import type { ClientMessage } from '../types.js';
import type { GameRules } from '../rules/GameRules.js';

/** Oriente les actions de pose, d'activation et de retrait. */
export function handleOzCommand(rules: GameRules, msg: ClientMessage): void {
  switch (msg.type) {
    case 'TangiblePlacementMode':
      rules.setTangiblePlacementMode(msg.mode);
      break;
    case 'TangiblePrepare':
      rules.prepareTangiblePlacement(msg.id);
      break;
    case 'TangiblePlacementCancel':
      rules.cancelTangiblePlacement();
      break;
    case 'TangibleControl':
      rules.onTangibleControl(msg);
      break;
    case 'TangibleMoved':
      rules.onTangibleMoved(msg);
      break;
    case 'TangibleRemoved':
      rules.onTangibleRemoved(msg);
      break;
  }
}
