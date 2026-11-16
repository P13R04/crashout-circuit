/**
 * Ajustement d'une ligne centrale à la surface de jeu : mise à l'échelle, lissage et construction.
 * Liens : server/layout.ts, server/trackGeneration/trackGeometry.ts.
 * Réexporté par server/MapGenerator.ts, qui reste la façade de la génération du circuit.
 */
import type { Vec2, TrackGeometry } from '../types.js';
import { PLAY_AREA } from '../layout.js';
import { makeLoop } from './strokeCleanup.js';
import { catmullRom } from './loopMerge.js';
import { computeGeometry } from './trackGeometry.js';
import { placeFeatures } from './trackFeatures.js';

/**
 * Replace et réduit si nécessaire le circuit pour le maintenir dans la surface de jeu.
 * La mise à l’échelle est uniforme et ne fait que réduire la boucle, ce qui conserve ses intersections.
 */
export function fitToPlayArea(pts: Vec2[]): Vec2[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (minX >= PLAY_AREA.x0 && maxX <= PLAY_AREA.x1 && minY >= PLAY_AREA.y0 && maxY <= PLAY_AREA.y1) return pts;
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const s = Math.min(1, (PLAY_AREA.x1 - PLAY_AREA.x0) / w, (PLAY_AREA.y1 - PLAY_AREA.y0) / h);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const nw = w * s, nh = h * s;
  const tx = Math.min(Math.max(cx, PLAY_AREA.x0 + nw / 2), PLAY_AREA.x1 - nw / 2);
  const ty = Math.min(Math.max(cy, PLAY_AREA.y0 + nh / 2), PLAY_AREA.y1 - nh / 2);
  return pts.map(/* Recentre et redimensionne chaque point dans la surface de jeu. */ p => ({ x: tx + (p.x - cx) * s, y: ty + (p.y - cy) * s }));
}

/**
 * Adoucit progressivement les angles d’une boucle sans en changer le nombre de points.
 * Le lissage laplacien de la boucle arrondit les raccords entre le dessin et son reflet avant un rééchantillonnage uniforme à 256 points.
 */
function relax(pts: Vec2[], iterations: number): Vec2[] {
  const n = pts.length;
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    cur = cur.map(/* Mélange un point avec ses voisins pour adoucir la boucle. */ (p, i) => {
      const a = cur[(i - 1 + n) % n];
      const b = cur[(i + 1) % n];
      return { x: 0.5 * p.x + 0.25 * (a.x + b.x), y: 0.5 * p.y + 0.25 * (a.y + b.y) };
    });
  }
  const closed = [...cur, cur[0]];
  return makeLoop(closed);
}

/**
 * Élargit la direction la plus étroite d’une boucle pour lui donner assez d’espace.
 * L’axe mineur est trouvé par analyse en composantes principales pour épaissir les boucles trop étroites.
 */
export function stretchMinorAxis(pts: Vec2[], factor: number): Vec2[] {
  const n = pts.length;
  const cx = pts.reduce(/* Additionne les abscisses pour calculer le centre du dessin. */ (a, p) => a + p.x, 0) / n;
  const cy = pts.reduce(/* Additionne les ordonnées pour calculer le centre du dessin. */ (a, p) => a + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    sxx += (p.x - cx) ** 2; syy += (p.y - cy) ** 2; sxy += (p.x - cx) * (p.y - cy);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy); // major axis angle
  const mx = Math.cos(theta), my = Math.sin(theta);
  return pts.map(/* Étire le point suivant l’axe le plus étroit tout en conservant son axe principal. */ p => {
    const dx = p.x - cx, dy = p.y - cy;
    const major = dx * mx + dy * my;
    const minor = -dx * my + dy * mx;
    const m2 = minor * factor;
    return { x: cx + major * mx - m2 * my, y: cy + major * my + m2 * mx };
  });
}

/** Lisse et ajuste une ligne centrale avant d’en accepter la géométrie. */
export function buildFromCenterline(raw: Vec2[], stretch = 1, preferredStart?: Vec2): TrackGeometry {
  let loop = relax(catmullRom(raw), 40);
  if (stretch !== 1) loop = stretchMinorAxis(loop, stretch);
  return placeFeatures(computeGeometry(fitToPlayArea(loop)), false, preferredStart);
}
