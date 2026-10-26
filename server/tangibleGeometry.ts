import type { Vec2 } from './types.js';

export interface TangiblePose { x: number; y: number; angle: number }
export interface TangibleDimensions {
  logicalWidth: number; logicalHeight: number; wallLengthPx: number; wallWidthPx: number;
  pylonBasePx: number; pylonFieldRadiusPx: number; tangibleTolerancePx: number;
  tangibleCorrectionPx: number; tangibleCorrectionDegrees: number;
}

/** The active 16:9 image fills the physical screen (letterboxing is excluded). */
export function physicalDimensions(diagonalInches: number, W = 1920, H = 1080) {
  const pxPerMm = Math.hypot(W, H) / (diagonalInches * 25.4);
  return { pxPerMm, wallLengthPx: 80 * pxPerMm, wallWidthPx: 32 * pxPerMm,
    pylonBasePx: 32 * pxPerMm, pylonFieldRadiusPx: 42 * pxPerMm,
    tangibleTolerancePx: 10 * pxPerMm, tangibleCorrectionPx: 15 * pxPerMm,
    tangibleCorrectionDegrees: 15 };
}
export function wallEndpoints(center: Vec2, angle: number, length: number): [Vec2, Vec2] {
  const radians = angle * Math.PI / 180;
  const dx = Math.cos(radians) * length / 2, dy = Math.sin(radians) * length / 2;
  return [{ x: center.x - dx, y: center.y - dy }, { x: center.x + dx, y: center.y + dy }];
}
export function wallCorners(center: Vec2, angle: number, length: number, width: number): Vec2[] {
  const a = angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => ({
    x: center.x + x * length / 2 * c - y * width / 2 * s,
    y: center.y + x * length / 2 * s + y * width / 2 * c }));
}
export function rotateWall(anchor: Vec2, pointer: Vec2, length: number): TangiblePose | null {
  const dx = pointer.x - anchor.x, dy = pointer.y - anchor.y, distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 1) return null;
  return { x: anchor.x + dx / distance * length / 2, y: anchor.y + dy / distance * length / 2,
    angle: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360 };
}
export function withinCorrection(origin: TangiblePose, pose: TangiblePose, p: TangibleDimensions): boolean {
  const angle = Math.abs(((pose.angle - origin.angle + 540) % 360 + 360) % 360 - 180);
  return Math.hypot((pose.x-origin.x)*p.logicalWidth, (pose.y-origin.y)*p.logicalHeight) <= p.tangibleCorrectionPx + 1e-6
    && angle <= p.tangibleCorrectionDegrees + 1e-6;
}

/** Swept disc vs a rounded rectangle; four sides + corner circles avoid tunnelling. */
export function wallContact(from: Vec2, to: Vec2, center: Vec2, angle: number,
  length: number, width: number, radius: number): { point: Vec2; normal: Vec2 } | null {
  const a = angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const hx = length / 2, hy = width / 2;
  const local = (p: Vec2) => ({
    x: (p.x - center.x) * c + (p.y - center.y) * s,
    y: -(p.x - center.x) * s + (p.y - center.y) * c,
  });
  const p = local(from), q = local(to), dx = q.x - p.x, dy = q.y - p.y;
  let best = Infinity, normal = { x: 0, y: 0 };
  const accept = (t: number, n: Vec2) => {
    if (t >= 0 && t <= 1 && t < best) { best = t; normal = n; }
  };
  const clampX = (x: number) => Math.max(-hx, Math.min(hx, x));
  const clampY = (y: number) => Math.max(-hy, Math.min(hy, y));
  const nx = p.x - clampX(p.x), ny = p.y - clampY(p.y);
  if (Math.hypot(nx, ny) <= radius) {
    const distance = Math.hypot(nx, ny);
    if (distance > 1e-9) accept(0, { x: nx / distance, y: ny / distance });
    else if (hx - Math.abs(p.x) < hy - Math.abs(p.y)) accept(0, { x: p.x < 0 ? -1 : 1, y: 0 });
    else accept(0, { x: 0, y: p.y < 0 ? -1 : 1 });
  }

  // Intersect the swept centre with the four straight sections of the expanded box.
  for (const sign of [-1, 1]) {
    if (Math.abs(dx) > 1e-9) {
      const t = (sign * (hx + radius) - p.x) / dx;
      if (Math.abs(p.y + dy * t) <= hy) accept(t, { x: sign, y: 0 });
    }
    if (Math.abs(dy) > 1e-9) {
      const t = (sign * (hy + radius) - p.y) / dy;
      if (Math.abs(p.x + dx * t) <= hx) accept(t, { x: 0, y: sign });
    }
  }

  // Each circular corner contributes only its outside quadrant.
  const aa = dx * dx + dy * dy;
  if (aa > 1e-12) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const ox = p.x - sx * hx, oy = p.y - sy * hy;
    const bb = 2 * (ox * dx + oy * dy), cc = ox * ox + oy * oy - radius * radius;
    const discriminant = bb * bb - 4 * aa * cc;
    if (discriminant < 0) continue;
    const t = (-bb - Math.sqrt(discriminant)) / (2 * aa);
    const x = p.x + dx * t - sx * hx, y = p.y + dy * t - sy * hy;
    if (x * sx >= -1e-6 && y * sy >= -1e-6) accept(t, { x: x / radius, y: y / radius });
  }
  if (!Number.isFinite(best)) return null;

  // Project an embedded start back to the nearest expanded boundary.
  let x = p.x + dx * best, y = p.y + dy * best;
  let bx = clampX(x), by = clampY(y);
  if (Math.abs(x) <= hx && Math.abs(y) <= hy) {
    if (normal.x) bx = Math.sign(normal.x) * hx;
    else by = Math.sign(normal.y) * hy;
  }
  x = bx + normal.x * (radius + 1); y = by + normal.y * (radius + 1);
  return {
    point: { x: center.x + x * c - y * s, y: center.y + x * s + y * c },
    normal: { x: normal.x * c - normal.y * s, y: normal.x * s + normal.y * c },
  };
}
