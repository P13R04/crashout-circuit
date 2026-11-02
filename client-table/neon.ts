/**
 * Fournit les halos en cache, les plaques vectorielles et le bruit déterministe utilisés par les rendus.
 * Référencé notamment par client-table/CircuitMaterials.ts, client-table/CircuitTrack.ts,
 * client-table/F1Venue.ts.
 */
/** Centralise les couleurs de base utilisées par les primitives graphiques communes. */
export const NEON = {
  ice: '#a4e8f2', violet: '#9079ff', gold: '#ffce66', danger: '#ff647b', mint: '#61f4ba',
  road: '#131f35', void: '#030611', steel: '#33445e', white: '#e8fcff',
};
const lights = new Map<string, HTMLCanvasElement>();
/** Réutilise une texture lumineuse de la bonne couleur pour dessiner un halo. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha = 1, squash = 1): void {
  let light = lights.get(color);
  if (!light) {
    light = document.createElement('canvas'); light.width = light.height = 96;
    const c = light.getContext('2d')!;
    const g = c.createRadialGradient(48, 48, 0, 48, 48, 48);
    g.addColorStop(0, color + 'c0'); g.addColorStop(.18, color + '6a'); g.addColorStop(.5, color + '1c'); g.addColorStop(1, color + '00');
    c.fillStyle = g; c.fillRect(0, 0, 96, 96);
    lights.set(color, light);
  }
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.drawImage(light, x - radius, y - radius * squash, radius * 2, radius * 2 * squash); ctx.restore();
}
/** Dessine une plaque remplie et éventuellement bordée dans le décor ou l’interface. */
export function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, fill: string | CanvasGradient, stroke?: string): void {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
/** Produit une variation déterministe à partir d’une graine pour garder les textures stables. */
export function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
