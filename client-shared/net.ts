/**
 * Client-side networking helpers shared by the table and the Oz console.
 *
 * - `StateSync` re-attaches the heavy fields (track, QR images) that the server only
 *   sends on change, so every consumer sees a complete GameState.
 * - the server clock offset lets rings and timers use server timestamps even when
 *   the browser's clock differs.
 */
import type { GameState, TrackGeometry, LobbyUrls, ServerMessage } from '../server/types.js';

export class StateSync {
  private track: TrackGeometry | null = null;
  private trackVersion = -1;
  private lobbyUrls: LobbyUrls | null = null;
  /** serverTime − localTime (ms), smoothed; positive when the server clock is ahead. */
  private offset = 0;
  private haveOffset = false;

  /** Merge a State message into a complete GameState. */
  apply(state: GameState, serverT: number): GameState {
    // Keep the smallest observed (serverT − localNow): it carries the least network delay.
    const sample = serverT - Date.now();
    if (!this.haveOffset || sample < this.offset) { this.offset = sample; this.haveOffset = true; }
    else this.offset += (sample - this.offset) * 0.02;

    if (state.track) {
      this.track = state.track;
      this.trackVersion = state.trackVersion;
    } else if (state.trackVersion !== this.trackVersion) {
      this.track = null;
      this.trackVersion = state.trackVersion;
    } else {
      state.track = this.track;
    }
    if (state.lobbyUrls) this.lobbyUrls = state.lobbyUrls;
    else state.lobbyUrls = this.lobbyUrls;
    return state;
  }

  /** Current server time in ms. */
  now(): number {
    return Date.now() + this.offset;
  }
}

export interface Connection {
  send(msg: { type: string } & Record<string, unknown>): void;
  isOpen(): boolean;
}

/** WebSocket with automatic reconnection; every outgoing message gets a `t` timestamp. */
export function connectWs(
  path: string,
  handlers: {
    onMessage(msg: ServerMessage): void;
    onOpen?(): void;
    onClose?(): void;
  },
): Connection {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}${path}`;
  let ws: WebSocket | null = null;

  const open = (): void => {
    ws = new WebSocket(url);
    ws.addEventListener('open', () => handlers.onOpen?.());
    ws.addEventListener('message', (ev) => {
      try { handlers.onMessage(JSON.parse(ev.data as string) as ServerMessage); }
      catch { console.warn('[net] bad message', ev.data); }
    });
    ws.addEventListener('close', () => {
      handlers.onClose?.();
      setTimeout(open, 2000);
    });
    ws.addEventListener('error', () => ws?.close());
  };
  open();

  return {
    send(msg) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: Date.now(), ...msg }));
    },
    isOpen: () => ws?.readyState === WebSocket.OPEN,
  };
}
