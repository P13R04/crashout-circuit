/**
 * Prépare le QR code unique et affiche la disponibilité des places autour de la table.
 * Liens : client-table/renderer/screenOverlays.ts, client-shared/sessionInfo.ts.
 */
import type { GameState } from '../../server/types.js';
import { SEAT_IDS, playerTeam, roleLabel, TEAM_LABEL } from '../../client-shared/seatLabels.js';
import { TEAM_COLOR } from '../view.js';
import { readSession } from '../../client-shared/sessionInfo.js';
import type { Ctx } from './rendererTypes.js';

export interface LobbyJoin {
  url: string;
  room: string;
  qr: HTMLCanvasElement;
}

/** Construit l'invitation à partir de l'adresse joignable annoncée par le serveur. */
export async function loadLobbyJoin(previous?: LobbyJoin | null): Promise<LobbyJoin | null> {
  const session = await readSession();
  if (!session.baseUrls.length) return null;
  const url = new URL('/play', session.baseUrls[0]);
  url.searchParams.set('room', session.room);
  if (previous?.url === url.href) return previous;
  const { toCanvas } = await import('qrcode');
  const qr = document.createElement('canvas');
  await toCanvas(qr, url.toString(), { margin: 4, scale: 12, errorCorrectionLevel: 'M' });
  return { url: url.toString(), room: session.room, qr };
}

/** Dessine un QR à fort contraste, le code de secours et l'occupation des quatre places. */
export function drawLobbyJoin(ctx: Ctx, invite: LobbyJoin, seats: GameState['seats'], soloTest = false): void {
  const x = 1520, y = 485, side = 340;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#0d1723f0';
  ctx.beginPath();
  ctx.roundRect(-244, -241, 488, 568, 22);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '700 26px system-ui';
  ctx.fillText('Jouer sur téléphone', 0, -198);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(invite.qr, -side / 2, -175, side, side);
  ctx.font = '700 22px system-ui';
  ctx.fillText(`Code ${invite.room}`, 0, 197);
  ctx.font = '17px system-ui';
  const url = new URL(invite.url);
  ctx.fillText(`${url.origin}/play`, 0, 225, 451);

  const ids = soloTest ? ['A-pilot'] as const : SEAT_IDS;
  for (const [index, seat] of ids.entries()) {
    const team = playerTeam(seat);
    const slot = seats[seat];
    const dx = soloTest ? 0 : index < 2 ? -121 : 121;
    const dy = index % 2 === 0 ? 263 : 297;
    const symbol = slot.connected ? '●' : slot.taken ? '◐' : '○';
    const status = slot.connected ? 'Connecté' : slot.taken ? 'Absent' : 'Libre';
    ctx.fillStyle = TEAM_COLOR[team];
    ctx.font = '600 16px system-ui';
    ctx.fillText(`${symbol}  ${TEAM_LABEL[team]} · ${roleLabel(seat)} · ${status}`, dx, dy, 221);
  }
  ctx.restore();
}
