/**
 * Fournit les cycles de rotation, de presse et de vapeur utilisés par le décor industriel.
 * Référencé par client-table/IndustrialMachinery.ts, client-table/IndustrialVapour.ts, scripts/visuals.ts.
 */
const TAU = Math.PI * 2;
/** Ramène une progression entre zéro et un avec un départ et une arrivée adoucis. */
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
/** Calcule l’avancement d’un cycle d’animation à partir du temps et de son décalage. */
const cycleAt = (time: number, period: number, phase: number) => Math.max(0, Number.isFinite(time) ? time : 0) / period + phase;

/** Fait avancer la roue par crans tout en conservant un temps d’arrêt entre deux mouvements. */
export function indexedRotation(time: number, period = 3700, phase = 0): number {
  const cycle = cycleAt(time, period, phase), whole = Math.floor(cycle), f = cycle - whole;
  let progress = smooth((f - .67) / .19);
  if (f > .86) progress += Math.sin((f - .86) / .14 * Math.PI * 3) * Math.exp(-(f - .86) * 26) * .025;
  return (whole + progress) * TAU / 9;
}

/** Calcule la position de la presse pendant sa descente, son maintien et sa remontée. */
export function pressStroke(time: number, period = 6100, phase = 0): number {
  const cycle = cycleAt(time, period, phase), f = cycle - Math.floor(cycle);
  if (f < .25) return 0;
  if (f < .38) return smooth((f - .25) / .13);
  if (f < .52) return 1;
  return 1 - smooth((f - .52) / .3);
}

/** Décrit l’âge, la taille et l’opacité d’une bouffée de vapeur dans son cycle. */
export function steamSample(time: number, index: number, phase: number): { age: number; alpha: number; scale: number } {
  const cycle = cycleAt(time, 7400, phase + index / 4), age = cycle - Math.floor(cycle);
  return { age, alpha: Math.sin(age * Math.PI) ** 1.4 * .22, scale: .25 + age * 1.4 };
}
