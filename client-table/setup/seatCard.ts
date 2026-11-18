/**
 * Dessine la fiche d'un poste : choix de l'appareil, puis QR code individuel et état de la connexion.
 * Liens : client-table/setup/setupScreen.ts, client-table/setup/setupLayout.ts, client-table/setup/setupLinks.ts.
 */
import type { GameState, SeatDevice, SeatId } from '../../server/types.js';
import { playerTeam, roleLabel, TEAM_LABEL } from '../../client-shared/seatLabels.js';
import { TEAM_COLOR } from '../view.js';
import { icon, type Icon } from '../ui/icons.js';
import { glow, NEON } from '../themes/neon/neon.js';
import type { themeLook } from '../themes/themes.js';
import type { Ctx } from '../renderer/rendererTypes.js';
import type { WiimoteView } from '../wiimote/wiimoteView.js';
import { drawWiimote } from './wiimoteCard.js';
import { CARD, SEAT_CARDS, devicesFor, tileRect } from './setupLayout.js';
import { seatUrl, type SetupLinks } from './setupLinks.js';

export type Look = ReturnType<typeof themeLook>;

const DEVICE_LOOK: Record<SeatDevice, { glyph: Icon; label: string }> = {
  table: { glyph: 'touch', label: 'TABLE' },
  phone: { glyph: 'phone', label: 'TÉLÉPHONE' },
  wiimote: { glyph: 'remote', label: 'MANETTE WII' },
};
const QR_SIDE = 156;

/** Dessine la fiche d'un poste dans son coin, tournée vers le joueur concerné. */
export function drawSeatCard(ctx: Ctx, seat: SeatId, state: GameState, links: SetupLinks | null, look: Look, time: number, wiimote: WiimoteView): void {
  const { cx, cy, rot } = SEAT_CARDS[seat];
  const team = playerTeam(seat), color = TEAM_COLOR[team], device = state.seatDevices[seat];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.textAlign = 'left';
  ctx.fillStyle = look.panel + 'f2';
  ctx.strokeStyle = color + 'aa';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-CARD.w / 2, -CARD.h / 2, CARD.w, CARD.h, Math.min(24, look.radius + 6));
  ctx.fill();
  ctx.stroke();
  glow(ctx, 0, -CARD.h / 2, 170, color, .12, .4);
  drawHeader(ctx, seat, color, look);
  for (const choice of devicesFor(seat)) drawTile(ctx, seat, choice, choice === device, color, look);
  if (device === 'table') drawTableHint(ctx, look);
  else if (device === 'wiimote') drawWiimote(ctx, wiimote, color, look, time);
  else drawRemote(ctx, seat, device, state, links, color, look, time);
  ctx.restore();
}

/** Nomme le poste avec son équipe, sa couleur et son pictogramme. */
function drawHeader(ctx: Ctx, seat: SeatId, color: string, look: Look): void {
  const y = -CARD.h / 2 + 30;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(-CARD.w / 2 + 34, y, 12, 0, Math.PI * 2);
  ctx.fill();
  icon(ctx, seat.endsWith('-pilot') ? 'wheel' : 'power', -CARD.w / 2 + 68, y, 28, look.ink);
  ctx.fillStyle = look.ink;
  ctx.font = '800 28px system-ui';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${roleLabel(seat).toUpperCase()} · ${TEAM_LABEL[playerTeam(seat)].toUpperCase()}`, -CARD.w / 2 + 96, y + 1);
  ctx.textBaseline = 'alphabetic';
}

/** Dessine un choix d'appareil : grande cible tactile, sélection marquée par la couleur et par une coche. */
function drawTile(ctx: Ctx, seat: SeatId, device: SeatDevice, chosen: boolean, color: string, look: Look): void {
  const { x, y, w, h } = tileRect(seat, device);
  const { glyph, label } = DEVICE_LOOK[device];
  ctx.fillStyle = chosen ? color + '30' : look.button;
  ctx.strokeStyle = chosen ? color : look.line;
  ctx.lineWidth = chosen ? 4 : 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(16, look.radius));
  ctx.fill();
  ctx.stroke();
  icon(ctx, glyph, x + w / 2, y + 38, 40, chosen ? color : look.ink);
  ctx.fillStyle = chosen ? look.ink : look.ink + 'cc';
  ctx.font = `700 ${w < 200 ? 17 : 20}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + 90);
  ctx.textAlign = 'left';
  if (chosen) icon(ctx, 'check', x + w - 17, y + 17, 18, color);
}

/** Indique qu'un poste resté sur la table n'a rien à scanner. */
function drawTableHint(ctx: Ctx, look: Look): void {
  const top = -CARD.h / 2 + 192;
  icon(ctx, 'touch', -CARD.w / 2 + 70, top + 78, 54, look.ink + 'cc');
  ctx.fillStyle = look.ink;
  ctx.font = '700 22px system-ui';
  ctx.fillText('Ce poste se joue', -CARD.w / 2 + 130, top + 66);
  ctx.fillText('sur la table.', -CARD.w / 2 + 130, top + 96);
  ctx.fillStyle = look.ink + 'aa';
  ctx.font = '500 17px system-ui';
  ctx.fillText('Choisissez un autre appareil pour jouer ailleurs.', -CARD.w / 2 + CARD.pad + 6, top + 146, CARD.w - 2 * CARD.pad - 12);
}

/** Affiche le QR code individuel du poste, l'état de la connexion et le code de secours. */
function drawRemote(ctx: Ctx, seat: SeatId, device: SeatDevice, state: GameState, links: SetupLinks | null, color: string, look: Look, time: number): void {
  const x = -CARD.w / 2 + CARD.pad, y = 8;
  const url = links ? seatUrl(links, seat, device) : null;
  const qr = url ? links?.qr.get(url) : undefined;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(x, y, QR_SIDE, QR_SIDE, 8);
  ctx.fill();
  if (qr) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, x + 4, y + 4, QR_SIDE - 8, QR_SIDE - 8);
  } else {
    ctx.fillStyle = '#41505f';
    ctx.font = '600 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Adresse', x + QR_SIDE / 2, y + QR_SIDE / 2 - 4);
    ctx.fillText('indisponible', x + QR_SIDE / 2, y + QR_SIDE / 2 + 18);
    ctx.textAlign = 'left';
  }
  const tx = x + QR_SIDE + 20, width = CARD.w / 2 - CARD.pad - tx;
  drawStatus(ctx, seat, state, color, tx, y + 30, width, time);
  ctx.fillStyle = look.ink;
  ctx.font = '600 19px system-ui';
  const lines = ['Scannez avec', 'le téléphone.'];
  lines.forEach((line, index) => ctx.fillText(line, tx, y + 76 + index * 26, width));
  if (links) {
    ctx.fillStyle = look.ink + 'aa';
    ctx.font = '600 17px monospace';
    ctx.fillText(`Code ${links.room}`, tx, y + QR_SIDE - 4, width);
  }
}

/** Dit si le joueur est connecté, absent ou attendu, sans reposer sur la seule couleur. */
function drawStatus(ctx: Ctx, seat: SeatId, state: GameState, color: string, x: number, y: number, width: number, time: number): void {
  const slot = state.seats[seat];
  const [symbol, text, tone] = slot.connected ? ['●', 'Connecté', NEON.mint] : slot.taken ? ['◐', 'Absent', NEON.gold] : ['○', 'En attente', NEON.gold];
  const pulse = slot.connected ? 1 : .6 + .4 * Math.sin(time * 4);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = tone;
  ctx.font = '800 22px system-ui';
  ctx.fillText(`${symbol} ${text}`, x, y, width);
  ctx.restore();
  if (slot.connected && slot.name) {
    ctx.fillStyle = color;
    ctx.font = '600 16px system-ui';
    ctx.fillText(slot.name, x, y + 20, width);
  }
}
