/**
 * Convertit l'accélération de la Wiimote en angle de volant, avec filtre passe-bas et rejet des secousses.
 * Liens : client-wiimote/hid/wiimoteProtocol.ts, client-wiimote/steering/wiimoteSteering.ts.
 * Module pur. Sans gyroscope, seule l'inclinaison est mesurable, par la gravité ; la rotation autour de la verticale ne l'est pas.
 * Les axes et le signe sont à valider sur la manette réelle avec tools/wiimote-monitor (voir docs/pilote-wiimote-protocole-essai.md).
 */
import type { RawAccel } from '../hid/reportDecoder.js';
import { ACCEL_PER_G, ACCEL_REST } from '../hid/wiimoteProtocol.js';

/**
 * Façon de tenir la manette à l'horizontale, boutons 1 et 2 à droite :
 * - `face` : face tournée vers le joueur, comme un volant ; l'angle est lu dans le plan de la face (axes X et Y) ;
 * - `flat` : face vers le haut, inclinée à gauche et à droite ; l'angle est lu dans le plan Y et Z.
 */
export type TiltGrip = 'face' | 'flat';

export interface TiltSettings {
  grip: TiltGrip;
  /** Inverse le sens de rotation si le signe mesuré est contraire à celui attendu. */
  flip: boolean;
}

/** Accélération en g sur les trois axes. */
export interface Gravity { x: number; y: number; z: number }

export const TILT = {
  /** Part de l'écart rattrapée à chaque rapport : filtre passe-bas sur chaque axe. */
  lowPass: .3,
  /** Écart relatif de la norme à sa valeur de repos au-delà duquel un rapport est une secousse. */
  shakeTolerance: .35,
  /** Secousses consécutives après lesquelles la norme de repos est réapprise. */
  shakeResetCount: 50,
  /** Projection minimale, en g, dans le plan de lecture : en dessous, la manette est trop à plat. */
  minProjection: .15,
};

const radians = Math.PI / 180;

/** Convertit les valeurs brutes de l'accéléromètre en g. */
export function rawToGravity(raw: RawAccel): Gravity {
  return {
    x: (raw.x - ACCEL_REST) / ACCEL_PER_G,
    y: (raw.y - ACCEL_REST) / ACCEL_PER_G,
    z: (raw.z - ACCEL_REST) / ACCEL_PER_G,
  };
}

/** Angle du volant en degrés dans le plan choisi, ou null si la manette est presque à plat par rapport à ce plan. */
export function tiltAngle(gravity: Gravity, settings: TiltSettings): number | null {
  const horizontal = gravity.y;
  const vertical = settings.grip === 'face' ? gravity.x : gravity.z;
  if (Math.hypot(horizontal, vertical) < TILT.minProjection) return null;
  const angle = Math.atan2(horizontal, vertical) / radians;
  return settings.flip ? -angle : angle;
}

/** Résultat d'un rapport : gravité filtrée et indication de secousse. */
export interface FilteredGravity { gravity: Gravity; shaking: boolean }

/** Filtre passe-bas sur la gravité ; un rapport dont la norme s'écarte trop de celle du repos est rejeté. */
export class GravityFilter {
  private value: Gravity | null = null;
  private rest = 0;
  private shakes = 0;

  /** Oublie l'état, par exemple après une déconnexion. */
  reset(): void {
    this.value = null;
    this.rest = 0;
    this.shakes = 0;
  }

  /** Intègre un rapport ; pendant une secousse, la dernière gravité fiable est conservée. */
  push(raw: RawAccel): FilteredGravity {
    const sample = rawToGravity(raw);
    const norm = Math.hypot(sample.x, sample.y, sample.z);
    if (!this.value) return this.start(sample, norm);
    if (Math.abs(norm - this.rest) > this.rest * TILT.shakeTolerance) return this.reject();
    this.shakes = 0;
    this.rest += (norm - this.rest) * .02;
    const k = TILT.lowPass;
    this.value = {
      x: this.value.x + (sample.x - this.value.x) * k,
      y: this.value.y + (sample.y - this.value.y) * k,
      z: this.value.z + (sample.z - this.value.z) * k,
    };
    return { gravity: this.value, shaking: false };
  }

  /** Premier rapport : sert de référence de repos. */
  private start(sample: Gravity, norm: number): FilteredGravity {
    this.value = sample;
    this.rest = norm;
    return { gravity: sample, shaking: false };
  }

  /** Rapport rejeté ; une série trop longue signale plutôt une mauvaise référence qu'une secousse. */
  private reject(): FilteredGravity {
    const held = this.value ?? { x: 0, y: 0, z: 0 };
    if (++this.shakes >= TILT.shakeResetCount) this.reset();
    return { gravity: held, shaking: true };
  }
}
