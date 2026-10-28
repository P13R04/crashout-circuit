import type { Difficulty } from './types.js';
export const speedScale = (difficulty:Difficulty) => difficulty==='hard'?1:difficulty==='medium'?.75:.5;
