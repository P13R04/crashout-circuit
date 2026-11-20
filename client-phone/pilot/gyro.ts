/**
 * Calcule les commandes du pilote à partir de l'orientation du téléphone.
 * Liens : W3C Device Orientation and Motion, client-phone/pilot/wheelSensor.ts.
 * La courbe de direction et la cadence d'envoi vivent dans client-shared/pilot/ (partagées avec la manette) et sont
 * réexportées ici pour que les noms et les tests du téléphone restent inchangés.
 */
import { STEERING } from '../../client-shared/pilot/steeringCurve.js';
import { CADENCE } from '../../client-shared/pilot/inputCadence.js';
import { screenGravity } from '../sensors/orientation.js';

export { steerFromAngle, smoothSteer } from '../../client-shared/pilot/steeringCurve.js';
export { shouldSendInput, driveSample } from '../../client-shared/pilot/inputCadence.js';
export type { DriveSample, SentInput } from '../../client-shared/pilot/inputCadence.js';

export const WHEEL = {
  ...STEERING, ...CADENCE,
  timeoutMs: 1500, minPitch: 10, maxPitch: 35,
};

type Angles = { wheel: number; pitch: number };
const radians = Math.PI / 180;

/** Projette la verticale dans le repère de l'écran, indépendamment du cap magnétique. */
export function wheelAngle(beta: number | null, gamma: number | null, orientation: number): Angles | null {
  const gravity = screenGravity(beta, gamma, orientation);
  if (!gravity) return null;
  const { horizontal, vertical, normal } = gravity;
  if (Math.hypot(horizontal, vertical) < .15) return null; // Le volant est presque à plat.
  return {
    wheel: Math.atan2(-horizontal, vertical) / radians,
    pitch: Math.atan2(normal, Math.hypot(horizontal, vertical)) / radians,
  };
}

/** Mesure la position neutre, y compris de part et d'autre du passage de +180° à -180°. */
export function neutralAngle(samples: readonly Angles[]): Angles {
  let sin = 0, cos = 0, pitch = 0;
  for (const sample of samples) {
    sin += Math.sin(sample.wheel * radians);
    cos += Math.cos(sample.wheel * radians);
    pitch += sample.pitch;
  }
  return { wheel: Math.atan2(sin, cos) / radians, pitch: pitch / samples.length };
}

/** Transforme l'inclinaison avant en position de pédale. */
export function throttleFromPitch(pitch: number, neutral: number): number {
  return Math.max(0, Math.min(1, (pitch - neutral - WHEEL.minPitch) / (WHEEL.maxPitch - WHEEL.minPitch)));
}
