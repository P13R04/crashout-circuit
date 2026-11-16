/** Prépare les matériaux de chaussée et d'ambiance utilisés par la scène WebGL. */
import { CanvasTexture, Color, DoubleSide, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace } from 'three';

import type { RaceLook } from './looks.js';

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
    pixels.data[i * 4] = red + shade;
    pixels.data[i * 4 + 1] = green + shade;
    pixels.data[i * 4 + 2] = blue + shade;
    pixels.data[i * 4 + 3] = 255;
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

/** Dégrade le ciel vers la teinte du brouillard à l’horizon. */
export function skyPaint(look: RaceLook): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const fill = ctx.createLinearGradient(0, 0, 0, 128);
  fill.addColorStop(0, '#' + new Color(look.sky).multiplyScalar(.69).getHexString());
  fill.addColorStop(.51, '#' + new Color(look.fog).getHexString());
  fill.addColorStop(1, '#' + new Color(look.fog).getHexString());
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 2, 128);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  return texture;
}
