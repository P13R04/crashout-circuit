/**
 * Tours, chronomètre et résultat de la course.
 * Liens : server/PhysicsLoop.ts.
 * Fonctions appelées par les méthodes de GameRules (server/rules/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { Team, Car } from '../../types.js';
import { TEAMS } from './rulesBasics.js';
import type { GameRules } from '../GameRules.js';

/** Détermine le résultat lorsque le nombre de tours ou la durée de course est atteint. */
export function checkEnd(rules: GameRules, now: number): void {
  const s = rules.state;
  if (s.phase !== 'RACE' || s.tutorial || s.sessionMode === 'tangibles-test' || now < s.sessionStartAt) return;
  /** Classe la progression d’une voiture à partir de ses tours et de son prochain checkpoint. */
  const progress = (c: Car) => c.lap * 8 + c.checkpointIndex;
  let winner: Team | 'draw' | null = null;
  for (const t of TEAMS) if (s.cars[t].lap >= s.params.lapsToWin) { winner = t; break; }
  if (!winner && s.raceDeadline>0 && now >= s.raceDeadline) {
    const a = progress(s.cars.A), b = progress(s.cars.B);
    winner = a === b ? 'draw' : a > b ? 'A' : 'B';
  }
  if (!winner) return;
  s.winner = winner;
  rules.releaseAllPads();
  rules.inputs.A = { throttle: 0, steer: 0 };
  rules.inputs.B = { throttle: 0, steer: 0 };
  rules.host.transition('RESULT', { winner });
  rules.host.broadcastFull();
}
