/**
 * Types de la reconnaissance tactile : zone d'un contact, contact suivi et envoi d'une commande reconnue.
 * Liens : client-table/view.ts, server/layout.ts.
 * Réexporté par client-table/GestureRecognizer.ts, qui reste la façade du lecteur de gestes.
 */
import type { Team, Vec2 } from '../../server/types.js';
import { type PanelLayout } from '../../server/layout.js';

/** Décrit l’usage réservé à un contact afin de ne pas mélanger commandes et gestes libres. */
type Zone = 'tangible' | 'simsling' | 'steer' | 'pedal' | 'item' | 'pad' | 'stroke' | 'target' | 'result' | 'pause' | 'mode' | 'free' | 'rejected';

/** Suit un doigt, sa zone et son déplacement depuis sa pose jusqu’à sa consommation. */
export interface Contact {
  id: number;
  x: number; y: number;
  sx: number; sy: number;
  zone: Zone;
  consumed: boolean;
  padKey?: string;
  panel?: PanelLayout;
  steer?: number;
  strokeTeam?: Team;
  strokeKey?: number; // unique per drawn stroke (a mouse reuses the same pointerId)
  outward?: Vec2; // border candidate: unit vector away from the centerline
  edgeIndex?: number;
  edgeSide?: number;
  edgeBank?: 'outer'|'inner';
  startedAt: number;
  releasedAt?: number;
}

/** Décrit l’envoi d’une commande déjà reconnue vers le réseau ou le double de test. */
export type Send = (msg: { type: string } & Record<string, unknown>) => void;
