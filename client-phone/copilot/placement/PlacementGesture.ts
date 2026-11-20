/**
 * Transforme un appui, un tracé ou une inclinaison en brouillon de pose.
 * Liens : AccessiblePlacement.ts, TiltAim.ts, placementInput.ts.
 */
import type { GameParams, RemotePlacementTarget, Vec2 } from '../../../server/types.js';
import { bearing, boostWidth, tracedPlacement } from './placementInput.js';
import type { TiltAim } from './TiltAim.js';

const HOLD_MS = 150;
type Held = { start: Vec2; before: RemotePlacementTarget; since: number; baseline: number };
type Release = { action: 'confirm' | 'preview' | 'manual-aim' }
  | { action: 'short-press'; before: RemotePlacementTarget };

export class PlacementGesture {
  private held: Held | null = null;

  constructor(private readonly tilt: TiltAim) {}

  /** Indique qu'un contact prépare un brouillon qu'il peut encore annuler. */
  get active(): boolean { return !!this.held; }

  /** Fixe le repère du tracé ou le point de départ du tir. */
  begin(point: Vec2, before: RemotePlacementTarget, params: GameParams): void {
    this.held = { start: point, before, since: performance.now(), baseline: aimBearing(point, params) };
    if (before.kind === 'slingshot') this.tilt.begin();
  }

  /** Construit l'aperçu courant à partir du contact capturé. */
  project(point: Vec2, params: GameParams): RemotePlacementTarget | null {
    if (!this.held) return null;
    const { before, start, baseline } = this.held;
    if (before.kind === 'slingshot') return { ...before, pos: start, angle: baseline + (this.tilt.offset() ?? 0) };
    if (before.kind === 'tangible' && before.id !== 1) return { ...before, pos: point };
    const trace = tracedPlacement(start, point);
    const angle = trace.length < 12 ? before.angle : trace.angle;
    return before.kind === 'boost'
      ? { ...before, pos: trace.pos, angle, width: trace.length < 12 ? before.width : boostWidth(trace.length, params) }
      : { ...before, pos: trace.pos, angle };
  }

  /** Recalcule la direction du tir sans modifier son point de départ. */
  projectTilt(params: GameParams): RemotePlacementTarget | null {
    return this.held?.before.kind === 'slingshot' ? this.project(this.held.start, params) : null;
  }

  /** Un tracé se confirme au bouton, un pilier ou un tir maintenu au relâchement. */
  release(): Release {
    const held = this.held, aimed = held?.before.kind === 'slingshot' && this.tilt.offset() !== null;
    this.cancel();
    if (held?.before.kind === 'slingshot') {
      if (performance.now() - held.since < HOLD_MS) return { action: 'short-press', before: held.before };
      return { action: aimed ? 'confirm' : 'manual-aim' };
    }
    return { action: held?.before.kind === 'tangible' && held.before.id !== 1 ? 'confirm' : 'preview' };
  }

  /** Termine le geste et retourne le brouillon antérieur pour une annulation. */
  cancel(): RemotePlacementTarget | null {
    const before = this.held?.before ?? null;
    this.held = null;
    this.tilt.end();
    return before;
  }
}

/** Oriente par défaut le lance-pierre vers le centre de la carte. */
export function aimBearing(pos: Vec2, params: GameParams): number {
  return bearing(pos, { x: params.logicalWidth / 2, y: params.logicalHeight / 2 });
}
