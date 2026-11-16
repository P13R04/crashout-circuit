/**
 * Gère les réservations des places sur téléphone et expose uniquement leur état public.
 * Liens : server/protocol/gameState.ts, server/net/playerCommands.ts.
 */
import type { GameState, JoinMsg, JoinRejectedMsg, Phase, SeatId } from '../../types.js';

type Reservation = { token: string; owner: symbol | null; expiresAt: number };
type Claim = { seat: SeatId; token: string; changed: boolean } | { reason: JoinRejectedMsg['reason'] };

/** Vérifie qu'une valeur reçue désigne l'une des quatre places. */
export function isSeatId(value: unknown): value is SeatId {
  return value === 'A-pilot' || value === 'A-copilot' || value === 'B-pilot' || value === 'B-copilot';
}

export class PlayerSeats {
  private readonly reservations = new Map<SeatId, Reservation>();

  constructor(private readonly seats: GameState['seats'], private readonly newToken: () => string) {}

  /** Identifie la place dont cette connexion détient actuellement les droits. */
  seatOf(owner: symbol): SeatId | undefined {
    for (const [seat, reservation] of this.reservations) {
      if (reservation.owner === owner) return seat;
    }
  }

  /** Réattribue une réservation par jeton, ou crée une réservation pour une place libre. */
  claim(owner: symbol, join: Pick<JoinMsg, 'seat' | 'token' | 'name'>, now: number): Claim {
    this.expire(now);
    const current = this.seatOf(owner);
    for (const [seat, reservation] of this.reservations) {
      if (reservation.token !== join.token || (current && current !== seat)) continue;
      const changed = reservation.owner !== owner;
      reservation.owner = owner;
      reservation.expiresAt = 0;
      this.seats[seat].connected = true;
      return { seat, token: reservation.token, changed };
    }

    if (current || !isSeatId(join.seat)) return { reason: 'bad-token' };
    if (this.reservations.size === 4) return { reason: 'room-full' };
    if (this.reservations.has(join.seat)) return { reason: 'seat-taken' };

    const token = this.newToken();
    const name = join.name?.trim().slice(0, 40);
    this.reservations.set(join.seat, { token, owner, expiresAt: 0 });
    this.seats[join.seat] = { taken: true, connected: true, ...(name ? { name } : {}) };
    return { seat: join.seat, token, changed: true };
  }

  /** Réserve une place hors ligne pendant le délai correspondant à la phase de déconnexion. */
  disconnect(owner: symbol, phase: Phase, now: number): SeatId | undefined {
    const seat = this.seatOf(owner);
    if (!seat) return;
    const reservation = this.reservations.get(seat)!;
    const inRace = phase === 'RACE' || phase === 'PAUSED' || phase === 'RESULT';
    reservation.owner = null;
    reservation.expiresAt = now + (inRace ? 300_000 : 60_000);
    this.seats[seat].connected = false;
    return seat;
  }

  /** Libère immédiatement la place de la connexion avant le départ de la course. */
  leave(owner: symbol, phase: Phase): SeatId | undefined {
    if (phase !== 'LOBBY' && phase !== 'MAP' && phase !== 'READY') return;
    return this.release(owner);
  }

  /** Rend la place immédiatement disponible, indépendamment de la phase. */
  release(owner: symbol): SeatId | undefined {
    const seat = this.seatOf(owner);
    if (!seat) return;
    this.free(seat);
    return seat;
  }

  /** Libère les réservations expirées et retire leurs noms de l'état public. */
  expire(now: number): void {
    for (const [seat, reservation] of this.reservations) {
      if (reservation.owner || reservation.expiresAt > now) continue;
      this.free(seat);
    }
  }

  /** Retire la réservation privée et met à jour l'occupation publique. */
  private free(seat: SeatId): void {
    this.reservations.delete(seat);
    this.seats[seat] = { taken: false, connected: false };
  }
}
