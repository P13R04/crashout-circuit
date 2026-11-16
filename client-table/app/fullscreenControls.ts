/**
 * Plein écran, touche Échap et visibilité de la page : relâchement des entrées et retour des sons.
 * Liens : client-table/index.html, client-table/sound/Sound.ts.
 * Appelé par client-table/main.ts dans l'ordre d'origine de l'initialisation de la table.
 */
import { tableAudio } from '../sound/Sound.js';
import type { TableApp } from './tableApp.js';

/** Branche le plein écran, la touche Échap et la gestion de la page cachée. */
export function setupFullscreenControls(app: TableApp, keyboard: { releaseKeyboard: () => void }): void {
  const { gestures, pcTools } = app;
  // Fullscreen is local to this screen; native Escape exits it without pausing the session.
  const fullscreen = document.getElementById('fullscreen') as HTMLButtonElement;
  const fullscreenNotice = document.getElementById('fullscreen-notice')!;
  /** Relâche les gestes et les touches lors d’un changement de taille ou de plein écran. */
  function releaseInputs(): void {
    gestures.releaseAll(); keyboard.releaseKeyboard();
  }
  /** Actualise le bouton de plein écran et annule les entrées devenues imprécises après le redimensionnement. */
  function syncFullscreen(): void {
    const active = !!document.fullscreenElement;
    fullscreen.setAttribute('aria-pressed', String(active));
    fullscreen.querySelector('span')!.textContent = active ? 'Quitter le plein écran' : 'Plein écran';
    releaseInputs();
  }
  /** Bascule le plein écran et conserve un message lisible si le navigateur le refuse. */
  fullscreen.addEventListener('click', async () => {
    fullscreenNotice.hidden = true;
    releaseInputs();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      pcTools.open = false;
    } catch {
      fullscreenNotice.textContent = 'Plein écran indisponible dans ce navigateur.';
      fullscreenNotice.hidden = false;
    }
  });
  document.addEventListener('fullscreenchange', syncFullscreen);
  /** Ferme les paramètres et sort du plein écran sur Échap sans mettre la course en pause. */
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    pcTools.open = false;
    if (document.fullscreenElement) void document.exitFullscreen().catch(/* Ignore un refus de sortie lorsque le navigateur a déjà quitté le plein écran lui-même. */ () => { /* Native Escape may already have exited. */ });
    // Keep the browser's default Escape behaviour and reserve Space for the game pause.
  }, true);

  /** Coupe les sons et relâche les gestes lorsque la page devient cachée. */
  document.addEventListener('visibilitychange', () => { tableAudio.focus(!document.hidden); if (document.hidden) gestures.releaseAll(); });
}
