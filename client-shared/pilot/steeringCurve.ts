/**
 * Courbe de direction commune aux sources de pilotage : zone morte, maximum, progressivité et lissage.
 * Liens : client-phone/pilot/gyro.ts (téléphone), client-wiimote/steering/wiimoteSteering.ts (manette).
 * Déplacé tel quel depuis gyro.ts pour que le téléphone et la manette donnent la même valeur pour le même angle.
 */
export const STEERING = {
  /** Durée de mesure du neutre, en millisecondes. */
  calibrationMs: 500,
  /** Écart d'angle, en degrés, sous lequel la direction reste nulle. */
  deadZone: 3,
  /** Écart d'angle, en degrés, qui donne la direction maximale. */
  maxSteer: 35,
  steerExponent: 1.3,
  /** Part de l'écart rattrapée à chaque mesure. */
  smoothing: .25,
};

/** Transforme un écart d'angle en direction bornée et progressive. */
export function steerFromAngle(wheel: number, neutral: number): number {
  const delta = ((wheel - neutral + 540) % 360) - 180;
  const fraction = Math.min(1, Math.max(0, (Math.abs(delta) - STEERING.deadZone) / (STEERING.maxSteer - STEERING.deadZone)));
  return Math.sign(delta) * fraction ** STEERING.steerExponent;
}

/** Lisse les variations du capteur et recentre instantanément dans la zone morte. */
export function smoothSteer(previous: number, target: number): number {
  return target === 0 ? 0 : previous + (target - previous) * STEERING.smoothing;
}
