/**
 * Pointeur de la carte Oz : pose, glissement, rotation du mur, outils à deux clics et sélection d'un tangible.
 * Liens : client-oz/OzController.ts, client-shared/tangibleGeometry.ts, client-oz/ozView.ts.
 * Fonctions appelées par les méthodes de OzMap (server/OzMap.ts), qui garde l'état et délègue ici.
 */
import type { Tangible, Vec2 } from '../../server/types.js';
import { wallEndpoints, rotateWall } from '../../client-shared/tangibleGeometry.js';
import { type TangibleId } from '../../server/tangibles.js';
import { distToSegment } from '../../server/geometry.js';
import { viewTransform, viewToWorld } from '../ozView.js';
import type { OzMap } from '../OzMap.js';

/** Convertit les coordonnées du doigt dans le canvas puis dans le repère logique de la table. */
function point(ozMap: OzMap, e: PointerEvent): Vec2 {
  const r = ozMap.canvas.getBoundingClientRect();
  return viewToWorld({
    x: (e.clientX - r.left) / r.width * ozMap.canvas.width,
    y: (e.clientY - r.top) / r.height * ozMap.canvas.height
  }, viewTransform(ozMap.canvas.width, ozMap.canvas.height, ozMap.state!.params.logicalWidth, ozMap.state!.params.logicalHeight, ozMap.quarter));
}

/** Choisit entre retrait tactile, pose manuelle, déplacement et rotation selon l’objet touché. */
export function down(ozMap: OzMap, e: PointerEvent): void {
  if (e.isPrimary===false||ozMap.drag&&ozMap.drag.pointer!==e.pointerId)return;
  if (!ozMap.h.enabled() || !ozMap.state || (e.button !== undefined && e.button !== 0)) return;
  e.preventDefault();
  const s = ozMap.state, p = point(ozMap, e);
  if(s.tangiblePlacementMode==='touch'){
    const hit=tangibleAt(ozMap, p);
    if(hit)ozMap.h.onRemove?.(hit);
    return;
  }
  ozMap.hover = p;
  ozMap.downClientPos = { x: e.clientX, y: e.clientY };

  // ── Pick & Drop: Second click drops the moving tangible ──
  if (ozMap.movingTangibleId) {
    const id = ozMap.movingTangibleId;
    if (id === 1) {
      // Wall relocation with orientation handling
      if (ozMap.movingWallStep === 0) {
        // Check if clicking another tangible to switch to it
        const candidates = ozMap.visibleTangibles().filter(/* Retient les piliers posés pour leur sélection lors d’un repositionnement. */ ([tid, t]) => t.status === 'placed' && tid !== 1);
        let switched = false;
        const transform = viewTransform(ozMap.canvas.width, ozMap.canvas.height, s.params.logicalWidth, s.params.logicalHeight, ozMap.quarter);
        const radius = 24 * ozMap.canvas.width / Math.max(1, ozMap.canvas.getBoundingClientRect().width) / transform.scale;
        for (const [tid, t] of candidates) {
          const center = { x: t.x * s.params.logicalWidth, y: t.y * s.params.logicalHeight };
          if (Math.hypot(p.x - center.x, p.y - center.y) <= radius) {
            ozMap.movingTangibleId = tid as TangibleId;
            ozMap.movingWallStep = 0;
            ozMap.movingWallFirstPoint = null;
            ozMap.movingWallDraftAngle = null;
            ozMap.h.onMovingTangibleChange?.(ozMap.movingTangibleId, 0);
            ozMap.draw();
            switched = true;
            break;
          }
        }
        if (switched) return;

        // 1st click on destination: set first anchor point
        ozMap.movingWallFirstPoint = p;
        ozMap.movingWallStep = 1;
        ozMap.h.onMovingTangibleChange?.(1, 1);
        ozMap.draw();
        return;
      } else if (ozMap.movingWallStep === 1) {
        // 2nd click on destination: compute angle & center, then drop
        const p1 = ozMap.movingWallFirstPoint!;
        const p2 = p;
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const wall = s.tangibles[1];
        const angle = d >= 5
          ? (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI + 360) % 360
          : (ozMap.movingWallDraftAngle ?? wall?.angle ?? 0);
        const center = d >= 5 ? { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } : p1;

        ozMap.movingTangibleId = null;
        ozMap.movingWallStep = 0;
        ozMap.movingWallFirstPoint = null;
        ozMap.movingWallDraftAngle = null;
        ozMap.h.onMovingTangibleChange?.(null, 0);
        ozMap.h.onRelocateTangible?.(1, center, angle);
        ozMap.draw();
        return;
      }
    } else {
      // Pylons (id 2 or 3) - instant drop
      ozMap.movingTangibleId = null;
      ozMap.h.onMovingTangibleChange?.(null, 0);
      ozMap.h.onRelocateTangible?.(id, p);
      ozMap.draw();
      return;
    }
  }

  // ── 2-Click Interactive Tool (Arc / Wall) ──
  if (ozMap.tool === 'arc') {
    if (ozMap.toolStep === 0) {
      ozMap.firstPoint = p;
      ozMap.toolStep = 1;
      ozMap.h.onToolStep?.('arc', 1, p);
      ozMap.draw();
      return;
    } else if (ozMap.toolStep === 1) {
      const p1 = ozMap.firstPoint!;
      const p2 = p;
      ozMap.h.onPlaceArc?.(p1, p2);
      ozMap.tool = null;
      ozMap.toolStep = 0;
      ozMap.firstPoint = null;
      ozMap.h.onToolStep?.(null, 0, null);
      ozMap.draw();
      return;
    }
  }

  if (ozMap.tool === 'wall') {
    if (ozMap.toolStep === 0) {
      ozMap.firstPoint = p;
      ozMap.toolStep = 1;
      ozMap.h.onToolStep?.('wall', 1, p);
      ozMap.draw();
      return;
    } else if (ozMap.toolStep === 1) {
      const p1 = ozMap.firstPoint!;
      const p2 = p;
      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const angle = d >= 5 ? (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI + 360) % 360 : 0;
      const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      ozMap.h.onPlaceWall?.(center, angle);
      ozMap.tool = null;
      ozMap.toolStep = 0;
      ozMap.firstPoint = null;
      ozMap.h.onToolStep?.(null, 0, null);
      ozMap.draw();
      return;
    }
  }

  // ── Legacy handlers / direct dragging (kept for unit test compatibility) ──
  if (ozMap.h.preparing() && ozMap.h.selectedKind() === 'wall') {
    const angle = ozMap.h.draftAngle();
    ozMap.drag = {
      pointer: e.pointerId, id: ozMap.h.selectedId() as TangibleId, mode: 'place',
      anchor: wallEndpoints(p, angle, s.params.wallLengthPx)[0], offset: { x: 0, y: 0 },
      pose: { x: p.x / s.params.logicalWidth, y: p.y / s.params.logicalHeight, angle }
    };
    ozMap.canvas.setPointerCapture(e.pointerId);
    ozMap.draw();
    return;
  }
  if (ozMap.h.preparing()) {
    ozMap.h.onPlace({ x: p.x / s.params.logicalWidth, y: p.y / s.params.logicalHeight, angle: ozMap.h.draftAngle() });
    ozMap.draw();
    return;
  }

  const transform = viewTransform(ozMap.canvas.width, ozMap.canvas.height, s.params.logicalWidth, s.params.logicalHeight, ozMap.quarter);
  const radius = 24 * ozMap.canvas.width / ozMap.canvas.getBoundingClientRect().width / transform.scale;
  const candidates = ozMap.visibleTangibles().filter(/* Limite la sélection aux objets présents sur la piste. */ ([, t]) => t.status === 'placed')
    .sort(/* Donne la priorité à l’objet déjà sélectionné lorsque plusieurs prises sont proches. */ ([a], [b]) => Number(b === ozMap.h.selectedId()) - Number(a === ozMap.h.selectedId()));
  let hit: { id: number; t: Tangible; rotate: boolean } | null = null;
  for (const [id, t] of candidates) {
    if (t.kind !== 'wall') continue;
    const [, b] = wallEndpoints({ x: t.x * s.params.logicalWidth, y: t.y * s.params.logicalHeight }, t.angle, s.params.wallLengthPx);
    if (Math.hypot(p.x - b.x, p.y - b.y) <= radius) { hit = { id, t, rotate: true }; break; }
  }
  if (!hit) for (const [id, t] of candidates) {
    const center = { x: t.x * s.params.logicalWidth, y: t.y * s.params.logicalHeight };
    const ends = wallEndpoints(center, t.angle, s.params.wallLengthPx);
    const distance = t.kind === 'wall' ? distToSegment(p, ...ends) : Math.hypot(p.x - center.x, p.y - center.y);
    if (distance <= radius) { hit = { id, t, rotate: false }; break; }
  }
  if (!hit) return;
  const id = hit.id as TangibleId, t = hit.t;
  ozMap.h.onSelect(id);
  const center = { x: t.x * s.params.logicalWidth, y: t.y * s.params.logicalHeight };
  ozMap.h.onDragStart();
  ozMap.drag = {
    pointer: e.pointerId, id, mode: hit.rotate ? 'rotate' : 'move',
    anchor: wallEndpoints(center, t.angle, s.params.wallLengthPx)[0],
    offset: { x: p.x - center.x, y: p.y - center.y }, pose: { x: t.x, y: t.y, angle: t.angle }
  };
  ozMap.canvas.setPointerCapture(e.pointerId);
  ozMap.draw();
}

/** Actualise l’aperçu et transmet le déplacement ou la rotation du doigt qui possède le geste. */
export function move(ozMap: OzMap, e: PointerEvent): void {
  if (!ozMap.state || !ozMap.h.enabled()) return;
  const p = point(ozMap, e);
  if(ozMap.state.tangiblePlacementMode==='touch'){
    ozMap.canvas.style.cursor=tangibleAt(ozMap, p)?'pointer':'default';
    return;
  }
  ozMap.hover = p;
  const s = ozMap.state;
  const W = s.params.logicalWidth, H = s.params.logicalHeight;
  const transform = viewTransform(ozMap.canvas.width, ozMap.canvas.height, W, H, ozMap.quarter);
  const unit = ozMap.canvas.width / Math.max(1, ozMap.canvas.getBoundingClientRect().width) / transform.scale;

  // Dynamic cursor feedback
  if (ozMap.canvas?.style) {
    if (ozMap.movingTangibleId || ozMap.tool) {
      ozMap.canvas.style.cursor = 'crosshair';
    } else {
      const candidates = ozMap.visibleTangibles().filter(/* Retient les objets posés pour calculer le retour de survol. */ ([, t]) => t.status === 'placed');
      let over = false;
      for (const [, t] of candidates) {
        const center = { x: t.x * W, y: t.y * H };
        const ends = wallEndpoints(center, t.angle, s.params.wallLengthPx);
        const distance = t.kind === 'wall' ? distToSegment(p, ...ends) : Math.hypot(p.x - center.x, p.y - center.y);
        if (distance <= 24 * unit) { over = true; break; }
      }
      ozMap.canvas.style.cursor = over ? 'pointer' : 'default';
    }
  }

  const d = ozMap.drag;
  if (!d || d.pointer !== e.pointerId) { ozMap.draw(); return; }
  if(d.mode==='move'&&!d.moved){
    if(Math.hypot(e.clientX-ozMap.downClientPos.x,e.clientY-ozMap.downClientPos.y)<=(e.pointerType==='touch'?10:3))return;
    d.moved=true;
  }
  const logical = d.mode !== 'move' ? rotateWall(d.anchor, p, s.params.wallLengthPx)
    : { x: p.x - d.offset.x, y: p.y - d.offset.y, angle: d.pose.angle };
  if (!logical) return;
  const pose = { x: logical.x / s.params.logicalWidth, y: logical.y / s.params.logicalHeight, angle: logical.angle };
  if (Math.abs(pose.x - d.pose.x) + Math.abs(pose.y - d.pose.y) + Math.abs(pose.angle - d.pose.angle) < 1e-10) return;
  if (d.mode === 'place' || ozMap.h.onMove(d.id, pose.x, pose.y, pose.angle)) d.pose = pose;
  ozMap.draw();
}

/** Retrouve le tangible le plus proche du contact avec une marge adaptée à la taille de la carte. */
function tangibleAt(ozMap: OzMap, p: Vec2): TangibleId | null {
  const s=ozMap.state;if(!s)return null;
  const transform=viewTransform(ozMap.canvas.width,ozMap.canvas.height,s.params.logicalWidth,s.params.logicalHeight,ozMap.quarter);
  const radius=20*ozMap.canvas.width/Math.max(1,ozMap.canvas.getBoundingClientRect().width)/transform.scale;
  let hit: TangibleId|null=null,best=Infinity;
  for(const [id,t] of ozMap.visibleTangibles())if(t.status==='placed'||t.status==='parked'){
    const center={x:t.x*s.params.logicalWidth,y:t.y*s.params.logicalHeight};
    const distance=t.kind==='wall'?distToSegment(p,...wallEndpoints(center,t.angle,s.params.wallLengthPx)):Math.hypot(p.x-center.x,p.y-center.y);
    if(distance<=Math.max(radius,s.params.pylonBasePx/2)&&distance<best){hit=id as TangibleId;best=distance;}
  }
  return hit;
}
