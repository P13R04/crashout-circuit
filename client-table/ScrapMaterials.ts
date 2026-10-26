import { noise } from './neon.js';
let grain: HTMLCanvasElement | null = null;
/** Baked micro-pitting and brushed scratches. A quiet material, not a moving noise filter. */
export function steelGrain(): HTMLCanvasElement {
  if (grain) return grain;
  grain = document.createElement('canvas'); grain.width = grain.height = 256;
  const c = grain.getContext('2d')!;
  for (let i = 0; i < 8500; i++) {
    const x = noise(i * 3) * 256, y = noise(i * 7) * 256;
    c.fillStyle = i % 3 ? '#02090c13' : '#c6d1c512';
    c.fillRect(x, y, .4 + noise(i) * 1.1, .4 + noise(i * 11) * .8);
  }
  for (let i = 0; i < 180; i++) {
    const x = noise(i * 13) * 256, y = noise(i * 19) * 256;
    c.strokeStyle = i % 5 ? '#c7cdbc09' : '#01090d14'; c.lineWidth = .5;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 3 + noise(i * 17) * 20, y + .5); c.stroke();
  }
  return grain;
}
