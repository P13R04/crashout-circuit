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
  dmgStone: 25,
  invulnAfterHitS: 1,
  stunStoneS: 1,
  arcSlowFactor: 0.5,
  arcSlowS: 1.5,
  repairHoldS: 2,
  repairHpRestore: 60,
  pickupRespawnS: 15,
  armWindowS: 5,
  stoneTelegraphS: 0.8,
  stoneRadiusPx: 60,
  boostLenMinPx: 100,
  boostLenMaxPx: 400,
  boostGateLifeS: 8,
  boostDurationS: 2,
  boostGain: 0.8,
  ghostS: 3,
  ghostCooldownS: 20,
  destroyDisableS: 10,
  destroyCooldownS: 15,
  wallLengthPx: 120,
  arcMaxDistPx: 500,
  trackWidthBasePx: 140,
  trackWidthMinPx: 90,
  vMaxFwd: 420,
  vMaxRev: 140,
  accel: 600,
  turnRate: 2.5,
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
    return { ...defaults, ...overrides };
  } catch {
    // config.json not found — use defaults
    return { ...defaults };
  }
}

export const config: Config = loadConfig();
