/**
 * Aperçu du déplacement d’un obstacle de la carte Oz : prise, rotation et dépôt.
 * Liens : client-oz/ozView.ts, client-shared/trackVisibility.ts, server/layout.ts.
 * Fonctions appelées par draw() de client-oz/map/ozDraw.ts (client-oz/map/OzMap.ts garde l'état et délègue).
 */
import { wallEndpoints, wallCorners } from '../../client-shared/tangibleGeometry.js';
import { validTangiblePose } from '../../server/tangibles/tangibles.js';
import type { DrawContext } from './ozDrawContext.js';

/** Dessine l’aperçu du déplacement d’un obstacle pris puis déposé. */
export function drawMovePreview(dc: DrawContext): void {
  const { ozMap, ctx, s, W, H, unit, textAt, arcRange } = dc;
  if (ozMap.movingTangibleId && ozMap.hover) {
    const id = ozMap.movingTangibleId;
    const t = s.tangibles[id];
    const p = ozMap.hover;
    if (t?.kind === 'wall') {
      if (ozMap.movingWallStep === 0) {
        const angle = ozMap.movingWallDraftAngle ?? t.angle;
        const corners = wallCorners(p, angle, s.params.wallLengthPx, s.params.wallWidthPx);
        const isValid = validTangiblePose('wall', { x: p.x / W, y: p.y / H, angle }, s.params);
        const strokeColor = isValid ? '#00e5ff' : '#f59e0b';
        const fillColor = isValid ? 'rgba(0, 229, 255, 0.35)' : 'rgba(245, 158, 11, 0.35)';

        ctx.strokeStyle = strokeColor;
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 14 * unit;
        ctx.fillStyle = fillColor;
        ctx.lineWidth = 3 * unit;
        ctx.beginPath();
        /** Trace les coins du mur dans sa pose affichée. */
        corners.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        const [wa, wb] = wallEndpoints(p, angle, s.params.wallLengthPx);
        for (const pt of [wa, wb]) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 6 * unit, 0, Math.PI * 2);
          ctx.fill();
        }

        const label = isValid
          ? `🧱 Touchez pour poser le 1er point (ou molette pour tourner)`
          : `⚠️ Emplacement sur commandes joueur — Déplacez le mur`;
        textAt(label, p.x, p.y, 12, isValid ? '#00e5ff' : '#fbbf24', -26);
      } else if (ozMap.movingWallStep === 1 && ozMap.movingWallFirstPoint) {
        const p1 = ozMap.movingWallFirstPoint;
        // Anchor 1
        ctx.fillStyle = '#00e5ff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 8 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const p2 = ozMap.hover;
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const angle = d >= 5
          ? (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI + 360) % 360
          : (ozMap.movingWallDraftAngle ?? t.angle);
        const center = d >= 5 ? { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } : p1;

        // Guide vector line from p1 to p2
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
        ctx.setLineDash([6 * unit, 6 * unit]);
        ctx.lineWidth = unit;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Wall preview rectangle (120 px length)
        const corners = wallCorners(center, angle, s.params.wallLengthPx, s.params.wallWidthPx);
        const isValid = validTangiblePose('wall', { x: center.x / W, y: center.y / H, angle }, s.params);
        const wallStroke = isValid ? '#00e5ff' : '#f59e0b';
        const wallFill = isValid ? 'rgba(0, 229, 255, 0.45)' : 'rgba(245, 158, 11, 0.35)';

        ctx.strokeStyle = wallStroke;
        ctx.shadowColor = wallStroke;
        ctx.shadowBlur = 14 * unit;
        ctx.fillStyle = wallFill;
        ctx.lineWidth = 3 * unit;
        ctx.beginPath();
        /** Trace le contour de l’aperçu du tangible avant confirmation. */
        corners.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Endpoints of the wall
        const [wa, wb] = wallEndpoints(center, angle, s.params.wallLengthPx);
        for (const endPt of [wa, wb]) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(endPt.x, endPt.y, 6 * unit, 0, Math.PI * 2);
          ctx.fill();
        }

        const label = isValid
          ? `🧱 Mur orienté (${Math.round(angle)}°) — Touchez pour déposer`
          : `⚠️ Emplacement sur commandes joueur — Déplacez le mur`;
        const labelColor = isValid ? '#00e5ff' : '#fbbf24';
        textAt(label, center.x, center.y, 12, labelColor, -26);
      }
    } else if (t?.kind === 'pylon') {
      const otherId = id === 2 ? 3 : 2;
      const other = s.tangibles[otherId];

      // Reach circle around cursor
      ctx.strokeStyle = 'rgba(255, 225, 74, 0.22)';
      ctx.setLineDash([8 * unit, 8 * unit]);
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      ctx.arc(p.x, p.y, arcRange, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (other?.status === 'placed') {
        const op = { x: other.x * W, y: other.y * H };
        const d = Math.hypot(p.x - op.x, p.y - op.y);
        if (d <= arcRange) {
          // In range electric tether
          ctx.strokeStyle = '#ffe14a';
          ctx.shadowColor = '#ffe14a';
          ctx.shadowBlur = 12 * unit;
          ctx.lineWidth = 4 * unit;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(op.x, op.y);
          ctx.stroke();
          ctx.shadowBlur = 0;
          textAt(`⚡ Arc lié (${Math.round(d)} px ≤ ${arcRange} px) — Touchez pour déposer`, p.x, p.y, 12, '#ffe14a', -26);
        } else {
          // Out of range
          ctx.strokeStyle = 'rgba(255, 110, 110, 0.55)';
          ctx.setLineDash([6 * unit, 6 * unit]);
          ctx.lineWidth = 2 * unit;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(op.x, op.y);
          ctx.stroke();
          ctx.setLineDash([]);
          textAt(`⚠ Hors portée (${Math.round(d)} px > ${arcRange} px) — Touchez pour déposer`, p.x, p.y, 12, '#f87171', -26);
        }
      } else {
        textAt(`⚡ Pylône ${id === 2 ? '1' : '2'} — Touchez pour déposer`, p.x, p.y, 12, '#ffe14a', -26);
      }

      // Pylon preview circle
      ctx.fillStyle = '#ffe14a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14 * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
