/**
 * Cadence d'envoi des commandes du pilote et combinaison de la direction avec l'accélérateur.
 * Liens : client-phone/pilot/gyro.ts (téléphone), client-shared/pilot/pilotLink.ts (réseau), config.json (pilotInputTimeoutMs).
 * Déplacé tel quel depuis gyro.ts : le serveur relâche une commande après pilotInputTimeoutMs sans nouvelle.
 */
export const CADENCE = {
  /** Intervalle minimal entre deux envois, en millisecondes. */
  minSendMs: 1000 / 30,
  /** Période à laquelle une commande immobile est renouvelée. */
  heartbeatMs: 100,
  /** Période de lecture des sources. */
  pollMs: 10,
};

export type DriveSample = { steer: number; throttle: number };
export type SentInput = DriveSample & { time: number };

/** Limite le débit tout en renouvelant les commandes immobiles. */
export function shouldSendInput(now: number, input: DriveSample, last: SentInput): boolean {
  const elapsed = now - last.time;
  if (elapsed < CADENCE.minSendMs) return false;
  // Préserve une période de 100 ms même lorsque le seuil tombe entre deux lectures.
  return elapsed >= CADENCE.heartbeatMs - CADENCE.pollMs
    || Math.abs(input.steer - last.steer) > .01 || Math.abs(input.throttle - last.throttle) > .01;
}

/** Combine la mesure du volant et la pédale lorsqu'un capteur utilisable est disponible. */
export function driveSample(sensor: DriveSample, pedalMode: boolean, pedalHeld: boolean): DriveSample {
  return {
    steer: sensor.steer,
    throttle: pedalMode ? Math.max(Number(pedalHeld), sensor.throttle) : 1,
  };
}
