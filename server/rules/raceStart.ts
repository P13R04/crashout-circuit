/**
 * Préparation du départ et lancement de la course : voitures, ramassables, tangibles et pilotes automatiques.
 * Liens : server/PhysicsLoop.ts, server/AutomaticPilot.ts, server/trackPresentation.ts.
 * Fonctions appelées par les méthodes de GameRules (server/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { TrackPresentation } from '../types.js';
import { presentingTrack } from '../trackPresentation.js';
import { clampToTrackRibbon } from '../geometry.js';
import { generatePreset } from '../MapGenerator.js';
import { COUNTDOWN_MS, TEAMS } from './rulesBasics.js';
import { makeCar } from './initialState.js';
import type { GameRules } from '../GameRules.js';

/** Installe le circuit, les voitures et les objets de la nouvelle course. */
export function startRace(rules: GameRules, track = generatePreset(), waitForPlayers = false, presentation: TrackPresentation | null = null): void {
  rules.state.tangiblePlacement = null;
  const s = rules.state;
  rules.generating = true;
  rules.automaticPilot.reset();
  s.track = track;
  s.trackPresentation = presentation;
  s.pausedAt = 0;
  rules.pausedAt = 0;
  s.deformations = [];
  s.trackVersion++;
  for (const team of TEAMS) {
    const car = makeCar(team);
    const sp = track.startPositions[team === 'A' ? 0 : 1];
    const tan = { x: track.startLine.normal.y, y: -track.startLine.normal.x };
    car.pos = { x: sp.x, y: sp.y };
    car.angle = Math.atan2(tan.y, tan.x);
    s.cars[team] = car;
    rules.inputs[team] = { throttle: rules.state.driveMode[team] === 'pedal' ? 0 : 1, steer: 0 };
    rules.lastPilotInputAt[team] = rules.now;
    s.repairProgress[team] = 0;
    s.cooldowns[team] = { ghost: 0, destroy: 0, borderPull: 0 };
  }
  for (const pad of Object.values(s.repairPads)) { pad.held = false; pad.startedAt = 0; }
  s.walls = []; s.arcs = []; s.boostGates = []; s.stones = [];
  s.pickups = track.pickupPositions.map(/* Construit chaque ramassable avec une pose sûre et un type adapté au tutoriel ou à la course. */ (pos, i) => ({
    id: i, pos: clampToTrackRibbon(pos, track, 25), kind: s.tutorial ? (i%2===0?'slingshot':'boost') : rules.randomItem(), respawnAt: 0,
  }));
  s.winner = null;
  s.sessionStartAt = waitForPlayers ? 0 : rules.now + COUNTDOWN_MS;
  s.raceDeadline=!waitForPlayers&&s.params.sessionMaxSeconds>0?s.sessionStartAt+s.params.sessionMaxSeconds*1000:0;
  for(const id of [1,2,3])rules.state.tangibles[id]=rules.parkedTangible(id);
  rules.rebuildTangibles();
  rules.host.transition(waitForPlayers ? 'READY' : 'RACE', { startsAt: s.sessionStartAt });
  rules.host.broadcastFull();
}

/** Lance les feux de départ lorsque la piste est prête et sa présentation terminée. */
export function beginRace(rules: GameRules): void {
  if (rules.state.phase !== 'READY' || presentingTrack(rules.state,rules.now)) return;
  rules.state.trackPresentation=null;
  rules.state.sessionStartAt = rules.now + COUNTDOWN_MS;
  rules.state.raceDeadline=rules.state.params.sessionMaxSeconds>0?rules.state.sessionStartAt+rules.state.params.sessionMaxSeconds*1000:0;
  rules.host.transition('RACE', { startsAt: rules.state.sessionStartAt });
  rules.host.broadcastFull();
}

/** Prépare le circuit et les voitures autonomes du mode d’essai réservé au développement. */
// Essai autonome des tangibles ; entrée masquée et filtrée dans GameServer.ts.
export function startTangibleTest(rules: GameRules): void {
  const s = rules.state;
  if (s.phase !== 'LOBBY') return;
  s.sessionMode = 'tangibles-test';
  s.mapMode = 'table';
  s.testMode = { invincible: false, allItems: false };
  startRace(rules, generatePreset(), true);
}

/** Remplace les entrées pilotes par les commandes de suivi du centre dans le mode d’essai. */
export function updateAutomaticPilots(rules: GameRules, now: number): void {
  const s = rules.state;
  if (s.sessionMode !== 'tangibles-test' || !s.track || s.phase !== 'RACE') return;
  for (const team of TEAMS) {
    rules.inputs[team] = now < s.sessionStartAt + (team === 'B' ? 2000 : 0)
      ? { throttle: 0, steer: 0 } : rules.automaticPilot.command(s.cars[team], s.track, s.trackVersion);
  }
}
