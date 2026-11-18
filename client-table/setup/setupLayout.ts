/**
 * Géométrie de l'écran de préparation : une fiche par poste dans son coin, orientée vers son joueur, et les commandes communes au centre.
 * Liens : client-table/setup/setupScreen.ts, client-table/gesture/contactDown.ts, server/layout.ts (postes de la table).
 * Module pur, sans Canvas : les mêmes rectangles servent au dessin et à la reconnaissance du toucher.
 */
import type { SeatDevice, SeatId, Vec2 } from '../../server/types.js';
import { LOGICAL_W, LOGICAL_H } from '../../server/layout.js';

/** Tailles d'une fiche de poste, dans son propre repère (origine au centre, y vers le joueur). */
export const CARD = { w: 500, h: 360, pad: 13, gap: 12 } as const;
const TILE_TOP = -118;
export const TILE_H = 110;

interface Card { cx: number; cy: number; rot: number }

/** Place chaque fiche sous les doigts de son joueur : les deux du haut sont les deux du bas tournées d'un demi-tour. */
export const SEAT_CARDS: Record<SeatId, Card> = {
  'A-pilot': { cx: 270, cy: 880, rot: 0 },
  'B-copilot': { cx: LOGICAL_W - 270, cy: 880, rot: 0 },
  'B-pilot': { cx: 270, cy: LOGICAL_H - 880, rot: Math.PI },
  'A-copilot': { cx: LOGICAL_W - 270, cy: LOGICAL_H - 880, rot: Math.PI },
};

/** Boutons communs au centre de la table, lisibles des deux grands côtés. */
export const SETUP_START = { x: LOGICAL_W / 2 - 260, y: 490, w: 520, h: 100 };
export const SETUP_BACK = { x: LOGICAL_W / 2 - 150, y: 800, w: 300, h: 70 };
/** Cadre du QR code des spectateurs. */
export const SETUP_SPECTATORS = { x: LOGICAL_W / 2 - 190, y: 160, w: 380, h: 270 };

/** Bouton qui ouvre la manette Wii du pilote, dans le repère de sa fiche. */
export const WIIMOTE_BUTTON = { x: -CARD.w / 2 + CARD.pad, y: 112, w: CARD.w - 2 * CARD.pad, h: 52 };

/** Appareils proposés à un poste : la manette Wii ne sert qu'à piloter. */
export function devicesFor(seat: SeatId): SeatDevice[] {
  return seat.endsWith('-pilot') ? ['table', 'phone', 'wiimote'] : ['table', 'phone'];
}

/** Rectangle d'un choix d'appareil, dans le repère de la fiche. */
export function tileRect(seat: SeatId, device: SeatDevice): { x: number; y: number; w: number; h: number } {
  const devices = devicesFor(seat);
  const inner = CARD.w - 2 * CARD.pad;
  const w = (inner - CARD.gap * (devices.length - 1)) / devices.length;
  return { x: -CARD.w / 2 + CARD.pad + devices.indexOf(device) * (w + CARD.gap), y: TILE_TOP, w, h: TILE_H };
}

/** Convertit un point de la table en point du repère de la fiche. */
export function toCardLocal(seat: SeatId, p: Vec2): Vec2 {
  const { cx, cy, rot } = SEAT_CARDS[seat];
  const dx = p.x - cx, dy = p.y - cy, c = Math.cos(rot), s = Math.sin(rot);
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** Vérifie qu'un point appartient au rectangle demandé. */
export function inRect(r: { x: number; y: number; w: number; h: number }, p: Vec2): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Commande touchée sur l'écran de préparation. */
export type SetupHit =
  | { kind: 'device'; seat: SeatId; device: SeatDevice }
  | { kind: 'connect'; seat: SeatId }
  | { kind: 'start' }
  | { kind: 'back' };

/** Retrouve la commande située sous un contact de la table, ou `null` s'il tombe à côté ; `connectable` : postes dont la manette Wii manque. */
export function setupHit(p: Vec2, connectable: readonly SeatId[] = []): SetupHit | null {
  if (inRect(SETUP_START, p)) return { kind: 'start' };
  if (inRect(SETUP_BACK, p)) return { kind: 'back' };
  for (const seat of Object.keys(SEAT_CARDS) as SeatId[]) {
    const local = toCardLocal(seat, p);
    if (connectable.includes(seat) && inRect(WIIMOTE_BUTTON, local)) return { kind: 'connect', seat };
    for (const device of devicesFor(seat)) {
      if (inRect(tileRect(seat, device), local)) return { kind: 'device', seat, device };
    }
  }
  return null;
}
