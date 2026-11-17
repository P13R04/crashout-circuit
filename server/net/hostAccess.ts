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
  private readonly cookie = 'crashout-host-' + this.key.slice(0, 10);

  constructor(readonly enabled: boolean) {}

  url(base: string, path = '/', required = this.enabled): string {
    return required ? base + path + '?host=' + this.key : base + path;
  }

  allow(req: IncomingMessage): boolean {
    return !this.enabled || this.allowPrivate(req);
  }

  allowPrivate(req: IncomingMessage): boolean {
    return req.headers.cookie?.split(';').some(item => item.trim() === this.cookie + '=' + this.key) === true;
  }

  /** Initialise un accès hôte à partir du lien privé, puis retire la clé de l’adresse. */
  authorize(req: IncomingMessage, res: ServerResponse, url: URL, secure: boolean, required = this.enabled): boolean {
    if (required && url.searchParams.get('host') === this.key) {
      url.searchParams.delete('host');
      res.writeHead(303, {
        Location: url.pathname + url.search,
        'Set-Cookie': this.cookie + '=' + this.key + '; Path=/; HttpOnly; SameSite=Strict' + (secure ? '; Secure' : ''),
        'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      }).end();
      return false;
    }
    if (!required || this.allowPrivate(req)) return true;
    res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Ouvre le lien privé de la table affiché dans Terminal.');
    return false;
  }
}
