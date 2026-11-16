/**
 * Lance le serveur HTTP et WebSocket, sert les deux interfaces et affiche leurs adresses sur le réseau
 * local.
 * Liens : client-table/index.html, client-oz/index.html, server/net/GameServer.ts, server/net/audioHttp.ts,
 * server/config.ts.
 */
import type { RequestListener, ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import { readFileSync, statSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { createSessionHttp, sessionAddresses } from './net/sessionHttp.js';
import { GameServer } from './net/GameServer.js';
import { audioByteRange } from './net/audioHttp.js';
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

const CLIENTS_ROOT = resolve(__dirname, '../../dist/clients');

/** Envoie un fichier compilé et prend en charge les plages de lecture des fichiers audio. */
function serveStatic(res: ServerResponse, filePath: string,range?:string): boolean {
  // Only regular files below dist/clients (no directories, no path traversal)
  if (!filePath.startsWith(CLIENTS_ROOT)) return false;
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
  res.writeHead(200, { 'Content-Type': mime,'Content-Length':content.length });
  res.end(content);
  return true;
}

// ── HTTP server ────────────────────────────────────────────────────────────────
/** Distribue les requêtes entre les API et les fichiers des interfaces compilées. */
const handleRequest: RequestListener = (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost`);

  if (url.pathname === '/api/session') {
    const port = (httpServer.address() as { port: number }).port;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ...sessionAddresses(port, protocol, publicUrl), room: gameServer.room }));
    return;
  }

  // Full server-side journal of pylon events (task 15)
  if (url.pathname === '/api/oz-log') {
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

  // Route to the correct client dist folder
  const phone = url.pathname === '/play' || url.pathname.startsWith('/play/');
  const wiimote = url.pathname === '/wiimote' || url.pathname.startsWith('/wiimote/');
  const prefix = phone ? '/play' : wiimote ? '/wiimote' : url.pathname.startsWith('/oz') ? '/oz' : '';
  const clientDir = resolve(CLIENTS_ROOT, phone ? 'client-phone' : wiimote ? 'client-wiimote' : prefix ? 'client-oz' : 'client-table');
  const filePath = url.pathname.slice(prefix.length) || '/';

  // Serve the file or fall back to index.html (SPA behaviour)
  const candidate = resolve(clientDir, filePath === '/' ? 'index.html' : filePath.slice(1));
  if (serveStatic(res, candidate,req.headers.range)) return;

  const index = resolve(clientDir, 'index.html');
  if (serveStatic(res, index,req.headers.range)) return;

  res.writeHead(404);
  res.end('Not found');
};

// ── WebSocket server ───────────────────────────────────────────────────────────
let transport: ReturnType<typeof createSessionHttp>;
try {
  transport = createSessionHttp(handleRequest);
} catch (err) {
  console.error(`[Crashout] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
const { server: httpServer, protocol, publicUrl } = transport;
const wss = new WebSocketServer({ server: httpServer });
const gameServer = new GameServer(wss, {
  developerTools: process.env.CRASHOUT_DEV_TOOLS === '1',
  soloTest: process.env.CRASHOUT_SOLO_TEST === '1',
});
gameServer.rules.setTangiblePlacementMode('touch');

// Export for use by PhysicsLoop and other modules (added in later tasks)
export { gameServer };

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

/** Affiche les adresses de connexion une fois le serveur effectivement lancé. */
httpServer.listen(PORT, () => {
  const { port } = httpServer.address() as { port: number };
  const { baseUrls, ozUrls, secure } = sessionAddresses(port, protocol, publicUrl);
  console.log('\n🏎  Crashout Circuit server running');
  console.log(`   Local:   ${protocol}://localhost:${port}`);

  for (const [i, baseUrl] of baseUrls.entries()) {
    console.log(`   Network: ${baseUrl}`);
    console.log(`   Oz:      ${ozUrls[i]}`);
    console.log(`   Joueurs: ${baseUrl}/play?room=${gameServer.room}`);
  }
  if (gameServer.getState().soloTest) console.log('   Essai pilote solo : scannez le QR sur la table.');
  if (!secure) console.log('   HTTP : capteurs iOS indisponibles. Utilisez une adresse HTTPS pour jouer au gyroscope.');
  console.log(`   Outils de test : ${gameServer.getState().developerTools?'activés':'désactivés'}`);
  console.log(`   Config:  lapsToWin=${config.lapsToWin}, physicsHz=${config.physicsHz}\n`);
});
