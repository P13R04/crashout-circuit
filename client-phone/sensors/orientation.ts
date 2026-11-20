/**
 * Accès aux événements d'orientation et projection de la verticale dans le repère de l'écran.
 * Liens : client-phone/pilot/gyro.ts et client-phone/copilot/placement/TiltAim.ts.
 */
export type OrientationSource = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/** Retourne la source disponible dans le contexte sécurisé de la page. */
export function orientationSource(): OrientationSource | null {
  return window.isSecureContext && typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null;
}

/** Renvoie l'orientation courante de l'écran pour les versions récentes et anciennes d'iOS. */
export function screenAngle(): number {
  return screen.orientation?.angle ?? window.orientation ?? 0;
}

/** Projette la gravité sans faire intervenir le cap magnétique. */
export function screenGravity(beta: number | null, gamma: number | null, orientation: number) {
  if (beta === null || gamma === null || ![beta, gamma, orientation].every(Number.isFinite)) return null;
  const toRadians = Math.PI / 180;
  const b = beta * toRadians, g = gamma * toRadians, s = orientation * toRadians;
  const x = -Math.cos(b) * Math.sin(g), y = Math.sin(b);
  return {
    horizontal: x * Math.cos(s) - y * Math.sin(s),
    vertical: x * Math.sin(s) + y * Math.cos(s),
    normal: Math.cos(b) * Math.cos(g),
  };
}
