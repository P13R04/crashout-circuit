/**
 * Calculs vectoriels 2D et aire signée utilisés par la génération du circuit.
 * Liens : server/types.ts (Vec2).
 * Réexporté par server/MapGenerator.ts, qui reste la façade de la génération du circuit.
 */
import type { Vec2 } from '../types.js';

/** Mesure la distance entre deux points. */
export function dist(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Additionne les deux vecteurs pour construire une nouvelle position. */
export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Calcule le vecteur qui relie les deux points. */
export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Multiplie le vecteur par le facteur demandé. */
export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

/** Ramène le vecteur à une longueur unitaire en tolérant une longueur nulle. */
export function normalize(v: Vec2): Vec2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len < 1e-9) return { x: 1, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/** Interpole la position entre deux points selon la progression demandée. */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Tourne le vecteur d’un quart de tour pour obtenir sa normale. */
export function perpendicular(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

/** Additionne les longueurs des segments du tracé. */
export function strokeLength(pts: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
}

/** Mesure la position d’un point suivant l’axe de référence. */
export function projectOntoAxis(p: Vec2, origin: Vec2, dir: Vec2): number {
  const d = sub(p, origin);
  return d.x * dir.x + d.y * dir.y;
}

/** Construit le symétrique d’un point par rapport à la ligne des raccords. */
export function mirrorAboutLine(p: Vec2, p1: Vec2, p2: Vec2): Vec2 {
  const dir = normalize(sub(p2, p1));
  const d = sub(p, p1);
  const dot = d.x * dir.x + d.y * dir.y;
  const proj: Vec2 = { x: p1.x + dir.x * dot, y: p1.y + dir.y * dot };
  return { x: 2 * proj.x - p.x, y: 2 * proj.y - p.y };
}

/** Calcule l’aire orientée de la boucle pour reconnaître son sens de parcours. */
export function signedArea(pts: Vec2[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
}
