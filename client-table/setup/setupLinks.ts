/**
 * Prépare les adresses et les QR codes de l'écran de préparation : un par poste annoncé, plus un pour les spectateurs.
 * Liens : client-table/setup/setupScreen.ts, client-shared/sessionInfo.ts, client-phone/main.ts (?seat=), client-wiimote/main.ts (?seat=).
 */
import type { SeatDevice, SeatId } from '../../server/types.js';
import { readSession } from '../../client-shared/sessionInfo.js';

export interface SetupLinks {
  room: string;
  base: string;
  spectators: boolean;
  /** QR déjà dessinés, par adresse. */
  qr: Map<string, HTMLCanvasElement>;
}

/** Adresse que le joueur ouvre pour prendre ce poste avec son téléphone (`null` pour la table et la manette Wii). */
export function seatUrl(links: Pick<SetupLinks, 'room' | 'base'>, seat: SeatId, device: SeatDevice): string | null {
  if (device !== 'phone') return null;
  const url = new URL('/play', links.base);
  url.searchParams.set('room', links.room);
  url.searchParams.set('seat', seat);
  return url.toString();
}

/** Adresse de la page des spectateurs. */
export function spectatorUrl(links: Pick<SetupLinks, 'room' | 'base'>): string {
  const url = new URL('/watch', links.base);
  url.searchParams.set('room', links.room);
  return url.toString();
}

/** Liste toutes les adresses qui peuvent apparaître à l'écran, pour dessiner leurs QR une seule fois. */
export function allSetupUrls(links: Pick<SetupLinks, 'room' | 'base' | 'spectators'>, seats: readonly SeatId[]): string[] {
  // La manette Wii est vérifiée par la table elle-même : seul le téléphone a un QR code par poste.
  const urls = seats.map(seat => seatUrl(links, seat, 'phone')!);
  return links.spectators ? [...urls, spectatorUrl(links)] : urls;
}

/** Lit l'adresse annoncée par le serveur puis prépare chaque QR ; renvoie `null` sans adresse joignable. */
export async function loadSetupLinks(seats: readonly SeatId[]): Promise<SetupLinks | null> {
  const session = await readSession();
  if (!session.baseUrls.length) return null;
  const links: SetupLinks = { room: session.room, base: session.baseUrls[0], spectators: session.spectators === true, qr: new Map() };
  const { toCanvas } = await import('qrcode');
  await Promise.all(allSetupUrls(links, seats).map(async url => {
    const canvas = document.createElement('canvas');
    await toCanvas(canvas, url, { margin: 2, scale: 8, errorCorrectionLevel: 'M' });
    links.qr.set(url, canvas);
  }));
  return links;
}
