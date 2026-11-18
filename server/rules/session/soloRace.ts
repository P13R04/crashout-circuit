/**
 * Lance le circuit prédéfini pour l'essai avec un seul pilote.
 * Liens : server/net/playerCommands.ts (StartSolo), server/rules/session/sessionControl.ts (retour à l'accueil).
 * Le mode solo peut venir du démarrage du serveur (CRASHOUT_SOLO_TEST=1) ou, sans variable d'environnement, d'un pilote
 * seul qui le demande depuis l'accueil ; resetToLobby revient alors au réglage du serveur.
 */
import type { GameRules } from '../GameRules.js';

/** Vrai tant que la séance est à l'accueil avec le seul pilote A connecté, sans tutoriel : le solo ne prend la table de personne. */
function canEnterSolo(rules: GameRules): boolean {
  const s = rules.state;
  if (s.phase !== 'LOBBY' || s.tutorial) return false;
  return Object.entries(s.seats).every(([id, seat]) => id === 'A-pilot' ? seat.taken : !seat.taken);
}

/** Refait le départ avec une seule voiture et une accélération liée au pilote, en activant le mode solo si l'accueil le permet. */
export function startSoloRace(rules: GameRules): void {
  const state = rules.state;
  if (!state.soloTest) {
    if (!canEnterSolo(rules)) return;
    state.soloTest = true;
  }
  if (!['LOBBY', 'RACE', 'PAUSED', 'RESULT'].includes(state.phase)) return;
  state.mapMode = 'table';
  rules.startRace();
}
