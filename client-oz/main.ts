import type { GameState, Tangible, Team } from '../server/types.js';
import { StateSync, connectWs } from '../client-shared/net.js';
import { wallEndpoints } from '../client-shared/tangibleGeometry.js';
import { chargeZoneTeam, insidePanel } from '../server/layout.js';
import { OzMap } from './OzMap.js';

const status = document.getElementById('status')!;
const controls = document.getElementById('controls') as HTMLFieldSetElement;
const kind = document.getElementById('kind') as HTMLSelectElement;
const team = document.getElementById('team') as HTMLSelectElement;
const activation = document.getElementById('activation') as HTMLButtonElement;
const remove = document.getElementById('remove') as HTMLButtonElement;
const notice = document.getElementById('notice')!;
const list = document.getElementById('tangible-list')!;
const sync = new StateSync();
let state: GameState | null = null;
let selectedId = 1;
let previousSelectionKey = '';
const names = { A: 'Cyan', B: 'Rose' };
const buttons = new Map<number, HTMLButtonElement>();

const conn = connectWs('/ws/oz', {
  onOpen: () => { status.textContent = 'Connecté'; },
  onClose: () => { controls.disabled = true; status.textContent = 'Déconnecté · reconnexion…'; map.cancel(); },
  onMessage: msg => {
    if (msg.type !== 'State') return;
    state = sync.apply(msg.state, msg.t);
    const enabled = ['READY', 'RACE', 'PAUSED'].includes(state.phase);
    controls.disabled = !enabled;
    status.textContent = enabled ? 'Connecté' : 'En attente du circuit';
    map.setState(state);
    refresh();
  },
});
function emit(type: string, params: Record<string, unknown>): boolean {
  if (!conn.isOpen() || controls.disabled) { notice.textContent = 'Action indisponible : attendre la connexion et le circuit.'; return false; }
  conn.send({ type, ...params }); notice.textContent = ''; return true;
}
function configure(): void {
  emit('TangibleControl', { id: selectedId, action: 'configure', team: team.value, kind: kind.value });
}
function ensureConfigured(): void {
  if (!state?.tangibles[selectedId]) configure();
}
const map = new OzMap(document.getElementById('oz-map') as HTMLCanvasElement, {
  enabled: () => conn.isOpen() && !controls.disabled,
  selectedId: () => selectedId,
  selectedKind: () => kind.value as Tangible['kind'],
  selectedTeam: () => team.value as Team,
  onSelect: id => { selectedId = id; previousSelectionKey = ''; refresh(); },
  onMove: (id, x, y, angle) => {
    if (!state) return false;
    const point = { x: x * state.params.logicalWidth, y: y * state.params.logicalHeight };
    const dockTeam = chargeZoneTeam(point);
    if (dockTeam) {
      if (state.tangibles[id]?.dockTeam !== dockTeam) emit('TangibleControl', { id, action: 'dock', team: dockTeam, kind: kind.value });
      return false;
    }
    const ends = kind.value === 'wall' ? wallEndpoints(point, angle, state.params.wallLengthPx) : [point];
    if ([point, ...ends].some(p => insidePanel(p) || p.x < 0 || p.y < 0 || p.x > state!.params.logicalWidth || p.y > state!.params.logicalHeight)) {
      notice.textContent = 'Gardez le tangible dans la surface de jeu.'; return false;
    }
    ensureConfigured();
    return emit('TangibleMoved', { id, x, y, angle });
  },
});
for (const id of [1, 2, 3, 4]) {
  const b = document.createElement('button');
  b.addEventListener('click', () => { selectedId = id; previousSelectionKey = ''; refresh(); map.draw(); });
  buttons.set(id, b); list.append(b);
}
function refresh(): void {
  const chosen = state?.tangibles[selectedId];
  const key = `${selectedId}:${chosen?.kind ?? 'wall'}:${chosen?.team ?? 'A'}`;
  if (key !== previousSelectionKey) {
    kind.value = chosen?.kind ?? 'wall'; team.value = chosen?.team ?? 'A'; previousSelectionKey = key;
  }
  for (const [id, button] of buttons) {
    const t = state?.tangibles[id];
    button.classList.toggle('selected', id === selectedId);
    button.setAttribute('aria-pressed', String(id === selectedId));
    const label = t ? `#${id} · ${t.kind === 'wall' ? 'Mur' : 'Pilier'} · ${names[t.team]}` : `#${id} · Non placé`;
    if (button.dataset.label !== label || button.dataset.active !== String(!!t?.active)) {
      button.replaceChildren();
      const dot = document.createElement('span'); dot.className = `dot${t?.active ? ' on' : ''}`; dot.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span'); text.textContent = label;
      button.append(dot, text); button.dataset.label = label; button.dataset.active = String(!!t?.active);
      button.setAttribute('aria-label', `${label} · ${t?.active ? 'activé' : 'désactivé'}`);
    }
  }
  activation.textContent = chosen?.active ? 'Désactiver' : 'Activer';
  activation.setAttribute('aria-pressed', String(!!chosen?.active));
  remove.disabled = !chosen;
}
kind.addEventListener('change', configure);
team.addEventListener('change', configure);
activation.addEventListener('click', () => {
  const active = state?.tangibles[selectedId]?.active;
  ensureConfigured(); emit('TangibleControl', { id: selectedId, action: active ? 'deactivate' : 'activate' });
});
document.getElementById('dock')!.addEventListener('click', () => emit('TangibleControl', { id: selectedId, action: 'dock', team: team.value, kind: kind.value }));
remove.addEventListener('click', () => emit('TangibleRemoved', { id: selectedId }));
refresh();
