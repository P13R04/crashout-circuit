/**
 * Interface commune des sources de commandes du pilote (manette Wii aujourd'hui, téléphone si on le rattache plus tard).
 * Liens : client-shared/pilot/pilotLink.ts (consommateur réseau), client-wiimote/control/wiimoteCommandSource.ts.
 */

/** Commandes instantanées lues sur la source ; les boutons sont des niveaux, les fronts sont détectés par le lien. */
export interface PilotSnapshot {
  /** Direction normalisée entre -1 et 1, avec la courbe de steeringCurve.ts. */
  steer: number;
  /** Accélérateur tenu : n'a d'effet qu'en mode PÉDALE. */
  accelerate: boolean;
  /** Réparation tenue : bouton du pad de réparation du pilote. */
  repair: boolean;
  /** Bascule AUTO / PÉDALE : une pression compte une fois. */
  toggleDriveMode: boolean;
}

export interface PilotCommandSource {
  /** Renvoie la commande courante, ou null tant que la source est absente, perdue ou non calibrée. */
  read(now: number): PilotSnapshot | null;
}
