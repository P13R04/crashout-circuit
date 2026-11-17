/** Expose à l’hôte les réglages et les commandes d’un seul salon. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GameServer } from './GameServer.js';
import { isSeatId } from '../rules/session/playerSeats.js';
import { isThemeId } from '../protocol/theme.js';

function respond(res: ServerResponse, code: number, value: object): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function command(req: IncomingMessage): Promise<Record<string, unknown>> {
  const length = Number(req.headers['content-length']);
  if (!(length > 0 && length <= 2048) || !req.headers['content-type']?.startsWith('application/json')) throw Error();
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  const data: unknown = JSON.parse(body);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error();
  return data as Record<string, unknown>;
}

function apply(game: GameServer, data: Record<string, unknown>): boolean {
  const t = Date.now();
  switch (data.action) {
    case 'kick':
      if (!isSeatId(data.seat)) return false;
      game.kickSeat(data.seat);
      break;
    case 'reset': game.resetLobby(); break;
    case 'home': game.rules.resetToLobby(); break;
    case 'pause': game.applyHostCommand({ type: 'Pause', t }); break;
    case 'tutorial': game.applyHostCommand({ type: 'StartTutorial', mode: 'table', t }); break;
    case 'quickRace': game.applyHostCommand({ type: 'StartPreset', t }); break;
    case 'settings': {
      const { theme, difficulty, lapsToWin, sessionMaxSeconds } = data;
      if (!isThemeId(theme) || !(difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard')
        || typeof lapsToWin !== 'number' || !Number.isInteger(lapsToWin) || lapsToWin < 1 || lapsToWin > 99
        || typeof sessionMaxSeconds !== 'number' || !Number.isInteger(sessionMaxSeconds) || sessionMaxSeconds < 0 || sessionMaxSeconds > 7200) return false;
      game.rules.updateRaceSettings({ type: 'RaceSettings', t, difficulty, lapsToWin, sessionMaxSeconds });
      game.applyHostCommand({ type: 'SetTheme', t, theme });
      break;
    }
    default: return false;
  }
  return true;
}

export async function adminRequest(req: IncomingMessage, res: ServerResponse, game: GameServer): Promise<void> {
  if (req.method === 'GET') {
    const { phase, seats, theme, soloTest, wideTable, params } = game.getState();
    const { difficulty, lapsToWin, sessionMaxSeconds } = params;
    respond(res, 200, { room: game.room, phase, seats, theme, soloTest, wideTable, difficulty, lapsToWin, sessionMaxSeconds });
    return;
  }
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'GET, POST' }).end(); return; }
  try {
    const data = await command(req);
    if (data.room !== game.room) { respond(res, 409, { error: 'Le salon a changé. Actualisez la page.' }); return; }
    if (!apply(game, data)) { respond(res, 400, { error: 'Commande ou réglages invalides.' }); return; }
    respond(res, 200, { ok: true });
  } catch {
    respond(res, 400, { error: 'Commande invalide.' });
  }
}
