/** Sépare les connexions publiques de lecture des commandes locales de la table et d’Oz. */
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type SocketRole = 'table' | 'oz' | 'player';

export function socketRole(path: string): SocketRole | null {
  switch (path.replace(/\/$/, '')) {
    case '/ws':
    case '/ws/table': return 'table';
    case '/ws/oz': return 'oz';
    case '/ws/player': return 'player';
    default: return null;
  }
}

export class HostAccess {
  private readonly key = randomBytes(24).toString('hex');
  private readonly cookieName = 'crashout-host-' + this.key.slice(0, 10);

  private on: boolean;
  constructor(enabled: boolean, private readonly directHost?: (req: IncomingMessage) => boolean) { this.on = enabled; }
  get enabled(): boolean { return this.on; }
  set(on: boolean): void { this.on = on; }
  cookie(secure: boolean): string {
    return this.cookieName + '=' + this.key + '; Path=/; HttpOnly; SameSite=Strict' + (secure ? '; Secure' : '');
  }

  url(base: string, path = '/', required = this.enabled): string {
    return required ? base + path + '?host=' + this.key : base + path;
  }

  allow(req: IncomingMessage): boolean {
    return !this.enabled || this.allowPrivate(req);
  }

  allowPrivate(req: IncomingMessage): boolean {
    return this.directHost?.(req) === true || req.headers.cookie?.split(';').some(item => item.trim() === this.cookieName + '=' + this.key) === true;
  }

  /** Initialise un accès hôte à partir du lien privé, puis retire la clé de l’adresse. */
  authorize(req: IncomingMessage, res: ServerResponse, url: URL, secure: boolean, required = this.enabled): boolean {
    if (required && url.searchParams.get('host') === this.key) {
      url.searchParams.delete('host');
      res.writeHead(303, {
        Location: url.pathname + url.search,
        'Set-Cookie': this.cookieName + '=' + this.key + '; Path=/; HttpOnly; SameSite=Strict' + (secure ? '; Secure' : ''),
        'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      }).end();
      return false;
    }
    if (!required || this.allowPrivate(req)) return true;
    res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Accès hôte · Crashout Circuit</title><body style="font:1rem system-ui;max-width:34rem;margin:3rem auto;padding:1rem">
<h1>Accès hôte</h1><p>Sur l’ordinateur qui héberge la session locale, ouvre l’adresse localhost annoncée dans Terminal.
Sur un autre appareil, ouvre le lien privé fourni par l’hôte.</p>
<p>Pour rejoindre l’équipe depuis un téléphone, ouvre <a href="/play">la page des joueurs</a>.</p></body></html>`);
    return false;
  }
}
