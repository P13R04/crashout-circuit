/**
 * Réparation coopérative, réapparition, dégâts et sortie de piste.
 * Liens : server/PhysicsLoop.ts, server/raceSettings.ts.
 * Fonctions appelées par les méthodes de GameRules (server/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { Team, Car, PadHoldMsg } from '../types.js';
import { RESPAWN_COUNTDOWN_MS } from '../armedPickup.js';
import { config } from '../config.js';
import { TEAMS } from './rulesBasics.js';
import type { GameRules } from '../GameRules.js';

/** Met à jour l’appui de réparation du poste et le transmet au tutoriel si nécessaire. */
export function onPadHold(rules: GameRules, msg: PadHoldMsg): void {
  if (rules.state.sessionMode === 'tangibles-test' && msg.role === 'pilot') return;
  const pad = rules.state.repairPads[`${msg.team}-${msg.role}`];
  if (!pad) return;
  pad.held = !!msg.on;
  pad.startedAt = pad.held ? rules.now : 0;
  if (pad.held && rules.state.phase === 'RACE' && rules.state.tutorial) {
    const wasIdentifying = rules.tutorialIdentifying();
    rules.tutorial?.onStation(msg.team, msg.role);
    rules.launchTutorialIfReady(wasIdentifying);
  }
}

/** Relâche les appuis de réparation lorsque la session ou la connexion est interrompue. */
export function releaseAllPads(rules: GameRules): void {
  for (const pad of Object.values(rules.state.repairPads)) { pad.held = false; pad.startedAt = 0; }
}

/** Fait progresser la réparation seulement lorsque les deux partenaires maintiennent leurs appuis. */
export function updateRepair(rules: GameRules, dt: number, now: number): void {
  const s = rules.state;
  for (const team of TEAMS) {
    const car = s.cars[team];
    const needsRepair = car.disabled || car.hp < config.repairHpRestore;
    if (s.sessionMode === 'tangibles-test') {
      const pilot = s.repairPads[`${team}-pilot`];
      if (pilot.held !== needsRepair) { pilot.held = needsRepair; pilot.startedAt = needsRepair ? now : 0; }
    }
    const both = s.repairPads[`${team}-pilot`].held && s.repairPads[`${team}-copilot`].held;
    if (!both || !needsRepair) { s.repairProgress[team] = 0; continue; }
    s.repairProgress[team] = Math.min(1, s.repairProgress[team] + dt / config.repairHoldS);
    if (s.repairProgress[team] >= 1) completeRepair(rules, team, now);
  }
}

/** Restaure la voiture et prépare son retour avec les feux de reprise si elle était en panne. */
function completeRepair(rules: GameRules, team: Team, now: number): void {
  const s = rules.state;
  const car = s.cars[team];
  const wasDisabled = car.disabled;
  car.hp = Math.max(car.hp, config.repairHpRestore);
  car.disabled = false;
  car.stunUntil = 0;
  car.respawnUntil=now+RESPAWN_COUNTDOWN_MS;
  car.speed=0;car.velocity={x:0,y:0};
  car.invulnUntil = car.respawnUntil + config.invulnAfterHitS * 1000;
  if (wasDisabled && s.track) {
    respawnAtCheckpoint(rules, car);
    rules.automaticPilot.forget(team);
  }
  s.repairProgress[team] = 0;
  if (s.sessionMode === 'tangibles-test') {
    const pilot = s.repairPads[`${team}-pilot`];
    pilot.held = false; pilot.startedAt = 0;
  }
  rules.host.feedback('repairDone', car.pos.x, car.pos.y, team);
}

/** Replace la voiture au dernier point de passage validé avec la direction de la piste. */
export function respawnAtCheckpoint(rules: GameRules, car: Car): void {
  const track = rules.state.track!;
  const last = (car.checkpointIndex - 1 + track.checkpoints.length) % track.checkpoints.length;
  const cp = track.checkpoints[last];
  car.pos = { x: cp.pos.x, y: cp.pos.y };
  car.angle = Math.atan2(-cp.normal.x, cp.normal.y);
  car.speed = 0;
  car.velocity = { x: 0, y: 0 };
}

/** Applique les dégâts autorisés et immobilise la voiture lorsque sa santé atteint zéro. */
export function damage(rules: GameRules, car: Car, amount: number, now: number,feedback='hit'): void {
  if (car.disabled || rules.state.testMode.invincible) return;
  if (rules.state.tutorial) amount = 0; // lessons show the hit, never its cost
  car.hp = Math.max(0, car.hp - amount);
  rules.host.feedback(feedback, car.pos.x, car.pos.y, car.team);
  if (car.hp === 0) {
    car.disabled = true;
    car.speed = 0;
    car.velocity = { x: 0, y: 0 };
    rules.host.feedback('carDisabled', car.pos.x, car.pos.y, car.team);
  }
  void now;
}

/** Traite une sortie de piste ou remet la voiture sur la route pendant l’entraînement. */
export function fallOffTrack(rules: GameRules, team: Team, now: number): void {
  const car = rules.state.cars[team];
  if (car.disabled) return;
  if (rules.state.testMode.invincible || rules.state.tutorial) {
    // Invincible: the fall costs nothing, the car is simply put back on the track
    respawnAtCheckpoint(rules, car);
    rules.host.feedback('fall', car.pos.x, car.pos.y, team);
    return;
  }
  car.hp = 0;
  car.disabled = true;
  car.speed = 0;
  car.velocity = { x: 0, y: 0 };
  rules.host.feedback('fall', car.pos.x, car.pos.y, team);
  rules.host.feedback('carDisabled', car.pos.x, car.pos.y, team);
  void now;
}
