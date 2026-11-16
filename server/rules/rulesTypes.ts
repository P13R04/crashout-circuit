/**
 * Contrats des règles : notifications demandées à l'hôte et entrée du journal des tangibles.
 * Liens : server/GameServer.ts, server/PhysicsLoop.ts, server/types.ts.
 * Réexporté par server/GameRules.ts, qui reste la façade des règles de jeu.
 */
import type { Team, Phase, ItemKind, TangibleControlMsg } from '../types.js';

/** Déclare les notifications de réseau et de phase que les règles demandent à leur hôte. */
export interface RulesHost {
  feedback(kind: string, x: number, y: number, team: Team, itemKind?: ItemKind): void;
  transition(phase: Phase, data?: unknown): void;
  /** Broadcast the full state (including the heavy track / QR fields). */
  broadcastFull(): void;
}

/** Décrit une pose ou une modification de tangible enregistrée dans le journal serveur. */
export interface TangibleLogEntry {
  t: number;
  type: 'TangibleMoved' | 'TangibleRemoved' | 'TangibleControl';
  action?: TangibleControlMsg['action'];
  team?: Team;
  kind?: 'wall' | 'pylon';
  id: number;
  x?: number;
  y?: number;
  angle?: number;
  active?: boolean;
}
