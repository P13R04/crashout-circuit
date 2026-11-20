/**
 * Adaptateur clavier de développement : direction, pédale, POWER et réparation des deux équipes.
 * Liens : client-shared/controls.ts, README.md (tableau des commandes clavier).
 * Appelé par client-table/main.ts dans l'ordre d'origine de l'initialisation de la table.
 */
import type { TableApp } from './tableApp.js';
import { downloadGestureLog } from './debugOverlay.js';

/** Branche le clavier sur les mêmes commandes que la table tactile et renvoie le relâchement des touches. */
export function setupKeyboardControls(app: TableApp): { releaseKeyboard: () => void } {
  const { view, conn, sendTable, controls } = app;
  // Desktop local multiplayer adapter. It mirrors the table controls without
  // leaking keyboard rules into the game engine: Q/D and ←/→ are the two
  // extremes of the same continuous steering input; cars keep moving.
  const down = new Set<string>();
  const repairHeld: Record<'A' | 'B', boolean> = { A: false, B: false };
  /** Normalise les lettres du clavier sans changer les noms des touches spéciales. */
  const keyName = (e: KeyboardEvent) => e.key.length === 1 ? e.key.toLowerCase() : e.key;
  /** Convertit les touches maintenues en commande de conduite pour l’équipe concernée. */
  function sendSteer(team: 'A' | 'B'): void {
    const steer = team === 'A'
      ? (down.has('q') ? -1 : down.has('d') ? 1 : 0)
      : (down.has('ArrowLeft') ? -1 : down.has('ArrowRight') ? 1 : 0);
    const isPedal = view.state?.driveMode[team] === 'pedal';
    const throttle = isPedal
      ? (team === 'A' ? Number(down.has('z')) : Number(down.has('ArrowUp')))
      : 1;
    controls.steer(team, steer, throttle);
  }
  // Match the touch-control heartbeat while a steering key is held. Do not emit
  // neutral keyboard frames otherwise: table and desktop controls share the same
  // protocol and must not overwrite one another.
  /** Renouvelle les commandes clavier maintenues avec la même cadence que le pilotage tactile. */
  window.setInterval(() => {
    if (down.has('q') || down.has('d') || down.has('z')) sendSteer('A');
    if (down.has('ArrowLeft') || down.has('ArrowRight') || down.has('ArrowUp')) sendSteer('B');
  }, 100);
  /** Transforme l’appui simultané des deux touches de partenaires en maintien des pads de réparation. */
  function updateKeyboardRepair(team: 'A' | 'B'): void {
    const active = team === 'A' ? down.has('a') && down.has('p') : down.has('m') && down.has('c');
    if (active === repairHeld[team]) return;
    repairHeld[team] = active;
    conn.send({ type: 'PadHold', team, role: 'pilot', on: active });
    conn.send({ type: 'PadHold', team, role: 'copilot', on: active });
  }
  /** Traduit les touches de jeu en commandes sans détourner la saisie des champs de paramètres. */
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.closest('button, summary, input, textarea, select, a')) return;
    const key = keyName(e);
    if (view.state?.developerTools && key === 'F3' && !e.repeat && !down.has('F3')) view.debug.on = !view.debug.on;
    if (view.state?.developerTools && key === 'F4' && !e.repeat && !down.has('F4')) { e.preventDefault(); downloadGestureLog(view); }
    if (down.has(key)) return;
    down.add(key);
    if (key === 'q' || key === 'd') sendSteer('A');
    if (key === 'ArrowLeft' || key === 'ArrowRight') { e.preventDefault(); sendSteer('B'); }
    if (key === 'z') sendSteer('A');
    if (key === 'ArrowUp') { e.preventDefault(); sendSteer('B'); }
    if (key === ' ') { e.preventDefault(); sendTable({ type: 'Pause' }); }
    if (key === 'a' || key === 'p') updateKeyboardRepair('A');
    if (key === 'm' || key === 'c') updateKeyboardRepair('B');
    // A/M alone press the copilot's POWER button. Waiting briefly lets the
    // A+P / M+C repair chord win when the two players press in rhythm.
    if ((key === 'a' || key === 'm') && !e.repeat) {
      const team: 'A' | 'B' = key === 'a' ? 'A' : 'B';
      /** Attend brièvement le second partenaire pour distinguer POWER de la combinaison de réparation. */
      window.setTimeout(() => {
        const combo = team === 'A' ? down.has('a') && down.has('p') : down.has('m') && down.has('c');
        if (!combo && down.has(key)) controls.power(team);
      }, 120);
    }
  });
  /** Relâche la direction, la pédale ou le pad correspondant à la touche levée. */
  window.addEventListener('keyup', (e) => {
    const key = keyName(e);
    down.delete(key);
    if (key === 'q' || key === 'd') sendSteer('A');
    if (key === 'ArrowLeft' || key === 'ArrowRight') { e.preventDefault(); sendSteer('B'); }
    if (key === 'z') sendSteer('A');
    if (key === 'ArrowUp') { e.preventDefault(); sendSteer('B'); }
    if (key === 'a' || key === 'p') updateKeyboardRepair('A');
    if (key === 'm' || key === 'c') updateKeyboardRepair('B');
  });
  /** Relâche les touches maintenues et renvoie des commandes neutres. */
  function releaseKeyboard(): void {
    down.clear();
    sendSteer('A'); sendSteer('B'); updateKeyboardRepair('A'); updateKeyboardRepair('B');
  }
  return { releaseKeyboard };
}
