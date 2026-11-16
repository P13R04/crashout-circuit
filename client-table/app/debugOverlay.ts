/**
 * Surcouche de diagnostic : mesures de rendu, décisions de reconnaissance et téléchargement du journal.
 * Liens : client-table/gesture/GestureLog.ts, client-table/view.ts.
 * Appelé par client-table/main.ts dans l'ordre d'origine de l'initialisation de la table.
 */
import { formatGestureEntry, gestureLogCsv } from '../gesture/GestureLog.js';
import type { View } from '../view.js';
import { LOGICAL_W } from './tableApp.js';
import type { TableApp } from './tableApp.js';

/** Affiche les mesures et les dernières décisions de reconnaissance lorsque le diagnostic est autorisé. */
export function drawDebug({ ctx, canvas, view }: TableApp): void {
  const d = view.debug;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(LOGICAL_W / 2 - 375, 4, 750, 30);
  ctx.fillStyle = d.fps >= 55 ? '#3ddc84' : '#ffb020';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${d.fps.toFixed(0)} fps · rendu ${canvas.dataset.renderMedianMs ?? '…'} ms · RTT ${d.rtt} ms · touch→frame ${d.touchMs.toFixed(0)} ms · ${d.contacts} pts`,
    LOGICAL_W / 2, 25,
  );
  // Latest touch decisions (issue #38): which finger became the pouch, widths, cancelled shots
  const lines = d.gestures.slice(-8);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(LOGICAL_W / 2 - 375, 36, 750, 4 + lines.length * 16);
  ctx.fillStyle = '#cfd8e3';
  ctx.textAlign = 'left';
  /** Affiche les dernières entrées de journal dans la surcouche de diagnostic. */
  lines.forEach((entry, i) => ctx.fillText(formatGestureEntry(entry).slice(0, 110), LOGICAL_W / 2 - 368, 50 + i * 16));
  ctx.restore();
}

/** Télécharge le journal des contacts et des décisions de la session de test. */
export function downloadGestureLog(view: View): void {
  try {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([gestureLogCsv(view.debug.gestures)], { type: 'text/csv' }));
    link.download = `session-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch { /* Downloads can be blocked; the overlay still shows the latest lines. */ }
}
