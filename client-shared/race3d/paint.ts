/** Prépare les matériaux de chaussée et d'ambiance utilisés par la scène WebGL. */
import { CanvasTexture, Color, DoubleSide, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace } from 'three';

export type RaceLook = {
  sky: number; fog: number; grass: number; road: number; verge: number; curb: number; white: number;
};

export const GRAND_PRIX: RaceLook = {
  sky: 0xadbfd0, fog: 0xb5c2cb, grass: 0x557052, road: 0x3d4145, verge: 0xafaa8c,
  curb: 0xcf403a, white: 0xf5f0df,
};

export function stipple(color: number, bands = false): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(64, 64);
  const base = new Color(color).getHex(SRGBColorSpace);
  const red = (base >> 16) & 255, green = (base >> 8) & 255, blue = base & 255;
  let seed = 59127;
  for (let i = 0; i < 4096; i++) {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    const shade = ((seed >>> 24) % 19) - 9 + (bands && i % 64 < 32 ? 7 : 0);
    pixels.data.set([red + shade, green + shade, blue + shade, 255], i * 4);
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

export function roadPaint(look: RaceLook) {
  return {
    road: new MeshBasicMaterial({ map: stipple(look.road), side: DoubleSide }),
    verge: new MeshBasicMaterial({ map: stipple(look.verge), side: DoubleSide }),
    curb: new MeshBasicMaterial({ color: look.curb, side: DoubleSide }),
    white: new MeshBasicMaterial({ color: look.white, side: DoubleSide }),
    dark: new MeshBasicMaterial({ color: 0x161c22, side: DoubleSide }),
  };
}
