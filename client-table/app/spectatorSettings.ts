/**
 * Paramètres des spectateurs : ouvrir ou fermer la séance, QR code de la page /watch et nombre de spectateurs connectés.
 * Liens : client-table/index.html (#spectator-options), server/net/spectatorSwitch.ts, client-shared/sessionInfo.ts.
 * Appelé par client-table/main.ts ; `onChange` rafraîchit le QR de l'écran de préparation.
 */
import { readSession, type SessionInfo } from '../../client-shared/sessionInfo.js';
import { spectatorUrl } from '../setup/setupLinks.js';
import type { TableApp } from './tableApp.js';

const REFRESH_MS = 4000;

const NOTICE = {
  'host-only': 'Seul l’ordinateur du serveur peut ouvrir les spectateurs. Ouvrez la table depuis cette machine.',
  failed: 'Le serveur n’a pas répondu. Réessayez.',
} as const;

/** Branche le groupe « Spectateurs » du menu des paramètres. */
export function setupSpectatorSettings(app: TableApp, onChange: () => void): void {
  const toggle = document.getElementById('spectators-toggle') as HTMLButtonElement;
  const share = document.getElementById('spectators-share') as HTMLDivElement;
  const qr = document.getElementById('spectators-qr') as HTMLCanvasElement;
  const count = document.getElementById('spectators-count') as HTMLParagraphElement;
  const link = document.getElementById('spectators-link') as HTMLParagraphElement;
  const notice = document.getElementById('spectators-notice') as HTMLParagraphElement;
  let shownUrl = '';

  /** Affiche ou masque un message d'erreur sous le bouton. */
  function say(message: string | null): void {
    notice.hidden = message === null;
    notice.textContent = message ?? '';
  }

  /** Dessine le QR de la page des spectateurs, une seule fois par adresse. */
  async function drawQr(url: string): Promise<void> {
    if (url === shownUrl) return;
    shownUrl = url;
    const { toCanvas } = await import('qrcode');
    await toCanvas(qr, url, { margin: 2, width: 180, errorCorrectionLevel: 'M' });
  }

  /** Reporte l'état du serveur dans le bouton, le QR et le compteur. */
  function show(session: SessionInfo): void {
    const on = session.spectators === true;
    toggle.setAttribute('aria-pressed', String(on));
    toggle.textContent = on ? 'Fermer aux spectateurs' : 'Ajouter des spectateurs';
    share.hidden = !on || !session.baseUrls.length;
    if (share.hidden) { shownUrl = ''; return; }
    const url = spectatorUrl({ room: session.room, base: session.baseUrls[0] });
    link.textContent = url;
    count.textContent = `${session.viewers ?? 0} / ${session.viewerLimit ?? 8} spectateurs connectés`;
    void drawQr(url);
  }

  /** Relit l'état de la séance ; une coupure réseau laisse l'affichage tel quel. */
  async function refresh(): Promise<void> {
    try { show(await readSession()); } catch { /* La table gère déjà la reconnexion. */ }
  }

  /** Demande au serveur d'ouvrir ou de fermer les spectateurs. */
  async function switchTo(on: boolean): Promise<void> {
    say(null);
    toggle.disabled = true;
    try {
      const response = await fetch('/api/spectators', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }),
      });
      if (!response.ok) say(response.status === 403 ? NOTICE['host-only'] : NOTICE.failed);
    } catch {
      say(NOTICE.failed);
    }
    toggle.disabled = false;
    await refresh();
    onChange();
  }

  toggle.addEventListener('click', () => { void switchTo(toggle.getAttribute('aria-pressed') !== 'true'); });
  app.pcTools.addEventListener('toggle', () => { if (app.pcTools.open) void refresh(); });
  setInterval(() => { if (app.pcTools.open && toggle.getAttribute('aria-pressed') === 'true') void refresh(); }, REFRESH_MS);
  void refresh();
}
