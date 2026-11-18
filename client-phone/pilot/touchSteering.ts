/**
 * Direction au doigt : transforme la position du doigt sur la bande de direction en valeur de direction.
 * Liens : client-phone/pilot/SteerStrip.ts, client-shared/pilot/steeringCurve.ts (même progressivité que le volant).
 * Module pur : la zone morte centrale évite de tourner quand le doigt se pose au milieu.
 */
import { STEERING } from '../../client-shared/pilot/steeringCurve.js';

export const TOUCH_STEERING = {
  /** Part de la demi-largeur, autour du centre, qui reste sans direction. */
  deadZone: .08,
  /** Part de la demi-largeur qui donne la pleine direction : le bord n'est pas à atteindre. */
  fullAt: .85,
};

/** Convertit la position du doigt (0 = bord gauche, 1 = bord droit) en direction de -1 à 1. */
export function steerFromTouch(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;
  const offset = Math.max(-1, Math.min(1, (fraction - .5) * 2));
  const ramp = Math.min(1, Math.max(0, (Math.abs(offset) - TOUCH_STEERING.deadZone) / (TOUCH_STEERING.fullAt - TOUCH_STEERING.deadZone)));
  return Math.sign(offset) * ramp ** STEERING.steerExponent;
}
