/**
 * Déroulement du tutoriel côté règles : lancement, identification des postes, passage de leçon et départ de la course.
 * Liens : server/modes/Tutorial.ts.
 * Fonctions appelées par les méthodes de GameRules (server/rules/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { Team } from '../../types.js';
import { config } from '../../config.js';
import { generatePreset } from '../../track/MapGenerator.js';
import { Tutorial, TUTORIAL_ARM_WINDOW_S } from '../../modes/Tutorial.js';
import { COUNTDOWN_MS, TEAMS } from './rulesBasics.js';
import type { GameRules } from '../GameRules.js';

/**
 * Crée la progression guidée des deux équipes et installe le circuit prédéfini.
 * Tutorial.ts fait progresser chaque équipe séparément, sans victoire ni perte de vie ; mode distingue les doigts de la souris.
 */
// Tutoriel : démarrage, identification des postes et passage à une course normale.
export function startTutorial(rules: GameRules, mode: 'table' | 'pc' = 'table'): void {
  const s = rules.state;
  if (s.phase !== 'LOBBY') return;
  s.mapMode = mode;
  s.params.armWindowS = TUTORIAL_ARM_WINDOW_S;
  rules.tutorial = new Tutorial(s, {
    /** Réutilise la commande POWER pour préparer le bonus demandé par la leçon. */
    arm:team=>rules.onPower(team),
    /** Fournit l’heure de simulation utilisée par les règles et les tests rejouables. */
    now: () => rules.now,
    /** Immobilise la voiture pour l’exercice de réparation sans simuler un choc. */
    breakDown: (team) => {
      const car = s.cars[team];
      car.hp = 0;
      car.disabled = true;
      car.speed = 0;
      car.velocity = { x: 0, y: 0 };
      rules.host.feedback('carDisabled', car.pos.x, car.pos.y, team);
    },
    /** Remet la voiture sur le circuit lorsqu’une leçon de réparation est passée. */
    restore: (team) => {
      const car = s.cars[team];
      car.disabled = false;
      car.respawnUntil = 0;
      car.stunUntil = 0;
      car.invulnUntil = rules.now + config.invulnAfterHitS * 1000;
      rules.respawnAtCheckpoint(car);
      s.repairProgress[team] = 0;
    },
    /** Transmet le retour de jeu au serveur et à la validation du tutoriel. */
    feedback: (kind, x, y, team) => rules.host.feedback(kind, x, y, team),
  }, mode);
  rules.startRace(generatePreset());
}

/** Fait avancer l’équipe demandée lorsqu’une étape du tutoriel doit être débloquée. */
export function tutorialSkip(rules: GameRules, team: Team): void {
  if (rules.state.phase !== 'RACE' || (team !== 'A' && team !== 'B')) return;
  const wasIdentifying = tutorialIdentifying(rules);
  rules.tutorial?.skip(team);
  launchTutorialIfReady(rules, wasIdentifying);
}

/** Indique si une équipe attend encore l’identification de ses postes avant le départ. */
export function tutorialIdentifying(rules: GameRules): boolean {
  const tut=rules.state.tutorial;
  return !!tut && TEAMS.some(/* Repère une équipe encore en attente d’identification de ses postes. */ t=>tut.steps[tut.teams[t].step]==='identify');
}

/** Lance le compte à rebours une fois les quatre postes identifiés. */
export function launchTutorialIfReady(rules: GameRules, wasIdentifying: boolean): void {
  if (wasIdentifying && !tutorialIdentifying(rules)) {
    rules.state.sessionStartAt = rules.now + COUNTDOWN_MS;
    for(const team of TEAMS) rules.inputs[team].steer=0;
  }
}

/** Quitte l’entraînement terminé et ouvre la création d’une course normale. */
export function tutorialRace(rules: GameRules): void {
  if (rules.state.phase !== 'RACE' || !rules.state.tutorial?.finished) return;
  const mode = rules.state.mapMode ?? 'table';
  rules.resetToLobby();
  rules.enterMap(mode);
}
