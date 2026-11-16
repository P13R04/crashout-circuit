/**
 * Écran de création du circuit : points P1 et P2, consignes, ancres et flèches des tracés.
 * Liens : server/mapCreation.ts, client-table/TrackCreation.ts.
 * Fonctions appelées par les méthodes de Renderer (server/Renderer.ts), qui garde l'état et délègue ici.
 */
import type { GameState, Team, Vec2 } from '../../server/types.js';
import { LOGICAL_W, LOGICAL_H, PLAY_AREA } from '../../server/layout.js';
import { TEAM_COLOR, type View } from '../view.js';
import { icon } from '../icons.js';
import { drawStationLabels } from '../TutorialOverlay.js';
import { activeMapTeam, inMapAnchor, mapStrokeEndpoints, MAP_ANCHOR_RADIUS } from '../../server/mapCreation.js';
import type { Ctx } from './rendererTypes.js';
import { MAP_GENERATE_BUTTON } from './rendererButtons.js';
import type { Renderer } from '../Renderer.js';

// Création : tracés, points de raccord, repères des joueurs et validation.
/** Dessine les points, les tracés et les repères de joueurs pendant la création du circuit. */
export function drawMap(renderer: Renderer, ctx: Ctx, state: GameState, view: View): void {
  const t = performance.now();
  const motion = renderer.reducedMotion ? 0 : renderer.time;
  const team = activeMapTeam(state);
  ctx.save();

  if (!state.mapTargets || !state.mapDivider) {
    ctx.strokeStyle = view.pendingDivider.length ? TEAM_COLOR.B : TEAM_COLOR.A;
    ctx.lineWidth = 2; ctx.setLineDash([12, 10]);
    ctx.strokeRect(PLAY_AREA.x0, PLAY_AREA.y0, PLAY_AREA.x1 - PLAY_AREA.x0, PLAY_AREA.y1 - PLAY_AREA.y0);
    ctx.setLineDash([]);
    const first = view.pendingDivider[0];
    if (first) drawMapAnchor(renderer, ctx, first, 'P1', 'POINT CYAN', TEAM_COLOR.A, 'A', false, t);
    if (!first) icon(ctx, 'touch', LOGICAL_W / 2, LOGICAL_H / 2, 64, '#00e5ff88');
  } else {
    const [a, b] = state.mapDivider;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const nx = -uy, ny = ux;
    const far = 4000;
    for (const [sideTeam, side] of [['A', 1], ['B', -1]] as const) {
      ctx.beginPath();
      ctx.moveTo(a.x - ux * far, a.y - uy * far);
      ctx.lineTo(a.x - ux * far + nx * side * far, a.y - uy * far + ny * side * far);
      ctx.lineTo(b.x + ux * far + nx * side * far, b.y + uy * far + ny * side * far);
      ctx.lineTo(b.x + ux * far, b.y + uy * far);
      ctx.closePath();
      ctx.fillStyle = TEAM_COLOR[sideTeam] + (sideTeam === team ? '14' : '04');
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.moveTo(a.x - ux * far, a.y - uy * far);
    ctx.lineTo(b.x + ux * far, b.y + uy * far); ctx.stroke(); ctx.setLineDash([]);

    // Only the active team's direction is shown. Curved chevrons leave the divider
    // towards its half-plane, without suggesting that the straight divider is a road.
    if (team && ![...view.strokes.values()].some(/* Repère le tracé actif de l’équipe pour choisir ses indications de dessin. */ s => s.team === team && !s.done)) {
      const [from, to] = state.mapTargets[team];
      drawMapArrow(renderer, ctx, from, to, TEAM_COLOR[team], motion);
    }

    for (const [key, stroke] of view.strokes) {
      if (stroke.rejectedAt !== undefined && t - stroke.rejectedAt >= 1500) {
        view.strokes.delete(key);
        continue;
      }
      if (stroke.pts.length < 2) continue;
      const accepted = state.mapStrokes[stroke.team];
      ctx.save();
      ctx.globalAlpha = accepted && team ? 0.6 : 1;
      ctx.strokeStyle = stroke.rejectedAt !== undefined ? '#ff4040' : TEAM_COLOR[stroke.team];
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = accepted ? 6 : 14;
      ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(stroke.pts[0].x, stroke.pts[0].y);
      for (const p of stroke.pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke(); ctx.restore();
    }

    if (team) {
      const activeStroke = [...view.strokes.values()].find(/* Retrouve le trait en cours afin d’en déduire son raccord d’arrivée. */ s => s.team === team && !s.done);
      const [from, to] = mapStrokeEndpoints(activeStroke?.pts[0], ...state.mapTargets[team]);
      const nearTarget = activeStroke && inMapAnchor(activeStroke.pts[activeStroke.pts.length - 1], to);
      /** Associe le point de raccord au libellé P1 ou P2 affiché sur la carte. */
      const label = (p: Vec2) => inMapAnchor(p, state.mapDivider![0]) ? 'P1' : 'P2';
      drawMapAnchor(renderer, ctx, from, label(from), 'DÉPART', TEAM_COLOR[team], team, !activeStroke, t);
      drawMapAnchor(renderer, ctx, to, label(to), activeStroke ? nearTarget ? 'RELÂCHEZ ICI' : 'ARRIVÉE' : 'DÉPART', TEAM_COLOR[team], team, true, t);
    } else {
      drawMapAnchor(renderer, ctx, a, 'P1', '✓ RELIÉ', TEAM_COLOR.A, 'A', false, t);
      drawMapAnchor(renderer, ctx, b, 'P2', '✓ RELIÉ', TEAM_COLOR.B, 'B', false, t);
      renderer.drawAction(ctx, MAP_GENERATE_BUTTON, 'track');
    }
  }

  drawStationLabels(ctx, renderer.theme);
  // Stable instruction bands outside the drawing area, facing both long edges.
  drawMapInstructions(renderer, ctx, state, view, t);
  ctx.restore();
}

/** Présente la consigne de dessin adaptée à l’équipe active et aux éventuels refus. */
function drawMapInstructions(renderer: Renderer, ctx: Ctx, state: GameState, view: View, t: number): void {
  const placed = !!state.mapTargets;
  const team = placed ? activeMapTeam(state) : view.pendingDivider.length ? 'B' : 'A';
  const step = placed ? team === 'A' ? 2 : team === 'B' ? 3 : 4 : view.pendingDivider.length ? 1 : 0;
  const color = team ? TEAM_COLOR[team] : '#3ddc84';
  const waiting = view.dividerSubmitting || [...view.strokes.values()].some(/* Indique qu’une validation de tracé attend encore le retour du serveur. */ s => s.submitting);
  const action = waiting ? 'Validation…' : !placed ? `Placez P${step + 1}` : team ? 'Reliez les deux points' : 'Créer le circuit';
  const notice = view.mapNotice && view.mapNotice.until > t ? view.mapNotice : null;
  for (const [y, rotation] of [[120, Math.PI], [960, 0]]) {
    ctx.save(); ctx.translate(LOGICAL_W / 2, y); ctx.rotate(rotation);
    ctx.fillStyle = '#080f26dd'; ctx.beginPath(); ctx.roundRect(-290, -58, 580, 116, 24); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 82;
      const c = i < step ? '#3ddc84' : i === step ? color : '#56627b';
      if (i < 4) { ctx.strokeStyle = '#ffffff18'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 24, -18); ctx.lineTo(x + 58, -18); ctx.stroke(); }
      ctx.strokeStyle = c; ctx.lineWidth = i === step ? 3 : 1;
      ctx.beginPath(); ctx.arc(x, -18, 23, 0, Math.PI * 2); ctx.stroke();
      if (i < step) icon(ctx, 'check', x, -18, 20, c);
      else if (i < 2) {
        ctx.fillStyle = TEAM_COLOR[i === 0 ? 'A' : 'B']; ctx.beginPath(); ctx.arc(x, -18, 7, 0, Math.PI * 2); ctx.fill();
      } else icon(ctx, i === 4 ? 'track' : 'draw', x, -18, 23, i === 2 ? TEAM_COLOR.A : i === 3 ? TEAM_COLOR.B : c);
    }
    ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.font = 'bold 23px sans-serif';
    ctx.fillText(action, 0, 36);
    if (notice) {
      ctx.fillStyle = '#080f26f5'; ctx.beginPath(); ctx.roundRect(-340, -126, 680, 47, 15); ctx.fill();
      ctx.fillStyle = notice.color ?? '#ff7070'; ctx.font = 'bold 22px sans-serif'; ctx.fillText(notice.text, 0, -95);
    }
    ctx.restore();
  }
}

/** Dessine un raccord avec son rôle de départ, d’arrivée ou de point déjà relié. */
function drawMapAnchor(renderer: Renderer, ctx: Ctx, point: Vec2, label: string, role: string, color: string, team: Team, pulse: boolean, t: number): void {
  const done = role.startsWith('✓');
  const arriving = role === 'ARRIVÉE' || role === 'RELÂCHEZ ICI';
  const ready = role === 'RELÂCHEZ ICI';
  const c = ready || done ? '#3ddc84' : color;
  ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(team === 'B' ? Math.PI : 0);
  // The visual boundary is exactly the input radius; animation stays outside it.
  ctx.fillStyle = '#080f26ee'; ctx.strokeStyle = c; ctx.lineWidth = ready ? 7 : 3;
  ctx.setLineDash(arriving && !ready ? [10, 8] : []);
  ctx.beginPath(); ctx.arc(0, 0, MAP_ANCHOR_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  if (pulse && !renderer.reducedMotion) {
    ctx.globalAlpha = .25 + .12 * Math.sin(renderer.time / 400); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, MAP_ANCHOR_RADIUS + 9, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  icon(ctx, done || ready ? 'check' : arriving ? 'flag' : 'touch', 0, -12, 47, c);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 22px monospace'; ctx.fillText(label, 0, 48);
  ctx.restore();
}

/** Montre le sens du tracé attendu avec une flèche qui suit la courbe de démonstration. */
function drawMapArrow(renderer: Renderer, ctx: Ctx, from: Vec2, to: Vec2, color: string, t: number): void {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Reversing from/to for rose naturally bends towards the opposite half.
  const normal = { x: -dy / len, y: dx / len };
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  let bow = Math.min(240, len * 0.35);
  // Keep the guide visible even with steeply rotated or edge-adjacent anchors.
  if (normal.x > 0) bow = Math.min(bow, (LOGICAL_W - 70 - mid.x) / normal.x);
  if (normal.x < 0) bow = Math.min(bow, (70 - mid.x) / normal.x);
  if (normal.y > 0) bow = Math.min(bow, (820 - mid.y) / normal.y);
  if (normal.y < 0) bow = Math.min(bow, (260 - mid.y) / normal.y);
  const control = { x: mid.x + normal.x * bow, y: mid.y + normal.y * bow };
  /** Calcule un point intermédiaire sur la trajectoire dessinée. */
  const at = (u: number): Vec2 => ({
    x: (1-u)*(1-u)*from.x + 2*(1-u)*u*control.x + u*u*to.x,
    y: (1-u)*(1-u)*from.y + 2*(1-u)*u*control.y + u*u*to.y,
  });
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const u = 0.22 + ((i / 3 + t / 4000) % 1) * 0.56;
    const p = at(u);
    if (inMapAnchor(p, from) || inMapAnchor(p, to)) continue;
    const ahead = at(u + 0.01);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(ahead.y - p.y, ahead.x - p.x));
    ctx.globalAlpha = 0.85; ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(0, 0); ctx.lineTo(-12, 10); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
