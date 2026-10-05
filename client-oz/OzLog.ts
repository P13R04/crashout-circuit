/**
 * OzLog — timestamped journal of every event the operator emits (REQ-7.3).
 * Entries are `{ t, type, params }`; the exported JSON can be loaded later and
 * replayed with the original delays (T-11).
 */
export interface OzLogEntry {
  t: number;                       // ms since epoch
  type: string;                    // protocol message type, or 'ReactionTime'
  params: Record<string, unknown>; // the message payload without `type` and `t`
}

export class OzLog {
  readonly entries: OzLogEntry[] = [];
  private replayTimers: ReturnType<typeof setTimeout>[] = [];
  private onChange: (() => void) | null = null;

  /** Called after every new entry (to refresh the on-screen journal). */
  subscribe(fn: () => void): void { this.onChange = fn; }

  record(type: string, params: Record<string, unknown>, t = Date.now()): void {
    this.entries.push({ t, type, params });
    this.onChange?.();
  }

  /** Last `n` lines, formatted as in the design (HH:MM:SS.mmm  Type  k=v …). */
  tail(n = 50): string[] {
    return this.entries.slice(-n).map((e) => {
      const d = new Date(e.t);
      const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
      const kv = Object.entries(e.params)
        .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 1000) / 1000 : JSON.stringify(v)}`)
        .join(' ');
      return `${ts}  ${e.type}  ${kv}`;
    });
  }

  exportJson(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  download(filename = `oz-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`): void {
    const blob = new Blob([this.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** Parse an exported journal; throws on malformed input. */
  static parse(json: string): OzLogEntry[] {
    const data = JSON.parse(json) as unknown;
    if (!Array.isArray(data)) throw new Error('journal: tableau attendu');
    return data.map((e) => {
      if (typeof e?.t !== 'number' || typeof e?.type !== 'string') throw new Error('journal: entrée invalide');
      return { t: e.t, type: e.type, params: (e.params ?? {}) as Record<string, unknown> };
    });
  }

  /**
   * Re-emit the entries with their original delays. `emit` receives the protocol
   * message without `t` (the sender stamps it). `ReactionTime` entries are skipped.
   */
  replay(entries: OzLogEntry[], emit: (type: string, params: Record<string, unknown>) => void, onDone?: () => void): void {
    this.stopReplay();
    const playable = entries.filter((e) => e.type !== 'ReactionTime');
    if (playable.length === 0) { onDone?.(); return; }
    const t0 = playable[0].t;
    for (const e of playable) {
      this.replayTimers.push(setTimeout(() => emit(e.type, e.params), e.t - t0));
    }
    this.replayTimers.push(setTimeout(() => onDone?.(), playable[playable.length - 1].t - t0 + 50));
  }

  stopReplay(): void {
    this.replayTimers.forEach(clearTimeout);
    this.replayTimers = [];
  }
}
