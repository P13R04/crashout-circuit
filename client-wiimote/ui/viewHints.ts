/**
 * Textes d'aide affichés au pilote selon l'état de la manette et de la séance.
 * Liens : client-wiimote/ui/wiimoteScreen.ts, client-wiimote/main.ts.
 * Module pur : il ne lit que le modèle de vue, ce qui permet de tester les messages sans navigateur.
 */
import type { DriveMode, Phase, SeatId } from '../../server/types.js';
import type { Buttons, RawAccel } from '../hid/reportDecoder.js';
import type { SteeringStatus } from '../steering/wiimoteSteering.js';

export type ControllerState = 'unsupported' | 'idle' | 'connected' | 'lost';

/** Tout ce que l'écran affiche, calculé par main.ts à partir de la manette et de la séance. */
export interface WiimoteView {
  controller: ControllerState;
  deviceName: string;
  battery: number | null;
  lowBattery: boolean;
  steeringStatus: SteeringStatus;
  shaking: boolean;
  steer: number | null;
  angle: number | null;
  accel: RawAccel | null;
  buttons: Buttons;
  room: string;
  online: boolean;
  seat: SeatId | null;
  seatsTaken: Record<SeatId, boolean>;
  pending: boolean;
  notice: string;
  phase: Phase | null;
  driveMode: DriveMode | null;
  driving: boolean;
  carDisabled: boolean;
  /** Séance en mode solo (un seul pilote, serveur lancé avec CRASHOUT_SOLO_TEST=1). */
  solo: boolean;
  /** Un lancement de partie solo est en cours. */
  launching: boolean;
}

/** Explique l'état de la manette et ce que le joueur doit faire. */
export function controllerHint(view: Pick<WiimoteView, 'controller' | 'steeringStatus' | 'shaking'>): string {
  switch (view.controller) {
    case 'unsupported':
      return 'WebHID indisponible : ouvre cette page dans Chrome ou Edge de bureau, sur http://localhost ou en HTTPS.';
    case 'idle':
      return 'Appuie sur « Connecter la manette », puis choisis la Wiimote dans la liste.';
    case 'lost':
      return 'Manette perdue, appuyer sur un bouton puis Reconnecter. La voiture se relâche seule en un quart de seconde.';
    case 'connected':
      if (view.shaking) return 'Secousse détectée : tiens la manette stable pour mesurer l’angle.';
      if (view.steeringStatus === 'waiting') return 'Tiens la manette à l’horizontale, boutons 1 et 2 à droite.';
      if (view.steeringStatus === 'calibrating') return 'Garde le volant droit pendant la calibration.';
      return 'Incline la manette pour tourner. Home recalibre le neutre.';
  }
}

/** Explique où en est la séance pour ce pilote. */
export function sessionHint(view: Pick<WiimoteView, 'room' | 'online' | 'seat' | 'phase' | 'driving' | 'carDisabled' | 'driveMode' | 'solo'>): string {
  if (!view.room) return 'Lance une partie solo, ou saisis le code de séance affiché sur la table.';
  if (!view.online) return 'Serveur injoignable. Reconnexion en cours…';
  if (!view.seat) return 'Choisis ta place de pilote.';
  if (view.phase === 'SETUP') return 'Place réservée. Connecte la manette, puis attends le départ sur la table.';
  if (view.phase === 'LOBBY' || view.solo && view.phase !== 'RACE') return 'Appuie sur « Lancer une partie solo », ou attends le départ sur la table.';
  if (view.phase === 'RACE' && view.carDisabled) return 'Voiture en panne : maintiens A avec ton copilote pour réparer.';
  if (view.driving) return view.driveMode === 'pedal' ? 'Course : tiens B pour accélérer.' : 'Course : la voiture avance seule.';
  if (view.phase === 'PAUSED') return 'Course en pause sur la table.';
  if (view.phase === 'RESULT') return 'Partie terminée.';
  return 'En attente du départ sur la table.';
}

/** Liste les boutons utilisés pour conduire qui sont actuellement appuyés. */
export function pressedLabel(buttons: Buttons): string {
  const names = [buttons.b && 'B accélérer', buttons.a && 'A réparer', buttons.one && '1 mode', buttons.home && 'Home recalibrer']
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join(' · ') : 'aucun';
}
