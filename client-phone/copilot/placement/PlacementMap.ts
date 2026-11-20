/**
 * Affiche le circuit et distingue la pose à un doigt du pincement à deux doigts.
 * Liens : client-shared/raceMap/RaceMap.ts, placementPreview.ts, AccessiblePlacement.ts.
 */
import type { GameState, RemotePlacementTarget, Vec2 } from '../../../server/types.js';
import type { PreparedPlacement } from '../../../server/rules/gameplay/remotePlacementGeometry.js';
import { RaceMap } from '../../../client-shared/raceMap/RaceMap.js';
import { toWorld, type MapCamera } from '../../../client-shared/raceMap/camera2d.js';
import { drawPlacementPreview } from './placementPreview.js';
import { beginPinch, boundedFocus, resizePinch, type Pinch } from './pinchZoom.js';

export type MapGesture =
  | { phase: 'start' | 'move' | 'end'; point: Vec2 }
  | { phase: 'cancel' };

export class PlacementMap {
  readonly canvas = document.createElement('canvas');
  private readonly map = new RaceMap();
  private readonly ctx = this.canvas.getContext('2d');
  private camera: MapCamera | null = null;
  private readonly touches = new Map<number, { point: Vec2; type: string }>();
  private placement: { id: number; camera: MapCamera } | null = null;
  private pinch: Pinch | null = null;
  private zoom = 1;
  private focus: Vec2 | null = null;

  constructor(private readonly gesture: (event: MapGesture) => void, private readonly redraw: () => void) {
    this.canvas.className = 'placement-map';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onCancel);
    this.canvas.addEventListener('lostpointercapture', this.onCancel);
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
  }

  /** Arrête toute interaction sans confirmer la pose éventuellement engagée. */
  cancel(): void {
    if (!this.touches.size) return;
    const ids = [...this.touches.keys()];
    this.touches.clear();
    this.pinch = null;
    for (const id of ids) this.releaseCapture(id);
    this.cancelPlacement();
  }

  /** Redessine la géométrie courante et l'aperçu issu des validations partagées. */
  draw(state: GameState, target: RemotePlacementTarget | null, preview: PreparedPlacement | null, now: number): void {
    if (!this.ctx || !state.track) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(this.canvas.clientWidth * ratio), height = Math.round(this.canvas.clientHeight * ratio);
    if (!width || !height) return;
    if (this.touches.size && (this.canvas.width !== width || this.canvas.height !== height)) this.cancel();
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const { logicalWidth, logicalHeight } = state.params;
    const frame = {
      width, height, rotation: 0,
      center: this.focus ?? { x: logicalWidth / 2, y: logicalHeight / 2 },
      scale: Math.min(width / (logicalWidth + 36), height / (logicalHeight + 36)) * this.zoom,
    };
    const camera = this.camera = this.placement?.camera ?? {
      ...frame, center: boundedFocus(frame, logicalWidth, logicalHeight),
    };
    this.map.draw(this.ctx, camera, state, state.cars, now);
    if (target && preview) drawPlacementPreview(this.ctx, camera, state, target, preview, ratio);
  }

  /** Convertit un contact en pixels locaux du canvas. */
  private pointerPoint(event: PointerEvent): Vec2 {
    const box = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) * this.canvas.width / box.width,
      y: (event.clientY - box.top) * this.canvas.height / box.height,
    };
  }

  /** Transforme l'arrivée d'un second doigt en pincement et annule le brouillon tactile. */
  private onDown = (event: PointerEvent): void => {
    if (!this.camera || event.button !== 0 || this.touches.has(event.pointerId)) return;
    const first = this.touches.values().next().value;
    if (first ? first.type !== 'touch' || event.pointerType !== 'touch' : !event.isPrimary) return;
    const id = event.pointerId, point = this.pointerPoint(event);
    this.touches.set(id, { point, type: event.pointerType });
    this.canvas.setPointerCapture(id);
    if (!first) {
      this.placement = { id, camera: this.camera };
      this.gesture({ phase: 'start', point: toWorld(this.camera, point) });
    } else if (this.touches.size === 2) {
      this.pinch = beginPinch(this.camera, this.zoom, first.point, point);
      this.cancelPlacement();
    }
  };

  /** Met à jour le tracé ou le cadre selon les contacts capturés. */
  private onMove = (event: PointerEvent): void => {
    const touch = this.touches.get(event.pointerId);
    if (!touch) return;
    touch.point = this.pointerPoint(event);
    if (this.placement?.id === event.pointerId) {
      this.gesture({ phase: 'move', point: toWorld(this.placement.camera, touch.point) });
    } else if (this.pinch) {
      const [a, b] = this.touches.values();
      const view = resizePinch(this.pinch, a.point, b.point);
      this.zoom = view.zoom;
      this.focus = view.focus;
      this.redraw();
    }
  };

  /** Confirme seulement un contact de pose qui n'a jamais participé à un pincement. */
  private onUp = (event: PointerEvent): void => {
    this.finish(event, false);
  };

  /** Annule les contacts interrompus par le système ou le navigateur. */
  private onCancel = (event: PointerEvent): void => {
    this.finish(event, true);
  };

  /** Recadre les doigts encore posés, sans les réinterpréter comme une nouvelle pose. */
  private finish(event: PointerEvent, cancelled: boolean): void {
    const id = event.pointerId;
    if (!this.touches.delete(id)) return;
    this.releaseCapture(id);
    const [a, b] = this.touches.values();
    this.pinch = this.camera && a && b ? beginPinch(this.camera, this.zoom, a.point, b.point) : null;
    if (this.placement?.id !== id) return;
    const placement = this.placement;
    this.placement = null;
    this.gesture(cancelled ? { phase: 'cancel' } : { phase: 'end', point: toWorld(placement.camera, this.pointerPoint(event)) });
  }

  /** Abandonne la pose quand un autre geste prend le relais. */
  private cancelPlacement(): void {
    if (!this.placement) return;
    this.placement = null;
    this.gesture({ phase: 'cancel' });
  }

  /** Libère une capture après avoir effacé son contact. */
  private releaseCapture(id: number): void {
    if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }
}
