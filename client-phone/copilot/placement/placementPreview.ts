/**
 * Affiche la taille des objets, le corridor du boost et la trajectoire du lance-pierre.
 * Liens : PlacementMap.ts, server/rules/gameplay/remotePlacementGeometry.ts.
 */
import type { GameState, RemotePlacementTarget, Vec2 } from '../../../server/types.js';
import type { PreparedPlacement } from '../../../server/rules/gameplay/remotePlacementGeometry.js';
import { wallCorners } from '../../../server/tangibles/tangibleGeometry.js';
import { toScreen, type MapCamera } from '../../../client-shared/raceMap/camera2d.js';

type Ctx = CanvasRenderingContext2D;

/** Dessine l'emprise et un repère de validation lisible aussi par sa forme. */
export function drawPlacementPreview(ctx: Ctx, camera: MapCamera, state: GameState, target: RemotePlacementTarget,
  preview: PreparedPlacement, dpr: number): void {
  const valid = !('reason' in preview);
  ctx.save();
  ctx.strokeStyle = valid ? '#a7ffcb' : '#ffac9e';
  ctx.fillStyle = valid ? '#a7ffcb' : '#ffac9e';
  ctx.lineWidth = 2 * dpr;
  let marker = target.pos;
  if (target.kind === 'tangible') {
    const length = target.id === 1 ? state.params.wallLengthPx : state.params.pylonBasePx;
    const width = target.id === 1 ? state.params.wallWidthPx : state.params.pylonBasePx;
    const angle = target.id === 1 ? target.angle : 0;
    drawPath(ctx, camera, wallCorners(target.pos, angle, length, width), true);
  } else if (valid && preview.kind === 'boost') {
    const { a, b, dir, depth } = preview.gate;
    const advance = (point: Vec2): Vec2 => ({ x: point.x + dir.x * depth, y: point.y + dir.y * depth });
    drawPath(ctx, camera, [a, b, advance(b), advance(a)], true);
  } else if (target.kind === 'slingshot') {
    if (valid && preview.kind === 'slingshot') {
      drawShot(ctx, camera, preview, state.params.stoneRadiusPx, dpr);
      marker = preview.shot.target;
    } else {
      drawAim(ctx, camera, target.pos, target.angle, dpr);
    }
  }
  drawMarker(ctx, toScreen(camera, marker), valid, dpr);
  ctx.restore();
}

/** Indique la direction choisie même lorsque la portée ou le point de départ empêchent le tir. */
function drawAim(ctx: Ctx, camera: MapCamera, pos: Vec2, angle: number, dpr: number): void {
  const start = toScreen(camera, pos);
  ctx.save();
  ctx.translate(start.x, start.y);
  ctx.rotate(camera.rotation + angle * Math.PI / 180);
  ctx.beginPath();
  ctx.moveTo(12 * dpr, 0);
  ctx.lineTo(48 * dpr, 0);
  ctx.lineTo(39 * dpr, -7 * dpr);
  ctx.moveTo(48 * dpr, 0);
  ctx.lineTo(39 * dpr, 7 * dpr);
  ctx.stroke();
  ctx.restore();
}

/** Affiche la fourche, la poche et le cercle d'impact reliés par une ligne pointillée. */
function drawShot(ctx: Ctx, camera: MapCamera, preview: Extract<PreparedPlacement, { kind: 'slingshot' }>,
  radius: number, dpr: number): void {
  const { shot, anchor, pouch } = preview;
  ctx.setLineDash([4 * dpr, 7 * dpr]);
  drawPath(ctx, camera, [anchor, shot.target]);
  ctx.setLineDash([]);
  const arm = { x: -shot.dir.y * 26, y: shot.dir.x * 26 };
  ctx.strokeStyle = '#ffdb86';
  drawPath(ctx, camera, [{ x: anchor.x + arm.x, y: anchor.y + arm.y }, pouch,
    { x: anchor.x - arm.x, y: anchor.y - arm.y }]);
  const impact = toScreen(camera, shot.target);
  ctx.strokeStyle = '#ffac9e';
  ctx.beginPath(); ctx.arc(impact.x, impact.y, radius * camera.scale, 0, Math.PI * 2); ctx.stroke();
}

/** Trace un contour dans le repère de la carte. */
function drawPath(ctx: Ctx, camera: MapCamera, points: Vec2[], closed = false): void {
  const pixels = points.map(point => toScreen(camera, point));
  ctx.beginPath();
  ctx.moveTo(pixels[0].x, pixels[0].y);
  for (const point of pixels.slice(1)) ctx.lineTo(point.x, point.y);
  if (closed) ctx.closePath();
  ctx.stroke();
}

/** Signale l'état de validation sans dépendre de la couleur. */
function drawMarker(ctx: Ctx, at: Vec2, valid: boolean, dpr: number): void {
  ctx.font = `bold ${17 * dpr}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(valid ? '✓' : '×', at.x, at.y);
}
