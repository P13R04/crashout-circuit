/**
 * Lance un serveur isolé et collecte les réponses de ses clients WebSocket.
 * Liens : scripts/network/seats.ts, server/net/GameServer.ts.
 */
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as wait } from 'node:timers/promises';
import { WebSocket, WebSocketServer } from 'ws';
import { GameServer } from '../../server/net/GameServer.js';
import type { ClientRole, GameServerOptions } from '../../server/net/GameServer.js';
import type { ServerMessage } from '../../server/types.js';

/** Attend une condition asynchrone avec un délai borné. */
export async function until<T>(read: () => T | undefined, description: string): Promise<T> {
  const deadline = Date.now() + 2000;
  do {
    const result = read();
    if (result !== undefined) return result;
    await wait(10);
  } while (Date.now() < deadline);
  throw new Error(description);
}

/** Ouvre un vrai serveur réseau local pour les tests de protocole. */
export async function socketFixture(options?: GameServerOptions) {
  const http = createServer();
  const wss = new WebSocketServer({ server: http });
  const game = new GameServer(wss, options);
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const { port } = http.address() as { port: number };

  /** Ouvre une connexion, enregistre ses messages et propose une barrière via Ping. */
  async function client(role: ClientRole) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${role}`);
    const messages: ServerMessage[] = [];
    ws.on('message', data => messages.push(JSON.parse(data.toString())));
    await once(ws, 'open');
    const send = (msg: Record<string, unknown>) => ws.send(JSON.stringify({ t: Date.now(), ...msg }));
    const receive = <T extends ServerMessage['type']>(type: T, since = 0) =>
      until(() => messages.slice(since).find(
        (msg): msg is Extract<ServerMessage, { type: T }> => msg.type === type,
      ), `Message ${type} manquant pour ${role}`);
    return {
      ws, messages, send, receive,
      async flush() {
        const since = messages.length;
        send({ type: 'Ping' });
        await receive('Pong', since);
      },
    };
  }

  /** Arrête la physique puis ferme les connexions du test. */
  async function close() {
    game.physics.stop();
    for (const ws of wss.clients) ws.terminate();
    await new Promise<void>(resolve => wss.close(() => resolve()));
    await new Promise<void>(resolve => http.close(() => resolve()));
  }
  return { game, client, close };
}
