import type { ServerMessage, GameState } from '../server/types.js';
import { StateSync, connectWs } from '../client-shared/net.js';
import { createView } from './view.js';
import { Renderer } from './Renderer.js';
import { GestureRecognizer } from './GestureRecognizer.js';
import { playFeedback, unlock } from './Sound.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

// ── Canvas sizing (1920×1080 logical, ×2 for 4K) ──────────────────────────────
const LOGICAL_W = 1920;
const LOGICAL_H = 1080;

function resizeCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
  canvas.width  = LOGICAL_W * dpr;
  canvas.height = LOGICAL_H * dpr;
  canvas.style.width  = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const ctx = canvas.getContext('2d')!;

// ── State, view and modules ───────────────────────────────────────────────────
const sync = new StateSync();
const view = createView(() => sync.now());
const renderer = new Renderer(ctx);
const urlParams = new URLSearchParams(location.search);
view.debug.on = urlParams.get('debug') === '1';

const conn = connectWs('/ws', {
  onOpen: () => { statusEl.textContent = 'Connecté'; },
  onClose: () => { statusEl.textContent = 'Déconnecté — reconnexion dans 2 s…'; gestures.releaseAll(); },
  onMessage: handleMessage,
});
const gestures = new GestureRecognizer(canvas, view, (m) => conn.send(m));

window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', (e) => { if (e.key === 'd' || e.key === 'D') view.debug.on = !view.debug.on; });
document.addEventListener('visibilitychange', () => { if (document.hidden) gestures.releaseAll(); });

// Round-trip time (server echo), used by the debug overlay (task 18)
setInterval(() => conn.send({ type: 'Ping' }), 2000);

function handleMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'State': {
      const prev = view.state;
      view.state = sync.apply(msg.state, msg.t);
      if (!prev) { view.hpShown.A = view.state.cars.A.hp; view.hpShown.B = view.state.cars.B.hp; }
      statusEl.textContent = `Phase: ${msg.state.phase}`;
      statusEl.style.display = view.debug.on ? 'block' : 'none';
      break;
    }
    case 'PhaseChange':
      view.effects.length = 0;
      if (msg.phase === 'MAP') view.strokes.clear();
      break;
    case 'Feedback':
      view.effects.push({ kind: msg.kind, x: msg.x, y: msg.y, team: msg.team, start: performance.now(), dur: effectDuration(msg.kind) });
      if (msg.kind === 'mapError') {
        view.mapErrorAt[msg.team] = performance.now();
        for (const s of view.strokes.values()) if (s.team === msg.team) s.rejectedAt = performance.now();
      }
      playFeedback(msg.kind);
      break;
    case 'Pong':
      view.debug.rtt = Date.now() - msg.clientT;
      break;
  }
}

function effectDuration(kind: string): number {
  switch (kind) {
    case 'stoneImpact': return 700;
    case 'wallDestroyed': return 450;
    case 'repairDone': return 900;
    case 'itemLost': return 1200;
    default: return 500;
  }
}

// ── Render loop ────────────────────────────────────────────────────────────────
let lastFrame = performance.now();
let fpsAcc = 0, fpsFrames = 0;

function drawFrame(now: number): void {
  const frameMs = now - lastFrame;
  lastFrame = now;
  fpsAcc += frameMs; fpsFrames++;
  if (fpsAcc >= 500) { view.debug.fps = (fpsFrames * 1000) / fpsAcc; view.debug.frameMs = fpsAcc / fpsFrames; fpsAcc = 0; fpsFrames = 0; }

  // Finger → frame latency: the pad/stroke feedback of the latest touch is drawn in this frame
  if (gestures.lastDownTs) {
    view.debug.touchMs = performance.now() - gestures.lastDownTs;
    gestures.lastDownTs = 0;
  }

  // Smooth the HP bars towards the authoritative value
  if (view.state) {
    for (const t of ['A', 'B'] as const) {
      view.hpShown[t] += (view.state.cars[t].hp - view.hpShown[t]) * 0.15;
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dpr = canvas.width / LOGICAL_W;
  ctx.save();
  ctx.scale(dpr, dpr);
  drawBackground();
  if (view.state?.phase === 'LOBBY') drawLobby(view.state);
  else renderer.render(view);
  if (view.debug.on) drawDebug();
  ctx.restore();

  requestAnimationFrame(drawFrame);
}

function drawDebug(): void {
  const d = view.debug;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(LOGICAL_W / 2 - 230, 4, 460, 30);
  ctx.fillStyle = d.fps >= 55 ? '#3ddc84' : '#ffb020';
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${d.fps.toFixed(0)} fps · frame ${d.frameMs.toFixed(1)} ms · RTT ${d.rtt} ms · touch→frame ${d.touchMs.toFixed(0)} ms · ${d.contacts} pts`,
    LOGICAL_W / 2, 25,
  );
  ctx.restore();
}

function drawBackground(): void {
  ctx.fillStyle = '#04081f';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  // Discrete square grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  const GRID = 60;
  for (let x = 0; x <= LOGICAL_W; x += GRID) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, LOGICAL_H);
    ctx.stroke();
  }
  for (let y = 0; y <= LOGICAL_H; y += GRID) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(LOGICAL_W, y);
    ctx.stroke();
  }
}

// ── Pre-loaded QR code images (cached as HTMLImageElement) ─────────────────────
let qrImageA: HTMLImageElement | null = null;
let qrImageB: HTMLImageElement | null = null;
let lastQrAUrl = '';
let lastQrBUrl = '';

function ensureQrImages(state: GameState): void {
  const urls = state.lobbyUrls;
  if (!urls) return;

  if (urls.pilotAQr !== lastQrAUrl) {
    lastQrAUrl = urls.pilotAQr;
    const img = new Image();
    img.src = urls.pilotAQr;
    qrImageA = img;
  }
  if (urls.pilotBQr !== lastQrBUrl) {
    lastQrBUrl = urls.pilotBQr;
    const img = new Image();
    img.src = urls.pilotBQr;
    qrImageB = img;
  }
}

function drawLobby(state: GameState): void {
  ensureQrImages(state);

  const cx = LOGICAL_W / 2;
  const cy = LOGICAL_H / 2;

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CRASHOUT CIRCUIT', cx, 120);

  ctx.font = '28px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('En attente des joueurs…', cx, 170);

  // ── QR Code panels ────────────────────────────────────────────────────────
  const qrSize = 280;
  const qrY = 240;
  const labelY = qrY + qrSize + 36;
  const urlY = labelY + 36;

  // Panel A — left side
  const aX = cx - 520 - qrSize / 2;
  drawQrPanel(
    aX, qrY, qrSize,
    qrImageA,
    state.lobbyUrls?.pilotA ?? null,
    'PILOTE A', '#00e5ff',
    state.lobbyStatus.pilotA,
  );

  // Panel B — right side
  const bX = cx + 520 - qrSize / 2;
  drawQrPanel(
    bX, qrY, qrSize,
    qrImageB,
    state.lobbyUrls?.pilotB ?? null,
    'PILOTE B', '#ff4c4c',
    state.lobbyStatus.pilotB,
  );

  void labelY; void urlY; // used inside drawQrPanel

  // ── Connection status bar ─────────────────────────────────────────────────
  drawConnectionStatus(state, cx, cy + 260);
}

function drawQrPanel(
  x: number, y: number, size: number,
  img: HTMLImageElement | null,
  url: string | null,
  label: string,
  color: string,
  connected: boolean,
): void {
  const padding = 12;

  // Background card
  ctx.fillStyle = connected ? 'rgba(0,50,30,0.7)' : 'rgba(10,10,30,0.7)';
  ctx.strokeStyle = connected ? '#00ff88' : color;
  ctx.lineWidth = connected ? 3 : 1.5;
  ctx.beginPath();
  ctx.roundRect(x - padding, y - padding, size + padding * 2, size + padding * 2 + 100, 16);
  ctx.fill();
  ctx.stroke();

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x, y, size, size);
  } else if (url) {
    // Fallback: show URL text
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('QR en cours de chargement…', x + size / 2, y + size / 2);
  } else {
    // No URL yet — server not ready
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Démarrage serveur…', x + size / 2, y + size / 2);
  }

  // Label
  ctx.font = 'bold 28px monospace';
  ctx.fillStyle = connected ? '#00ff88' : color;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + size / 2, y + size + 44);

  // Connection indicator
  const statusText = connected ? '✓ CONNECTÉ' : 'Scannez le QR';
  ctx.font = '20px monospace';
  ctx.fillStyle = connected ? '#00ff88' : 'rgba(255,255,255,0.4)';
  ctx.fillText(statusText, x + size / 2, y + size + 78);

  // URL below the label (small)
  if (url) {
    ctx.font = '14px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText(url, x + size / 2, y + size + 100);
  }
}

function drawConnectionStatus(state: GameState, cx: number, y: number): void {
  const items: Array<{ label: string; ok: boolean }> = [
    { label: 'Table', ok: state.lobbyStatus.table },
    { label: 'Pilote A', ok: state.lobbyStatus.pilotA },
    { label: 'Pilote B', ok: state.lobbyStatus.pilotB },
  ];

  const boxW = 220;
  const boxH = 60;
  const gap = 20;
  const totalW = items.length * boxW + (items.length - 1) * gap;
  let startX = cx - totalW / 2;

  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';

  for (const item of items) {
    const bx = startX;
    const by = y;

    ctx.fillStyle = item.ok ? 'rgba(0,80,40,0.8)' : 'rgba(30,30,60,0.6)';
    ctx.strokeStyle = item.ok ? '#00ff88' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = item.ok ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = item.ok ? '#00ff88' : 'rgba(255,255,255,0.4)';
    ctx.fillText(`${item.ok ? '✓' : '○'} ${item.label}`, bx + boxW / 2, by + 38);

    startX += boxW + gap;
  }
}


// ── Bootstrap ──────────────────────────────────────────────────────────────────
requestAnimationFrame(drawFrame);
