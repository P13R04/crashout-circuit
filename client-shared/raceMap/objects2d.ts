/** Dessine les voitures et les objets publics de la course sur le plan. */
import type { GameState, Team, Vec2 } from '../../server/types.js';
import { boostFrame } from '../../server/track/boostGeometry.js';

export const CAR_COLORS: Record<Team, string> = { A: '#69e8fb', B: '#ff80aa' };
export type CarPose = { pos: Vec2; angle: number };

/** Dessine les éléments mobiles selon l'état de la course et l'horloge partagée. */
export function drawObjects2d(ctx: CanvasRenderingContext2D, state: GameState,
  poses: Record<Team, CarPose>, now: number, own?: Team): void {
  for (const gate of state.boostGates) {
    const { forward, depth } = boostFrame(gate);
    const far = (p: Vec2) => ({ x: p.x + forward.x * depth, y: p.y + forward.y * depth });
    const corners = [gate.a, gate.b, far(gate.b), far(gate.a)];
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (const p of corners.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fillStyle = '#ffce5060';
    ctx.fill();
    ctx.strokeStyle = '#ffdd71';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  for (const wall of state.walls) {
    ctx.save();
    ctx.translate(wall.pos.x, wall.pos.y);
    ctx.rotate(wall.angle * Math.PI / 180);
    ctx.fillStyle = wall.disabledUntil > now ? '#a48e7170' : '#f2aa62';
    const width = wall.widthPx ?? state.params.wallWidthPx;
    ctx.fillRect(-wall.lengthPx / 2, -width / 2, wall.lengthPx, width);
    ctx.restore();
  }
  for (const arc of state.arcs) {
    if (arc.disabledUntil > now) continue;
    ctx.beginPath();
    ctx.moveTo(arc.pylon1.x, arc.pylon1.y);
    ctx.lineTo(arc.pylon2.x, arc.pylon2.y);
    ctx.strokeStyle = '#bda4ff';
    ctx.lineWidth = 5;
    ctx.stroke();
  }
  for (const tangible of Object.values(state.tangibles)) {
    if (tangible.kind === 'pylon' && tangible.status === 'placed') {
      circle(ctx, { x: tangible.x * state.params.logicalWidth, y: tangible.y * state.params.logicalHeight }, 15,
        tangible.active ? '#d7c4ff' : '#75758a');
    }
  }
  drawPickupsAndStones(ctx, state, now);
  for (const team of state.soloTest ? ['A'] as const : ['A', 'B'] as const) {
    drawCar(ctx, poses[team], team, team === own, state.cars[team].disabled);
  }
}

/** Dessine les bonus disponibles et les zones d'impact des tirs. */
function drawPickupsAndStones(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  for (const pickup of state.pickups) {
    if (pickup.respawnAt > now) continue;
    ctx.save();
    ctx.translate(pickup.pos.x, pickup.pos.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = pickup.kind === 'boost' ? '#ffe482' : '#f6a4ff';
    ctx.fillRect(-10, -10, 20, 20);
    ctx.restore();
  }
  for (const stone of state.stones) {
    ctx.beginPath();
    ctx.arc(stone.target.x, stone.target.y, state.params.stoneRadiusPx, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6a5a40';
    ctx.fill();
    ctx.strokeStyle = '#ff8a73';
    ctx.lineWidth = 5;
    ctx.stroke();
    const t = Math.max(0, Math.min(1, (now - stone.launchedAt) / Math.max(1, stone.impactAt - stone.launchedAt)));
    circle(ctx, { x: stone.from.x + (stone.target.x - stone.from.x) * t,
      y: stone.from.y + (stone.target.y - stone.from.y) * t }, 9, '#e7ad8e');
  }
}

/** Indique le cap par une pointe et repère la voiture suivie par un cercle. */
function drawCar(ctx: CanvasRenderingContext2D, pose: CarPose, team: Team, own: boolean, disabled: boolean): void {
  if (own) circle(ctx, pose.pos, 25, '#101820b0');
  ctx.save();
  ctx.translate(pose.pos.x, pose.pos.y);
  ctx.rotate(pose.angle);
  ctx.fillStyle = disabled ? '#b2b2b2' : CAR_COLORS[team];
  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(-13, -11);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-13, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Marque la position d'un objet avec un disque de couleur. */
function circle(ctx: CanvasRenderingContext2D, p: Vec2, radius: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
