import type { Team, ServerMessage, PilotJoinMsg, StateMsg } from '../server/types.js';

// ── Parse team from URL ───────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const team: Team = params.get('team') === 'B' ? 'B' : 'A';

const loadingEl = document.getElementById('loading') as HTMLDivElement;
const appEl     = document.getElementById('app') as HTMLDivElement;

// ── WebSocket connection ───────────────────────────────────────────────────────
const WS_URL = `ws://${location.host}/ws/pilot?team=${team}`;

let ws: WebSocket | null = null;

function connect(): void {
  ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    loadingEl.textContent = '';
    appEl.classList.add('ready');
    // Announce team
    send({ type: 'PilotJoin', t: Date.now(), team } satisfies PilotJoinMsg);
  });

  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      if (msg.type === 'State') updateUI(msg as StateMsg);
    } catch {
      // ignore
    }
  });

  ws.addEventListener('close', () => {
    appEl.classList.remove('ready');
    loadingEl.textContent = 'Reconnexion…';
    setTimeout(connect, 2000);
  });

  ws.addEventListener('error', () => ws?.close());
}

function send(msg: object): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function updateUI(_state: StateMsg): void {
  // Controls rendering is implemented in Task 3 (Controls.ts)
}

// ── Placeholder UI ─────────────────────────────────────────────────────────────
const teamColor = team === 'A' ? '#00e5ff' : '#ff4081';
appEl.innerHTML = `
  <div style="text-align:center;padding:20px;color:${teamColor}">
    <h1 style="font-size:24px;letter-spacing:2px">CRASHOUT</h1>
    <p style="font-size:14px;color:#666;margin-top:4px">ÉQUIPE ${team === 'A' ? 'CYAN' : 'ROSE'}</p>
  </div>
  <p style="text-align:center;color:#555;font-size:13px;padding:20px">
    Contrôles disponibles en Task 3…
  </p>
`;

connect();
