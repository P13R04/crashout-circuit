/**
 * Lance une partie à un seul pilote depuis la page Wii, comme si on scannait le QR code avec le téléphone :
 * vérifie la manette, ouvre la séance du serveur (code relevé automatiquement), prend la place A-pilot, envoie StartSolo.
 * Liens : client-shared/playerSession.ts, server/rules/session/soloRace.ts (StartSolo), client-wiimote/main.ts.
 * Aucune variable d'environnement : le serveur passe en solo si l'accueil est libre et que ce pilote est seul. Il ignore
 * sinon la demande, d'où la confirmation par le numéro de piste et la phase avant de dire que la partie a démarré.
 */
import type { SeatId } from '../../server/types.js';

/** Partie de la séance dont le lancement a besoin ; PhoneSession la fournit telle quelle. */
export interface SoloSessionPort {
  readonly room: string;
  readonly online: boolean;
  readonly canPlay: boolean;
  readonly seat: SeatId | null;
  readonly state: { readonly soloTest: boolean; readonly phase: string; readonly trackVersion: number } | null;
  open(code: string): Promise<void>;
  join(seat: SeatId): void;
  send(message: { type: string } & Record<string, unknown>): void;
}

export interface SoloLaunchDeps {
  session: SoloSessionPort;
  /** Vrai tant que la manette est ouverte. */
  controllerConnected(): boolean;
  /** Lit le code de la séance courante sur le serveur. */
  readRoom(): Promise<string>;
  /** Délais en millisecondes ; réduits par les tests. */
  timing?: { connectMs: number; resumeMs: number; seatMs: number; confirmMs: number };
}

export type SoloLaunchResult = 'started' | 'no-controller' | 'offline' | 'refused' | 'seat-unavailable';

/** Messages à afficher selon l'issue du lancement ; vide quand la partie démarre. */
export const SOLO_LAUNCH_NOTICE: Record<SoloLaunchResult, string> = {
  started: '',
  'no-controller': 'Connecte d’abord la manette avec « Connecter la manette ».',
  offline: 'Serveur injoignable. Vérifie qu’il tourne, puis réessaie.',
  refused: 'Le serveur a refusé le lancement : retourne à l’accueil sur la table et vérifie qu’aucun autre joueur n’a pris de place.',
  'seat-unavailable': 'Place de pilote indisponible : elle est prise ou la séance ne l’accepte pas.',
};

const DEFAULT_TIMING = { connectMs: 5000, resumeMs: 500, seatMs: 3000, confirmMs: 2000 };

/** Attend qu'une condition soit vraie ; renvoie faux au bout du délai. */
async function until(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > end) return false;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return true;
}

/** Enchaîne les vérifications puis démarre la course ; chaque échec renvoie sa raison sans rien envoyer. */
export async function launchSolo({ session, controllerConnected, readRoom, timing = DEFAULT_TIMING }: SoloLaunchDeps): Promise<SoloLaunchResult> {
  if (!controllerConnected()) return 'no-controller';
  if (!session.online || !session.room) {
    try {
      await session.open(await readRoom());
    } catch {
      return 'offline';
    }
    if (!await until(() => session.online && session.state !== null, timing.connectMs)) return 'offline';
  }
  // Une réservation de cet onglet se reprend d'elle-même à l'ouverture : on la laisse aboutir avant de demander une place.
  if (!await until(() => session.canPlay, timing.resumeMs)) {
    session.join('A-pilot');
    if (!await until(() => session.canPlay, timing.seatMs)) return 'seat-unavailable';
  }
  if (session.seat !== 'A-pilot') return 'seat-unavailable';
  if (!controllerConnected()) return 'no-controller';
  const before = session.state?.trackVersion ?? -1;
  session.send({ type: 'StartSolo' });
  const started = await until(() => {
    const state = session.state;
    return state !== null && state.soloTest && state.phase === 'RACE' && state.trackVersion !== before;
  }, timing.confirmMs);
  return started ? 'started' : 'refused';
}
