/**
 * Applique une action à distance validée aux règles de la table.
 * Liens : remotePlacementGeometry.ts, tangiblesRules.ts, armedItems.ts.
 */
import type { PlacementFailure, RemotePlacementTarget, SeatId } from '../../types.js';
import type { GameRules } from '../GameRules.js';
import { prepareRemotePlacement } from './remotePlacementGeometry.js';
import { applyTouchTangible } from './tangiblesRules.js';

/** Valide les droits et la pose au moment de la confirmation. */
export function placeRemotely(rules: GameRules, seat: SeatId, target: RemotePlacementTarget): PlacementFailure | null {
  if (rules.state.soloTest || !seat.endsWith('-copilot') || !rules.state.seats[seat]?.accessible) return 'disabled';
  const t = rules.now, team = rules.state.repairPads[seat].team;
  rules.tickTangiblePlacement(t);
  const placement = prepareRemotePlacement(rules.state, target);
  if ('reason' in placement) return placement.reason;
  if (placement.kind === 'tangible') {
    applyTouchTangible(rules, placement.id, placement.pose);
    return null;
  }
  const applied = placement.kind === 'boost'
    ? rules.onBoostGate({ type: 'BoostGate', t, team, a: placement.a, b: placement.b })
    : rules.onSlingshot({ type: 'Slingshot', t, team, anchor: placement.anchor, pouch: placement.pouch });
  return applied ? null : 'invalid';
}
