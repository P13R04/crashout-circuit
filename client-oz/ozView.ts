import type { Vec2 } from '../server/types.js';

export function viewTransform(width: number, height: number, W: number, H: number, quarter: number) {
  return { scale: Math.min(width / (quarter % 2 ? H : W), height / (quarter % 2 ? W : H)),
    angle: quarter * Math.PI / 2, cx: width / 2, cy: height / 2, W, H };
}
export function viewToWorld(p: Vec2, t: ReturnType<typeof viewTransform>): Vec2 {
  const x = (p.x - t.cx) / t.scale, y = (p.y - t.cy) / t.scale;
  return { x: t.W / 2 + x * Math.cos(t.angle) + y * Math.sin(t.angle),
    y: t.H / 2 - x * Math.sin(t.angle) + y * Math.cos(t.angle) };
}
export function worldToView(p: Vec2, t: ReturnType<typeof viewTransform>): Vec2 {
  const x = p.x - t.W / 2, y = p.y - t.H / 2;
  return { x: t.cx + t.scale * (x * Math.cos(t.angle) - y * Math.sin(t.angle)),
    y: t.cy + t.scale * (x * Math.sin(t.angle) + y * Math.cos(t.angle)) };
}
