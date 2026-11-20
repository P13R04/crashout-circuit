/**
 * Décrit les poses à distance et leur confirmation privée.
 * Liens : messages.ts, server/rules/gameplay/remotePlacement.ts.
 */
import type { BaseMsg } from './messages.js';
import type { Team, Vec2 } from './gameState.js';
import type { TangibleId } from '../tangibles/tangibles.js';

type ArmedStock = { team: Team; version: number };

/** Exprime la position du mur ou du pilier et la géométrie des bonus visés. */
export type RemotePlacementTarget =
  | { kind: 'tangible'; id: TangibleId; pos: Vec2; angle: number }
  | { kind: 'boost'; pos: Vec2; angle: number; width: number; arm: ArmedStock }
  | { kind: 'slingshot'; pos: Vec2; angle: number; power: number; arm: ArmedStock };

/** Regroupe les refus de géométrie, de disponibilité et de droit de la place. */
export type PlacementFailure = 'disabled' | 'phase' | 'busy' | 'wrong-mode' | 'not-armed'
  | 'outside-table' | 'blocked-zone' | 'outside-track' | 'out-of-range' | 'invalid';

export interface SetAccessibilityMsg extends BaseMsg { type: 'SetAccessibility'; on: boolean }
export interface RemotePlacementMsg extends BaseMsg { type: 'RemotePlacement'; requestId: number; target: RemotePlacementTarget }
export type RemotePlacementResultMsg = BaseMsg & { type: 'RemotePlacementResult'; requestId: number }
  & ({ ok: true } | { ok: false; reason: PlacementFailure });
