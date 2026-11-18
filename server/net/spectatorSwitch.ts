/**
 * Ouvre ou ferme la séance aux spectateurs depuis les paramètres de la table, sans relancer le serveur.
 * Liens : server/index.ts (route /api/spectators), server/net/hostAccess.ts, server/net/SpectatorStream.ts.
 * Ouvrir les spectateurs protège aussi la table et Oz (lien privé de l'hôte) : seule la machine du serveur peut donc le demander.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import type { HostAccess } from './hostAccess.js';
import type { SpectatorStream } from './SpectatorStream.js';

export interface SpectatorSwitchDeps {
  hostAccess: HostAccess;
  spectators: SpectatorStream;
  secure: boolean;
  /** Prévenu après un changement, par exemple pour afficher le nouveau lien privé d'Oz. */
  onChange: (enabled: boolean) => void;
}

/** Retire le préfixe IPv4 d'une adresse IPv6 mappée. */
const plain = (address: string | undefined): string => (address ?? '').replace(/^::ffff:/, '');

/** Reconnaît une requête émise par la machine du serveur, par boucle locale ou par sa propre adresse réseau. */
export function fromServerMachine(req: IncomingMessage, interfaces = networkInterfaces()): boolean {
  const from = plain(req.socket.remoteAddress);
  if (from === '127.0.0.1' || from === '::1') return true;
  return Object.values(interfaces).some(list => list?.some(entry => entry.address === from));
}

/** Vérifie que la requête vient bien d'une page servie par ce serveur et non d'un autre site. */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  return URL.canParse(origin) && new URL(origin).host === req.headers.host;
}

/** Lit un petit corps JSON, ou `null` s'il est trop long ou invalide. */
function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1024) { resolve(null); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

/** Répond en JSON sans mise en cache. */
function reply(res: ServerResponse, status: number, body: object, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

/** Traite `POST /api/spectators` avec `{ "on": true | false }` et renvoie l'état obtenu. */
export async function handleSpectatorSwitch(req: IncomingMessage, res: ServerResponse, deps: SpectatorSwitchDeps): Promise<void> {
  const { hostAccess, spectators, secure } = deps;
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
  if (!sameOrigin(req) || !(req.headers['content-type'] ?? '').startsWith('application/json')) {
    reply(res, 400, { error: 'bad-request' });
    return;
  }
  // Déjà ouvert : le lien privé de l'hôte suffit. Sinon, seule la machine du serveur peut l'ouvrir.
  const allowed = hostAccess.enabled ? hostAccess.allow(req) : fromServerMachine(req);
  if (!allowed) { reply(res, 403, { error: 'host-only' }); return; }
  const body = await readJson(req) as { on?: unknown } | null;
  if (typeof body?.on !== 'boolean') { reply(res, 400, { error: 'bad-request' }); return; }
  const changed = body.on !== spectators.enabled;
  hostAccess.set(body.on);
  spectators.setEnabled(body.on);
  if (changed) deps.onChange(body.on);
  // La page de la table reçoit le cookie hôte : sans lui, elle serait refusée à sa prochaine connexion.
  reply(res, 200, { spectators: spectators.enabled }, body.on ? { 'Set-Cookie': hostAccess.cookie(secure) } : {});
}
