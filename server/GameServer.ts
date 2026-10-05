import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import type {
  GameState,
  Team,
  Phase,
  ClientMessage,
  ServerMessage,
  PhaseChangeMsg,
  FeedbackMsg,
  PongMsg,
  StateMsg,
} from './types.js';
import { config } from './config.js';
import { GameRules, createInitialState } from './GameRules.js';
import type { RulesHost } from './GameRules.js';
import { PhysicsLoop } from './PhysicsLoop.js';

export type ClientRole = 'table' | 'oz';

interface ConnectedClient {
  ws: WebSocket;
  role: ClientRole;
  connectedAt: number;
}

export class GameServer {
  private wss: WebSocketServer;
  private clients: Set<ConnectedClient> = new Set();
  private state: GameState;
  readonly rules: GameRules;
  readonly physics: PhysicsLoop;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.state = createInitialState();
    const host: RulesHost = {
      feedback: (kind, x, y, team) =>
        this.broadcast({ type: 'Feedback', t: Date.now(), kind, x, y, team } satisfies FeedbackMsg),
      transition: (phase, data) => this.transitionTo(phase, data),
      broadcastFull: () => this.broadcastFull(),
    };
    this.rules = new GameRules(this.state, host);
    this.physics = new PhysicsLoop(this.state, this.rules, () => this.broadcastTick());
    this.wss.on('connection', this.onConnection.bind(this));
    this.physics.start();
    console.log('[GameServer] Initialized');
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url ?? '/', `http://localhost`);
    const role = this.resolveRole(url);

    const client: ConnectedClient = { ws, role, connectedAt: Date.now() };
    this.clients.add(client);
    console.log(`[GameServer] Client connected: ${role} (total: ${this.clients.size})`);

    // Send current state immediately
    this.sendTo(ws, {
      type: 'State',
      t: Date.now(),
      state: this.state,
    } satisfies StateMsg);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(client, msg);
      } catch (err) {
        console.warn('[GameServer] Malformed message:', err);
      }
    });

    ws.on('close', () => {
      this.clients.delete(client);
      console.log(`[GameServer] Client disconnected: ${client.role} (total: ${this.clients.size})`);
      if (client.role === 'table' && ![...this.clients].some((c) => c.role === 'table')) {
        // No table left: nothing may stay pressed
        this.rules.releaseAllPads();
        this.rules.inputs.A = { throttle: 0, steer: 0 };
        this.rules.inputs.B = { throttle: 0, steer: 0 };
      }
    });

    ws.on('error', (err) => {
      console.error(`[GameServer] WS error (${role}):`, err.message);
    });
  }

  private resolveRole(url: URL): ClientRole {
    const path = url.pathname.replace(/^\/ws(?=\/|$)/, '') || '/';
    return path.startsWith('/oz') ? 'oz' : 'table';
  }

  private handleMessage(client: ConnectedClient, msg: ClientMessage): void {
    const fromTable = client.role === 'table';
    const fromOz = client.role === 'oz';

    switch (msg.type) {
      case 'Ping':
        this.sendTo(client.ws, { type: 'Pong', t: Date.now(), clientT: msg.t } satisfies PongMsg);
        break;
      // Table → server (the pilot joystick and item button live on the table)
      case 'PilotInput':
        if (fromTable && (msg.team === 'A' || msg.team === 'B')) this.rules.onPilotInput(msg.team, msg);
        break;
      case 'UseItem':
        if (fromTable && (msg.team === 'A' || msg.team === 'B')) this.rules.onUseItem(msg.team, msg);
        break;
      case 'StartGame':
        if (fromTable && this.state.phase === 'LOBBY') this.rules.enterMap();
        break;
      case 'StrokeDraw':
        if (fromTable) this.rules.onStrokeDraw(msg);
        break;
      case 'PadHold':
        if (fromTable) this.rules.onPadHold(msg);
        break;
      case 'Slingshot':
        if (fromTable) this.rules.onSlingshot(msg);
        break;
      case 'BoostGate':
        if (fromTable) this.rules.onBoostGate(msg);
        break;
      case 'Ability':
        if (fromTable) this.rules.onAbility(msg);
        break;
      case 'BorderPull':
        if (fromTable) this.rules.onBorderPull(msg);
        break;
      case 'NewGame':
        if (fromTable && this.state.phase === 'RESULT') {
          this.rules.resetToLobby();
        }
        break;
      // Oz console (or a future TUIO bridge on the table) → server
      case 'TangibleMoved':
        if (fromOz || fromTable) this.rules.onTangibleMoved(msg);
        break;
      case 'TangibleRemoved':
        if (fromOz || fromTable) this.rules.onTangibleRemoved(msg);
        break;
      case 'OzTrigger':
        if (fromOz) {
          this.rules.onOzTrigger(msg);
        }
        break;
      default:
        break;
    }
  }

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

  /** 30 Hz tick: the heavy field (the track) are omitted; clients keep the last copy. */
  private broadcastTick(): void {
    this.broadcast({
      type: 'State',
      t: Date.now(),
      state: { ...this.state, track: null },
    } satisfies StateMsg);
  }

  /** Full state, including the track (on phase/track changes and connections). */
  broadcastFull(): void {
    this.broadcast({ type: 'State', t: Date.now(), state: this.state } satisfies StateMsg);
  }

  getState(): GameState {
    return this.state;
  }

  setState(partial: Partial<GameState>): void {
    Object.assign(this.state, partial);
  }

  broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  sendToRole(role: ClientRole, msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.role === role && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  private sendTo(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
