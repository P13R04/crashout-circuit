/** Sert le même salon sur le réseau local, en HTTP et en HTTPS pour le gyroscope. */
import { createServer as createHttpsServer } from 'node:https';
import type { IncomingMessage, RequestListener } from 'node:http';
import { networkInterfaces } from 'node:os';
import { lanAddresses } from '../networkAddresses.js';
import type { AddressInfo } from 'node:net';
import { localAuthority, signLocalCertificate } from './localCertificates.js';

export function isLoopback(req: IncomingMessage): boolean {
  const ip = req.socket.remoteAddress;
  // Une origine publique peut être relayée via localhost. Seul le lien localhost de l’hôte est direct.
  const browserHost = req.headers.host ?? '';
  const origin = req.headers.origin;
  const scheme = 'encrypted' in req.socket && req.socket.encrypted === true ? 'https' : 'http';
  if (origin && origin !== `${scheme}://${browserHost}`) return false;
  const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(browserHost);
  return localHost && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1');
}

export function localIPv4(interfaces = networkInterfaces()): string[] {
  return lanAddresses(interfaces);
}

export function createLocalNetwork(handler: RequestListener, scan = localIPv4) {
  const authority = localAuthority(process.env.CRASHOUT_LOCAL_CA_DIR);
  let signed = scan();
  let signedAt = Date.now();
  let failure = false;
  const https = createHttpsServer(signLocalCertificate(authority, signed), handler);

  function refresh(): void {
    const addresses = scan();
    if ([...addresses].sort().join(',') === [...signed].sort().join(',') && Date.now() - signedAt < 86_400_000) return;
    try {
      https.setSecureContext(signLocalCertificate(authority, addresses));
      signed = addresses;
      signedAt = Date.now();
      failure = false;
    } catch (error) {
      if (!failure) console.error('[Crashout] Certificat local indisponible. Le lien HTTP reste utilisable.', error);
      failure = true;
    }
  }

  const timer = setInterval(refresh, 2500);
  timer.unref();
  https.once('close', () => clearInterval(timer));

  return {
    https,
    certificate: authority.certificate,
    refresh,
    addresses(port: number) {
      const addresses = scan();
      const baseUrls = addresses.map(ip => `http://${ip}:${port}`);
      const tlsPort = (https.address() as AddressInfo | null)?.port;
      const secureBaseUrls = tlsPort ? addresses.filter(ip => signed.includes(ip)).map(ip => `https://${ip}:${tlsPort}`) : [];
      return { baseUrls, ozUrls: baseUrls.map(base => base + '/oz'), secureBaseUrls, secure: false, localNetwork: true };
    },
  };
}
