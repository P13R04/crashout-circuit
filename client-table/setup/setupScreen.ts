/**
 * Écran de préparation : chaque joueur choisit l'appareil de son poste, scanne son QR code, puis la table lance la création du circuit.
 * Liens : client-table/setup/seatCard.ts, client-table/setup/setupLayout.ts, client-table/renderer/Renderer.ts.
 * Les fiches des postes sont dans les coins ; le centre porte le QR des spectateurs, le départ et le retour, lisibles des deux grands côtés.
 */
import type { GameState, SeatId, Team } from '../../server/types.js';
import type { WiimoteView } from '../wiimote/wiimoteView.js';
import { LOGICAL_W, LOGICAL_H } from '../../server/layout.js';
import { playerTeam, roleLabel, SEAT_IDS, TEAM_LABEL } from '../../client-shared/seatLabels.js';
import { seatsWaiting } from '../../server/rules/session/seatSetup.js';
import { icon } from '../ui/icons.js';
import { glow } from '../themes/neon/neon.js';
import { themeLook, type ThemeId } from '../themes/themes.js';
import type { Ctx } from '../renderer/rendererTypes.js';
import { drawSeatCard, type Look } from './seatCard.js';
import { SETUP_BACK, SETUP_SPECTATORS, SETUP_START } from './setupLayout.js';
import { spectatorUrl, type SetupLinks } from './setupLinks.js';

/** Dessine les quatre fiches de poste puis les commandes communes du centre. */
export function drawSetup(ctx: Ctx, state: GameState, links: SetupLinks | null, theme: ThemeId, time: number, wiimotes: Record<Team, WiimoteView>): void {
  const look = themeLook(theme);
  ctx.save();
  for (const seat of SEAT_IDS) drawSeatCard(ctx, seat, state, links, look, time, wiimotes[playerTeam(seat)]);
  drawTitle(ctx, look);
  drawSpectators(ctx, links, look);
  drawStart(ctx, state, look);
  drawBack(ctx, look);
  ctx.restore();
}

/** Appelle `draw` une fois pour chaque côté de la table, dans un repère centré et tourné vers ce côté. */
function bothSides(ctx: Ctx, center: { x: number; y: number }, draw: () => void): void {
  for (const rot of [0, Math.PI]) {
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);
    draw();
    ctx.restore();
  }
}

/** Pose la question à chaque joueur, au bord de la table qui lui fait face. */
function drawTitle(ctx: Ctx, look: Look): void {
  ctx.textAlign = 'center';
  bothSides(ctx, { x: LOGICAL_W / 2, y: LOGICAL_H / 2 }, () => {
    ctx.fillStyle = look.ink;
    ctx.font = '800 46px system-ui';
    ctx.fillText('Où jouez-vous ?', 0, 422);
    ctx.fillStyle = look.ink + 'bb';
    ctx.font = '500 24px system-ui';
    ctx.fillText('Chaque joueur choisit l’appareil de son poste', 0, 464);
  });
}

/** Affiche le QR unique des spectateurs, ou explique pourquoi il manque. */
function drawSpectators(ctx: Ctx, links: SetupLinks | null, look: Look): void {
  const box = SETUP_SPECTATORS, center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  ctx.fillStyle = look.panel + 'f0';
  ctx.strokeStyle = look.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(22, look.radius + 4));
  ctx.fill();
  ctx.stroke();
  const qr = links?.spectators ? links.qr.get(spectatorUrl(links)) : undefined;
  if (qr) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(center.x - 100, center.y - 100, 200, 200, 8);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, center.x - 96, center.y - 96, 192, 192);
  } else {
    icon(ctx, 'eye', center.x, center.y, 70, look.ink + '77');
  }
  ctx.textAlign = 'center';
  bothSides(ctx, center, () => {
    icon(ctx, 'eye', -92, 119, 22, look.accent);
    ctx.fillStyle = look.ink;
    ctx.font = '800 20px system-ui';
    ctx.fillText(qr ? 'SPECTATEURS' : 'SPECTATEURS : INACTIF', 12, 126, 230);
    if (!qr) {
      ctx.fillStyle = look.ink + 'aa';
      ctx.font = '500 16px system-ui';
      ctx.fillText('Activez-les dans les paramètres (engrenage)', 0, 98, 350);
    }
  });
}

/** Dessine le bouton de départ, éteint tant qu'un joueur annoncé hors de la table n'est pas connecté. */
function drawStart(ctx: Ctx, state: GameState, look: Look): void {
  const b = SETUP_START, waiting = seatsWaiting(state), ready = waiting.length === 0;
  const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  if (ready) glow(ctx, center.x, center.y, b.w * .7, look.accent, .22, .4);
  ctx.fillStyle = ready ? look.accent + '2a' : look.button + 'dd';
  ctx.strokeStyle = ready ? look.accent : look.line;
  ctx.lineWidth = ready ? 4 : 2;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(24, look.radius + 6));
  ctx.fill();
  ctx.stroke();
  icon(ctx, ready ? 'draw' : 'wait', b.x + 62, center.y, 44, ready ? look.accent : look.ink + '88');
  ctx.textAlign = 'center';
  bothSides(ctx, center, () => {
    ctx.fillStyle = ready ? look.ink : look.ink + '88';
    ctx.font = '800 28px system-ui';
    ctx.fillText('CRÉER LE CIRCUIT', 28, 36);
    if (!ready) {
      ctx.fillStyle = look.accent;
      ctx.font = '600 21px system-ui';
      ctx.fillText(`En attente : ${waiting.map(seatName).join(', ')}`, 0, 102, 760);
    }
  });
}

/** Nomme un poste attendu, par exemple « Pilote Cyan ». */
function seatName(seat: SeatId): string {
  return `${roleLabel(seat)} ${TEAM_LABEL[playerTeam(seat)]}`;
}

/** Dessine le retour à l'accueil, plus discret que le départ. */
function drawBack(ctx: Ctx, look: Look): void {
  const b = SETUP_BACK, center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  ctx.fillStyle = look.button + 'dd';
  ctx.strokeStyle = look.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(20, look.radius));
  ctx.fill();
  ctx.stroke();
  icon(ctx, 'home', b.x + 50, center.y, 30, look.ink);
  ctx.textAlign = 'center';
  bothSides(ctx, center, () => {
    ctx.fillStyle = look.ink;
    ctx.font = '700 18px system-ui';
    ctx.fillText('ACCUEIL', 24, 26);
  });
}
