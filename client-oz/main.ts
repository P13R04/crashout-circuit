import { StateSync, connectWs, type Connection } from '../client-shared/net.js';
import { TANGIBLES, tangibleDefinition, type TangibleId } from '../server/tangibles.js';
import { OzMap } from './OzMap.js';
import { OzController, ozShortcut } from './OzController.js';

const status = document.getElementById('status')!;
const controls = document.getElementById('controls') as HTMLFieldSetElement;
const notice = document.getElementById('notice')!;
const hint = document.getElementById('hint')!;
const arc = document.getElementById('arc-state')!;
const presence = document.getElementById('presence') as HTMLButtonElement;
const undo = document.getElementById('undo') as HTMLButtonElement;
const cancel = document.getElementById('cancel') as HTMLButtonElement;
const view = document.getElementById('rotate-view') as HTMLButtonElement;
const canvas = document.getElementById('oz-map') as HTMLCanvasElement;
const sync = new StateSync();
const buttons = new Map<TangibleId, HTMLButtonElement>();
let conn: Connection;
let quarter = 0;
try { const stored = Number(localStorage.getItem('oz-view')); if (Number.isInteger(stored) && stored >= 0 && stored < 4) quarter = stored; } catch { /* Storage may be disabled. */ }
const controller = new OzController((type, params) => {
  if (!conn?.isOpen()) return false;
  conn.send({ type, ...params }); return true;
}, () => refresh());
const map = new OzMap(canvas, {
  enabled: () => controller.enabled,
  selectedId: () => controller.selectedId,
  selectedKind: () => tangibleDefinition(controller.selectedId)!.kind,
  preparing: () => controller.preparing,
  draftAngle: () => controller.draftAngle,
  onDock: team => controller.dock(team),
  onSelect: id => controller.select(id),
  onPlace: pose => controller.place(pose),
  onMove: (id, x, y, angle) => controller.move(id, { x, y, angle }),
  onDragStart: () => controller.beginGesture(),
  onDragEnd: () => controller.endGesture(),
});
map.setQuarter(quarter);
for (const t of TANGIBLES) {
  const button = document.createElement('button'); button.type = 'button';
  button.className = 'object'; button.dataset.id = String(t.id);
  button.setAttribute('aria-keyshortcuts', t.id === 1 ? 'M' : String(t.id - 1));
  button.innerHTML = `<span class="object-icon" aria-hidden="true">${t.kind === 'wall' ? '━' : '◉'}</span><span><strong>${t.name}</strong><span class="object-state">Absent</span></span><kbd>${t.shortcut}</kbd>`;
  button.addEventListener('click', () => { controller.select(t.id); if (controller.state?.tangibles[t.id]?.status === 'docked' && controller.state.tangibles[t.id].active) controller.prepare(t.id); });
  buttons.set(t.id, button); document.getElementById('tangible-list')!.append(button);
}
function rotateView(): void {
  quarter = (quarter + 1) % 4; map.setQuarter(quarter);
  try { localStorage.setItem('oz-view', String(quarter)); } catch { /* Optional preference. */ }
  refresh();
}
function refresh(): void {
  const s = controller.state;
  controls.disabled = !controller.enabled;
  status.textContent = !controller.connected ? 'Déconnecté · reconnexion…' : !controller.enabled ? 'En attente du circuit' : 'Connecté · objets neutres';
  status.classList.toggle('online', controller.enabled);
  for (const [id, button] of buttons) {
    const selected = id === controller.selectedId, tangible = s?.tangibles[id], active = !!tangible?.active;
    button.classList.toggle('selected', selected); button.classList.toggle('present', active);
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('.object-state')!.textContent = selected && controller.preparing ? 'À placer · cliquez sur la carte' : tangible?.status === 'docked' ? active ? 'Chargé · prêt à poser' : 'En station · à charger' : tangible ? active ? 'Actif' : 'Désactivé' : 'À recharger';
  }
  arc.textContent = !s?.tangibles[2]?.active || !s?.tangibles[3]?.active || s.tangibles[2].status !== 'placed' || s.tangibles[3].status !== 'placed' ? 'Pylône manquant' : s.arcs.length ? 'Arc établi' : 'Hors portée';
  arc.classList.toggle('linked', !!s?.arcs.length);
  const chosen = s?.tangibles[controller.selectedId];
  presence.querySelector('span')!.textContent = chosen?.status === 'docked' ? chosen.active ? 'Décharger' : '⚡ Charger' : chosen?.active ? 'Désactiver' : 'Activer';
  presence.disabled = !chosen;
  undo.disabled = !controller.canUndo; cancel.disabled = !controller.preparing;
  view.querySelector('span')!.textContent = `Vue ${quarter * 90}°`;
  const name = tangibleDefinition(controller.selectedId)!.name;
  hint.textContent = controller.preparing ? `${name} · clic pour poser${controller.selectedId === 1 ? ' · glisser pour orienter' : ''}`
    : chosen?.status === 'placed' ? 'Correction ±15 mm / 15° · nouvelle pose : recharge'
    : chosen?.active ? `${name} chargé · ${controller.selectedId === 1 ? 'M' : controller.selectedId-1} pour poser`
    : 'Station cyan ou rose → charger → poser';
  if (controller.notice) hint.textContent = '';
  notice.textContent = controller.notice;
  canvas.style.cursor = controller.preparing ? 'crosshair' : 'default';
  if (s) map.setState(s); else map.draw();
}
for (const team of ['A','B'] as const) document.getElementById(`dock-${team}`)!.addEventListener('click',()=>controller.dock(team));
presence.addEventListener('click', () => controller.presence());
undo.addEventListener('click', () => { map.cancel(); controller.undo(); });
cancel.addEventListener('click', () => { map.cancel(); controller.cancelPreparation(); });
view.addEventListener('click', rotateView);
let rotating = false;
document.addEventListener('keydown', e => {
  if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  const action = ozShortcut(e);
  if (!action || !controller.enabled) return;
  e.preventDefault();
  if (action === 'left' || action === 'right') {
    if (!rotating) { map.cancel(); controller.beginGesture(); rotating = true; }
    controller.rotate((action === 'left' ? -1 : 1) * (e.shiftKey ? 15 : 5)); return;
  }
  if (e.repeat) return;
  rotating = false; controller.endGesture(); map.cancel();
  switch (action) {
    case 'wall': controller.prepare(1); break;
    case 'pylon1': controller.prepare(2); break;
    case 'pylon2': controller.prepare(3); break;
    case 'presence': controller.presence(); break;
    case 'remove': controller.presence(false); break;
    case 'cancel': controller.cancelPreparation(); break;
    case 'undo': controller.undo(); break;
    case 'view': rotateView(); break;
  }
});
document.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { rotating = false; controller.endGesture(); }
});
window.addEventListener('blur', () => { rotating = false; map.cancel(); controller.cancelPreparation(); });
new ResizeObserver(() => {
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr)); canvas.height = Math.max(1, Math.round(rect.height * dpr));
  map.cancel(); map.draw();
}).observe(canvas);
conn = connectWs('/ws/oz', {
  onOpen: () => controller.setConnected(true),
  onClose: () => { map.cancel(); controller.setConnected(false); },
  onMessage: msg => { if (msg.type === 'State') controller.applyState(sync.apply(msg.state, msg.t)); },
});
refresh();
