/**
 * Calcule les commandes du pilote à partir de l'orientation du téléphone.
 * Liens : W3C Device Orientation and Motion, client-phone/pilot/wheelSensor.ts.
 */
export const WHEEL = {
  timeoutMs: 1500, calibrationMs: 500, deadZone: 3, maxSteer: 35, steerExponent: 1.3,
  smoothing: .25, minPitch: 10, maxPitch: 35, minSendMs: 1000 / 30, heartbeatMs: 100, pollMs: 10,
};

type Angles = { wheel: number; pitch: number };
const radians = Math.PI / 180;

/** Projette la verticale dans le repère de l'écran, indépendamment du cap magnétique. */
export function wheelAngle(beta: number | null, gamma: number | null, orientation: number): Angles | null {
  if (beta === null || gamma === null || !Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  if (!Number.isFinite(orientation)) return null;
  // La rotation alpha se fait autour de la verticale terrestre et n'affecte pas ce vecteur.
  const b = beta * radians, g = gamma * radians, s = orientation * radians;
  const x = -Math.cos(b) * Math.sin(g), y = Math.sin(b), z = Math.cos(b) * Math.cos(g);
  const horizontal = x * Math.cos(s) - y * Math.sin(s);
  const vertical = x * Math.sin(s) + y * Math.cos(s);
  if (Math.hypot(horizontal, vertical) < .15) return null; // Le volant est presque à plat.
  return {
    wheel: Math.atan2(-horizontal, vertical) / radians,
    pitch: Math.atan2(z, Math.hypot(horizontal, vertical)) / radians,
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

/** Transforme un écart d'angle en direction bornée et progressive. */
export function steerFromAngle(wheel: number, neutral: number): number {
  const delta = ((wheel - neutral + 540) % 360) - 180;
  const fraction = Math.min(1, Math.max(0, (Math.abs(delta) - WHEEL.deadZone) / (WHEEL.maxSteer - WHEEL.deadZone)));
  return Math.sign(delta) * fraction ** WHEEL.steerExponent;
}

/** Lisse les variations du capteur et recentre instantanément dans la zone morte. */
export function smoothSteer(previous: number, target: number): number {
  return target === 0 ? 0 : previous + (target - previous) * WHEEL.smoothing;
}

/** Transforme l'inclinaison avant en position de pédale. */
export function throttleFromPitch(pitch: number, neutral: number): number {
  return Math.max(0, Math.min(1, (pitch - neutral - WHEEL.minPitch) / (WHEEL.maxPitch - WHEEL.minPitch)));
}

export type DriveSample = { steer: number; throttle: number };
export type SentInput = DriveSample & { time: number };

/** Limite le débit tout en renouvelant les commandes immobiles. */
export function shouldSendInput(now: number, input: DriveSample, last: SentInput): boolean {
  const elapsed = now - last.time;
  if (elapsed < WHEEL.minSendMs) return false;
  // Préserve une période de 100 ms même lorsque le seuil tombe entre deux lectures.
  return elapsed >= WHEEL.heartbeatMs - WHEEL.pollMs
    || Math.abs(input.steer - last.steer) > .01 || Math.abs(input.throttle - last.throttle) > .01;
}


/** Conserve la direction du volant ou des flèches et combine les deux manières d'accélérer. */
export function driveSample(sensor: DriveSample | null, touchSteer: number, pedalMode: boolean, pedalHeld: boolean): DriveSample {
  return {
    steer: sensor?.steer ?? touchSteer,
    throttle: pedalMode ? Math.max(Number(pedalHeld), sensor?.throttle ?? 0) : 1,
  };
}
