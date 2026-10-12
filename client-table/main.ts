import type { ServerMessage } from '../server/types.js';
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

// PC testing: buttons that stand in for the 3- and 2-finger gestures (shown with a mouse or ?sim=1)
const simBar = document.getElementById('sim') as HTMLDivElement;
const sim3 = document.getElementById('sim3') as HTMLButtonElement;
const sim2 = document.getElementById('sim2') as HTMLButtonElement;
const simHint = document.getElementById('sim-hint') as HTMLSpanElement;
if (urlParams.get('sim') === '1' || window.matchMedia('(pointer: fine)').matches) simBar.classList.add('on');
let simKind: 'slingshot' | 'boost' | null = null;
const setSim = (k: 'slingshot' | 'boost' | null): void => {
  simKind = simKind === k ? null : k;
  sim3.classList.toggle('armed', simKind === 'slingshot');
  sim2.classList.toggle('armed', simKind === 'boost');
  gestures.simulate(simKind);
};
sim3.addEventListener('click', () => setSim('slingshot'));
sim2.addEventListener('click', () => setSim('boost'));
gestures.onSimChange = (hint) => {
  simHint.textContent = hint;
  // The gesture was consumed (or failed): leave simulation mode
  if (!hint || hint.startsWith('Aucune') || hint.startsWith('Écart')) {
    simKind = null; sim3.classList.remove('armed'); sim2.classList.remove('armed');
  }
};

window.addEventListener('pointerdown', unlock, { once: true });
// Desktop local multiplayer adapter. It mirrors the table controls without
// leaking keyboard rules into the game engine: Q/D and ←/→ are the two
// extremes of the same continuous steering input; cars keep moving.
const down = new Set<string>();
const repairHeld: Record<'A' | 'B', boolean> = { A: false, B: false };
const keyName = (e: KeyboardEvent) => e.key.length === 1 ? e.key.toLowerCase() : e.key;
function sendSteer(team: 'A' | 'B'): void {
  const steer = team === 'A'
    ? (down.has('q') ? -1 : down.has('d') ? 1 : 0)
    : (down.has('ArrowLeft') ? -1 : down.has('ArrowRight') ? 1 : 0);
  conn.send({ type: 'PilotInput', team, throttle: 1, steer });
}
// Match the touch-control heartbeat while a steering key is held. Do not emit
// neutral keyboard frames otherwise: table and desktop controls share the same
// protocol and must not overwrite one another.
window.setInterval(() => {
  if (down.has('q') || down.has('d')) sendSteer('A');
  if (down.has('ArrowLeft') || down.has('ArrowRight')) sendSteer('B');
}, 100);
function updateKeyboardRepair(team: 'A' | 'B'): void {
  const active = team === 'A' ? down.has('a') && down.has('p') : down.has('m') && down.has('c');
  if (active === repairHeld[team]) return;
  repairHeld[team] = active;
  conn.send({ type: 'PadHold', team, role: 'pilot', on: active });
  conn.send({ type: 'PadHold', team, role: 'copilot', on: active });
}
window.addEventListener('keydown', (e) => {
  const key = keyName(e);
  if (key === 'F3' && !e.repeat && !down.has('F3')) view.debug.on = !view.debug.on;
  if (down.has(key)) return;
  down.add(key);
  if (key === 'q' || key === 'd') sendSteer('A');
  if (key === 'ArrowLeft' || key === 'ArrowRight') { e.preventDefault(); sendSteer('B'); }
  if (key === 'Escape' || key === ' ') { e.preventDefault(); conn.send({ type: 'Pause' }); }
  if (key === 'a' || key === 'p') updateKeyboardRepair('A');
  if (key === 'm' || key === 'c') updateKeyboardRepair('B');
  // A/M alone activate the pilot's stocked item. Waiting briefly lets the
  // A+P / M+C repair chord win when the two players press in rhythm.
  if ((key === 'a' || key === 'm') && !e.repeat) {
    const team: 'A' | 'B' = key === 'a' ? 'A' : 'B';
    window.setTimeout(() => {
      const combo = team === 'A' ? down.has('a') && down.has('p') : down.has('m') && down.has('c');
      if (!combo && down.has(key)) conn.send({ type: 'UseItem', team });
    }, 120);
  }
});
window.addEventListener('keyup', (e) => {
  const key = keyName(e);
  down.delete(key);
  if (key === 'q' || key === 'd') sendSteer('A');
  if (key === 'ArrowLeft' || key === 'ArrowRight') { e.preventDefault(); sendSteer('B'); }
  if (key === 'a' || key === 'p') updateKeyboardRepair('A');
  if (key === 'm' || key === 'c') updateKeyboardRepair('B');
});
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
  renderer.render(view);
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

// ── Bootstrap ──────────────────────────────────────────────────────────────────
requestAnimationFrame(drawFrame);
