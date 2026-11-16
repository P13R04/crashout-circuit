/** Assemble les silhouettes architecturales et objets de décor propres à chaque thème. */
import type { ThemeId } from '../../../server/protocol/theme.js';
import type { Plot } from './layout.js';
import { LOOKS } from '../looks.js';

export type Part = [x: number, y: number, z: number, w: number, h: number, d: number, color: number, flag?: boolean];

function grandPrix(kind: Plot['kind']): Part[] {
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

export function venueParts(theme: ThemeId, kind: Plot['kind']): Part[] {
  const { accent, structure, white } = LOOKS[theme];
  if (theme === 'classic') return grandPrix(kind);
  if (theme === 'neon') return kind === 'small' ? [[0, 17, 0, 3, 34, 3, white]] : [
    [0, .5, 0, 78, 1, 41, structure], ...[-30, 0, 30].flatMap((x, i): Part[] => [
      [x, 24 + i * 11, 0, 7, 48 + i * 22, 7, accent], [x, 25 + i * 11, -4, 2, 44 + i * 22, 1, white],
      [x + 4, 35, 10, 2.5, 8, 2.5, white, true],
    ]),
  ];
  if (theme === 'scrap') return kind === 'small' ? [[0, 19, 0, 13, 38, 13, structure], [0, 39, 0, 16, 4, 16, white]] : [
    [0, 13, 0, 88, 26, 42, structure], [0, 28, 0, 86, 3, 40, accent],
    [0, 11, -23, 65, 8, 8, 0x263135], [0, 17, -28, 62, 2, 2, white],
    [-29, 33, 9, 16, 43, 14, structure], [26, 32, 9, 16, 42, 14, structure],
    [-29, 56, 9, 17, 4, 16, accent], [26, 54, 9, 17, 4, 16, accent],
  ];
  if (theme === 'toy') return kind === 'small' ? [
    [-6, 8, 2, 15, 16, 15, accent], [8, 16, -3, 12, 32, 13, 0xd75038],
  ] : [
    [0, 1, 0, 94, 2, 52, 0xefd18c], [0, 18, 4, 77, 36, 28, structure],
    [0, 36, 4, 86, 5, 35, accent], [-22, 13, -11, 28, 24, 2, 0x17303c],
    [22, 13, -11, 28, 24, 2, 0x17303c], [0, 42, 4, 23, 6, 13, white],
    [-41, 10, -18, 11, 20, 11, 0xdd5742],
  ];
  return kind === 'small' ? [[0, 6, 0, 19, 12, 16, accent], [0, 14, 0, 2, 16, 2, white]] : [
    [0, 6, 0, 88, 12, 44, structure], [0, 25, 18, 68, 30, 3, 0x26282a], [0, 29, 15, 50, 18, 2, accent],
    [-32, 26, -12, 10, 30, 10, 0x2a2825], [32, 26, -12, 10, 30, 10, 0x2a2825],
    [0, 43, 4, 74, 4, 34, accent], [0, 46, -6, 66, 2, 5, white],
    [39, 48, 8, 2, 22, 2, white], [44, 54, 8, 10, 6, 1, accent, true],
  ];
}
