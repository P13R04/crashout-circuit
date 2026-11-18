/**
 * Pilote conduit hors de la table : téléphone connecté ou manette Wii vérifiée sur l'ordinateur de la table.
 * Liens : client-table/ui/HUD.ts (poste dessiné sans direction ni pédale), client-table/gesture/contactDown.ts (poste inerte).
 * Le poste de la table ne reprend ses commandes que si ce pilote disparaît : le jeu reste alors jouable.
 */
import type { GameState, Team } from '../../server/types.js';
import { icon } from './icons.js';

export type RemoteKind = 'phone' | 'wiimote';

/** Renvoie l'appareil qui conduit pour cette équipe, ou `null` quand le pilote joue sur la table. */
export function remotePilot(state: Pick<GameState, 'seats' | 'seatDevices' | 'wiimotes'>, team: Team): RemoteKind | null {
  if (state.seats?.[`${team}-pilot`]?.connected) return 'phone';
  return state.seatDevices?.[`${team}-pilot`] === 'wiimote' && state.wiimotes?.[team] != null ? 'wiimote' : null;
}

/** Remplace la direction et la pédale du poste par l'appareil qui conduit, avec le numéro de la manette Wii. */
export function drawRemotePilot(ctx: CanvasRenderingContext2D, area: { x: number; y: number; w: number; h: number }, kind: RemoteKind,
  number: number | null, color: string, fill: string, line: string, ink: string): void {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(area.x - area.w / 2, area.y - area.h / 2, area.w, area.h, 14);
  ctx.fill();
  ctx.stroke();
  icon(ctx, kind === 'wiimote' ? 'remote' : 'phone', area.x - area.w / 2 + 34, area.y, 38, color);
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  ctx.font = 'bold 17px system-ui';
  ctx.fillText(kind === 'wiimote' ? `MANETTE N° ${number ?? '?'}` : 'TÉLÉPHONE', area.x - area.w / 2 + 66, area.y - 4);
  ctx.fillStyle = '#61f4ba';
  ctx.font = '600 14px system-ui';
  ctx.fillText('● connecté', area.x - area.w / 2 + 66, area.y + 18);
  ctx.restore();
}
