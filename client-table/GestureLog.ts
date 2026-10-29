/**
 * Journal of what the touch recognizer decided and why (issue #38): which contact
 * became the pouch, how wide the fingers were, why a shot was cancelled. For test
 * sessions (issue #40) it also carries the server feedbacks and phase changes, so a
 * session can be replayed afterwards. It lives in `view.debug.gestures`, is drawn in
 * the `?debug=1` overlay and is downloaded with F4, or at the end of every game with
 * `?log=1`.
 */
export interface GestureLogEntry {
  /** Seconds since the page loaded. */
  t: number;
  kind: string;
  detail: Record<string, number | string | boolean>;
}

export const GESTURE_LOG_MAX = 2000;

export function recordGesture(
  log: GestureLogEntry[], kind: string, detail: GestureLogEntry['detail'], now = performance.now(),
): void {
  log.push({ t: Math.round(now) / 1000, kind, detail });
  if (log.length > GESTURE_LOG_MAX) log.splice(0, log.length - GESTURE_LOG_MAX);
}

const round = (v: number | string | boolean) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

/** One overlay line: `12.345 puller id=3 move=26 others=4`. */
export function formatGestureEntry(entry: GestureLogEntry): string {
  const fields = Object.entries(entry.detail).map(([k, v]) => `${k}=${round(v)}`).join(' ');
  return `${entry.t.toFixed(3)} ${entry.kind} ${fields}`.trim();
}

/** One row per entry; the detail is a JSON column so the header never changes. */
export function gestureLogCsv(log: readonly GestureLogEntry[]): string {
  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ['t,kind,detail', ...log.map(e => `${e.t},${e.kind},${cell(JSON.stringify(e.detail))}`)].join('\n');
}
