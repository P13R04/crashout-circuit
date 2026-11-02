/**
 * Construit les commandes de conduite, de POWER et de gestes envoyées par les adaptateurs de la table.
 * Liens : server/types.ts.
 * Référencé par client-table/GestureRecognizer.ts, client-table/main.ts.
 */
import type { Team, Vec2, ItemKind } from '../server/types.js';

/** Décrit l’envoi d’une commande déjà reconnue vers le réseau ou le double de test. */
type Send = (message: { type: string } & Record<string, unknown>) => void;

/** Expose les commandes communes utilisées par le tactile et le clavier pour envoyer les mêmes messages au serveur. */
export function createControls(send: Send) {
  return {
    /** Borne la direction et l’accélération puis transmet la commande de conduite de l’équipe. */
    steer(team: Team, value: number, throttle = 1): void {
      if (!Number.isFinite(value) || !Number.isFinite(throttle)) return;
      send({ type: 'PilotInput', team, throttle: Math.max(0, Math.min(1, throttle)), steer: Math.max(-1, Math.min(1, value)) });
    },
    /** Envoie l’armement demandé par le copilote de l’équipe. */
    power(team: Team): void { send({ type: 'Power', team, role: 'copilot' }); },
    /** Convertit le geste reconnu en message de lance-pierre ou de zone d’accélération. */
    gesture(kind: ItemKind, team: Team, a: Vec2, b?: Vec2): void {
      if (kind === 'slingshot' && b) send({ type: 'Slingshot', team, anchor: a, pouch: b });
      else if (b) send({ type: 'BoostGate', team, a, b });
    },
  };
}
