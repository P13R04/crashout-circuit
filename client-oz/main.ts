import type { ServerMessage, GameState, Team } from '../server/types.js';
import { StateSync, connectWs } from '../client-shared/net.js';
import { OzMap, PYLON_COLOR } from './OzMap.js';
import { OzLog } from './OzLog.js';

const statusEl = document.getElementById('status') as HTMLSpanElement;
const controlsEl = document.getElementById('controls-panel') as HTMLDivElement;
const mapCanvas = document.getElementById('oz-map') as HTMLCanvasElement;

const sync = new StateSync();
const log = new OzLog();
let state: GameState | null = null;
let selectedId = 1;
let selectedTeam: Team = 'A';

// ── Network ───────────────────────────────────────────────────────────────────
const conn = connectWs('/ws/oz', {
  onOpen: () => { statusEl.textContent = 'Connecté'; statusEl.style.color = '#34d399'; },
  onClose: () => { statusEl.textContent = 'Déconnecté'; statusEl.style.color = '#6b7280'; },
  onMessage: (msg: ServerMessage) => {
    if (msg.type !== 'State') return;
    state = sync.apply(msg.state, msg.t);
    statusEl.textContent = `Phase: ${state.phase}`;
    ozMap.setState(state);
    refreshActive();
  },
});

/** Send an operator event and journal it (REQ-7.3). */
function emit(type: string, params: Record<string, unknown>, journal = true): void {
  if (journal) log.record(type, params);
  conn.send({ type, ...params });
}

// ── Map ───────────────────────────────────────────────────────────────────────
const angleInput = document.createElement('input');
const ozMap = new OzMap(mapCanvas, {
  selectedId: () => selectedId,
  onSelect: (id) => {
    selectedId = id;
    const t = state?.tangibles[id];
    if (t) { angleInput.value = String(Math.round(((t.angle % 360) + 360) % 360)); angleLabel.textContent = `${angleInput.value}°`; }
    refreshSelector();
  },
  onMove: (id, x, y) => emit('TangibleMoved', { id, x, y, angle: Number(angleInput.value) }),
});

// ── Controls ──────────────────────────────────────────────────────────────────
controlsEl.innerHTML = `
  <style>
    .row { margin-bottom: 12px; }
    .row h3 { font-size: 11px; letter-spacing: 2px; color: #6b7280; margin-bottom: 6px; font-weight: normal; }
    button { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px; padding: 10px 14px; font: inherit; font-size: 13px; cursor: pointer; touch-action: manipulation; }
    button:active { background: #334155; }
    button.sel { outline: 2px solid #fff; }
    #ids button { min-width: 56px; font-weight: bold; }
    #angle { width: 220px; vertical-align: middle; }
    #active .item { display: inline-flex; gap: 6px; align-items: center; margin-right: 10px; }
    #journal { background: #070b16; border: 1px solid #1e2a40; border-radius: 4px; height: 170px; overflow-y: auto; padding: 6px; font-size: 11px; white-space: pre; }
    .danger { border-color: #7f1d1d; }
  </style>
  <div class="row"><h3>POTEAU (id 1–2 équipe cyan · 3–4 équipe rose)</h3>
    <span id="ids"></span>
  </div>
  <div class="row"><h3>ANGLE</h3>
    <input id="angle-slot" type="hidden"><span id="angle-wrap"></span> <span id="angle-label">0°</span>
  </div>
  <div class="row"><h3>POTEAUX ACTIFS</h3>
    <span id="active"></span>
    <button id="remove-sel" class="danger">Retirer poteau sélectionné</button>
  </div>
  <div class="row"><h3>SECOURS — équipe visée :
      <button id="team-A" class="sel">Cyan</button> <button id="team-B">Rose</button></h3>
    <button data-oz="obstacle">Obstacle</button>
    <button data-oz="boost">Boost</button>
    <button data-oz="breakdown" class="danger">Panne</button>
    <button data-oz="widen">Élargir</button>
    <button data-oz="fallbackTrack">Circuit ↺</button>
  </div>
  <div class="row"><h3>JOURNAL</h3>
    <div id="journal"></div>
    <div style="margin-top:6px">
      <button id="export">Export JSON</button>
      <button id="replay">Rejouer</button>
      <button id="stop-replay">Stop</button>
      <label style="font-size:12px;margin-left:8px">Charger <input id="load" type="file" accept="application/json"></label>
      <button id="server-log">Journal serveur</button>
    </div>
  </div>
  <div class="row"><h3>LATENCE OPÉRATEUR (R-16)</h3>
    <button id="reaction">Test de réaction</button> <span id="reaction-out" style="font-size:12px"></span>
  </div>
`;

const q = <T extends HTMLElement>(sel: string): T => controlsEl.querySelector(sel) as T;

// angle slider (0–360°)
angleInput.type = 'range';
angleInput.min = '0'; angleInput.max = '360'; angleInput.value = '0'; angleInput.id = 'angle';
q('#angle-wrap').appendChild(angleInput);
const angleLabel = q<HTMLSpanElement>('#angle-label');
angleInput.addEventListener('input', () => {
  angleLabel.textContent = `${angleInput.value}°`;
  // Rotate the selected pylon in place if it is on the table
  const t = state?.tangibles[selectedId];
  if (t) emit('TangibleMoved', { id: selectedId, x: t.x, y: t.y, angle: Number(angleInput.value) });
});

// id selector
const idsEl = q<HTMLSpanElement>('#ids');
function refreshSelector(): void {
  idsEl.innerHTML = '';
  for (const id of [1, 2, 3, 4]) {
    const b = document.createElement('button');
    b.textContent = ['①', '②', '③', '④'][id - 1];
    b.style.color = PYLON_COLOR[id];
    if (id === selectedId) b.classList.add('sel');
    b.addEventListener('click', () => {
      selectedId = id;
      const t = state?.tangibles[id];
      if (t) { angleInput.value = String(Math.round(((t.angle % 360) + 360) % 360)); angleLabel.textContent = `${angleInput.value}°`; }
      refreshSelector();
      ozMap.draw();
    });
    idsEl.appendChild(b);
  }
}
refreshSelector();

// active pylons, one "retirer" button each
const activeEl = q<HTMLSpanElement>('#active');
let activeKey = '';
function refreshActive(): void {
  const ids = Object.keys(state?.tangibles ?? {}).map(Number).sort();
  const key = ids.join(',');
  if (key === activeKey) return;
  activeKey = key;
  activeEl.innerHTML = '';
  if (ids.length === 0) activeEl.textContent = 'aucun ';
  for (const id of ids) {
    const item = document.createElement('span');
    item.className = 'item';
    item.innerHTML = `<b style="color:${PYLON_COLOR[id]}">poteau ${id}</b>`;
    const b = document.createElement('button');
    b.textContent = 'Retirer';
    b.addEventListener('click', () => emit('TangibleRemoved', { id }));
    item.appendChild(b);
    activeEl.appendChild(item);
  }
}

q('#remove-sel').addEventListener('click', () => emit('TangibleRemoved', { id: selectedId }));

// fallback buttons
for (const t of ['A', 'B'] as Team[]) {
  q(`#team-${t}`).addEventListener('click', () => {
    selectedTeam = t;
    q('#team-A').classList.toggle('sel', t === 'A');
    q('#team-B').classList.toggle('sel', t === 'B');
  });
}
controlsEl.querySelectorAll<HTMLButtonElement>('button[data-oz]').forEach((b) => {
  b.addEventListener('click', () => emit('OzTrigger', { kind: b.dataset.oz!, params: { team: selectedTeam } }));
});

// ── Journal, export, replay (task 15) ─────────────────────────────────────────
const journalEl = q<HTMLDivElement>('#journal');
log.subscribe(() => {
  journalEl.textContent = log.tail(50).join('\n');
  journalEl.scrollTop = journalEl.scrollHeight;
});
q('#export').addEventListener('click', () => log.download());

let loaded: ReturnType<typeof OzLog.parse> | null = null;
q<HTMLInputElement>('#load').addEventListener('change', async (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    loaded = OzLog.parse(await file.text());
    log.record('JournalLoaded', { entries: loaded.length });
  } catch (e) {
    alert(`Journal invalide : ${(e as Error).message}`);
  }
});
q('#replay').addEventListener('click', () => {
  const entries = loaded ?? [...log.entries];
  log.record('ReplayStart', { entries: entries.length });
  // Replayed events go straight to the server with their original delays
  const REPLAYABLE = new Set(['TangibleMoved', 'TangibleRemoved', 'OzTrigger']);
  log.replay(
    entries,
    (type, params) => { if (REPLAYABLE.has(type)) conn.send({ type, ...params }); },
    () => log.record('ReplayEnd', {}),
  );
});
q('#stop-replay').addEventListener('click', () => log.stopReplay());
q('#server-log').addEventListener('click', async () => {
  const res = await fetch('/api/oz-log');
  const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'server-tangible-log.json';
  a.click();
});

// ── Operator reaction time (R-16): a stimulus appears, the operator taps ──────
const reactionBtn = q<HTMLButtonElement>('#reaction');
const reactionOut = q<HTMLSpanElement>('#reaction-out');
let stimulusAt = 0;
let waiting = false;
reactionBtn.addEventListener('click', () => {
  if (waiting) return;
  if (stimulusAt) {
    const ms = Math.round(performance.now() - stimulusAt);
    stimulusAt = 0;
    reactionBtn.style.background = '';
    reactionBtn.textContent = 'Test de réaction';
    reactionOut.textContent = `${ms} ms`;
    log.record('ReactionTime', { ms });
    return;
  }
  reactionBtn.textContent = 'Attendez…';
  reactionOut.textContent = '';
  waiting = true;
  setTimeout(() => {
    waiting = false;
    stimulusAt = performance.now();
    reactionBtn.style.background = '#15803d';
    reactionBtn.textContent = 'MAINTENANT !';
  }, 1000 + Math.random() * 2000);
});
