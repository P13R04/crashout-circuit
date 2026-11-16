/** Lance le circuit prédéfini pour l'essai de connexion avec un seul pilote. */
import type { GameRules } from '../GameRules.js';

/** Refait le départ avec une seule voiture et une accélération liée au téléphone. */
export function startSoloRace(rules: GameRules): void {
  const state = rules.state;
  if (!state.soloTest || !['LOBBY', 'RACE', 'PAUSED', 'RESULT'].includes(state.phase)) return;
  state.driveMode.A = 'pedal';
  state.mapMode = 'table';
  rules.startRace();
}
