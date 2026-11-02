/**
 * Enregistre les contacts et les décisions de reconnaissance puis les exporte pour les essais tactiles.
 * Le journal de view.debug.gestures inclut aussi les retours serveur et changements de phase ;
 * en développement, ?debug=1 l’affiche, F4 le télécharge et ?log=1 l’exporte en fin de partie.
 * Référencé par client-table/GestureRecognizer.ts, client-table/main.ts, client-table/view.ts.
 */
/** Conserve le temps, la catégorie et les mesures d’une décision de reconnaissance. */
export interface GestureLogEntry {
  /** Seconds since the page loaded. */
  t: number;
  kind: string;
  detail: Record<string, number | string | boolean>;
}

export const GESTURE_LOG_MAX = 2000;

/** Ajoute une entrée horodatée au journal des gestes en limitant sa taille. */
export function recordGesture(
  log: GestureLogEntry[], kind: string, detail: GestureLogEntry['detail'], now = performance.now(),
): void {
  log.push({ t: Math.round(now) / 1000, kind, detail });
  if (log.length > GESTURE_LOG_MAX) log.splice(0, log.length - GESTURE_LOG_MAX);
}

/** Arrondit les mesures numériques du journal pour les rendre lisibles. */
const round = (v: number | string | boolean) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

/** Transforme une entrée de journal en ligne courte pour l’affichage de diagnostic. */
export function formatGestureEntry(entry: GestureLogEntry): string {
  const fields = Object.entries(entry.detail).map(/* Formate chaque mesure du journal avec son nom et sa valeur arrondie. */ ([k, v]) => `${k}=${round(v)}`).join(' ');
  return `${entry.t.toFixed(3)} ${entry.kind} ${fields}`.trim();
}

/** Encode les contacts et décisions du journal dans un fichier CSV. */
export function gestureLogCsv(log: readonly GestureLogEntry[]): string {
  /** Protège les guillemets d’une valeur avant son insertion dans le CSV. */
  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ['t,kind,detail', ...log.map(/* Encode une ligne horodatée du journal en protégeant son objet de détails. */ e => `${e.t},${e.kind},${cell(JSON.stringify(e.detail))}`)].join('\n');
}
