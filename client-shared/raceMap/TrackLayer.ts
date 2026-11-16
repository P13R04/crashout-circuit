/** Met en cache la piste vue du dessus, y compris les croisements et le damier. */
import type { RaceViewState } from '../../server/protocol/raceView.js';
import type { TrackGeometry, Vec2 } from '../../server/types.js';
import { LOGICAL_H, LOGICAL_W } from '../../server/layout.js';
import { visibleTrackEdges } from '../trackVisibility.js';

export type MapColors = { ground: string; road: string; edge: string };
export const MAP_COLORS: MapColors = { ground: '#17242c', road: '#455460', edge: '#dee7ec' };

export class TrackLayer {
  private readonly layer = document.createElement('canvas');
  private version = -1;
  private colors: MapColors | null = null;

  /** Retourne le calque en le redessinant seulement si la géométrie ou le style a changé. */
  get(state: RaceViewState, colors = MAP_COLORS): HTMLCanvasElement {
    if (this.version === state.trackVersion && this.colors === colors) return this.layer;
    this.version = state.trackVersion;
    this.colors = colors;
    this.layer.width = LOGICAL_W;
    this.layer.height = LOGICAL_H;
    const ctx = this.layer.getContext('2d')!;
    if (state.track) paintTrack(ctx, state.track, colors);
    return this.layer;
  }
}

/** Remplit les bandes de chaussée puis trace leurs seules bordures visibles. */
function paintTrack(ctx: CanvasRenderingContext2D, track: TrackGeometry, colors: MapColors): void {
  const { outerEdge, innerEdge, startLine, widths, featureIndices } = track;
  const edges = [outerEdge, innerEdge];
  const visible = visibleTrackEdges(track);
  ctx.fillStyle = colors.road;
  ctx.strokeStyle = colors.road;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < outerEdge.length; i++) {
    const next = (i + 1) % outerEdge.length;
    trace(ctx, [outerEdge[i], outerEdge[next], innerEdge[next], innerEdge[i]]);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (const [side, edge] of edges.entries()) {
    for (let i = 0; i < edge.length; i++) {
      const next = (i + 1) % edge.length;
      if (visible[side][i] && visible[side][next]) trace(ctx, [edge[i], edge[next]]);
    }
  }
  ctx.stroke();
  ctx.save();
  ctx.translate(startLine.pos.x, startLine.pos.y);
  ctx.rotate(Math.atan2(startLine.normal.y, startLine.normal.x));
  const cell = widths[featureIndices.start] / 16;
  for (let i = 0; i < 16; i++) {
    for (let r = 0; r < 2; r++) {
      ctx.fillStyle = (i + r) % 2 ? '#101821' : '#fff';
      ctx.fillRect((i - 8) * cell, (r - 1) * cell, cell + .3, cell + .3);
    }
  }
  ctx.restore();
}

/** Ajoute les points d'une forme au chemin actif. */
function trace(ctx: CanvasRenderingContext2D, [first, ...rest]: Vec2[]): void {
  ctx.moveTo(first.x, first.y);
  for (const point of rest) ctx.lineTo(point.x, point.y);
}
