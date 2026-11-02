/**
 * Gère les connexions WebSocket, les reconnexions et la conservation de la géométrie entre deux états reçus.
 * Liens : server/types.ts.
 * Référencé par client-oz/main.ts, client-table/main.ts, scripts/public-session.ts.
 */
import type { GameState, TrackGeometry, ServerMessage } from '../server/types.js';

/** Gère les connexions WebSocket, les reconnexions et la conservation de la géométrie entre deux états reçus. */
export class StateSync {
  private track: TrackGeometry | null = null;
  private trackVersion = -1;
  /** serverTime − localTime (ms), smoothed; positive when the server clock is ahead. */
  private offset = 0;
  private haveOffset = false;

  /** Conserve la dernière géométrie reçue et ajuste l’horloge locale à celle du serveur. */
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
    return state;
  }

  /** Renvoie l’heure locale corrigée par l’écart mesuré avec le serveur. */
  now(): number {
    return Date.now() + this.offset;
  }
}

/** Expose l’envoi, l’état et la fermeture volontaire d’une connexion partagée par les interfaces. */
export interface Connection {
  send(msg: { type: string } & Record<string, unknown>): void;
  isOpen(): boolean;
  close(): void;
}

/** Ouvre un WebSocket horodaté et le reconnecte automatiquement après une coupure. */
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
  let stopped=false;
  let reconnectTimer:ReturnType<typeof setTimeout>|null=null;

  /** Ouvre la connexion et installe la réception des messages ainsi que la reconnexion différée. */
  const open = (): void => {
    if(stopped)return;
    ws = new WebSocket(url);
    /** Prévient l’interface que la connexion peut à nouveau envoyer des commandes. */
    ws.addEventListener('open', () => handlers.onOpen?.());
    /** Décode le message reçu et le transmet au lecteur de l’interface. */
    ws.addEventListener('message', (ev) => {
      try { handlers.onMessage(JSON.parse(ev.data as string) as ServerMessage); }
      catch { console.warn('[net] bad message', ev.data); }
    });
    /** Signale la coupure puis programme une reconnexion si elle n’a pas été arrêtée volontairement. */
    ws.addEventListener('close', () => {
      handlers.onClose?.();
      if(stopped)return;
      reconnectTimer=setTimeout(open, 2000);
    });
    /** Ferme une connexion en erreur afin de laisser agir la reconnexion prévue. */
    ws.addEventListener('error', () => ws?.close());
  };
  open();

  return {
    /** Ajoute l’horodatage puis envoie la commande si le WebSocket est ouvert. */
    send(msg) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: Date.now(), ...msg }));
    },
    /** Indique si la connexion accepte immédiatement de nouvelles commandes. */
    isOpen: () => ws?.readyState === WebSocket.OPEN,
    /** Arrête la connexion et toute tentative de reconnexion programmée. */
    close:()=>{stopped=true;if(reconnectTimer)clearTimeout(reconnectTimer);ws?.close();},
  };
}
