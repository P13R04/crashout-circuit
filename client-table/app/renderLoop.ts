/**
 * Boucle de rendu : horloge visuelle, mesures de performance, dessin de la scène et surcouche de diagnostic.
 * Liens : client-table/renderer/Renderer.ts, client-table/themes/VisualMotion.ts, client-table/sound/Sound.ts.
 * Appelé par client-table/main.ts dans l'ordre d'origine de l'initialisation de la table.
 */
import { tableAudio } from '../sound/Sound.js';
import { advanceVisualTime } from '../themes/VisualMotion.js';
import { LOGICAL_W } from './tableApp.js';
import type { TableApp } from './tableApp.js';
import { drawDebug } from './debugOverlay.js';

/** Démarre la boucle de rendu de la table. */
export function startRenderLoop(app: TableApp): void {
  const { canvas, ctx, view, renderer, gestures } = app;
  let lastFrame = performance.now();
  let fpsAcc = 0, fpsFrames = 0;
  const renderSamples: number[] = [];
  let metricsAt = 0;

  /** Actualise l’horloge visuelle, dessine la scène et collecte les mesures de rendu utiles au diagnostic. */
  function drawFrame(now: number): void {
    const frameMs = now - lastFrame;
    lastFrame = now;
    view.visualTime = advanceVisualTime(view.visualTime, frameMs, view.state?.phase === 'PAUSED');
    fpsAcc += frameMs; fpsFrames++;
    if (fpsAcc >= 500) { view.debug.fps = (fpsFrames * 1000) / fpsAcc; view.debug.frameMs = fpsAcc / fpsFrames; fpsAcc = 0; fpsFrames = 0; }

    // Finger → frame latency: the pad/stroke feedback of the latest touch is drawn in this frame
    if (gestures.lastDownTs) {
      view.debug.touchMs = performance.now() - gestures.lastDownTs;
      gestures.lastDownTs = 0;
    }

    // Smooth the HP bars towards the authoritative value
    if (view.state) {
      for (const t of ['A', 'B'] as const) {
        view.hpShown[t] += (view.state.cars[t].hp - view.hpShown[t]) * 0.15;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = canvas.width / LOGICAL_W;
    ctx.save();
    ctx.scale(dpr, dpr);
    const renderStart = performance.now();
    renderer.render(view);
    tableAudio.update(view,now);
    renderSamples.push(performance.now() - renderStart);
    if (renderSamples.length > 120) renderSamples.shift();
    if (now - metricsAt > 1000) {
      metricsAt = now;
      const sorted = [...renderSamples].sort(/* Trie les temps de rendu pour mesurer le percentile des frames lentes. */ (a, b) => a - b);
      canvas.dataset.renderMedianMs = sorted[Math.floor(sorted.length / 2)].toFixed(2);
      canvas.dataset.renderP95Ms = sorted[Math.floor((sorted.length - 1) * .95)].toFixed(2);
      canvas.dataset.fps = view.debug.fps.toFixed(1);
      canvas.dataset.trackBuilds = String(renderer.stats.trackBuilds);
      canvas.dataset.trailPoints = String(renderer.stats.trailPoints);
    }
    if (view.debug.on) drawDebug(app);
    ctx.restore();

    requestAnimationFrame(drawFrame);
  }

  requestAnimationFrame(drawFrame);
}
