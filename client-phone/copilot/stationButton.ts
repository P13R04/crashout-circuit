/**
 * Adapte les dessins Canvas de la table aux boutons natifs du téléphone.
 * Liens : CopilotScreen.ts, client-shared/ui/stationControls.ts.
 */
import type { ControlDisc } from '../../client-shared/ui/stationControls.js';

/** Installe une face vectorielle tout en conservant le libellé accessible du bouton. */
export function stationButton(button: HTMLButtonElement, radius: number) {
  button.setAttribute('aria-label', button.textContent ?? '');
  button.textContent = '';
  button.classList.add('station-button');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const center = radius + 3;
  const size = 2 * center;
  const scale = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(size * scale);
  const ctx = canvas.getContext('2d');
  ctx?.scale(canvas.width / size, canvas.height / size);
  button.append(canvas);
  return (draw: (ctx: CanvasRenderingContext2D, disc: ControlDisc) => void): void => {
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    draw(ctx, { x: center, y: center, r: radius });
  };
}
