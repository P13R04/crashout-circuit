/**
 * Accepte les connexions table et Oz, filtre leurs commandes par rôle et diffuse l’état et les retours du
 * jeu.
 * Liens : server/GameRules.ts, server/PhysicsLoop.ts, server/types.ts, server/config.ts.
 * Référencé par server/index.ts, scripts/network-acceptance.ts, scripts/public-session.ts.
 */
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

/** Distingue les droits des connexions de table et de console opérateur. */
export type ClientRole = 'table' | 'oz';

/** Conserve la connexion, le rôle et la date d’arrivée d’un client du serveur. */
interface ConnectedClient {
  ws: WebSocket;
  role: ClientRole;
  connectedAt: number;
}

/** Regroupe les options de démarrage qui autorisent ou masquent les outils de développement. */
export interface GameServerOptions {
  developerTools?: boolean;
}

/** Accepte les connexions table et Oz, filtre leurs commandes par rôle et diffuse l’état et les retours du jeu. */
export class GameServer {
  private wss: WebSocketServer;
  private clients: Set<ConnectedClient> = new Set();
  private state: GameState;
  private broadcastTrackVersion = -1;
  readonly rules: GameRules;
  readonly physics: PhysicsLoop;

  /** Crée les règles et la simulation puis branche les nouvelles connexions sur l’état partagé. */
  constructor(wss: WebSocketServer, private options:GameServerOptions={}) {
    this.wss = wss;
    this.state = createInitialState();
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

    const client: ConnectedClient = { ws, role, connectedAt: Date.now() };
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
        this.handleMessage(client, msg);
      } catch (err) {
        console.warn('[GameServer] Malformed message:', err);
      }
    });

    /** Retire la connexion fermée et relâche les commandes qui n’ont plus de client pour les maintenir. */
    ws.on('close', () => {
      this.clients.delete(client);
      if (![...this.clients].some(/* Vérifie si un autre client du même rôle conserve encore la session opérateur. */ c=>c.role===client.role)) this.rules.cancelTangiblePlacement();
      console.log(`[GameServer] Client disconnected: ${client.role} (total: ${this.clients.size})`);
      if (client.role === 'table' && ![...this.clients].some(/* Vérifie si une table connectée peut encore renouveler les appuis des joueurs. */ (c) => c.role === 'table')) {
        // No table left: nothing may stay pressed
        this.rules.releaseAllPads();
        this.rules.inputs.A = { throttle: 0, steer: 0 };
        this.rules.inputs.B = { throttle: 0, steer: 0 };
      }
    });

    /** Signale l’erreur réseau en précisant le rôle du client concerné. */
    ws.on('error', (err) => {
      console.error(`[GameServer] WS error (${role}):`, err.message);
    });
  }

  /** Déduit le rôle table ou Oz du chemin de connexion WebSocket. */
  private resolveRole(url: URL): ClientRole {
    const path = url.pathname.replace(/^\/ws(?=\/|$)/, '') || '/';
    return path.startsWith('/oz') ? 'oz' : 'table';
  }

  // Commandes acceptées par rôle ; les outils de développement sont filtrés ici.
  /** Aiguille la commande vers les règles autorisées pour son rôle et son mode de session. */
  private handleMessage(client: ConnectedClient, msg: ClientMessage): void {
    const fromTable = client.role === 'table';
    const fromOz = client.role === 'oz';

    switch (msg.type) {
      // Renvoie l’horodatage nécessaire à la mesure du délai réseau.
      case 'Ping':
        this.sendTo(client.ws, { type: 'Pong', t: Date.now(), clientT: msg.t } satisfies PongMsg);
        break;
      // Table → server (the pilot joystick and item button live on the table)
      // Transmet les réglages de course reçus de la table aux règles du jeu.
      case 'RaceSettings':
        if(fromTable)this.rules.updateRaceSettings(msg);
        break;
      // Applique les commandes de conduite de l’équipe identifiée par la table.
      case 'PilotInput':
        if (fromTable && (msg.team === 'A' || msg.team === 'B')) this.rules.onPilotInput(msg.team, msg);
        break;
      // Autorise le copilote à armer le bonus de son équipe.
      case 'Power':
        if (fromTable && msg.role === 'copilot' && (msg.team === 'A' || msg.team === 'B')) this.rules.onPower(msg.team, msg);
        break;
      // Ouvre la création du circuit depuis l’accueil, en réservant le mode PC aux outils de développement.
      case 'StartGame':
        if (fromTable && this.state.phase === 'LOBBY' && (msg.mode===undefined||msg.mode==='table'||msg.mode==='pc'&&this.state.developerTools)) this.rules.enterMap(msg.mode);
        break;
      // Démarre l’essai des tangibles seulement si les outils de développement sont activés.
      case 'StartTangibleTest':
        if (fromTable && this.state.developerTools) this.rules.startTangibleTest();
        break;
      // Lance le tutoriel dans le mode d’entrée autorisé.
      case 'StartTutorial':
        if (fromTable && this.state.phase === 'LOBBY' && (msg.mode===undefined||msg.mode==='table'||msg.mode==='pc'&&this.state.developerTools)) this.rules.startTutorial(msg.mode === 'pc' ? 'pc' : 'table');
        break;
      // Passe du tutoriel à la préparation de la course normale.
      case 'TutorialRace':
        if (fromTable) this.rules.tutorialRace();
        break;
      // Permet à la table de passer la leçon courante de l’équipe.
      case 'TutorialSkip':
        if (fromTable) this.rules.tutorialSkip(msg.team);
        break;
      // Change les aides de test uniquement lorsque le serveur les autorise.
      case 'TestToggle':
        if (fromTable && this.state.developerTools) this.rules.onTestToggle(msg);
        break;
      // Bascule la pause de la séance depuis la table.
      case 'Pause':
        if (fromTable) this.rules.togglePause();
        break;
      // Transmet le changement de conduite de l’équipe aux règles.
      case 'ToggleDriveMode':
        if (fromTable) this.rules.toggleDriveMode(msg.team);
        break;
      // Enregistre le demi-circuit dessiné par une équipe.
      case 'StrokeDraw':
        if (fromTable) this.rules.onStrokeDraw(msg);
        break;
      // Demande la construction du circuit à partir des tracés reçus.
      case 'GenerateTrack':
        if (fromTable) this.rules.onGenerateTrack();
        break;
      // Démarre le départ lorsque le circuit est prêt.
      case 'BeginRace':
        if (fromTable) this.rules.beginRace();
        break;
      // Valide les deux contacts qui séparent les moitiés de dessin.
      case 'MapDivider':
        if (fromTable) this.rules.onMapDivider(msg);
        break;
      // Transmet le maintien du bouton de réparation.
      case 'PadHold':
        if (fromTable) this.rules.onPadHold(msg);
        break;
      // Valide et lance le tir reconnu par la table.
      case 'Slingshot':
        if (fromTable) this.rules.onSlingshot(msg);
        break;
      // Valide la zone de boost reconnue par la table.
      case 'BoostGate':
        if (fromTable) this.rules.onBoostGate(msg);
        break;
      // Transmet la déformation locale du circuit aux règles.
      case 'BorderPull':
        if (fromTable) this.rules.onBorderPull(msg);
        break;
      // Ramène la séance à l’accueil sur demande de la table.
      case 'Reset':
        if (fromTable) {
          this.rules.resetToLobby();
        }
        break;
      // Réinitialise la séance pour une nouvelle partie.
      case 'NewGame':
        if (fromTable) {
          this.rules.resetToLobby();
        }
        break;
      // Oz console (or a future TUIO bridge on the table) → server
      // Choisit depuis la console la pose manuelle ou la pose repérée par les doigts.
      case 'TangiblePlacementMode':
        if (fromOz) this.rules.setTangiblePlacementMode(msg.mode);
        break;
      // Réserve le prochain geste de pose au tangible choisi dans la console.
      case 'TangiblePrepare':
        if (fromOz) this.rules.prepareTangiblePlacement(msg.id);
        break;
      // Annule depuis la console l’attente du prochain tangible.
      case 'TangiblePlacementCancel':
        if (fromOz) this.rules.cancelTangiblePlacement();
        break;
      // Applique la position et l’orientation mesurées par les deux contacts sur la table.
      case 'TangibleTouchPlaced':
        if (fromTable) this.rules.onTangibleTouchPlaced(msg);
        break;
      // Applique l’activation ou la désactivation demandée par le magicien.
      case 'TangibleControl':
        if (fromOz) this.rules.onTangibleControl(msg);
        break;
      // Applique le placement manuel reçu de la console.
      case 'TangibleMoved':
        if (fromOz) this.rules.onTangibleMoved(msg);
        break;
      // Retire de la simulation le tangible enlevé physiquement.
      case 'TangibleRemoved':
        if (fromOz) this.rules.onTangibleRemoved(msg);
        break;
      default:
        break;
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
