/**
 * Ouvre le panneau de la télécommande Wii dans une autre fenêtre, sans quitter la table.
 * Liens : client-table/gesture/contactRelease.ts, client-wiimote/main.ts, server/index.ts (route /wiimote).
 * Appelé à la levée du doigt : le navigateur n'autorise une fenêtre qu'après un geste complet.
 */
const WINDOW_NAME = 'crashout-wiimote';

/** Ouvre ou réutilise la fenêtre du panneau Wii ; renvoie faux si le navigateur l'a bloquée. */
export function openWiimotePanel(): boolean {
  return window.open(new URL('/wiimote', location.href).toString(), WINDOW_NAME) !== null;
}
