/**
 * Partage les durées et la progression de la révélation et de la roulette entre le serveur, le rendu et
 * l’audio.
 * Liens : server/types.ts.
 * Référencé notamment par client-table/AudioPlan.ts, client-table/GestureRecognizer.ts,
 * client-table/Renderer.ts.
 */
import type { GameState, TrackPresentation } from './types.js';

export const TRACK_REVEAL_MS = 1800;
export const FINISH_ROULETTE_MS = 3400;
export const FINISH_LOCK_MS = 450;
export const TRACK_PRESENTATION_MS = TRACK_REVEAL_MS + FINISH_ROULETTE_MS + FINISH_LOCK_MS;
/** Borne la valeur dans l’intervalle autorisé. */
const clamp = (n:number) => Math.max(0,Math.min(1,n));
/** Ramène une progression entre zéro et un avec un départ et une arrivée adoucis. */
export const smooth = (n:number):number => {const t=clamp(n);return t*t*(3-2*t);};

/** Calcule une progression d’abord régulière puis ralentie jusqu’à l’arrêt de la ligne. */
export function rouletteTravel(progress:number):number {
  const t=clamp(progress),cruise=.24,scale=1/(cruise+(1-cruise)/3);
  if(t<=cruise)return t*scale;
  const u=(t-cruise)/(1-cruise);
  return scale*(cruise+(1-cruise)*(u-u*u+u*u*u/3));
}
/** Calcule l’instant où la présentation du circuit est entièrement terminée. */
export function presentationEnd(p:TrackPresentation):number {return p.startedAt+TRACK_PRESENTATION_MS;}
/** Indique si la révélation ou la roulette doit encore bloquer le départ. */
export function presentingTrack(state:Pick<GameState,'phase'|'trackPresentation'>,now:number):boolean {
  return state.phase==='READY'&&!!state.trackPresentation&&now<presentationEnd(state.trackPresentation);
}
/** Décrit l’étape visuelle courante de construction, de roulette ou de fixation de la ligne. */
export function presentationFrame(p:TrackPresentation,now:number) {
  const age=now-p.startedAt;
  return {
    stage:age<TRACK_REVEAL_MS?'reveal':age<TRACK_REVEAL_MS+FINISH_ROULETTE_MS?'roulette':'lock',
    reveal:smooth(age/TRACK_REVEAL_MS),
    spin:clamp((age-TRACK_REVEAL_MS)/FINISH_ROULETTE_MS),
    travel:rouletteTravel((age-TRACK_REVEAL_MS)/FINISH_ROULETTE_MS),
    lock:clamp((age-TRACK_REVEAL_MS-FINISH_ROULETTE_MS)/FINISH_LOCK_MS),
  } as const;
}
