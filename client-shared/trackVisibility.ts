/**
 * Détermine les bordures visibles de la piste et masque celles qui traversent une autre branche aux
 * croisements.
 * Liens : server/types.ts.
 * Référencé par client-oz/OzMap.ts, client-table/CircuitTrack.ts, client-table/NeonTrack.ts.
 */
import type { TrackGeometry } from '../server/types.js';

/** Repère les portions de bordure à masquer lorsque deux branches du circuit se croisent. */
export function visibleTrackEdges(track: TrackGeometry): boolean[][] {
  const c = track.centerline, n = c.length, cum = [0];
  const cell = Math.max(64, ...track.widths.map(/* Extrait les demi-largeurs pour dimensionner les cellules de recherche. */ w => w / 2));
  const bins = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.floor(c[i].x / cell)},${Math.floor(c[i].y / cell)}`;
    const bucket = bins.get(k); if (bucket) bucket.push(i); else bins.set(k, [i]);
    const prev = c[(i - 1 + n) % n];
    if (i) cum.push(cum[i - 1] + Math.hypot(c[i].x - prev.x, c[i].y - prev.y));
  }
  const length = cum[n - 1] + Math.hypot(c[0].x - c[n - 1].x, c[0].y - c[n - 1].y);
  return [track.outerEdge, track.innerEdge].map(/* Construit le masque de visibilité de chacun des deux bords. */ edge => edge.map(/* Recherche les portions voisines qui pourraient recouvrir ce point de bordure. */ (p, k) => {
    const bx = Math.floor(p.x / cell), by = Math.floor(p.y / cell);
    for (let x = bx - 1; x <= bx + 1; x++) for (let y = by - 1; y <= by + 1; y++) {
      for (const m of bins.get(`${x},${y}`) ?? []) {
        const gap = Math.abs(cum[m] - cum[k]);
        if (Math.min(gap, length - gap) < 200) continue;
        const r = track.widths[m] / 2 - 1;
        if ((p.x - c[m].x) ** 2 + (p.y - c[m].y) ** 2 < r * r) return false;
      }
    }
    return true;
  }));
}
