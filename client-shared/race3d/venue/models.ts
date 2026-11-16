/** Assemble les silhouettes architecturales et objets de décor propres à chaque thème. */
import type { Plot } from './layout.js';

export type Part = [x: number, y: number, z: number, w: number, h: number, d: number, color: number, flag?: boolean];

export function grandPrixParts(kind: Plot['kind']): Part[] {
  if (kind === 'landmark') return [
    [0, .4, 6, 150, .8, 72, 0x9fa496], [0, 16, 0, 138, 32, 44, 0xaab2a6],
    [0, 34, 0, 155, 4, 48, 0x465c5d], [0, 38, -6, 112, 5, 22, 0x637c7a],
    ...[-46, 0, 46].flatMap((x): Part[] => [
      [x, 13, -22, 37, 21, 2, 0x293e42], [x, 26, -24, 38, 3, 4, 0xa0463c],
      [x, 1.1, -37, 36, .4, 22, 0xc2c2ad], [x - 9, 41, -9, 20, 1, 12, 0xbfd0c8],
    ]),
  ];
  if (kind === 'small') return [[0, 13, 0, 1.5, 26, 1.5, 0xbdc3a9], [6, 23, 0, 12, 7, .7, 0xd4433e, true]];
  const parts: Part[] = [[0, 2, 2, 96, 4, 45, 0x667774], [0, 7, -19, 97, 1, 1, 0xc1c2a7]];
  for (let row = 0; row < 4; row++) {
    const top = 7 + row * 4, z = -12 + row * 8;
    parts.push([0, top / 2, z, 91, top, 8.5, 0x7f9189]);
    for (let col = 0; col < 7; col++) {
      const shade = [0xbc8d77, 0x627f83, 0xa76658, 0xb9b99a][(row * 3 + col) % 4];
      parts.push([(col - 3) * 12.5, top + 1.4, z + 1, 9.5, 2.8, 5, shade]);
    }
  }
  parts.push([0, 32, 12, 96, 2.5, 18, 0xc4c9b4], [-41, 24, 18, 2, 16, 2, 0x34494a],
    [41, 24, 18, 2, 16, 2, 0x34494a], [29, 38, 16, 1, 15, 1, 0xcfceaa], [35, 43, 16, 12, 6, .8, 0xcb5149, true]);
  return parts;
}
