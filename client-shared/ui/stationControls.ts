/**
 * Dessine les commandes circulaires du copilote sur la table et le téléphone.
 * Liens : icons.ts, themes.ts, client-table/ui/HUD.ts.
 */
import type { Team } from '../../server/types.js';
import { icon } from './icons.js';
import { themeLook, type ThemeId } from './themes.js';

export const STATION_TEAM_COLOR: Record<Team, string> = { A: '#00e5ff', B: '#ff4081' };
const MINT = '#61f4ba';
const GOLD = '#ffce66';
export type ControlDisc = { x: number; y: number; r: number };
type Ctx = CanvasRenderingContext2D;

/** Trace le fond puis la progression de la couronne. */
function ring(ctx: Ctx, x: number, y: number, r: number, progress: number, color: string, width: number): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (progress <= 0) return;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress));
  ctx.stroke();
}

/** Choisit la couleur de POWER et du bonus selon l'accès à la commande. */
export function powerInk(color: string, stocked: boolean, armed: boolean, blocked: boolean): string {
  return armed ? GOLD : stocked && !blocked ? color : '#586078';
}

/** Dessine le disque POWER et son pictogramme. */
export function drawPowerControl(ctx: Ctx, { x, y, r }: ControlDisc, style: {
  theme: ThemeId; teamColor: string; ink: string; stocked: boolean; armed: boolean;
}): void {
  const { theme, teamColor, ink, stocked, armed } = style;
  ctx.fillStyle = armed ? '#ffce661f' : stocked ? teamColor + '24' : themeLook(theme).button;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (theme === 'toy') {
    ctx.strokeStyle = '#ffffff25'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y - 2, r - 5, Math.PI, Math.PI * 1.8); ctx.stroke();
  }
  ring(ctx, x, y, r, 1, ink, armed ? 4 : 2);
  icon(ctx, 'power', x, y, 30, ink);
}

/** Dessine la clé, la couronne de progression et les deux appuis de réparation. */
export function drawRepairControl(ctx: Ctx, { x, y, r }: ControlDisc, style: {
  theme: ThemeId; teamColor: string; disabledCar: boolean; held: boolean; partnerHeld: boolean; progress: number;
}): void {
  const { theme, teamColor, disabledCar, held, partnerHeld, progress } = style;
  ctx.fillStyle = held ? 'rgba(97,244,186,0.12)' : disabledCar ? 'rgba(255,64,64,0.2)' : themeLook(theme).button;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ring(ctx, x, y, r - 5, progress, MINT, 6);
  ctx.strokeStyle = held ? MINT : teamColor;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  icon(ctx, 'wrench', x, y - 8, 30, held ? MINT : disabledCar ? '#ff7070' : '#a9b6cd');
  for (const [dx, on] of [[-11, held], [11, partnerHeld]] as const) {
    ctx.fillStyle = on ? MINT : '#ffffff15';
    ctx.strokeStyle = on ? MINT : '#8190aa';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + dx, y + 24, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
