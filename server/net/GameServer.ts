/**
 * Accepte les connexions table, Oz et joueur, filtre leurs commandes par rôle et diffuse l’état et les retours du
 * jeu.
 * Liens : server/rules/GameRules.ts, server/PhysicsLoop.ts, server/types.ts, server/config.ts.
 * Référencé par server/index.ts, scripts/network/network-acceptance.ts, scripts/game/public-session.ts.
 */
import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import type {
  GameState,
  SeatId,
  JoinMsg,
  Phase,
  ClientMessage,
  ServerMessage,
  PhaseChangeMsg,
  FeedbackMsg,
  PongMsg,
  StateMsg,
} from '../types.js';
import { config } from '../config.js';
import { GameRules, createInitialState } from '../rules/GameRules.js';
import type { RulesHost } from '../rules/GameRules.js';
import { PhysicsLoop } from '../PhysicsLoop.js';
import { PlayerSeats, isSeatId } from '../rules/session/playerSeats.js';
import { handlePlayerCommand, releasePlayerControls } from './playerCommands.js';
import { handleTableSession, handleTableGameplay, releaseTableSteering } from './tableCommands.js';
import { handleOzCommand } from './ozCommands.js';

/** Distingue les droits des connexions de table et de console opérateur. */
export type ClientRole = 'table' | 'oz' | 'player';

/** Conserve la connexion, le rôle et l’identité d’un client du serveur. */
interface ConnectedClient {
  ws: WebSocket;
  role: ClientRole;
  id: symbol;
}

/** Regroupe les options de démarrage qui autorisent ou masquent les outils de développement. */
export interface GameServerOptions {
  developerTools?: boolean;
}

/** Accepte les connexions table, Oz et joueur, filtre leurs commandes par rôle et diffuse l’état et les retours du jeu. */
export class GameServer {
  private wss: WebSocketServer;
  private clients: Set<ConnectedClient> = new Set();
  private state: GameState;
  private readonly playerSeats: PlayerSeats;
  private readonly mobilePads = new Set<SeatId>();
  private broadcastTrackVersion = -1;
  readonly rules: GameRules;
  readonly physics: PhysicsLoop;

  /** Crée les règles et la simulation puis branche les nouvelles connexions sur l’état partagé. */
  constructor(wss: WebSocketServer, options: GameServerOptions = {}) {
    this.wss = wss;
    this.state = createInitialState();
    this.playerSeats = new PlayerSeats(this.state.seats, randomUUID);
    this.state.developerTools=options.developerTools===true;
    const host: RulesHost = {
      /** Diffuse le retour d’action avec son équipe et le type de bonus lorsqu’il est connu. */
      feedback: (kind, x, y, team, itemKind) =>
        this.broadcast({ type: 'Feedback', t: Date.now(), kind, x, y, team, ...(itemKind?{itemKind}:{}) } satisfies FeedbackMsg),
      /** Transmet le changement de phase demandé par les règles à la diffusion réseau. */
      transition: (phase, data) => this.transitionTo(phase, data),
      /** Diffuse un état complet comprenant la géométrie du circuit. */
      broadcastFull: () => this.broadcastFull(),
    };
    this.rules = new GameRules(this.state, host);
    this.physics = new PhysicsLoop(this.state, this.rules, /* Diffuse le snapshot demandé par la boucle de physique. */ () => this.broadcastTick());
    this.wss.on('connection', this.onConnection.bind(this));
    this.physics.start();
    console.log('[GameServer] Initialized');
  }

  /** Enregistre le rôle du client, lui envoie l’état complet et installe ses gestionnaires réseau. */
  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url ?? '/', `http://localhost`);
    const role = this.resolveRole(url);

    const client: ConnectedClient = { ws, role, id: Symbol(role) };
    this.clients.add(client);
    console.log(`[GameServer] Client connected: ${role} (total: ${this.clients.size})`);

    // Send current state immediately
    this.sendTo(ws, {
      type: 'State',
      t: Date.now(),
      state: this.state,
    } satisfies StateMsg);

    /** Décode la commande du client puis applique les restrictions de son rôle. */
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        if (msg && typeof msg.type === 'string') this.handleMessage(client, msg);
      } catch (err) {
        console.warn('[GameServer] Malformed message:', err);
      }
    });

    ws.on('close', () => this.onDisconnect(client));

    /** Signale l’erreur réseau en précisant le rôle du client concerné. */
    ws.on('error', (err) => {
      console.error(`[GameServer] WS error (${role}):`, err.message);
    });
  }

  /** Déduit le rôle du chemin WebSocket. */
  private resolveRole(url: URL): ClientRole {
    const path = url.pathname.replace(/^\/ws(?=\/|$)/, '') || '/';
    if (/^\/player(?:\/|$)/.test(path)) return 'player';
    return path.startsWith('/oz') ? 'oz' : 'table';
  }

  /** Retire la connexion et relâche uniquement les appuis encore associés à son interface. */
  private onDisconnect(client: ConnectedClient): void {
    this.clients.delete(client);
    console.log(`[GameServer] Client disconnected: ${client.role} (total: ${this.clients.size})`);
    if (client.role === 'player') {
      const seat = this.playerSeats.disconnect(client.id, this.state.phase, Date.now());
      if (seat) {
        this.mobilePads.delete(seat);
        releasePlayerControls(this.rules, seat);
        this.broadcastTick();
      }
      return;
    }
    if ([...this.clients].some(c => c.role === client.role)) return;
    this.rules.cancelTangiblePlacement();
    if (client.role !== 'table') return;
    releaseTableSteering(this.rules);
    for (const [seat, pad] of Object.entries(this.state.repairPads)) {
      if (isSeatId(seat) && this.mobilePads.has(seat)) continue;
      pad.held = false;
      pad.startedAt = 0;
    }
  }

  /** Aiguille uniquement les messages autorisés par le rôle de la connexion. */
  private handleMessage(client: ConnectedClient, msg: ClientMessage): void {
    if (msg.type === 'Ping') {
      this.sendTo(client.ws, { type: 'Pong', t: Date.now(), clientT: msg.t } satisfies PongMsg);
      return;
    }
    if (client.role === 'oz') {
      handleOzCommand(this.rules, msg);
      return;
    }
    if (client.role === 'table') {
      if (msg.type === 'PadHold') {
        const seat = `${msg.team}-${msg.role}`;
        if (isSeatId(seat)) this.mobilePads.delete(seat);
      }
      handleTableSession(this.rules, msg);
      handleTableGameplay(this.rules, msg);
      return;
    }

    if (msg.type === 'Join') {
      this.joinPlayer(client, msg);
      return;
    }
    const seat = this.playerSeats.seatOf(client.id);
    if (!seat) return;
    const held = handlePlayerCommand(this.rules, seat, msg);
    if (msg.type !== 'PadHold' || typeof msg.on !== 'boolean') return;
    if (held) this.mobilePads.add(seat);
    else this.mobilePads.delete(seat);
  }

  /** Confirme ou refuse la demande d'une place sans diffuser le jeton de réservation. */
  private joinPlayer(client: ConnectedClient, msg: JoinMsg): void {
    if (msg.token !== undefined && typeof msg.token !== 'string') return;
    if (msg.name !== undefined && typeof msg.name !== 'string') return;
    const now = Date.now();
    const result = this.playerSeats.claim(client.id, msg, now);
    if ('reason' in result) {
      this.sendTo(client.ws, { type: 'JoinRejected', t: now, reason: result.reason });
      return;
    }
    this.sendTo(client.ws, { type: 'Joined', t: now, seat: result.seat, token: result.token });
    if (result.changed) {
      this.mobilePads.delete(result.seat);
      releasePlayerControls(this.rules, result.seat);
      this.broadcastTick();
    }
  }

  /** Change la phase et avertit tous les clients de la transition. */
  transitionTo(phase: Phase, data?: unknown): void {
    this.state.phase = phase;
    console.log(`[GameServer] Phase → ${phase}`);
    this.broadcast({
      type: 'PhaseChange',
      t: Date.now(),
      phase,
      ...(data !== undefined ? { data } : {}),
    } satisfies PhaseChangeMsg);
  }

  /** Diffuse l’état courant en joignant la piste seulement lorsque sa version change. */
  // Synchronisation : snapshots allégés par tick, géométrie complète lors d’un changement.
  private broadcastTick(): void {
    this.playerSeats.expire(Date.now());
    const changed = this.broadcastTrackVersion !== this.state.trackVersion;
    this.broadcast({
      type: 'State',
      t: Date.now(),
      state: { ...this.state, track: changed ? this.state.track : null },
    } satisfies StateMsg);
    this.broadcastTrackVersion = this.state.trackVersion;
  }

  /** Diffuse un état complet comprenant la géométrie du circuit. */
  broadcastFull(): void {
    this.broadcast({ type: 'State', t: Date.now(), state: this.state } satisfies StateMsg);
    this.broadcastTrackVersion = this.state.trackVersion;
  }

  /** Expose l’état serveur courant pour les outils internes et les tests. */
  getState(): GameState {
    return this.state;
  }

  /** Met à jour les champs demandés de l’état serveur sans créer une nouvelle session. */
  setState(partial: Partial<GameState>): void {
    Object.assign(this.state, partial);
  }

  /** Envoie le même message à toutes les connexions encore ouvertes. */
  broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  /** Envoie un message seulement aux clients du rôle indiqué. */
  sendToRole(role: ClientRole, msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.role === role && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  /** Transmet le message au client demandé si sa connexion est ouverte. */
  private sendTo(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
