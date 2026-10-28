import { physicalDimensions } from './tangibleGeometry.js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default config values (REQ-8.1, REQ-8.2)
const defaults = {
  lapsToWin: 3,
  sessionMaxSeconds: 300,
  hpMax: 100,
  dmgWall: 10,
  dmgArc: 10,
  dmgStone: 100, // a stone puts a full-HP car out of order (hpMax)
  invulnAfterHitS: 1,
  stunStoneS: 1,
  arcSlowFactor: 0.5,
  arcSlowS: 1.5,
  repairHoldS: 2,
  repairHpRestore: 60,
  pickupRespawnS: 15,
  armWindowS: 0,
  stoneTelegraphS: 0.8,
  stoneRadiusPx: 60,
  slingMinPullPx: 40,
  slingMaxPullPx: 260,
  slingMinRangePx: 220,
  slingMaxRangePx: 900,
  boostLenMinPx: 100,
  boostLenMaxPx: 400,
  boostGateLifeS: 8,
  boostDurationS: 2,
  boostGain: 0.8,
  ghostS: 3,
  ghostCooldownS: 20,
  destroyDisableS: 10,
  destroyCooldownS: 15,
  tableDiagonalInches: 55,
  ...physicalDimensions(55),
  arcMaxDistPx: 350,
  trackWidthBasePx: 140,
  trackWidthMinPx: 90,
  trackDeformRampS: 0.18,
  trackDeformHoldS: 6,
  trackDeformRelaxS: 1.2,
  trackDeformRadiusPoints: 22,
  trackDeformMaxShiftPx: 220,
  trackDeformSafetyPx: 32,
  vMaxFwd: 420,
  vMaxPedal: 190,
  accel: 600,
  coastDecel: 260,
  turnRate: 2.5,
  steerGain: 1.12,
  pilotInputTimeoutMs: 250,
  physicsHz: 60,
  broadcastHz: 30,
  logicalWidth: 1920,
  logicalHeight: 1080,
};

export type Config = typeof defaults;

function loadConfig(): Config {
  // Compiled: dist/server/config.js → ../../config.json; source (tsx): server/config.ts → ../config.json
  const configPath = [resolve(__dirname, '../../config.json'), resolve(__dirname, '../config.json')]
    .find((p) => existsSync(p)) ?? '';
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const overrides = JSON.parse(raw) as Partial<Config>;
    const diagonal = Number(overrides.tableDiagonalInches);
    const tableDiagonalInches = Number.isFinite(diagonal) && diagonal >= 20 && diagonal <= 120 ? diagonal : 55;
    return { ...defaults, ...overrides, tableDiagonalInches,
      ...physicalDimensions(tableDiagonalInches, defaults.logicalWidth, defaults.logicalHeight) };
  } catch {
    // config.json not found — use defaults
    return { ...defaults };
  }
}

export const config: Config = loadConfig();
