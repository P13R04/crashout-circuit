/**
 * Lance le serveur HTTP et WebSocket, sert les deux interfaces et affiche leurs adresses sur le réseau
 * local.
 * Liens : client-table/index.html, client-oz/index.html, server/net/GameServer.ts, server/net/audioHttp.ts,
 * server/config.ts.
 */
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import { readFileSync, statSync } from 'fs';
import { resolve, dirname, extname, sep } from 'path';
import { fileURLToPath } from 'url';
import { createSessionHttp, sessionAddresses } from './net/sessionHttp.js';
import { GameServer } from './net/GameServer.js';
import { audioByteRange } from './net/audioHttp.js';
import { handleSpectatorSwitch } from './net/spectatorSwitch.js';
import { adminRequest } from './net/local/adminHttp.js';
import { createLocalNetwork, isLoopback } from './net/local/localNetwork.js';
import { HostAccess, socketRole } from './net/hostAccess.js';
import { SpectatorStream } from './net/SpectatorStream.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── MIME types for static file serving ────────────────────────────────────────
/** Associe les extensions compilées à leur type de contenu HTTP. */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.ts':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.wav':  'audio/wav',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
};

const localMode = process.env.CRASHOUT_LOCAL_NETWORK === '1';
const hostAccess = new HostAccess(process.env.CRASHOUT_SPECTATORS === '1' || localMode, localMode ? isLoopback : undefined);
let localNetwork: ReturnType<typeof createLocalNetwork> | undefined;

const CLIENTS_ROOT = resolve(__dirname, '../../dist/clients');

/** Envoie un fichier compilé et prend en charge les plages de lecture des fichiers audio. */
function serveStatic(res: ServerResponse, filePath: string,range?:string): boolean {
  // Only regular files below dist/clients (no directories, no path traversal)
  if (!filePath.startsWith(CLIENTS_ROOT + sep)) return false;
  try { if (!statSync(filePath).isFile()) return false; } catch { return false; }
  const ext = extname(filePath);
  const mime = MIME[ext] ?? 'application/octet-stream';
  const content = readFileSync(filePath);
  if(mime.startsWith('audio/')){
    const headers={'Content-Type':mime,'Accept-Ranges':'bytes'};
    if(range){
      const part=audioByteRange(range,content.length);
      if(!part){res.writeHead(416,{...headers,'Content-Range':`bytes */${content.length}`});res.end();return true;}
      res.writeHead(206,{...headers,'Content-Length':part.end-part.start+1,'Content-Range':`bytes ${part.start}-${part.end}/${content.length}`});res.end(content.subarray(part.start,part.end+1));return true;
    }
    res.writeHead(200,{...headers,'Content-Length':content.length});res.end(content);return true;
  }
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': content.length,
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600' });
  res.end(content);
  return true;
}

// ── HTTP server ────────────────────────────────────────────────────────────────
/** Distribue les requêtes entre les API et les fichiers des interfaces compilées. */
const handleRequest: RequestListener = (req, res) => {
  if (!req.url?.startsWith('/') || req.url.startsWith('//')) { res.writeHead(400).end(); return; }
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/session') { sendSessionInfo(req, res); return; }

  if (url.pathname === '/certificat-local.cer' && localNetwork) {
    const certificate = localNetwork.certificate;
    res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Length': certificate.length,
      'Content-Disposition': 'attachment; filename="Crashout-Circuit-CA.cer"', 'Cache-Control': 'no-store' });
    res.end(certificate);
    return;
  }

  if (url.pathname === '/api/spectators') {
    void handleSpectatorSwitch(req, res, {
      hostAccess, spectators, secure: encrypted(req),
      onChange: announceSpectators,
    });
    return;
  }

  if (url.pathname === '/api/spectator') {
    spectators.connect(req, res, url.searchParams.get('room'));
    return;
  }

  // Full server-side journal of pylon events (task 15)
  if (url.pathname === '/api/oz-log') {
    if (!hostAccess.authorize(req, res, url, encrypted(req))) return;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(gameServer.rules.tangibleLog));
    return;
  }

  // Vite emits shared bundles under /assets/ for all three pages
  if (url.pathname.startsWith('/assets/')) {
    if (serveStatic(res, resolve(CLIENTS_ROOT, url.pathname.slice(1)),req.headers.range)) return;
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  if (url.pathname === '/api/admin') {
    if (!hostAccess.allowPrivate(req)) { res.writeHead(401).end(); return; }
    void adminRequest(req, res, gameServer);
    return;
  }

  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    if (!hostAccess.authorize(req, res, url, encrypted(req), true)) return;
    if (!serveStatic(res, resolve(CLIENTS_ROOT, 'client-admin/index.html'))) res.writeHead(404).end();
    return;
  }

  if (url.pathname === '/test' || url.pathname === '/test/') {
    const { soloTest, developerTools } = gameServer.getState();
    if (soloTest && developerTools && serveStatic(res, resolve(CLIENTS_ROOT, 'client-phone/test.html'))) return;
    res.writeHead(404).end();
    return;
  }

  if (url.pathname === '/watch' || url.pathname === '/watch/') {
    if (spectators.enabled && serveStatic(res, resolve(CLIENTS_ROOT, 'client-phone/spectator.html'))) return;
    res.writeHead(404).end();
    return;
  }

  servePage(req, res, url);
};

function sendSessionInfo(req: IncomingMessage, res: ServerResponse): void {
  const { port } = httpServer.address() as { port: number };
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  const { baseUrls, ...connection } = announcedAddresses(port);
  const direct = localMode && !isLoopback(req) ? baseUrls.find(base => req.headers.host?.split(':')[0] === new URL(base).hostname) : undefined;
  const origins = direct ? [direct, ...baseUrls.filter(base => base !== direct)] : baseUrls;
  res.end(JSON.stringify({ ...connection, baseUrls: origins, room: gameServer.room, spectators: spectators.enabled, viewers: spectators.count, viewerLimit: spectators.limit }));
}

function servePage(req: IncomingMessage, res: ServerResponse, url: URL): void {
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  const page = pathname === '/wiimote' ? 'client-wiimote' : pathname === '/' ? 'client-table' : pathname === '/play' ? 'client-phone' : pathname === '/oz' ? 'client-oz' : null;
  if (!page) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><h1>Page introuvable</h1><a href="/play">Rejoindre la partie</a>');
    return;
  }
  if (page !== 'client-phone' && page !== 'client-wiimote' && !hostAccess.authorize(req, res, url, encrypted(req))) return;
  if (serveStatic(res, resolve(CLIENTS_ROOT, page, 'index.html'))) return;
  res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('Interface indisponible. Reconstruisez le projet avec npm run build.');
}

// ── WebSocket server ───────────────────────────────────────────────────────────
let transport: ReturnType<typeof createSessionHttp>;
try {
  transport = createSessionHttp(handleRequest, localMode ? {} : process.env);
} catch (err) {
  console.error(`[Crashout] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
const { server: httpServer, protocol, publicUrl } = transport;
const wss = new WebSocketServer({ noServer: true, verifyClient: ({ req }: { req: IncomingMessage }) => {
  const role = socketRole(req.url?.split('?')[0] ?? '');
  return role === 'player' || (role !== null && hostAccess.allow(req));
} });
httpServer.on('upgrade', upgrade);
if (localMode) {
  try {
    localNetwork = createLocalNetwork(handleRequest);
    localNetwork.https.on('upgrade', upgrade);
    localNetwork.https.once('error', error => {
      console.error('[Crashout] HTTPS local indisponible. Le salon HTTP reste ouvert.', error);
      localNetwork?.https.close();
      localNetwork = undefined;
    });
    localNetwork.https.listen(Number(process.env.CRASHOUT_LOCAL_HTTPS_PORT ?? 3444));
  } catch (error) {
    console.error('[Crashout] HTTPS local indisponible. Le salon HTTP reste ouvert.', error);
  }
}

function upgrade(req: IncomingMessage, socket: Parameters<typeof wss.handleUpgrade>[1], head: Buffer): void {
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
}

function encrypted(req: IncomingMessage): boolean {
  return 'encrypted' in req.socket && req.socket.encrypted === true;
}

function announcedAddresses(port: number) {
  return localNetwork?.addresses(port) ?? {
    ...sessionAddresses(port, protocol, publicUrl), localNetwork: localMode, secureBaseUrls: [],
  };
}
const gameServer = new GameServer(wss, {
  developerTools: process.env.CRASHOUT_DEV_TOOLS === '1',
  soloTest: process.env.CRASHOUT_SOLO_TEST === '1',
});
gameServer.rules.setTangiblePlacementMode('touch');
const spectators = new SpectatorStream(hostAccess.enabled, () => gameServer.getState(), () => gameServer.room);

// Export for use by PhysicsLoop and other modules (added in later tasks)
export { gameServer };

/** Rappelle les accès privés lorsque les spectateurs sont ouverts depuis la table. */
function announceSpectators(enabled: boolean): void {
  const { port } = httpServer.address() as { port: number };
  if (!enabled) {
    console.log('   Spectateurs fermés : les accès joueurs restent disponibles.');
    return;
  }
  console.log('   Spectateurs ouverts : liens privés pour la table et Oz sur le réseau.');
  const base = announcedAddresses(port).baseUrls[0] ?? `${protocol}://localhost:${port}`;
  console.log(`   Table: ${hostAccess.url(base)}`);
  console.log(`   Oz:    ${hostAccess.url(base, '/oz')}`);
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

/** Affiche les adresses de connexion une fois le serveur effectivement lancé. */
httpServer.listen(PORT, () => {
  const { port } = httpServer.address() as { port: number };
  const { baseUrls, secure } = announcedAddresses(port);
  console.log('\n🏎  Crashout Circuit server running');
  const base = `${protocol}://localhost:${port}`;
  console.log(`   Administration (privé) : ${hostAccess.url(base, '/admin', !localMode)}`);
  console.log(`   Local:   ${hostAccess.url(base, '/', !localMode && hostAccess.enabled)}`);
  if (localMode) console.log(`   Oz (local) : ${base}/oz`);

  for (const baseUrl of baseUrls) {
    console.log(`   Network: ${baseUrl}`);
    console.log(`   Oz:      ${hostAccess.url(baseUrl, '/oz')}`);
    if (spectators.enabled) console.log(`   Spectateur: ${baseUrl}/watch?room=${gameServer.room}`);
    console.log(`   Joueurs: ${baseUrl}/play?room=${gameServer.room}`);
  }
  if (gameServer.getState().soloTest) console.log('   Essai pilote solo : scannez le QR sur la table.');
  if (gameServer.getState().soloTest && gameServer.getState().developerTools) {
    console.log(`   Menu des essais : ${protocol}://localhost:${port}/test`);
    console.log(`   Pilote PC : ${protocol}://localhost:${port}/play?room=${gameServer.room}&keyboard=1`);
  }
  if (localNetwork) console.log('   QR en HTTP. Le lien gyroscope et le certificat sont disponibles sur la page joueurs.');
  else if (!secure) console.log('   HTTP : capteurs iOS indisponibles. Utilisez une adresse HTTPS pour jouer au gyroscope.');
  console.log(`   Outils de test : ${gameServer.getState().developerTools?'activés':'désactivés'}`);
  console.log(`   Config:  lapsToWin=${config.lapsToWin}, physicsHz=${config.physicsHz}\n`);
});
