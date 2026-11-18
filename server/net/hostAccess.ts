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

const COOKIE = 'crashout-host';

export class HostAccess {
  private readonly key = randomBytes(24).toString('hex');

  private on: boolean;

  constructor(enabled: boolean) { this.on = enabled; }

  /** Indique si la table et Oz exigent le lien privé de l'hôte, ce qui accompagne l'ouverture aux spectateurs. */
  get enabled(): boolean { return this.on; }

  /** Active ou coupe la protection ; la clé reste la même pendant toute la vie du serveur. */
  set(on: boolean): void { this.on = on; }

  /** Cookie qui prouve l'accès hôte ; renvoyé à la table quand elle active les spectateurs. */
  cookie(secure: boolean): string {
    return COOKIE + '=' + this.key + '; Path=/; HttpOnly; SameSite=Strict' + (secure ? '; Secure' : '');
  }

  url(base: string, path = '/'): string {
    return this.enabled ? base + path + '?host=' + this.key : base + path;
  }

  allow(req: IncomingMessage): boolean {
    return !this.enabled || req.headers.cookie?.split(';').some(item => item.trim() === COOKIE + '=' + this.key) === true;
  }

  /** Initialise un accès hôte à partir du lien privé, puis retire la clé de l’adresse. */
  authorize(req: IncomingMessage, res: ServerResponse, url: URL, secure: boolean): boolean {
    if (this.enabled && url.searchParams.get('host') === this.key) {
      url.searchParams.delete('host');
      res.writeHead(303, {
        Location: url.pathname + url.search,
        'Set-Cookie': this.cookie(secure),
        'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      }).end();
      return false;
    }
    if (this.allow(req)) return true;
    res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Ouvre le lien privé de la table affiché dans Terminal.');
    return false;
  }
}
