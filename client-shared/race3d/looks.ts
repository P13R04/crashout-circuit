/** Traduit les matières et ambiances des thèmes de la table pour la scène 3D. */
import type { ThemeId } from '../../server/protocol/theme.js';

export type RaceLook = {
  sky: number; fog: number; ground: number; road: number; verge: number; curb: number; white: number;
  accent: number; structure: number; light: number; bands?: boolean;
};

export const LOOKS: Record<ThemeId, RaceLook> = {
  classic: { sky: 0xa6bbce, fog: 0xb1c0c8, ground: 0x557252, road: 0x3d4145, verge: 0xb6ad8d,
    curb: 0xcf403a, white: 0xf5f0df, accent: 0x9d443d, structure: 0x81908b, light: 0xffebce, bands: true },
  neon: { sky: 0x15162e, fog: 0x20223f, ground: 0x1c1830, road: 0x242a45, verge: 0x31294d,
    curb: 0x8065dc, white: 0x94e7ff, accent: 0x7456be, structure: 0x283359, light: 0x8e86ff },
  scrap: { sky: 0x26333a, fog: 0x43555d, ground: 0x323b3a, road: 0x444e55, verge: 0x565751,
    curb: 0x819395, white: 0x87d9d8, accent: 0xad6f4b, structure: 0x5b686a, light: 0xa7d6d9 },
  toy: { sky: 0x8cbec5, fog: 0xa3b9bf, ground: 0x307678, road: 0x496577, verge: 0x326c75,
    curb: 0xf47c45, white: 0xffd359, accent: 0xef9749, structure: 0x226575, light: 0xffe3b5, bands: true },
  mayhem: { sky: 0xab8c72, fog: 0xa58d72, ground: 0x584c36, road: 0x615040, verge: 0x6f6249,
    curb: 0xa16b50, white: 0xd6af6a, accent: 0xbf6a49, structure: 0x6f5745, light: 0xffc484 },
};
