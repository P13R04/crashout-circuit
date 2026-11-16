/**
 * Contexte de dessin partagé par les sections de la carte Oz : canvas, état, transformation de vue et libellés.
 * Liens : client-oz/ozView.ts, client-shared/trackVisibility.ts, server/layout.ts.
 * Construit par draw() dans client-oz/map/ozDraw.ts.
 */
import type { GameState } from '../../server/types.js';
import type { viewTransform } from '../ozView.js';
import type { OzMap } from '../OzMap.js';

/** Regroupe ce que chaque section de dessin lit : la carte, le contexte canvas et la vue en cours. */
export interface DrawContext {
  ozMap: OzMap;
  ctx: CanvasRenderingContext2D;
  s: GameState;
  W: number;
  H: number;
  transform: ReturnType<typeof viewTransform>;
  unit: number;
  textAt: (text: string, x: number, y: number, size: number, color: string, offsetY?: number) => void;
  arcRange: number;
}
