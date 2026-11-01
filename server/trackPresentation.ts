import type { GameState, TrackPresentation } from './types.js';

export const TRACK_REVEAL_MS = 1800;
export const FINISH_ROULETTE_MS = 3400;
export const FINISH_LOCK_MS = 450;
export const TRACK_PRESENTATION_MS = TRACK_REVEAL_MS + FINISH_ROULETTE_MS + FINISH_LOCK_MS;
const clamp = (n:number) => Math.max(0,Math.min(1,n));
export const smooth = (n:number):number => {const t=clamp(n);return t*t*(3-2*t);};

/** Constant initial speed, then a continuous deceleration to rest (zero final acceleration). */
export function rouletteTravel(progress:number):number {
  const t=clamp(progress),cruise=.24,scale=1/(cruise+(1-cruise)/3);
  if(t<=cruise)return t*scale;
  const u=(t-cruise)/(1-cruise);
  return scale*(cruise+(1-cruise)*(u-u*u+u*u*u/3));
}
export function presentationEnd(p:TrackPresentation):number {return p.startedAt+TRACK_PRESENTATION_MS;}
export function presentingTrack(state:Pick<GameState,'phase'|'trackPresentation'>,now:number):boolean {
  return state.phase==='READY'&&!!state.trackPresentation&&now<presentationEnd(state.trackPresentation);
}
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
