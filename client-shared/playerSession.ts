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
  'seat-on-table': 'Ce poste se joue sur la table. Scannez le code de votre poste.',
  'seat-wiimote': 'Ce poste se joue avec une manette Wii branchée à la table.',
};
const PRE_RACE = ['LOBBY', 'SETUP', 'MAP', 'READY'];

type Reservation = { room: string; seat: SeatId; token: string };

export class PhoneSession {
  private conn: Connection | null = null;
  private reservation: Reservation | null = null;
  private generation = 0;
  private confirmed = false;
  readonly sync = new StateSync();
  state: GameState | null = null;
  stateTime = 0;
  seat: SeatId | null = null;
  room = '';
  online = false;
  canWatch = false;
  gyroUrl = '';
  pending: 'join' | 'leave' | null = null;
  notice = '';

  /** `wantedSeat` : poste annoncé par le QR code de la table, pris dès que la connexion est ouverte. */
  constructor(private readonly refresh: () => void, private wantedSeat: SeatId | null = null) {}

  /** Valide un code, ouvre la connexion et reprend la réservation de cet onglet si possible. */
  async open(raw = ''): Promise<void> {
    let room = raw.trim().toUpperCase();
    this.notice = '';
    if (room && !/^[A-HJ-NP-Z2-9]{5}$/.test(room)) {
      this.notice = 'Saisissez le code à cinq caractères affiché sur la table.';
      this.refresh();
      return;
    }

    const generation = ++this.generation;
    this.canWatch = false;
    this.gyroUrl = '';
    this.online = false;
    this.confirmed = false;
    this.conn?.close();
    this.notice = 'Connexion à la séance…';
    this.refresh();
    try {
      const info = await readSession();
      if (generation !== this.generation) return;
      this.canWatch = info.spectators === true;
      if (room && info.room !== room && !info.localNetwork) {
        this.notice = REJECTION['unknown-room'];
        this.refresh();
        return;
      }
      room = info.room;
      if (info.localNetwork && location.protocol === 'http:') {
        const choices = info.secureBaseUrls ?? [];
        const secure = choices.find(base => new URL(base).hostname === location.hostname) ?? choices[0];
        if (secure) {
          const link = new URL('/play?room=' + room, secure);
          if (this.wantedSeat) link.searchParams.set('seat', this.wantedSeat);
          this.gyroUrl = link.href;
        }
      }
    } catch {
      if (generation !== this.generation) return;
      this.notice = 'Serveur injoignable. Vérifiez la connexion et réessayez.';
      this.refresh();
      return;
    }

    if (this.room !== room) {
      this.seat = null;
      this.confirmed = false;
      this.state = null;
    }
    this.room = room;
    this.reservation = this.loadReservation();
    this.resumeSecureLink();
    const next = new URL(location.href);
    next.searchParams.set('room', room);
    history.replaceState(null, '', next);
    this.connect(generation);
  }

  /** Transmet la réservation au passage HTTP → HTTPS, dans le fragment jamais envoyé au serveur HTTP. */
  get secureJoinUrl(): string {
    if (!this.gyroUrl) return '';
    const link = new URL(this.gyroUrl);
    const seat = this.reservation?.seat ?? this.wantedSeat;
    if (seat) link.searchParams.set('seat', seat);
    link.searchParams.set('input', 'gyro');
    if (this.reservation) link.hash = new URLSearchParams({ resume: this.reservation.token }).toString();
    return link.href;
  }

  /** Reprend le poste dans la nouvelle origine puis efface immédiatement le jeton de l'adresse. */
  private resumeSecureLink(): void {
    if (location.protocol !== 'https:') return;
    const token = new URLSearchParams(location.hash.slice(1)).get('resume');
    if (!token) return;
    if (this.wantedSeat && /^[a-f0-9-]{36}$/i.test(token)) {
      this.saveReservation({ room: this.room, seat: this.wantedSeat, token });
    }
    history.replaceState(null, '', location.pathname + location.search);
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
    } else if (this.online && this.wantedSeat && !this.seat && !this.pending) {
      this.join(this.wantedSeat);
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
        this.stateTime = msg.t;
        if (this.pending === 'leave' && !PRE_RACE.includes(msg.state.phase)) {
          this.pending = null;
        }
        break;
      case 'Joined':
        this.wantedSeat = null;
        this.confirmed = true;
        this.pending = null;
        this.seat = msg.seat;
        this.notice = '';
        this.saveReservation({ room: this.room, seat: msg.seat, token: msg.token });
        break;
      case 'Left':
        this.wantedSeat = null;
        this.confirmed = false;
        this.pending = null;
        this.seat = null;
        this.saveReservation(null);
        break;
      case 'JoinRejected': {
        // Le poste du QR code n'est tenté qu'une fois de plus, après l'abandon d'une réservation périmée.
        const retry = msg.reason === 'bad-token' ? this.wantedSeat : null;
        this.wantedSeat = null;
        this.pending = null;
        this.notice = REJECTION[msg.reason];
        if (msg.reason === 'bad-token' || msg.reason === 'unknown-room') {
          this.confirmed = false;
          this.seat = null;
          this.saveReservation(null);
        }
        if (msg.reason === 'unknown-room') this.closeSession();
        if (retry) this.join(retry);
        break;
      }
      default:
        return;
    }
    this.refresh();
  }

  /** Ferme le transport sur une vraie sortie de page et libère le pilote de test. */
  suspend(): void {
    if (this.state?.soloTest) this.saveReservation(null);
    this.generation++;
    this.conn?.close();
    this.conn = null;
    this.online = false;
    this.confirmed = false;
    this.pending = null;
    this.seat = null;
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
