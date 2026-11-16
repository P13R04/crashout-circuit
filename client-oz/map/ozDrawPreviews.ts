/**
 * Aperçus des outils de la carte Oz : arc à deux clics, mur à deux clics et pose annoncée.
 * Liens : client-oz/ozView.ts, client-shared/trackVisibility.ts, server/layout.ts.
 * Fonctions appelées par draw() de client-oz/map/ozDraw.ts (client-oz/map/OzMap.ts garde l'état et délègue).
 */
import { wallEndpoints, wallCorners } from '../../client-shared/tangibleGeometry.js';
import { validTangiblePose } from '../../server/tangibles/tangibles.js';
import type { DrawContext } from './ozDrawContext.js';

/** Dessine l’aperçu de l’outil arc à deux clics avec sa portée. */
export function drawArcPreview(dc: DrawContext): void {
  const { ozMap, ctx, unit, textAt, arcRange } = dc;
  if (ozMap.tool === 'arc') {
    if (ozMap.toolStep === 0 && ozMap.hover) {
      // Step 0 hover: Preview first pylon
      ctx.strokeStyle = '#ffe14a';
      ctx.fillStyle = 'rgba(255, 225, 74, 0.25)';
      ctx.lineWidth = 3 * unit;
      ctx.beginPath();
      ctx.arc(ozMap.hover.x, ozMap.hover.y, 18 * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      textAt('⚡ 1er Pylône (touchez)', ozMap.hover.x, ozMap.hover.y, 12, '#ffe14a', -28);
    } else if (ozMap.toolStep === 1 && ozMap.firstPoint) {
      const p1 = ozMap.firstPoint;
      // Pylon 1 placed
      ctx.fillStyle = '#ffe14a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 14 * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      textAt('Pylône 1', p1.x, p1.y, 11, '#ffffff', -24);

      // Max reach radius
      ctx.strokeStyle = 'rgba(255, 225, 74, 0.22)';
      ctx.setLineDash([8 * unit, 8 * unit]);
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, arcRange, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (ozMap.hover) {
        const p2 = ozMap.hover;
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const inRange = d <= arcRange;

        if (inRange) {
          // Electric lightning tether preview
          ctx.strokeStyle = '#ffe14a';
          ctx.shadowColor = '#ffe14a';
          ctx.shadowBlur = 12 * unit;
          ctx.lineWidth = 4 * unit;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Pylon 2 preview (in range)
          ctx.fillStyle = '#ffe14a';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 * unit;
          ctx.beginPath();
          ctx.arc(p2.x, p2.y, 14 * unit, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          textAt(`⚡ Arc lié (${Math.round(d)} px ≤ ${arcRange} px)`, p2.x, p2.y, 12, '#ffe14a', -26);
        } else {
          // Out of range line (dashed red/gray, no electric arc)
          ctx.strokeStyle = 'rgba(255, 110, 110, 0.55)';
          ctx.setLineDash([6 * unit, 6 * unit]);
          ctx.lineWidth = 2 * unit;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Pylon 2 preview (solitary pylon)
          ctx.fillStyle = '#94a3b8';
          ctx.strokeStyle = '#ff6b6b';
          ctx.lineWidth = 2 * unit;
          ctx.beginPath();
          ctx.arc(p2.x, p2.y, 14 * unit, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          textAt(`⚠ Hors portée (${Math.round(d)} px > ${arcRange} px) — Pylône seul`, p2.x, p2.y, 12, '#f87171', -26);
        }
      }
    }
  }
}

/** Dessine l’aperçu de l’outil mur à deux clics. */
export function drawWallPreview(dc: DrawContext): void {
  const { ozMap, ctx, s, unit, textAt } = dc;
  if (ozMap.tool === 'wall') {
    if (ozMap.toolStep === 0 && ozMap.hover) {
      // Step 0 hover
      ctx.strokeStyle = '#ff3b3b';
      ctx.fillStyle = 'rgba(255, 59, 59, 0.25)';
      ctx.lineWidth = 3 * unit;
      ctx.beginPath();
      ctx.arc(ozMap.hover.x, ozMap.hover.y, 14 * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      textAt('🧱 1er point du mur (touchez)', ozMap.hover.x, ozMap.hover.y, 12, '#ff6a6a', -24);
    } else if (ozMap.toolStep === 1 && ozMap.firstPoint) {
      const p1 = ozMap.firstPoint;
      // Anchor 1
      ctx.fillStyle = '#ff3b3b';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 8 * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (ozMap.hover) {
        const p2 = ozMap.hover;
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const angle = d >= 5 ? (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI + 360) % 360 : 0;
        const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

        // Guide vector line from p1 to p2
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.setLineDash([6 * unit, 6 * unit]);
        ctx.lineWidth = unit;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Wall preview rectangle (120 px length)
        const corners = wallCorners(center, angle, s.params.wallLengthPx, s.params.wallWidthPx);
        const isValid = validTangiblePose('wall', { x: center.x / s.params.logicalWidth, y: center.y / s.params.logicalHeight, angle }, s.params);
        const wallStroke = isValid ? '#ff3b3b' : '#f59e0b';
        const wallFill = isValid ? 'rgba(255, 59, 59, 0.45)' : 'rgba(245, 158, 11, 0.35)';

        ctx.strokeStyle = wallStroke;
        ctx.shadowColor = wallStroke;
        ctx.shadowBlur = 14 * unit;
        ctx.fillStyle = wallFill;
        ctx.lineWidth = 3 * unit;
        ctx.beginPath();
        /** Trace successivement les coins de l’empreinte du tangible. */
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
          ? `🧱 Mur orienté (${Math.round(angle)}°) — Touchez pour poser`
          : `⚠️ Emplacement sur commandes joueur — Déplacez le mur`;
        const labelColor = isValid ? '#ff6a6a' : '#fbbf24';
        textAt(label, center.x, center.y, 12, labelColor, -26);
      }
    }
  }
}

/** Dessine l’aperçu historique de la pose annoncée, conservé pour les tests. */
export function drawPreparingPreview(dc: DrawContext): void {
  const { ozMap, ctx, s, W, H, unit, textAt } = dc;
  if (ozMap.h.preparing() && ozMap.hover && !ozMap.tool) {
    const p = ozMap.drag?.mode === 'place' ? { x: ozMap.drag.pose.x * W, y: ozMap.drag.pose.y * H } : ozMap.hover;
    const angle = ozMap.drag?.mode === 'place' ? ozMap.drag.pose.angle : ozMap.h.draftAngle();
    const pose = { x: p.x / W, y: p.y / H, angle };
    const kind = ozMap.h.selectedKind();
    ctx.strokeStyle = validTangiblePose(kind, pose, s.params) ? '#9be5bb' : '#ff6f7b';
    ctx.lineWidth = 3 * unit;
    ctx.setLineDash([7 * unit, 5 * unit]);
    ctx.beginPath();
    if (kind === 'wall') {
      const corners = wallCorners(p, angle, s.params.wallLengthPx, s.params.wallWidthPx);
      /** Trace les quatre coins du volume affiché pour la manipulation. */
      corners.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y));
      ctx.closePath();
    } else ctx.arc(p.x, p.y, 12 * unit, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (ozMap.drag?.mode === 'place') {
      const anchor = ozMap.drag.anchor;
      ctx.fillStyle = '#e9f8ff';
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 5 * unit, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = `bold ${12 * unit}px system-ui`;
    ctx.textAlign = 'center';
    textAt(ozMap.drag?.mode === 'place' ? '↻' : '＋', p.x, p.y, 12, ctx.strokeStyle as string, -28);
  }
}
