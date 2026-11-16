/**
 * Configure le transport HTTP(S) et construit les adresses de connexion de la séance.
 * Liens : server/index.ts, README.md.
 */
import { readFileSync } from 'node:fs';
import { createServer as createHttpServer, type RequestListener } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';

/** Ouvre le transport configuré et valide les réglages fournis au démarrage. */
export function createSessionHttp(handler: RequestListener, env = process.env) {
  const { CRASHOUT_TLS_KEY: keyPath, CRASHOUT_TLS_CERT: certPath, CRASHOUT_PUBLIC_URL: publicAddress } = env;
  if ((keyPath !== undefined) !== (certPath !== undefined)) {
    throw new Error('CRASHOUT_TLS_KEY et CRASHOUT_TLS_CERT doivent être définies ensemble.');
  }
  const publicUrl = publicAddress === undefined ? null : parsePublicUrl(publicAddress);
  if (keyPath === undefined || certPath === undefined) {
    return { server: createHttpServer(handler), protocol: 'http' as const, publicUrl };
  }
  try {
    const key = readFileSync(keyPath);
    const cert = readFileSync(certPath);
    return { server: createHttpsServer({ key, cert }, handler), protocol: 'https' as const, publicUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Impossible de charger CRASHOUT_TLS_KEY / CRASHOUT_TLS_CERT : ${message}`);
  }
}

/** Valide une origine HTTP(S) adaptée aux routes de l'application et à ses WebSocket. */
function parsePublicUrl(address: string): URL {
  const message = 'CRASHOUT_PUBLIC_URL doit être une origine HTTP ou HTTPS, sans chemin ni identifiants.';
  const url = URL.canParse(address) ? new URL(address) : null;
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.pathname !== '/'
    || url.username || url.password || url.search || url.hash) throw new Error(message);
  return url;
}

/** Prépare les adresses annoncées au démarrage et renvoyées aux interfaces. */
export function sessionAddresses(port: number, protocol: 'http' | 'https', publicUrl: URL | null) {
  const local = Object.values(networkInterfaces()).flat().flatMap(iface =>
    iface?.family === 'IPv4' && !iface.internal ? [`${protocol}://${iface.address}:${port}`] : []);
  const baseUrls = [...new Set(publicUrl ? [publicUrl.origin, ...local] : local)];
  return {
    baseUrls,
    ozUrls: baseUrls.map(base => `${base}/oz`),
    secure: protocol === 'https' || publicUrl?.protocol === 'https:',
  };
}
