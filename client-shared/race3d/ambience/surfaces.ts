/** Dessine des textures de matière et de bordure préparées une fois par thème. */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { ThemeId } from '../../../server/protocol/theme.js';

function texture(paint: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  paint(canvas.getContext('2d')!);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;
  return map;
}

function base(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 128);
}

function specks(ctx: CanvasRenderingContext2D, count: number, color: string, size: number): void {
  ctx.fillStyle = color;
  let seed = 63194;
  for (let i = 0; i < count; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const y = seed >>> 25, x = (seed >>> 14) & 255;
    const radius = .5 + (seed % 17) / 17 * size;
    ctx.fillRect(x, y, radius * 2, radius);
  }
}

function scrap(ctx: CanvasRenderingContext2D): void {
  base(ctx, '#46545a');
  for (let y = 0; y < 128; y += 32) {
    for (let x = y % 64 ? -32 : 0; x < 256; x += 64) {
      ctx.fillStyle = ['#48565a', '#536364', '#3e5057', '#594e44'][((x + 32) / 64 + y / 32 * 3) & 3];
      ctx.fillRect(x, y, 63, 31);
      ctx.fillStyle = '#b5c5b642'; ctx.fillRect(x + 1, y + 1, 62, 2);
      ctx.fillStyle = '#1d2b2e'; ctx.fillRect(x, y + 30, 64, 2); ctx.fillRect(x + 62, y, 2, 32);
      ctx.fillStyle = '#9aaba9';
      for (const dx of [5, 57]) for (const dy of [5, 25]) ctx.fillRect(x + dx, y + dy, 2, 2);
    }
  }
  specks(ctx, 2200, '#cbded61a', 2);
  specks(ctx, 210, '#1a212a55', 9);
}

function toy(ctx: CanvasRenderingContext2D): void {
  base(ctx, '#373e65');
  const sheen = ctx.createLinearGradient(0, 0, 0, 128);
  for (const [offset, color] of [[0, '#596e86'], [.16, '#414c72'], [.5, '#485076'], [.88, '#343d60'], [1, '#66738e']] as const) {
    sheen.addColorStop(offset, color);
  }
  ctx.fillStyle = sheen; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#30354f';
  for (const y of [13, 43, 84, 114]) ctx.fillRect(0, y, 256, 2);
  ctx.fillRect(0, 0, 2, 128); ctx.fillRect(128, 0, 2, 128);
  ctx.fillStyle = '#a0a5c37b';
  for (const y of [15, 45, 86, 116]) ctx.fillRect(0, y, 256, 1);
  ctx.fillRect(3, 0, 1, 128); ctx.fillRect(131, 0, 1, 128);
  ctx.fillStyle = '#cea2866d';
  for (let x = 16; x < 256; x += 32) ctx.fillRect(x, 63, 12, 2);
}

function mud(ctx: CanvasRenderingContext2D): void {
  base(ctx, '#73533e');
  for (const y of [26, 92]) {
    const rut = ctx.createLinearGradient(0, y - 14, 0, y + 14);
    for (const [at, color] of [[0, '#7a5a4000'], [.25, '#99704c'], [.48, '#3c2921'], [.64, '#422b22'], [1, '#7a5a4000']] as const) rut.addColorStop(at, color);
    ctx.fillStyle = rut; ctx.fillRect(0, y - 14, 256, 28);
    ctx.fillStyle = '#231e1958';
    for (let x = 5; x < 256; x += 17) ctx.fillRect(x, y, 8, 7);
  }
  ctx.fillStyle = '#40342b';
  ctx.beginPath(); ctx.ellipse(180, 61, 43, 9, -.05, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#998a755f';
  ctx.fillRect(158, 58, 38, 1);
  specks(ctx, 1400, '#d3a07043', 2);
  specks(ctx, 1200, '#34271d44', 3);
}

function neon(ctx: CanvasRenderingContext2D): void {
  base(ctx, '#18142f');
  const gleam = ctx.createLinearGradient(0, 0, 0, 128);
  gleam.addColorStop(0, '#3a2866'); gleam.addColorStop(.5, '#19192f'); gleam.addColorStop(1, '#3a2866');
  ctx.fillStyle = gleam; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#806cc84f';
  ctx.fillRect(0, 12, 256, 1); ctx.fillRect(0, 115, 256, 1);
  for (let x = 8; x < 256; x += 48) ctx.fillRect(x, 63, 22, 1);
  ctx.fillStyle = '#9d91d321'; ctx.fillRect(244, 0, 1, 128);
}

export function roadSurface(theme: ThemeId): CanvasTexture | undefined {
  switch (theme) {
    case 'scrap': return texture(scrap);
    case 'toy': return texture(toy);
    case 'mayhem': return texture(mud);
    case 'neon': return texture(neon);
  }
}

export function edgePulse(theme: ThemeId): CanvasTexture | undefined {
  if (theme !== 'scrap' && theme !== 'neon') return;
  return texture(ctx => {
    const trail = ctx.createLinearGradient(0, 0, 256, 0);
    trail.addColorStop(0, theme === 'scrap' ? '#26afba' : '#985def');
    trail.addColorStop(.45, theme === 'scrap' ? '#38d5d2' : '#6c77ec');
    trail.addColorStop(.67, '#a5f4ff');
    trail.addColorStop(.75, '#edffff');
    trail.addColorStop(1, theme === 'scrap' ? '#26afba' : '#985def');
    ctx.fillStyle = trail;
    ctx.fillRect(0, 0, 256, 128);
  });
}

export function terrainSurface(theme: ThemeId): CanvasTexture | undefined {
  if (theme === 'toy') return texture(ctx => {
    base(ctx, '#246c70');
    ctx.fillStyle = '#66aeab51';
    for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 0, 1, 128);
    for (let y = 0; y < 128; y += 32) ctx.fillRect(0, y, 256, 1);
    ctx.fillStyle = '#bdd6a991';
    ctx.fillRect(0, 0, 256, 1); ctx.fillRect(0, 0, 1, 128);
    for (let x = 0; x < 256; x += 8) ctx.fillRect(x, 0, 1, x % 32 ? 4 : 9);
  });
  if (theme === 'mayhem') return texture(ctx => {
    base(ctx, '#494432');
    specks(ctx, 2300, '#b5926c3a', 5);
    specks(ctx, 2100, '#261f19a0', 5);
  });
}
