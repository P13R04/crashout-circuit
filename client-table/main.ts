import type { ServerMessage } from '../server/types.js';
import { createControls } from '../client-shared/controls.js';
import { StateSync, connectWs } from '../client-shared/net.js';
import { createView, showDividerRefusal, showMapError } from './view.js';
import { Renderer } from './Renderer.js';
import { SETTINGS_BUTTON } from '../server/layout.js';
import { GestureRecognizer } from './GestureRecognizer.js';
import { playFeedback, unlock } from './Sound.js';
import { THEMES, themeLook, loadTheme, saveTheme, type ThemeId } from './themes.js';
import { advanceVisualTime } from './VisualMotion.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

// ── Canvas sizing (1920×1080 logical, ×2 for 4K) ──────────────────────────────
const LOGICAL_W = 1920;
const LOGICAL_H = 1080;

function resizeCanvas(): void {
  const fit = Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H);
  const resolution = Math.min(2, fit * Math.min(window.devicePixelRatio ?? 1, 2));
  canvas.width = Math.round(LOGICAL_W * resolution);
  canvas.height = Math.round(LOGICAL_H * resolution);
  canvas.style.width = `${LOGICAL_W * fit}px`;
  canvas.style.height = `${LOGICAL_H * fit}px`;
  const left = (window.innerWidth - LOGICAL_W * fit) / 2;
  const top = (window.innerHeight - LOGICAL_H * fit) / 2;
  document.documentElement.style.setProperty('--tools-x', `${left + SETTINGS_BUTTON.x * fit}px`);
  document.documentElement.style.setProperty('--tools-y', `${top + SETTINGS_BUTTON.y * fit}px`);
  document.documentElement.style.setProperty('--tools-w', `${SETTINGS_BUTTON.w * fit}px`);
  document.documentElement.style.setProperty('--tools-h', `${SETTINGS_BUTTON.h * fit}px`);
  document.documentElement.style.setProperty('--tools-scale', `${fit}`);
  document.documentElement.style.setProperty('--tools-bottom', `${top + 8}px`);
  document.documentElement.style.setProperty('--table-top', `${top + 18}px`);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const ctx = canvas.getContext('2d')!;

// ── State, view and modules ───────────────────────────────────────────────────
const sync = new StateSync();
const view = createView(() => sync.now());
const renderer = new Renderer(ctx);
const urlParams = new URLSearchParams(location.search);
// Themes are a local display setting: switching never sends a command or restarts a race.
const themeOptions = document.getElementById('theme-options')!;
for (const theme of THEMES) {
  const button = document.createElement('button'); button.type = 'button';
  button.className = 'theme-option'; button.dataset.theme = theme.id;
  button.setAttribute('aria-label', theme.name);
  const swatch = document.createElement('span'); swatch.className = 'theme-swatch'; swatch.setAttribute('aria-hidden', 'true');
  for (const color of theme.colors) { const chip = document.createElement('i'); chip.style.background = color; swatch.append(chip); }
  const name = document.createElement('strong'); name.textContent = theme.name;
  const detail = document.createElement('small'); detail.textContent = theme.detail;
  button.append(swatch, name, detail); button.addEventListener('click', () => selectTheme(theme.id)); themeOptions.append(button);
}
function selectTheme(id: ThemeId): void {
  view.theme = id; try { saveTheme(window.localStorage, id); } catch { /* Display preference still applies. */ }
  document.body.dataset.theme = id; canvas.dataset.theme = id;
  const look=themeLook(id);
  for(const [key,value] of Object.entries(look))document.body.style.setProperty(`--look-${key}`,typeof value==='number'?`${value}px`:value);
  for (const button of themeOptions.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.theme === id));
}
// Access to localStorage itself can be denied in embedded/private contexts.
try { selectTheme(loadTheme(window.localStorage)); } catch { selectTheme('neon'); }
view.debug.on = urlParams.get('debug') === '1';
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
view.reducedMotion = motionPreference.matches || urlParams.get('motion') === '0';
motionPreference.addEventListener('change', e => { view.reducedMotion = e.matches || urlParams.get('motion') === '0'; });

const conn = connectWs('/ws', {
  onOpen: () => { statusEl.hidden = true; },
  onClose: () => { statusEl.textContent = 'Connexion perdue · Reconnexion…'; statusEl.hidden = false; gestures.releaseAll(); },
  onMessage: handleMessage,
});
const controls = createControls(m => conn.send(m));
const gestures = new GestureRecognizer(canvas, view, (m) => conn.send(m));

document.getElementById('settings-home')!.addEventListener('click',()=>{conn.send({type:'Reset'});pcTools.open=false;});
const difficultyInput=document.getElementById('race-difficulty') as HTMLSelectElement;
const lapsInput=document.getElementById('race-laps') as HTMLInputElement;
const timerInput=document.getElementById('race-timer') as HTMLInputElement;
const minutesInput=document.getElementById('race-minutes') as HTMLInputElement;
difficultyInput.addEventListener('change',()=>conn.send({type:'RaceSettings',difficulty:difficultyInput.value}));
lapsInput.addEventListener('change',()=>{if(lapsInput.checkValidity())conn.send({type:'RaceSettings',lapsToWin:Number(lapsInput.value)});});
const sendTimer=()=>{if(!timerInput.checked||minutesInput.checkValidity())conn.send({type:'RaceSettings',sessionMaxSeconds:timerInput.checked?Math.round(Number(minutesInput.value)*60):0});};
timerInput.addEventListener('change',sendTimer);minutesInput.addEventListener('change',()=>{if(timerInput.checked)sendTimer();});
function syncRaceOptions(): void {
  const s=view.state;if(!s)return;
  const editable=!s.tutorial&&s.phase!=='RESULT';
  difficultyInput.disabled=!editable;lapsInput.disabled=!editable||s.sessionMode==='tangibles-test';timerInput.disabled=lapsInput.disabled;
  if(document.activeElement!==difficultyInput)difficultyInput.value=s.params.difficulty;
  if(document.activeElement!==lapsInput)lapsInput.value=String(s.params.lapsToWin);
  timerInput.checked=s.params.sessionMaxSeconds>0;minutesInput.disabled=!timerInput.checked||timerInput.disabled;
  if(s.params.sessionMaxSeconds>0&&document.activeElement!==minutesInput)minutesInput.value=String(s.params.sessionMaxSeconds/60);
}

const driveOptions=document.getElementById('drive-options')!;
const driveButtons={A:document.getElementById('drive-A')!,B:document.getElementById('drive-B')!};
for(const team of ['A','B'] as const)driveButtons[team].addEventListener('click',()=>conn.send({type:'ToggleDriveMode',team}));
function syncDriveOptions(): void {
  const s=view.state;driveOptions.hidden=!s||!['READY','RACE','PAUSED'].includes(s.phase)||s.sessionMode==='tangibles-test';
  for(const team of ['A','B'] as const){const mode=s?.driveMode[team]??'auto';driveButtons[team].textContent=`${team==='A'?'Cyan':'Rose'} · ${mode==='auto'?'AUTO':'PÉDALE'}`;driveButtons[team].setAttribute('aria-pressed',String(mode==='pedal'));}
}

// PC testing: buttons that stand in for the 3- and 2-finger gestures (shown with a mouse or ?sim=1)
const pcTools = document.getElementById('pc-tools') as HTMLDetailsElement;
const simBar = document.getElementById('sim') as HTMLDivElement;
const sim3 = document.getElementById('sim3') as HTMLButtonElement;
const sim2 = document.getElementById('sim2') as HTMLButtonElement;
const simHint = document.getElementById('sim-hint') as HTMLSpanElement;
const showSimulation = urlParams.get('sim') === '1' || window.matchMedia('(pointer: fine)').matches;
let simKind: 'slingshot' | 'boost' | null = null;
const setSim = (k: 'slingshot' | 'boost' | null): void => {
  simKind = simKind === k ? null : k;
  sim3.classList.toggle('armed', simKind === 'slingshot');
  sim2.classList.toggle('armed', simKind === 'boost');
  sim3.setAttribute('aria-pressed', String(simKind === 'slingshot'));
  sim2.setAttribute('aria-pressed', String(simKind === 'boost'));
  gestures.simulate(simKind);
};
sim3.addEventListener('click', () => setSim('slingshot'));
sim2.addEventListener('click', () => setSim('boost'));
pcTools.addEventListener('toggle', () => { if (!pcTools.open && simKind) setSim(null); });
gestures.onSimChange = (hint) => {
  simHint.textContent = hint;
  // The gesture was consumed (or failed): leave simulation mode
  if (!hint || hint.startsWith('Aucune') || hint.startsWith('Écart')) {
    simKind = null; sim3.classList.remove('armed'); sim2.classList.remove('armed');
    sim3.setAttribute('aria-pressed', 'false'); sim2.setAttribute('aria-pressed', 'false');
  }
};

// PC test switches: only shown (and honoured by the server) in the PC mode
const testBar = document.getElementById('testbar') as HTMLDivElement;
const testInvincible = document.getElementById('test-invincible') as HTMLButtonElement;
const testItems = document.getElementById('test-items') as HTMLButtonElement;
testInvincible.addEventListener('click', () =>
  conn.send({ type: 'TestToggle', flag: 'invincible', on: !view.state?.testMode.invincible }));
testItems.addEventListener('click', () =>
  conn.send({ type: 'TestToggle', flag: 'allItems', on: !view.state?.testMode.allItems }));
function syncTestBar(): void {
  const st = view.state;
  const racing = st?.phase === 'RACE' || st?.phase === 'PAUSED';
  // The tutorial needs the real item rules: no free items, no invincibility switch
  testBar.classList.toggle('on', st?.mapMode === 'pc' && racing && !st.tutorial);
  simBar.classList.toggle('on', showSimulation && racing);
  if (!racing && simKind) setSim(null);
  testInvincible.classList.toggle('active', !!st?.testMode.invincible);
  testItems.classList.toggle('active', !!st?.testMode.allItems);
  testInvincible.setAttribute('aria-pressed', String(!!st?.testMode.invincible));
  testItems.setAttribute('aria-pressed', String(!!st?.testMode.allItems));
}

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
  const isPedal = view.state?.driveMode[team] === 'pedal';
  const throttle = isPedal
    ? (team === 'A' ? Number(down.has('z')) : Number(down.has('ArrowUp')))
    : 1;
  controls.steer(team, steer, throttle);
}
// Match the touch-control heartbeat while a steering key is held. Do not emit
// neutral keyboard frames otherwise: table and desktop controls share the same
// protocol and must not overwrite one another.
window.setInterval(() => {
  if (down.has('q') || down.has('d') || down.has('z')) sendSteer('A');
  if (down.has('ArrowLeft') || down.has('ArrowRight') || down.has('ArrowUp')) sendSteer('B');
}, 100);
function updateKeyboardRepair(team: 'A' | 'B'): void {
  const active = team === 'A' ? down.has('a') && down.has('p') : down.has('m') && down.has('c');
  if (active === repairHeld[team]) return;
  repairHeld[team] = active;
  conn.send({ type: 'PadHold', team, role: 'pilot', on: active });
  conn.send({ type: 'PadHold', team, role: 'copilot', on: active });
}
window.addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.closest('button, summary, input, textarea, select, a')) return;
  const key = keyName(e);
  if (key === 'F3' && !e.repeat && !down.has('F3')) view.debug.on = !view.debug.on;
  if (down.has(key)) return;
  down.add(key);
  if (key === 'q' || key === 'd') sendSteer('A');
  if (key === 'ArrowLeft' || key === 'ArrowRight') { e.preventDefault(); sendSteer('B'); }
  if (key === 'z') sendSteer('A');
  if (key === 'ArrowUp') { e.preventDefault(); sendSteer('B'); }
  if (key === ' ') { e.preventDefault(); conn.send({ type: 'Pause' }); }
  if (key === 'a' || key === 'p') updateKeyboardRepair('A');
  if (key === 'm' || key === 'c') updateKeyboardRepair('B');
  // A/M alone press the copilot's POWER button. Waiting briefly lets the
  // A+P / M+C repair chord win when the two players press in rhythm.
  if ((key === 'a' || key === 'm') && !e.repeat) {
    const team: 'A' | 'B' = key === 'a' ? 'A' : 'B';
    window.setTimeout(() => {
      const combo = team === 'A' ? down.has('a') && down.has('p') : down.has('m') && down.has('c');
      if (!combo && down.has(key)) controls.power(team);
    }, 120);
  }
});
window.addEventListener('keyup', (e) => {
  const key = keyName(e);
  down.delete(key);
  if (key === 'q' || key === 'd') sendSteer('A');
  if (key === 'ArrowLeft' || key === 'ArrowRight') { e.preventDefault(); sendSteer('B'); }
  if (key === 'z') sendSteer('A');
  if (key === 'ArrowUp') { e.preventDefault(); sendSteer('B'); }
  if (key === 'a' || key === 'p') updateKeyboardRepair('A');
  if (key === 'm' || key === 'c') updateKeyboardRepair('B');
});
// Fullscreen is local to this screen; native Escape exits it without pausing the session.
const fullscreen = document.getElementById('fullscreen') as HTMLButtonElement;
const fullscreenNotice = document.getElementById('fullscreen-notice')!;
function releaseInputs(): void {
  gestures.releaseAll(); down.clear();
  sendSteer('A'); sendSteer('B'); updateKeyboardRepair('A'); updateKeyboardRepair('B');
}
function syncFullscreen(): void {
  const active = !!document.fullscreenElement;
  fullscreen.setAttribute('aria-pressed', String(active));
  fullscreen.querySelector('span')!.textContent = active ? 'Quitter le plein écran' : 'Plein écran';
  releaseInputs();
}
fullscreen.addEventListener('click', async () => {
  fullscreenNotice.hidden = true;
  releaseInputs();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    pcTools.open = false;
  } catch {
    fullscreenNotice.textContent = 'Plein écran indisponible dans ce navigateur.';
    fullscreenNotice.hidden = false;
  }
});
document.addEventListener('fullscreenchange', syncFullscreen);
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  pcTools.open = false;
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => { /* Native Escape may already have exited. */ });
  // Keep the browser's default Escape behaviour and reserve Space for the game pause.
}, true);

document.addEventListener('visibilitychange', () => { if (document.hidden) gestures.releaseAll(); });

// Round-trip time (server echo), used by the debug overlay (task 18)
setInterval(() => conn.send({ type: 'Ping' }), 2000);

function handleMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'State': {
      const prev = view.state;
      view.state = sync.apply(msg.state, msg.t);
      gestures.syncState();
      syncDriveOptions();
      syncRaceOptions();
      if (view.state.mapTargets) {
        if (!prev?.mapTargets) view.mapNotice = null;
        view.pendingDivider = [];
        view.dividerSubmitting = false;
      }
      for (const stroke of view.strokes.values()) {
        if (view.state.mapStrokes[stroke.team] && view.state.mapTargets) {
          stroke.submitting = false;
          stroke.done = true;
          stroke.rejectedAt = undefined;
          const [start, end] = view.state.mapTargets[stroke.team];
          stroke.pts[0] = { ...start };
          stroke.pts[stroke.pts.length - 1] = { ...end };
        }
      }
      if (!prev || (prev.phase !== 'LOBBY' && msg.state.phase === 'LOBBY')) {
        view.hpShown.A = view.state.cars.A.hp;
        view.hpShown.B = view.state.cars.B.hp;
        view.strokes.clear();
        view.pendingDivider = [];
        view.dividerSubmitting = false;
        view.mapNotice = null;
        view.effects.length = 0;
        gestures.releaseAll();
      }
      syncTestBar();
      break;
    }
    case 'PhaseChange':
      view.effects.length = 0;
      if (msg.phase === 'MAP' || msg.phase === 'LOBBY') {
        view.strokes.clear();
        view.pendingDivider = [];
        view.dividerSubmitting = false;
        view.mapNotice = null;
        if (msg.phase === 'LOBBY') {
          gestures.releaseAll();
          view.hpShown.A = 100;
          view.hpShown.B = 100;
        }
      }
      break;
    case 'Feedback':
      if (msg.kind === 'dividerTooShort' || msg.kind === 'dividerOutOfZone') {
        view.dividerSubmitting = false;
        showDividerRefusal(view, msg.kind === 'dividerTooShort' ? 'tooShort' : 'outOfZone');
      }
      view.effects.push({
        kind: msg.kind, x: msg.x, y: msg.y, team: msg.team, start: view.visualTime, dur: effectDuration(msg.kind),
      });
      if (view.effects.length > 64) view.effects.splice(0, view.effects.length - 64);
      if (msg.kind.startsWith('map') && msg.kind !== 'mapAccepted') {
        showMapError(view, msg.kind, msg.team);
        view.mapErrorAt[msg.team] = performance.now();
        for (const s of view.strokes.values()) {
          if (s.team === msg.team && !view.state?.mapStrokes[s.team]) {
            s.rejectedAt = performance.now();
            s.submitting = false;
          }
        }
      }
      if (msg.kind === 'mapAccepted') view.mapNotice = null;
      playFeedback(msg.kind);
      break;
    case 'Pong':
      view.debug.rtt = Date.now() - msg.clientT;
      break;
  }
}

function effectDuration(kind: string): number {
  switch (kind) {
    case 'stoneHit': return 700;
    case 'fall': return 950;
    case 'pickup': return 650;
    case 'itemArmed': return 650;
    case 'checkpoint': return 550;
    case 'trackDeformed': return 550;
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
const renderSamples: number[] = [];
let metricsAt = 0;

function drawFrame(now: number): void {
  const frameMs = now - lastFrame;
  lastFrame = now;
  view.visualTime = advanceVisualTime(view.visualTime, frameMs, view.state?.phase === 'PAUSED');
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
  const renderStart = performance.now();
  renderer.render(view);
  renderSamples.push(performance.now() - renderStart);
  if (renderSamples.length > 120) renderSamples.shift();
  if (now - metricsAt > 1000) {
    metricsAt = now;
    const sorted = [...renderSamples].sort((a, b) => a - b);
    canvas.dataset.renderMedianMs = sorted[Math.floor(sorted.length / 2)].toFixed(2);
    canvas.dataset.renderP95Ms = sorted[Math.floor((sorted.length - 1) * .95)].toFixed(2);
    canvas.dataset.fps = view.debug.fps.toFixed(1);
    canvas.dataset.trackBuilds = String(renderer.stats.trackBuilds);
    canvas.dataset.trailPoints = String(renderer.stats.trailPoints);
  }
  if (view.debug.on) drawDebug();
  ctx.restore();

  requestAnimationFrame(drawFrame);
}

function drawDebug(): void {
  const d = view.debug;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(LOGICAL_W / 2 - 375, 4, 750, 30);
  ctx.fillStyle = d.fps >= 55 ? '#3ddc84' : '#ffb020';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${d.fps.toFixed(0)} fps · rendu ${canvas.dataset.renderMedianMs ?? '…'} ms · RTT ${d.rtt} ms · touch→frame ${d.touchMs.toFixed(0)} ms · ${d.contacts} pts`,
    LOGICAL_W / 2, 25,
  );
  ctx.restore();
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
requestAnimationFrame(drawFrame);
