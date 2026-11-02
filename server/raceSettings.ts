/**
 * Convertit le niveau de difficulté choisi en facteur de vitesse pour la physique des voitures.
 * Liens : server/types.ts.
 * Référencé par server/PhysicsLoop.ts.
 */
import type { Difficulty } from './types.js';
/** Convertit la difficulté choisie en multiplicateur de vitesse. */
export const speedScale = (difficulty:Difficulty) => difficulty==='hard'?1:difficulty==='medium'?.75:.5;
