/**
 * Dessin de la carte Oz : table, circuit, voitures et tangibles posés.
 * Liens : client-oz/ozView.ts, client-shared/trackVisibility.ts, server/layout.ts.
 * Fonctions appelées par draw() de client-oz/map/ozDraw.ts (client-oz/map/OzMap.ts garde l'état et délègue).
 */
import type { Tangible } from '../../server/types.js';
import { wallEndpoints, wallCorners } from '../../client-shared/tangibleGeometry.js';
import { nearestOnTrack } from '../../server/geometry.js';
import { visibleTrackEdges } from '../../client-shared/trackVisibility.js';
import { viewTransform } from '../ozView.js';
import { PANELS, PANEL_H, panelWidth, TANGIBLE_DEPOT, NEUTRAL_CONTROLS } from '../../server/layout.js';
import type { OzMap } from './OzMap.js';
import type { DrawContext } from './ozDrawContext.js';
import { drawArcPreview, drawWallPreview, drawPreparingPreview } from './ozDrawPreviews.js';
import { drawMovePreview } from './ozDrawMove.js';

/** Réunit les poses reçues et la pose provisoire du geste en cours pour le dessin. */
export function visibleTangibles(ozMap: OzMap): Array<[number, Tangible]> {
  if (!ozMap.state) return [];
  const all = new Map(Object.entries(ozMap.state.tangibles).map(/* Associe chaque pose à son identifiant numérique pour y superposer l’aperçu. */ ([id, t]) => [Number(id), t]));
  if (ozMap.drag) {
    const old = all.get(ozMap.drag.id);
    if (old) all.set(ozMap.drag.id, { ...old, ...ozMap.drag.pose });
  }
  return [...all];
}

/** Dessine la piste, les voitures, les objets et les aperçus dans l’orientation choisie. */
export function draw(ozMap: OzMap): void {
  const ctx = ozMap.ctx, s = ozMap.state;
  ctx.fillStyle = '#04081f';
  ctx.fillRect(0, 0, ozMap.canvas.width, ozMap.canvas.height);
  if (!s) return;
  const W = s.params.logicalWidth, H = s.params.logicalHeight;
  const transform = viewTransform(ozMap.canvas.width, ozMap.canvas.height, W, H, ozMap.quarter);
  const unit = ozMap.canvas.width / Math.max(1, ozMap.canvas.getBoundingClientRect().width) / transform.scale;

  ctx.save();
  ctx.translate(transform.cx, transform.cy);
  ctx.rotate(transform.angle);
  ctx.scale(transform.scale, transform.scale);
  ctx.translate(-W / 2, -H / 2);

  /** Dessine un libellé lisible sur la carte même lorsque la vue générale est tournée. */
  const textAt = (text: string, x: number, y: number, size: number, color: string, offsetY = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-transform.angle);
    ctx.fillStyle = color;
    ctx.font = `bold ${size * unit}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(text, 0, offsetY * unit);
    ctx.restore();
  };

  // Table boundary
  ctx.strokeStyle = '#33405a';
  ctx.lineWidth = unit;
  ctx.strokeRect(0, 0, W, H);

  ctx.strokeStyle='#78929a66';ctx.lineWidth=unit;
  for(const r of [TANGIBLE_DEPOT,NEUTRAL_CONTROLS])ctx.strokeRect(r.x,r.y,r.w,r.h);

  const arcRange = s.params.arcMaxDistPx ?? 350;
  const dc: DrawContext = { ozMap, ctx, s, W, H, transform, unit, textAt, arcRange };
  drawStations(dc);
  drawTrack(dc);
  drawCars(dc);
  drawArcs(dc);
  drawTangibles(dc);
  drawArcPreview(dc);
  drawWallPreview(dc);
  drawMovePreview(dc);
  drawPreparingPreview(dc);
  ctx.restore();
}

/** Dessine les quatre postes de joueur dans les coins de la table. */
export function drawStations(dc: DrawContext): void {
  const { ctx, unit } = dc;
  for (const panel of PANELS) {
    ctx.save();
    ctx.translate(panel.cx, panel.cy);
    ctx.rotate(panel.rot);
    ctx.fillStyle = '#ffffff06';
    ctx.fillRect(-panelWidth(panel.role) / 2, -PANEL_H / 2, panelWidth(panel.role), PANEL_H);
    ctx.fillStyle = panel.team === 'A' ? '#00e5ff88' : '#ff408188';
    ctx.font = `${10 * unit}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(`${panel.team === 'A' ? 'CYAN' : 'ROSE'} · ${panel.role === 'pilot' ? 'PILOTE' : 'COPILOTE'}`, 0, -PANEL_H / 2 + 18 * unit);
    ctx.restore();
  }
}

/** Dessine la chaussée visible, ses bords et ses points de contrôle. */
export function drawTrack(dc: DrawContext): void {
  const { ozMap, ctx, s, unit } = dc;
  if (s.track) {
    const track = s.track, c = track.centerline, n = c.length;
    ctx.strokeStyle = '#182238';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      ctx.lineWidth = (track.widths[i] + track.widths[j]) / 2;
      ctx.beginPath();
      ctx.moveTo(c[i].x, c[i].y);
      ctx.lineTo(c[j].x, c[j].y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    if (ozMap.trackVersion !== s.trackVersion) {
      ozMap.hiddenEdges = visibleTrackEdges(track).map(/* Prépare les portions cachées de chaque bordure au croisement. */ edge => edge.map(/* Inverse le masque de visibilité pour repérer les segments à ignorer. */ visible => !visible));
      ozMap.trackVersion = s.trackVersion;
    }
    ctx.lineWidth = 2 * unit;
    for (const [edge, pts] of [track.outerEdge, track.innerEdge].entries()) {
      ctx.strokeStyle = edge === 0 ? '#ff4081' : '#00e5ff';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (ozMap.hiddenEdges[edge][i] || ozMap.hiddenEdges[edge][j]) continue;
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[j].x, pts[j].y);
      }
      ctx.stroke();
    }
    const sl = track.startLine, half = nearestOnTrack(sl.pos, track).halfWidth;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 * unit;
    ctx.beginPath();
    ctx.moveTo(sl.pos.x + sl.normal.x * half, sl.pos.y + sl.normal.y * half);
    ctx.lineTo(sl.pos.x - sl.normal.x * half, sl.pos.y - sl.normal.y * half);
    ctx.stroke();
  }
}

/** Dessine les deux voitures pilotes en temps réel. */
export function drawCars(dc: DrawContext): void {
  const { ctx, s, unit, textAt } = dc;
  for (const team of ['A', 'B'] as const) {
    const car = s.cars[team];
    const teamColor = team === 'A' ? '#00e5ff' : '#ff4081';
    ctx.save();
    ctx.translate(car.pos.x, car.pos.y);
    ctx.rotate(car.angle);

    // Glow behind moving car
    ctx.shadowColor = teamColor;
    ctx.shadowBlur = 12 * unit;

    // Racing car arrowhead
    ctx.fillStyle = car.disabled ? '#64748b' : teamColor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * unit;
    ctx.beginPath();
    ctx.moveTo(14 * unit, 0);
    ctx.lineTo(-10 * unit, -8 * unit);
    ctx.lineTo(-5 * unit, 0);
    ctx.lineTo(-10 * unit, 8 * unit);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Boost trail
    if (car.boostUntil > (s.phase === 'PAUSED' ? s.pausedAt : performance.now())) {
      ctx.strokeStyle = '#ffd400';
      ctx.lineWidth = 3 * unit;
      ctx.beginPath();
      ctx.moveTo(-10 * unit, 0);
      ctx.lineTo(-24 * unit, 0);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.restore();

    // Pilot label above vehicle
    textAt(`Pilote ${team}`, car.pos.x, car.pos.y, 11, teamColor, -18);
  }
}

/** Dessine les arcs électriques actifs entre deux piliers. */
export function drawArcs(dc: DrawContext): void {
  const { ctx, s, unit } = dc;
  for (const arc of s.arcs) {
    ctx.strokeStyle = '#ffe14a';
    ctx.shadowColor = '#ffe14a';
    ctx.shadowBlur = 14 * unit;
    ctx.lineWidth = 4 * unit;
    ctx.beginPath();
    ctx.moveTo(arc.pylon1.x, arc.pylon1.y);
    ctx.lineTo(arc.pylon2.x, arc.pylon2.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

/** Dessine les murs et piliers posés, y compris leur pose provisoire. */
export function drawTangibles(dc: DrawContext): void {
  const { ozMap, ctx, s, W, H, unit, textAt } = dc;
  for (const [id, t] of visibleTangibles(ozMap)) {
    if (t.status !== 'placed' && t.status !== 'parked') continue;
    const center = { x: t.x * W, y: t.y * H };
    const selected = id === ozMap.h.selectedId();
    const isBeingMoved = id === ozMap.movingTangibleId;

    ctx.save();
    if (isBeingMoved) {
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([6 * unit, 6 * unit]);
    }

    if (t.kind === 'wall') {
      const [a, b] = wallEndpoints(center, t.angle, s.params.wallLengthPx);
      const points = wallCorners(center, t.angle, s.params.wallLengthPx, s.params.wallWidthPx);
      ctx.strokeStyle = t.active ? '#ff3b3b' : '#7a8498';
      ctx.shadowColor = t.active ? '#ff3b3b' : '#000000';
      ctx.shadowBlur = t.active ? 12 * unit : 0;
      ctx.fillStyle = t.active ? 'rgba(255, 59, 59, 0.35)' : 'rgba(122, 132, 152, 0.15)';
      ctx.lineWidth = (selected ? 4 : 3) * unit;
      ctx.beginPath();
      /** Ajoute les points du contour au tracé Canvas. */
      points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Endpoints
      for (const pt of s.tangiblePlacementMode==='touch'?[]:[a, b]) {
        ctx.fillStyle = '#ff6a6a';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6 * unit, 0, Math.PI * 2);
        ctx.fill();
      }
      textAt('MUR', center.x, center.y, 11, '#ffffff');
    } else {
      // Pylon
      ctx.fillStyle = t.active ? '#ffe14a33' : '#7a849814';
      ctx.strokeStyle = t.active ? '#ffe14a' : '#7a8498';
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      ctx.arc(center.x, center.y, s.params.pylonFieldRadiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const base = s.params.pylonBasePx;
      ctx.fillStyle = t.active ? '#ffe14a' : '#7a8498';
      ctx.fillRect(center.x - base / 2, center.y - base / 2, base, base);
      textAt(s.tangiblePlacementMode==='touch'?`P${id-1}`:'PYLÔNE', center.x, center.y, 10, '#ffe14a', -22);
    }
    ctx.restore();

    if (isBeingMoved) {
      textAt('(En déplacement…)', center.x, center.y + 18 * unit, 10, '#00e5ff');
    }
  }
}
