/** Repère les emprises libres dans un circuit de forme quelconque. */
import type { TrackGeometry, Vec2 } from '../../../server/types.js';

export type Plot = Vec2 & { angle: number; radius: number; kind: 'stand' | 'landmark' | 'small' };

export function clearance(x: number, y: number, points: Vec2[], widths: number[]): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length, a = points[i], b = points[j];
    const dx = b.x - a.x, dz = b.y - a.y;
    const fraction = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dz) / (dx * dx + dz * dz || 1)));
    const gap = Math.hypot(x - a.x - fraction * dx, y - a.y - fraction * dz);
    best = Math.min(best, gap - (widths[i] * (1 - fraction) + widths[j] * fraction) / 2);
  }
  return best;
}

export function venuePlots(track: TrackGeometry): Plot[] {
  const points = track.baseCenterline, plots: Plot[] = [];
  const free = (x: number, y: number, radius: number) => clearance(x, y, points, track.widths) > radius + 9
    && plots.every(p => Math.hypot(p.x - x, p.y - y) > p.radius + radius + 16);
  let landmark: Plot | null = null;
  let largest = 102;
  for (let y = 170; y < 930; y += 55) for (let x = 240; x < 1710; x += 65) {
    const size = clearance(x, y, points, track.widths);
    if (size > largest) { largest = size; landmark = { x, y, angle: 0, radius: 91, kind: 'landmark' }; }
  }
  if (landmark) plots.push(landmark);
  for (let i = 0; i < points.length && plots.length < 16; i += 12) {
    const p = points[i], q = points[(i + 3) % points.length];
    const angle = Math.atan2(q.y - p.y, q.x - p.x);
    for (const side of [1, -1]) {
      const span = track.widths[i] / 2 + 72 + 12 * (i % 5);
      const x = p.x - Math.sin(angle) * side * span, y = p.y + Math.cos(angle) * side * span;
      const kind = i % 36 === 0 ? 'small' : 'stand', radius = kind === 'small' ? 22 : 54;
      if (free(x, y, radius)) plots.push({ x, y, radius, kind, angle: side === 1 ? angle : angle + Math.PI });
    }
  }
  return plots;
}
