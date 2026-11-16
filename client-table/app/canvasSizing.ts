/**
 * Dimensionnement du canvas : résolution, position de l’engrenage des paramètres et réaction au redimensionnement.
 * Liens : client-table/index.html, server/layout.ts.
 * Appelé par client-table/main.ts dans l'ordre d'origine de l'initialisation de la table.
 */
import { SETTINGS_BUTTON } from '../../server/layout.js';
import { LOGICAL_W, LOGICAL_H } from './tableApp.js';

/** Ajuste le canvas à la fenêtre puis le maintient à jour à chaque redimensionnement. */
export function setupCanvasSizing(canvas: HTMLCanvasElement): void {
  /** Ajuste la résolution du canvas et la position des paramètres à la taille réelle de la fenêtre. */
  function resizeCanvas(): void {
    const fit = Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H);
    const resolution = Math.min(2, fit * Math.min(window.devicePixelRatio ?? 1, 2));
    canvas.width = Math.round(LOGICAL_W * resolution);
    canvas.height = Math.round(LOGICAL_H * resolution);
    canvas.style.width = `${LOGICAL_W * fit}px`;
    canvas.style.height = `${LOGICAL_H * fit}px`;
    const left = (window.innerWidth - LOGICAL_W * fit) / 2;
    const top = (window.innerHeight - LOGICAL_H * fit) / 2;
    document.documentElement.style.setProperty('--tools-x', `${left + SETTINGS_BUTTON.x * fit}px`);
    document.documentElement.style.setProperty('--tools-y', `${top + SETTINGS_BUTTON.y * fit}px`);
    document.documentElement.style.setProperty('--tools-w', `${SETTINGS_BUTTON.w * fit}px`);
    document.documentElement.style.setProperty('--tools-h', `${SETTINGS_BUTTON.h * fit}px`);
    document.documentElement.style.setProperty('--tools-scale', `${fit}`);
    document.documentElement.style.setProperty('--tools-bottom', `${top + 8}px`);
    document.documentElement.style.setProperty('--table-top', `${top + 18}px`);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}
