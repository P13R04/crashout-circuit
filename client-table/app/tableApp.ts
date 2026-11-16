/**
 * Contexte partagé de la table : objets créés au démarrage et lus par les modules d’initialisation.
 * Liens : client-table/main.ts, client-shared/net.ts, client-table/view.ts.
 * Appelé par client-table/main.ts dans l'ordre d'origine de l'initialisation de la table.
 */
import { StateSync, connectWs } from '../../client-shared/net.js';
import { createControls } from '../../client-shared/controls.js';
import type { View } from '../view.js';
import type { Renderer } from '../renderer/Renderer.js';
import type { GestureRecognizer } from '../gesture/GestureRecognizer.js';

/** Largeur logique de la table, en pixels de jeu. */
export const LOGICAL_W = 1920;
/** Hauteur logique de la table, en pixels de jeu. */
export const LOGICAL_H = 1080;

/** Regroupe les objets que chaque module d'initialisation de la table lit pour se brancher. */
export interface TableApp {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  view: View;
  sync: StateSync;
  renderer: Renderer;
  urlParams: URLSearchParams;
  conn: ReturnType<typeof connectWs>;
  sendTable: (m: { type: string } & Record<string, unknown>) => void;
  controls: ReturnType<typeof createControls>;
  gestures: GestureRecognizer;
  pcTools: HTMLDetailsElement;
}
