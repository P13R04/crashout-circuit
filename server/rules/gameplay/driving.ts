/**
 * Conduite et réglages de course : commandes du pilote, difficulté, mode de conduite et expiration des commandes.
 * Liens : server/PhysicsLoop.ts, server/rules/raceSettings.ts.
 * Fonctions appelées par les méthodes de GameRules (server/rules/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { Team, PilotInputMsg, RaceSettingsMsg } from '../../types.js';
import { config } from '../../config.js';
import { TEAMS, clamp } from '../session/rulesBasics.js';
import type { GameRules } from '../GameRules.js';

/** Valide et mémorise la commande du pilote puis informe le tutoriel des actions effectuées. */
export function onPilotInput(rules: GameRules, team: Team, msg: PilotInputMsg): void {
  if (rules.state.sessionMode === 'tangibles-test') return;
  if (!Number.isFinite(msg.throttle) || !Number.isFinite(msg.steer)) return;
  const steer = clamp(msg.steer, -1, 1);
  rules.inputs[team] = {
    throttle: clamp(msg.throttle, 0, 1),
    steer: steer * config.steerGain,
  };
  rules.lastPilotInputAt[team] = rules.now;
  if (rules.now >= rules.state.sessionStartAt) rules.tutorial?.onPilotInput(team, steer, rules.inputs[team].throttle);
}

/** Applique les réglages de difficulté, de tours et de durée en dehors du tutoriel. */
export function updateRaceSettings(rules: GameRules, msg: RaceSettingsMsg): void {
  const s=rules.state;if(s.tutorial||s.phase==='RESULT')return;
  if(msg.difficulty!==undefined&&!['easy','medium','hard'].includes(msg.difficulty))return;
  if(msg.lapsToWin!==undefined&&(!Number.isInteger(msg.lapsToWin)||msg.lapsToWin<1||msg.lapsToWin>99))return;
  if(msg.sessionMaxSeconds!==undefined&&(!Number.isInteger(msg.sessionMaxSeconds)||msg.sessionMaxSeconds<0||msg.sessionMaxSeconds>7200))return;
  if(msg.difficulty!==undefined)s.params.difficulty=msg.difficulty;
  if(msg.lapsToWin!==undefined)s.params.lapsToWin=msg.lapsToWin;
  if(msg.sessionMaxSeconds!==undefined){
    s.params.sessionMaxSeconds=msg.sessionMaxSeconds;
    const now=s.phase==='PAUSED'?s.pausedAt:rules.now;
    s.raceDeadline=msg.sessionMaxSeconds>0&&['RACE','PAUSED'].includes(s.phase)?Math.max(now,s.sessionStartAt)+msg.sessionMaxSeconds*1000:0;
  }
  rules.host.broadcastFull();
}

/** Bascule la conduite d’une équipe entre avance automatique et pédale tout en relâchant son entrée précédente. */
export function toggleDriveMode(rules: GameRules, team?: Team): void {
  if (rules.state.phase === 'RESULT' || rules.state.sessionMode === 'tangibles-test') return;
  if (team) {
    rules.state.driveMode[team] = rules.state.driveMode[team] === 'auto' ? 'pedal' : 'auto';
    rules.inputs[team].throttle = 0;
  } else {
    for (const t of TEAMS) {
      rules.state.driveMode[t] = rules.state.driveMode[t] === 'auto' ? 'pedal' : 'auto';
      rules.inputs[t].throttle = 0;
    }
  }

  rules.tutorial?.onDriveMode();
  rules.host.broadcastFull();
}

/** Relâche une commande de conduite qui n’a plus reçu de nouvelles du client. */
export function expirePilotInputs(rules: GameRules, now: number): void {
  if (rules.state.sessionMode === 'tangibles-test') return;
  for (const team of TEAMS) {
    if (now - rules.lastPilotInputAt[team] <= config.pilotInputTimeoutMs) continue;
    rules.inputs[team].steer = 0;
    if (rules.state.soloTest) rules.inputs[team].throttle = 0;
  }
}
