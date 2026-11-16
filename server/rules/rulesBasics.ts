/**
 * Constantes et petites fonctions de base des règles : rayon des voitures, durées, équipes et équipe adverse.
 * Liens : server/GameRules.ts et les modules de server/rules/.
 * Réexporté par server/GameRules.ts, qui reste la façade des règles de jeu.
 */
import type { Team } from '../types.js';

export const CAR_RADIUS = 10;
export const WALL_HALF_THICKNESS = 4;
const MAP_DURATION_MS = 30_000;
export const COUNTDOWN_MS = 3_000;
export const MAX_STROKE_POINTS = 4_000;
export const PICKUP_RADIUS = 30;
export const TEAMS: Team[] = ['A', 'B'];
/** Renvoie l’équipe adverse à partir de l’équipe reçue. */
export const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');
/** Borne la valeur dans l’intervalle autorisé. */
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
