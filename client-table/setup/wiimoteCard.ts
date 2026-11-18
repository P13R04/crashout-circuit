/**
 * Contenu de la fiche d'un pilote réglé sur « Manette Wii » : pas de QR, la table vérifie la manette branchée à l'ordinateur.
 * Liens : client-table/setup/seatCard.ts, client-table/wiimote/wiimoteView.ts, client-table/wiimote/TableWiimotes.ts.
 * Connectée : numéro (ordre de connexion, aussi allumé sur les LED de la manette), batterie et calibrage. Sinon : bouton Connecter.
 */
import { icon } from '../ui/icons.js';
import { NEON } from '../themes/neon/neon.js';
import { wiimoteConnected, type WiimoteView } from '../wiimote/wiimoteView.js';
import type { Ctx } from '../renderer/rendererTypes.js';
import type { Look } from './seatCard.js';
import { CARD, WIIMOTE_BUTTON } from './setupLayout.js';

const LEFT = -CARD.w / 2 + CARD.pad;

/** Coupe un texte en lignes qui tiennent dans la largeur donnée. */
function wrap(ctx: Ctx, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
  }
  return line ? [...lines, line] : lines;
}

/** Dessine l'état de la manette du pilote et, tant qu'elle manque, le bouton qui l'ouvre. */
export function drawWiimote(ctx: Ctx, view: WiimoteView, color: string, look: Look, time: number): void {
  if (wiimoteConnected(view)) drawConnected(ctx, view, color, look);
  else drawMissing(ctx, view, look, time);
}

/** Affiche le numéro de la manette en grand, avec son état et sa batterie. */
function drawConnected(ctx: Ctx, view: WiimoteView, color: string, look: Look): void {
  const cx = LEFT + 62, cy = 78;
  ctx.fillStyle = color + '24';
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = look.ink;
  ctx.font = '800 72px system-ui';
  ctx.fillText(String(view.number), cx, cy + 25);
  ctx.textAlign = 'left';
  const x = LEFT + 140, width = CARD.w / 2 - CARD.pad - x;
  ctx.fillStyle = NEON.mint;
  ctx.font = '800 22px system-ui';
  ctx.fillText('● Manette connectée', x, 40, width);
  ctx.fillStyle = look.ink;
  ctx.font = '600 18px system-ui';
  ctx.fillText(`Manette n° ${view.number}`, x, 70, width);
  ctx.fillStyle = look.ink + 'bb';
  ctx.font = '500 16px system-ui';
  ctx.fillText(view.status === 'ready' ? 'Direction prête' : 'Calibrage : tenez-la droite', x, 96, width);
  const battery = view.battery === null ? '' : `Batterie ${view.battery} %${view.lowBattery ? ' (faible)' : ''}`;
  ctx.fillStyle = view.lowBattery ? NEON.gold : look.ink + 'bb';
  ctx.fillText(battery, x, 120, width);
  ctx.fillStyle = look.ink + 'bb';
  ctx.fillText(`La LED ${view.number} est allumée dessus.`, LEFT + 6, 156, CARD.w - 2 * CARD.pad - 12);
}

/** Invite à allumer la manette puis à la connecter ; affiche la raison d'un échec. */
function drawMissing(ctx: Ctx, view: WiimoteView, look: Look, time: number): void {
  const searching = view.status === 'connecting';
  ctx.save();
  ctx.globalAlpha = searching ? .6 + .4 * Math.sin(time * 4) : 1;
  icon(ctx, 'remote', LEFT + 34, 52, 56, look.ink + 'cc');
  ctx.restore();
  const x = LEFT + 90, width = CARD.w / 2 - CARD.pad - x;
  ctx.fillStyle = NEON.gold;
  ctx.font = '800 22px system-ui';
  ctx.fillText(searching ? '○ Recherche…' : view.status === 'unsupported' ? '○ Non disponible' : '○ Manette non détectée', x, 40, width);
  ctx.fillStyle = look.ink + 'cc';
  ctx.font = '500 16px system-ui';
  const text = view.notice || 'Allumez la manette (1 + 2), puis touchez Connecter.';
  wrap(ctx, text, width).slice(0, 3).forEach((line, index) => ctx.fillText(line, x, 68 + index * 22, width));
  if (view.status === 'unsupported') return;
  const b = WIIMOTE_BUTTON;
  ctx.fillStyle = look.accent + '24';
  ctx.strokeStyle = look.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(14, look.radius));
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = look.ink;
  ctx.font = '800 22px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('CONNECTER LA MANETTE', b.x + b.w / 2, b.y + b.h / 2 + 8);
  ctx.textAlign = 'left';
}
