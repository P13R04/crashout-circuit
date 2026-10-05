import http from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync, statSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { GameServer } from './GameServer.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── MIME types for static file serving ────────────────────────────────────────
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.ts':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const CLIENTS_ROOT = resolve(__dirname, '../../dist/clients');

function serveStatic(res: http.ServerResponse, filePath: string): boolean {
  // Only regular files below dist/clients (no directories, no path traversal)
  if (!filePath.startsWith(CLIENTS_ROOT)) return false;
  try { if (!statSync(filePath).isFile()) return false; } catch { return false; }
  const ext = extname(filePath);
  const mime = MIME[ext] ?? 'application/octet-stream';
  const content = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': mime });
  res.end(content);
  return true;
}

// ── HTTP server ────────────────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost`);

  // Full server-side journal of pylon events (task 15)
  if (url.pathname === '/api/oz-log') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(gameServer.rules.tangibleLog));
    return;
  }

  // Vite emits shared bundles under /assets/ for all three pages
  if (url.pathname.startsWith('/assets/')) {
    if (serveStatic(res, resolve(CLIENTS_ROOT, url.pathname.slice(1)))) return;
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // Route to the correct client dist folder
  let clientDir: string;
  if (url.pathname.startsWith('/pilot')) {
    clientDir = resolve(__dirname, '../../dist/clients/client-pilot');
  } else if (url.pathname.startsWith('/oz')) {
    clientDir = resolve(__dirname, '../../dist/clients/client-oz');
  } else {
    clientDir = resolve(__dirname, '../../dist/clients/client-table');
  }

  // Strip route prefix to get the file path within the client folder
  let filePath = url.pathname;
  if (url.pathname.startsWith('/pilot')) filePath = filePath.slice('/pilot'.length) || '/';
  if (url.pathname.startsWith('/oz'))    filePath = filePath.slice('/oz'.length) || '/';

  // Serve the file or fall back to index.html (SPA behaviour)
  const candidate = resolve(clientDir, filePath === '/' ? 'index.html' : filePath.slice(1));
  if (serveStatic(res, candidate)) return;

  const index = resolve(clientDir, 'index.html');
  if (serveStatic(res, index)) return;

  res.writeHead(404);
  res.end('Not found');
});

// ── WebSocket server ───────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });
const gameServer = new GameServer(wss);

// Export for use by PhysicsLoop and other modules (added in later tasks)
export { gameServer };

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

httpServer.listen(PORT, async () => {
  const os = await import('os');
  const networkInterfaces = os.networkInterfaces();
  const localIps = Object.values(networkInterfaces)
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface!.address);

  console.log(`\n🏎  Crashout Circuit server running`);
  console.log(`   Local:   http://localhost:${PORT}`);

  for (const ip of localIps) {
    console.log(`   Network: http://${ip}:${PORT}`);
    console.log(`   Oz:      http://${ip}:${PORT}/oz`);

    const pilotAUrl = `http://${ip}:${PORT}/pilot?team=A`;
    const pilotBUrl = `http://${ip}:${PORT}/pilot?team=B`;

    console.log(`\n   Pilot A: ${pilotAUrl}`);
    const qrA = await QRCode.toString(pilotAUrl, { type: 'terminal', small: true });
    console.log(qrA);

    console.log(`   Pilot B: ${pilotBUrl}`);
    const qrB = await QRCode.toString(pilotBUrl, { type: 'terminal', small: true });
    console.log(qrB);

    // Generate base64 PNG data URLs so the table can render QR images
    const pilotAQr = await QRCode.toDataURL(pilotAUrl, { errorCorrectionLevel: 'M', margin: 2 });
    const pilotBQr = await QRCode.toDataURL(pilotBUrl, { errorCorrectionLevel: 'M', margin: 2 });
    gameServer.setLobbyUrls({ pilotA: pilotAUrl, pilotB: pilotBUrl, pilotAQr, pilotBQr });
  }

  console.log(`   Config:  lapsToWin=${config.lapsToWin}, physicsHz=${config.physicsHz}\n`);
});
