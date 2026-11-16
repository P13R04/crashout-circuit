/**
 * Gère le code de séance, le choix d'un poste et la reconnexion du joueur.
 * Liens : client-shared/net.ts, server/protocol/messages.ts, client-phone/session.ts (façade), client-wiimote/main.ts.
 * Déplacé depuis client-phone/session.ts sans changement de comportement : le téléphone et la manette Wii partagent
 * la même couche de séance (code, place, jeton, reconnexion).
 */
import { connectWs, StateSync, type Connection } from './net.js';
import { readSession } from './sessionInfo.js';
import { SEAT_IDS } from './seatLabels.js';
import type { GameState, JoinRejectedMsg, SeatId, ServerMessage } from '../server/types.js';

const STORAGE = 'crashout-player';
const REJECTION: Record<JoinRejectedMsg['reason'], string> = {
  'seat-taken': 'Cette place est déjà prise. Choisissez une autre place.',
  'bad-token': 'Votre réservation a expiré. Choisissez de nouveau une place.',
  'unknown-room': 'Ce code de séance est inconnu.',
  'solo-seat': 'Cet essai est réservé à un seul pilote.',
  'room-full': 'Les quatre places de cette séance sont prises.',
};

type Reservation = { room: string; seat: SeatId; token: string };

export class PhoneSession {
  private conn: Connection | null = null;
  private reservation: Reservation | null = null;
  private generation = 0;
  private confirmed = false;
  readonly sync = new StateSync();
  state: GameState | null = null;
  seat: SeatId | null = null;
  room = '';
  online = false;
  pending: 'join' | 'leave' | null = null;
  notice = '';

  constructor(private readonly refresh: () => void) {}

  /** Valide un code, ouvre la connexion et reprend la réservation de cet onglet si possible. */
  async open(raw: string): Promise<void> {
    const room = raw.trim().toUpperCase();
    this.notice = '';
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(room)) {
      this.notice = 'Saisissez le code à cinq caractères affiché sur la table.';
      this.refresh();
      return;
    }

    const generation = ++this.generation;
    this.conn?.close();
    this.notice = 'Connexion à la séance…';
    this.refresh();
    try {
      const info = await readSession();
      if (generation !== this.generation) return;
      if (info.room !== room) {
        this.notice = REJECTION['unknown-room'];
        this.refresh();
        return;
      }
    } catch {
      if (generation !== this.generation) return;
      this.notice = 'Serveur injoignable. Vérifiez la connexion et réessayez.';
      this.refresh();
      return;
    }

    this.room = room;
    this.reservation = this.loadReservation();
    const next = new URL(location.href);
    next.searchParams.set('room', room);
    history.replaceState(null, '', next);
    this.connect(generation);
  }

  /** Vérifie que le serveur a confirmé le poste sur la connexion en cours. */
  get canPlay(): boolean { return this.online && this.confirmed; }

  /** Envoie les commandes héritées du poste authentifié. */
  send(message: { type: string } & Record<string, unknown>): void {
    if (this.canPlay) this.conn?.send(message);
  }

  /** Envoie la demande de place après le choix de l'équipe et du rôle. */
  join(seat: SeatId): void {
    if (!this.online || this.pending) return;
    this.pending = 'join';
    this.notice = '';
    this.conn?.send({ type: 'Join', room: this.room, seat });
    this.refresh();
  }

  /** Demande la libération immédiate de la place. */
  leave(): void {
    if (!this.online || this.pending || !this.seat) return;
    this.pending = 'leave';
    this.conn?.send({ type: 'Leave' });
    this.refresh();
  }

  /** Réutilise le jeton à l'ouverture du socket ou au retour au premier plan. */
  resume(): void {
    if (this.online && this.reservation && this.pending !== 'leave') {
      this.conn?.send({ type: 'Join', room: this.room, token: this.reservation.token });
    }
  }

  /** Branche la reconnexion automatique et déconnecte visuellement l'ancien poste en cas de coupure. */
  private connect(generation: number): void {
    this.conn = connectWs('/ws/player', {
      onOpen: () => {
        if (generation !== this.generation) return;
        this.online = true;
        this.notice = '';
        this.resume();
        this.refresh();
      },
      onClose: () => {
        if (generation !== this.generation) return;
        this.online = false;
        this.confirmed = false;
        this.pending = null;
        this.notice = 'Serveur injoignable. Reconnexion en cours…';
        this.refresh();
      },
      onMessage: msg => {
        if (generation === this.generation) this.onMessage(msg);
      },
    });
  }

  /** Applique les confirmations privées et les états partagés. */
  private onMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'State':
        this.state = this.sync.apply(msg.state, msg.t);
        if (this.pending === 'leave' && !['LOBBY', 'MAP', 'READY'].includes(msg.state.phase)) {
          this.pending = null;
        }
        break;
      case 'Joined':
        this.confirmed = true;
        this.pending = null;
        this.seat = msg.seat;
        this.notice = '';
        this.saveReservation({ room: this.room, seat: msg.seat, token: msg.token });
        break;
      case 'Left':
        this.confirmed = false;
        this.pending = null;
        this.seat = null;
        this.saveReservation(null);
        break;
      case 'JoinRejected':
        this.pending = null;
        this.notice = REJECTION[msg.reason];
        if (msg.reason === 'bad-token' || msg.reason === 'unknown-room') {
          this.confirmed = false;
          this.seat = null;
          this.saveReservation(null);
        }
        if (msg.reason === 'unknown-room') this.closeSession();
        break;
      default:
        return;
    }
    this.refresh();
  }

  /** Retourne à la saisie du code si le serveur a redémarré. */
  private closeSession(): void {
    this.generation++;
    this.conn?.close();
    this.conn = null;
    this.room = '';
    this.online = false;
    this.state = null;
  }

  /** Récupère uniquement une réservation valable pour le code affiché. */
  private loadReservation(): Reservation | null {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE) ?? 'null') as Reservation | null;
      return saved?.room === this.room && SEAT_IDS.includes(saved.seat) && typeof saved.token === 'string'
        ? saved : null;
    } catch {
      return null;
    }
  }

  /** Mémorise la place en mémoire et, si possible, dans l'onglet. */
  private saveReservation(reservation: Reservation | null): void {
    this.reservation = reservation;
    try {
      if (reservation) sessionStorage.setItem(STORAGE, JSON.stringify(reservation));
      else sessionStorage.removeItem(STORAGE);
    } catch {
      // La reconnexion dans la page reste possible si le stockage est désactivé.
    }
  }
}
