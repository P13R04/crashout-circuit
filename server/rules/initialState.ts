/**
 * État initial d'une session : voiture à l'arrêt et état de jeu avec les réglages par défaut de config.json.
 * Liens : server/config.ts, server/types.ts.
 * Réexporté par server/GameRules.ts, qui reste la façade des règles de jeu.
 */
import type { GameState, Team, Car } from '../types.js';
import { config } from '../config.js';
import { LOGICAL_W } from '../layout.js';

/** Crée une voiture avec ses valeurs initiales de santé, de mouvement et de stock. */
export function makeCar(team: Team): Car {
  return {
    team,
    pos: { x: LOGICAL_W / 2, y: 540 },
    angle: 0,
    velocity: { x: 0, y: 0 },
    hp: config.hpMax,
    disabled: false,
    respawnUntil: 0,
    invulnUntil: 0,
    stunUntil: 0,
    ghostUntil: 0,
    lap: 0,
    checkpointIndex: 1,
    heldItem: null,
    itemArmed: false,
    itemArmVersion: 0,
    itemArmExpiry: 0,
    speed: 0,
    slowUntil: 0,
    boostUntil: 0,
    boostK: 0,
  };
}

/** Prépare une session vide avec les réglages par défaut et les deux voitures. */
export function createInitialState(): GameState {
  return {
    phase: 'LOBBY',
    sessionMode: 'race',
    developerTools: false,
    driveMode: { A: 'auto', B: 'auto' },
    tick: 0,
    cars: { A: makeCar('A'), B: makeCar('B') },
    walls: [],
    arcs: [],
    boostGates: [],
    stones: [],
    pickups: [],
    repairPads: {
      'A-pilot':   { team: 'A', role: 'pilot',   held: false, startedAt: 0 },
      'A-copilot': { team: 'A', role: 'copilot', held: false, startedAt: 0 },
      'B-pilot':   { team: 'B', role: 'pilot',   held: false, startedAt: 0 },
      'B-copilot': { team: 'B', role: 'copilot', held: false, startedAt: 0 },
    },
    cooldowns: {
      A: { ghost: 0, destroy: 0, borderPull: 0 },
      B: { ghost: 0, destroy: 0, borderPull: 0 },
    },
    track: null,
    deformations: [],
    winner: null,
    sessionStartAt: Date.now(),
    raceDeadline: 0,
    pausedAt: 0,
    mapTargets: null,
    mapDivider: null,
    mapStrokes: { A: false, B: false },
    mapDeadline: 0,
    mapMode: null,
    repairProgress: { A: 0, B: 0 },
    trackVersion: 0,
    trackPresentation: null,
    tangibles: {},
    tangiblePlacementMode: 'manual',
    tangiblePlacement: null,
    testMode: { invincible: false, allItems: false },
    tutorial: null,
    params: {
      difficulty: 'easy',
      hpMax: config.hpMax,
      lapsToWin: config.lapsToWin,
      sessionMaxSeconds: config.sessionMaxSeconds,
      armWindowS: config.armWindowS,
      ghostS: config.ghostS,
      ghostCooldownS: config.ghostCooldownS,
      destroyCooldownS: config.destroyCooldownS,
      destroyDisableS: config.destroyDisableS,
      borderPullCooldownS: 0,
      trackDeformMaxShiftPx: config.trackDeformMaxShiftPx,
      trackDeformHoldS: config.trackDeformHoldS,
      trackDeformRelaxS: config.trackDeformRelaxS,
      stoneTelegraphS: config.stoneTelegraphS,
      stoneRadiusPx: config.stoneRadiusPx,
      slingMinPullPx: config.slingMinPullPx,
      slingMaxPullPx: config.slingMaxPullPx,
      slingMinRangePx: config.slingMinRangePx,
      slingMaxRangePx: config.slingMaxRangePx,
      boostLenMinPx: config.boostLenMinPx,
      boostLenMaxPx: config.boostLenMaxPx,
      repairHoldS: config.repairHoldS,
      wallLengthPx: config.wallLengthPx,
      wallWidthPx: config.wallWidthPx,
      pylonBasePx: config.pylonBasePx,
      pylonFieldRadiusPx: config.pylonFieldRadiusPx,
      tangibleTolerancePx: config.tangibleTolerancePx,
      tangibleCorrectionPx: config.tangibleCorrectionPx,
      tangibleCorrectionDegrees: config.tangibleCorrectionDegrees,
      tableDiagonalInches: config.tableDiagonalInches,
      arcMaxDistPx: config.arcMaxDistPx,
      logicalWidth: config.logicalWidth,
      logicalHeight: config.logicalHeight,
    },
  };
}
