/** Diffuse l’état réduit en SSE aux spectateurs connectés, avec cache de géométrie par connexion. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GameState } from '../types.js';
import { config } from '../config.js';
import { spectatorState } from './spectatorState.js';

type Listener = { res: ServerResponse; trackVersion: number; phase: GameState['phase'] | null };

export class SpectatorStream {
  private readonly listeners = new Set<Listener>();
  private readonly limit = 8;

  constructor(readonly enabled: boolean, private readonly state: () => GameState, private readonly room: () => string) {
    if (!enabled) return;
    setInterval(this.tick, 1000 / Math.max(1, Math.min(30, config.spectatorHz))).unref();
    setInterval(() => {
      for (const { res } of this.listeners) if (!res.writableNeedDrain) res.write(': connexion\n\n');
    }, 15000).unref();
  }

  connect(req: IncomingMessage, res: ServerResponse, room: string | null): void {
    if (!this.enabled || room !== this.room()) { res.writeHead(404).end(); return; }
    if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }).end(); return; }
    if (this.listeners.size >= this.limit) { res.writeHead(503).end(); return; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no', Connection: 'keep-alive',
    });
    res.flushHeaders();
    res.write('retry: 1500\n\n');
    const listener: Listener = { res, trackVersion: -1, phase: null };
    this.listeners.add(listener);
    res.once('close', () => this.listeners.delete(listener));
    this.tick();
  }

  private tick = (): void => {
    if (!this.listeners.size) return;
    const state = this.state(), t = Date.now();
    let full = '', delta = '';
    for (const listener of this.listeners) {
      const { res } = listener;
      if (res.writableNeedDrain || res.destroyed) continue;
      if (listener.phase !== state.phase) {
        res.write('event: phase\ndata: ' + JSON.stringify({ phase: state.phase }) + '\n\n');
        if (state.phase === 'RESULT') res.write('event: result\ndata: ' + JSON.stringify({ winner: state.winner }) + '\n\n');
      }
      const complete = listener.trackVersion !== state.trackVersion;
      const event = complete ? full ||= this.encode(t, state, true) : delta ||= this.encode(t, state, false);
      res.write(event);
      listener.trackVersion = state.trackVersion;
      listener.phase = state.phase;
    }
  };

  private encode(t: number, state: GameState, track: boolean): string {
    return 'event: race\ndata: ' + JSON.stringify({ t, state: spectatorState(state, track) }) + '\n\n';
  }
}
