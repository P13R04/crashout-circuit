/**
 * Touch thresholds that can be adjusted without recompiling (issue #38): add them to
 * the table URL, e.g. `/?cluster=220&role=10&dominance=1.3&palm=200`. Unknown or
 * out-of-range values are ignored. The slingshot pull and range limits are server
 * rules: they come from `config.json` (`slingMinPullPx`, `slingMaxPullPx`, ...).
 */
export interface GestureTuning {
  /** Wait for all fingers to land before judging a gesture (ms). */
  settleMs: number;
  /** Three fingers count as one slingshot when each is this close to their centre (logical px). */
  slingClusterPx: number;
  /** A finger must move this far to be designated as the pouch (logical px). */
  slingRoleMinPx: number;
  /** ...and this many times more than each other finger. */
  slingDominance: number;
  /** Largest gap between the two fingers of a boost gate (logical px). */
  boostMaxPx: number;
  /** Contacts wider than this are palms or arms (logical px). */
  palmMaxPx: number;
}

export const DEFAULT_TUNING: Readonly<GestureTuning> = {
  settleMs: 180,
  slingClusterPx: 190,
  slingRoleMinPx: 14,
  slingDominance: 1.5,
  boostMaxPx: 400,
  palmMaxPx: 140,
};

/** URL parameter → field and accepted range. */
export const TUNING_PARAMS: Record<string, { key: keyof GestureTuning; min: number; max: number }> = {
  settle: { key: 'settleMs', min: 30, max: 1000 },
  cluster: { key: 'slingClusterPx', min: 40, max: 600 },
  role: { key: 'slingRoleMinPx', min: 2, max: 100 },
  dominance: { key: 'slingDominance', min: 1, max: 5 },
  boostmax: { key: 'boostMaxPx', min: 50, max: 1200 },
  palm: { key: 'palmMaxPx', min: 20, max: 2000 },
};

/** Live values read by the recognizer on every gesture. */
export const tuning: GestureTuning = { ...DEFAULT_TUNING };

/** Applies the URL parameters to `target` and returns the names that were accepted. */
export function applyTuning(search: string, target: GestureTuning = tuning): string[] {
  const params = new URLSearchParams(search);
  const applied: string[] = [];
  for (const [name, spec] of Object.entries(TUNING_PARAMS)) {
    const raw = params.get(name);
    if (raw === null || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < spec.min || value > spec.max) continue;
    target[spec.key] = value;
    applied.push(name);
  }
  return applied;
}
