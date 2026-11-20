/** Relie les parcours d’essai au salon que le serveur héberge actuellement. */
import { readSession } from '../client-shared/sessionInfo.js';

const status = document.querySelector<HTMLElement>('#test-status')!;
void readSession().then(session => {
  const { room } = session;
  const paths = { 'try-phone': '/play?room=' + room,
    'try-pc': '/play?room=' + room + '&keyboard=1',
    'try-watch': session.spectators ? '/watch?room=' + room : null };
  for (const [id, path] of Object.entries(paths)) {
    if (!path) continue;
    const link = document.querySelector<HTMLAnchorElement>('#' + id)!;
    link.href = path;
    link.hidden = false;
  }
  status.textContent = 'Une place pilote. Tu peux regarder la même course sur un deuxième écran.';
}).catch(() => { status.textContent = 'Le serveur de test est injoignable.'; });
