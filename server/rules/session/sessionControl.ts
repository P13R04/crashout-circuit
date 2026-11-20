/**
 * Pilotage de la session : interrupteurs de test PC, pause, tirage d'objet et retour à l'accueil.
 * Liens : server/net/GameServer.ts, server/rules/raceSettings.ts.
 * Fonctions appelées par les méthodes de GameRules (server/rules/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { ItemKind, TestToggleMsg } from '../../types.js';
import { config } from '../../config.js';
import { TEAMS } from './rulesBasics.js';
import { makeCar } from './initialState.js';
import type { GameRules } from '../GameRules.js';

/** Applique les aides de test uniquement dans le mode clavier hors tutoriel. */
export function onTestToggle(rules: GameRules, msg: TestToggleMsg): void {
  const s = rules.state;
  // The lessons need the real item rules: no free items, no invincibility switch
  if (s.mapMode !== 'pc' || s.tutorial) return;
  if (msg.flag !== 'invincible' && msg.flag !== 'allItems') return;
  s.testMode[msg.flag] = !!msg.on;
  if (msg.flag === 'allItems' && !msg.on) {
    // back to the normal rules: nothing stays armed for free
    for (const t of TEAMS) {
      const car = s.cars[t];
      car.itemArmed = false;
      car.itemArmExpiry = 0;
    }
  }
  rules.host.broadcastFull();
}

/** Fige les commandes et les échéances puis les décale ensemble lors de la reprise. */
// Pause et reprise ; resetToLobby, plus bas, nettoie toute la session.
export function togglePause(rules: GameRules): void {
  rules.cancelTangiblePlacement();
  const s = rules.state;
  if (s.phase === 'RACE') {
    rules.pausedAt = rules.now;
    s.pausedAt = rules.pausedAt;
    rules.releaseAllPads();
    rules.host.transition('PAUSED');
    rules.host.broadcastFull();
  } else if (s.phase === 'PAUSED') {
    const delta = rules.now - rules.pausedAt;
    /** Décale les échéances encore actives de la durée de pause. */
    const shift = (value: number) => value > rules.pausedAt ? value + delta : value;
    s.sessionStartAt += delta;
    if(s.raceDeadline)s.raceDeadline+=delta;
    for (const car of Object.values(s.cars)) {
      for (const key of ['respawnUntil', 'invulnUntil', 'stunUntil', 'ghostUntil', 'slowUntil', 'boostUntil'] as const) car[key] = shift(car[key]);
    }
    for (const cd of Object.values(s.cooldowns)) { cd.ghost = shift(cd.ghost); cd.destroy = shift(cd.destroy); }
    for (const wall of s.walls) { wall.disabledUntil = shift(wall.disabledUntil); if (wall.expiresAt) wall.expiresAt = shift(wall.expiresAt); }
    for (const arc of s.arcs) arc.disabledUntil = shift(arc.disabledUntil);
    for (const pickup of s.pickups) pickup.respawnAt = shift(pickup.respawnAt);
    for (const gate of s.boostGates) { gate.expiresAt = shift(gate.expiresAt); if (gate.createdAt !== undefined) gate.createdAt += delta; }
    for (const stone of s.stones) { stone.launchedAt += delta; stone.impactAt = shift(stone.impactAt); }
    for (const d of s.deformations) { d.createdAt += delta; if(d.holdUntil)d.holdUntil+=delta; if (d.releaseAt !== null) d.releaseAt += delta; }
    rules.pausedAt = 0;
    s.pausedAt = 0;
    rules.host.transition('RACE');
    rules.host.broadcastFull();
  }
}

/** Tire le prochain type de bonus à partir du générateur aléatoire de la session. */
export function randomItem(rules: GameRules): ItemKind {
  return rules.rng() < 0.5 ? 'slingshot' : 'boost';
}

/** Efface les objets, commandes et progressions de session avant de revenir à l’accueil. */
export function resetToLobby(rules: GameRules): void {
  const s = rules.state;
  s.winner = null;
  s.track = null;
  s.trackPresentation = null;
  s.trackVersion++;
  s.walls = []; s.arcs = []; s.boostGates = []; s.stones = []; s.pickups = [];
  s.tangibles = {};
  s.tangiblePlacement = null;
  s.mapTargets = null;
  s.mapDivider = null;
  s.mapStrokes = { A: false, B: false };
  s.mapMode = null;
  s.sessionMode = 'race';
  s.wideTable = false;
  s.soloTest = rules.soloByDefault;
  s.raceDeadline=0;
  rules.automaticPilot.reset();
  s.testMode = { invincible: false, allItems: false };
  s.tutorial = null;
  rules.tutorial = null;
  s.params.armWindowS = config.armWindowS;
  s.mapDeadline = 0;
  rules.generating = false;
  rules.strokes = { A: null, B: null };
  rules.pausedAt = 0;
  s.pausedAt = 0;
  rules.releaseAllPads();
  rules.inputs.A = { throttle: 1, steer: 0 };
  rules.inputs.B = { throttle: 1, steer: 0 };
  s.cars.A = makeCar('A');
  s.cars.B = makeCar('B');
  s.repairProgress = { A: 0, B: 0 };
  s.cooldowns = {
    A: { ghost: 0, destroy: 0, borderPull: 0 },
    B: { ghost: 0, destroy: 0, borderPull: 0 },
  };
  rules.host.transition('LOBBY');
  rules.host.broadcastFull();
}
