/** Affiche le flux spectateur sans établir de connexion de jeu. */
import { StateSync } from '../../client-shared/net.js';
import { readSession } from '../../client-shared/sessionInfo.js';
import { RaceFrames } from '../../client-shared/raceMap/raceFrames.js';
import { RaceMap } from '../../client-shared/raceMap/RaceMap.js';
import { SceneSlot } from '../../client-shared/race3d/SceneSlot.js';
import type { CameraMode } from '../../client-shared/race3d/cameras.js';
import type { RaceViewState } from '../../server/protocol/raceView.js';
import type { Team } from '../../server/types.js';

const root = document.querySelector<HTMLElement>('#watch-view')!;
const status = document.querySelector<HTMLElement>('#watch-status')!;
const options = document.querySelector<HTMLElement>('#watch-options')!;
const camera = document.querySelector<HTMLSelectElement>('#camera')!;
const teamSelect = document.querySelector<HTMLSelectElement>('#watch-team')!;
const carChoice = document.querySelector<HTMLElement>('#car-choice')!;
const canvas = document.createElement('canvas');
canvas.setAttribute('aria-label', 'Plan du circuit');
canvas.hidden = true;
const ctx = canvas.getContext('2d')!;
const map = new RaceMap();
const scene = new SceneSlot(() => {
  camera.value = 'overview';
  camera.disabled = true;
  carChoice.hidden = true;
  refresh();
});
root.prepend(canvas, scene.canvas);

const sync = new StateSync();
const frames = new RaceFrames(70);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let state: RaceViewState | null = null;
let online = false;
let disconnected = false;
let stream: EventSource | null = null;
let reconnect = 0;
let roomCode = '';

const director = () => camera.value as CameraMode;
const team = (): Team => state?.soloTest ? 'A' : teamSelect.value as Team;

function refresh(): void {
  options.hidden = !state?.track;
  carChoice.hidden = !state || state.soloTest || director() === 'overview';
  const phase = state?.phase;
  const winner = state?.winner;
  status.textContent = !online ? disconnected ? 'Connexion perdue. Reconnexion…' : 'Connexion à la course…'
    : phase === 'PAUSED' ? 'Course en pause.'
    : phase === 'RESULT' ? winner === 'draw' ? 'Égalité.' : winner ? `Victoire de l’équipe ${winner === 'A' ? 'cyan' : 'rose'}.` : 'Course terminée.'
    : phase === 'RACE' ? '' : 'En attente du départ.';
  if (scene.failed) status.textContent += '  Vue 2D active.';
}

function draw(): void {
  requestAnimationFrame(draw);
  if (!state?.track || document.hidden) {
    canvas.hidden = true;
    scene.hide();
    return;
  }
  const now = state.phase === 'PAUSED' ? state.pausedAt : sync.now();
  const poses = reduced.matches ? state.cars : frames.poses(now);
  canvas.hidden = scene.draw(state, poses, director(), team(), now, reduced.matches);
  if (!canvas.hidden) {
    const ratio = Math.min(2, devicePixelRatio);
    const w = Math.round(canvas.clientWidth * ratio), h = Math.round(canvas.clientHeight * ratio);
    if (!w || !h) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const { logicalWidth, logicalHeight } = state.params;
    map.draw(ctx, { center: { x: logicalWidth / 2, y: logicalHeight / 2 }, width: w, height: h,
      rotation: 0, scale: Math.min(w / (logicalWidth + 60), h / (logicalHeight + 60)) }, state, poses, now);
  }
}

function onFrame(message: MessageEvent<string>): void {
  const packet = JSON.parse(message.data) as { state: RaceViewState; t: number };
  const changed = packet.state.phase !== state?.phase || packet.state.trackVersion !== state.trackVersion;
  state = sync.apply(packet.state, packet.t);
  frames.update(state, packet.t);
  if (director() !== 'overview' && state.cars[team()].disabled) {
    camera.value = 'overview';
    refresh();
  } else if (changed) refresh();
}

async function open(): Promise<void> {
  const info = await readSession();
  const raw = new URLSearchParams(location.search).get('room');
  const room = raw?.trim().toUpperCase() || info.room;
  if (!info.spectators || room !== info.room) {
    status.textContent = 'Séance spectateur indisponible. Vérifie le lien ou scanne le QR de la table.';
    return;
  }
  roomCode = room;
  connect();
}

function connect(): void {
  stream?.close();
  const current = stream = new EventSource('/api/spectator?room=' + roomCode);
  current.addEventListener('race', onFrame);
  current.onopen = () => { online = true; refresh(); };
  current.onerror = () => {
    online = false;
    disconnected = true;
    refresh();
    if (current.readyState === EventSource.CLOSED) reconnect = window.setTimeout(connect, 2000);
  };
}

function showError(): void { status.textContent = 'Serveur injoignable. Actualise la page pour réessayer.'; }
camera.addEventListener('change', refresh);
window.addEventListener('pagehide', () => {
  clearTimeout(reconnect);
  stream?.close();
});
window.addEventListener('pageshow', event => {
  if (event.persisted && roomCode) connect();
});
requestAnimationFrame(draw);
void open().catch(showError);
