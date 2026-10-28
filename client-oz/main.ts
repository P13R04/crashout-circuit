import { StateSync, connectWs, type Connection } from '../client-shared/net.js';
import { OzMap, type OzTool } from './OzMap.js';
import { OzController, ozShortcut } from './OzController.js';
import type { Vec2 } from '../server/types.js';
import type { TangibleId } from '../server/tangibles.js';

const status = document.getElementById('status')!;
const hint = document.getElementById('hint')!;
const btnArc = document.getElementById('btn-arc') as HTMLButtonElement;
const btnWall = document.getElementById('btn-wall') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const canvas = document.getElementById('oz-map') as HTMLCanvasElement;
const placementMode = document.getElementById('placement-mode') as HTMLSelectElement;
const touchTools = document.getElementById('touch-tools')!;
const touchCancel = document.getElementById('touch-cancel') as HTMLButtonElement;
const touchButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-tangible]')];

const sync = new StateSync();
let conn: Connection;
let wasTouch = false;

// Controller kept for state tracking, optimistic reconciliation & unit tests
const controller = new OzController((type, params) => {
  if (!conn?.isOpen()) return false;
  conn.send({ type, ...params });
  return true;
}, () => refresh());

function updateToolUI(tool: OzTool, step: number): void {
  if (controller.state?.tangiblePlacementMode === 'touch') return;
  btnArc.classList.toggle('active', tool === 'arc');
  btnWall.classList.toggle('active', tool === 'wall');

  const maxRange = controller.state?.params.arcMaxDistPx ?? 350;

  if (tool === 'arc') {
    if (step === 0) {
      hint.textContent = '⚡ Pylônes / Arc : cliquez sur la carte pour placer le 1er pylône';
    } else {
      hint.textContent = `⚡ Pylônes / Arc : cliquez pour placer le 2e pylône (arc si distance ≤ ${maxRange} px, pylônes seuls au-delà)`;
    }
    canvas.style.cursor = 'crosshair';
  } else if (tool === 'wall') {
    if (step === 0) {
      hint.textContent = '🧱 Mur : cliquez sur la carte pour poser le 1er point';
    } else {
      hint.textContent = '🧱 Mur : cliquez sur un 2e point pour orienter et poser le mur';
    }
    canvas.style.cursor = 'crosshair';
  } else {
    hint.textContent = 'Cliquez sur un bouton (⚡ Arc ou 🧱 Mur), ou cliquez sur un obstacle pour le déplacer';
    canvas.style.cursor = 'default';
  }
}

const map = new OzMap(canvas, {
  enabled: () => controller.enabled,
  selectedId: () => controller.selectedId,
  selectedKind: () => (controller.selectedId === 1 ? 'wall' : 'pylon'),
  preparing: () => controller.preparing,
  draftAngle: () => controller.draftAngle,
  onDock: team => controller.dock(team),
  onSelect: id => controller.select(id),
  onPlace: pose => controller.place(pose),
  onMove: (id, x, y, angle) => controller.move(id, { x, y, angle }),
  onDragStart: () => controller.beginGesture(),
  onDragEnd: () => controller.endGesture(),
  onRemove: id => { if(conn?.isOpen())conn.send({type:'TangibleRemoved',id}); },

  onPlaceArc: (p1: Vec2, p2: Vec2) => {
    if (!conn?.isOpen()) return;
    const maxRange = controller.state?.params.arcMaxDistPx ?? 350;
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    // Place Pylon 1 (id: 2) and Pylon 2 (id: 3)
    conn.send({ type: 'TangibleMoved', id: 2, x: p1.x / 1920, y: p1.y / 1080, angle: 0, active: true });

    conn.send({ type: 'TangibleMoved', id: 3, x: p2.x / 1920, y: p2.y / 1080, angle: 0, active: true });

    if (d <= maxRange) {
      hint.textContent = `⚡ Arc électrique formé entre les 2 pylônes (${Math.round(d)} px ≤ ${maxRange} px) !`;
    } else {
      hint.textContent = `2 pylônes placés (${Math.round(d)} px > ${maxRange} px : hors de portée, aucun arc actif)`;
    }
    updateToolUI(null, 0);
  },

  onPlaceWall: (center: Vec2, angle: number) => {
    if (!conn?.isOpen()) return;
    // Place Wall (id: 1)
    conn.send({
      type: 'TangibleMoved',
      id: 1,
      x: center.x / 1920,
      y: center.y / 1080,
      angle: ((angle % 360) + 360) % 360,
      active: true,
    });

    hint.textContent = `🧱 Mur posé à l’angle ${Math.round(angle)}° !`;
    updateToolUI(null, 0);
  },

  onRelocateTangible: (id: TangibleId, pos: Vec2, angle?: number) => {
    if (!conn?.isOpen()) return;
    const maxRange = controller.state?.params.arcMaxDistPx ?? 350;
    if (id === 1) {
      const wall = controller.state?.tangibles[1];
      const finalAngle = angle !== undefined ? angle : (wall?.angle ?? 0);
      conn.send({
        type: 'TangibleMoved',
        id: 1,
        x: pos.x / 1920,
        y: pos.y / 1080,
        angle: ((finalAngle % 360) + 360) % 360,
        active: true,
      });
      hint.textContent = `🧱 Mur déplacé et orienté à ${Math.round(finalAngle)}° !`;
    } else if (id === 2 || id === 3) {
      const team = id === 2 ? 'A' : 'B';
      conn.send({
        type: 'TangibleMoved',
        id,
        x: pos.x / 1920,
        y: pos.y / 1080,
        angle: 0,
        active: true,
      });
      const otherId = id === 2 ? 3 : 2;
      const other = controller.state?.tangibles[otherId];
      if (other?.status === 'placed') {
        const d = Math.hypot(other.x * 1920 - pos.x, other.y * 1080 - pos.y);
        if (d <= maxRange) {
          hint.textContent = `⚡ Pylône ${id === 2 ? '1' : '2'} déplacé : arc électrique actif (${Math.round(d)} px ≤ ${maxRange} px) !`;
        } else {
          hint.textContent = `Pylône ${id === 2 ? '1' : '2'} déplacé (${Math.round(d)} px > ${maxRange} px : hors de portée)`;
        }
      } else {
        hint.textContent = `⚡ Pylône ${id === 2 ? '1' : '2'} déplacé !`;
      }
    }
    updateToolUI(null, 0);
  },

  onMovingTangibleChange: (id: TangibleId | null, step: number = 0) => {
    if (id === 1) {
      if (step === 0) {
        hint.textContent = '🧱 Mur sélectionné : cliquez sur la carte pour poser le 1er point (ou Échap pour annuler)';
      } else {
        hint.textContent = '🧱 Mur : cliquez sur un 2e point pour orienter et déposer le mur';
      }
    } else if (id === 2) {
      hint.textContent = '⚡ Pylône 1 sélectionné : cliquez sur la carte à l’endroit où vous souhaitez le déposer (Échap pour annuler)';
    } else if (id === 3) {
      hint.textContent = '⚡ Pylône 2 sélectionné : cliquez sur la carte à l’endroit où vous souhaitez le déposer (Échap pour annuler)';
    } else {
      hint.textContent = 'Cliquez sur un bouton (⚡ Arc ou 🧱 Mur), ou cliquez sur un obstacle pour le déplacer';
    }
  },

  onToolStep: (tool, step) => {
    updateToolUI(tool, step);
  },
});

btnArc.addEventListener('click', () => {
  if (!controller.enabled) return;
  const current = map.getTool();
  map.setTool(current === 'arc' ? null : 'arc');
});

placementMode.addEventListener('change',()=>{
  map.cancel();
  if(conn?.isOpen())conn.send({type:'TangiblePlacementMode',mode:placementMode.value});
});
for(const button of touchButtons)button.addEventListener('click',()=>{
  if(conn?.isOpen())conn.send({type:'TangiblePrepare',id:Number(button.dataset.tangible)});
});
touchCancel.addEventListener('click',()=>{if(conn?.isOpen())conn.send({type:'TangiblePlacementCancel'});});

btnWall.addEventListener('click', () => {
  if (!controller.enabled) return;
  const current = map.getTool();
  map.setTool(current === 'wall' ? null : 'wall');
});

btnClear.addEventListener('click', () => {
  if (!conn?.isOpen()) return;
  map.cancel();
  conn.send({ type: 'TangibleRemoved', id: 1 });
  conn.send({ type: 'TangibleRemoved', id: 2 });
  conn.send({ type: 'TangibleRemoved', id: 3 });
  hint.textContent = 'Tous les obstacles ont été retirés.';
});

document.addEventListener('keydown', e => {
  if(e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))return;
  const shortcut=ozShortcut(e);
  const id=shortcut==='wall'?1:shortcut==='pylon1'?2:shortcut==='pylon2'?3:null;
  if(id && controller.state?.tangiblePlacementMode==='touch' && !e.repeat){
    e.preventDefault();touchButtons.find(b=>Number(b.dataset.tangible)===id)?.click();return;
  }
  if(shortcut==='wall' && controller.state?.tangiblePlacementMode==='manual' && !e.repeat){e.preventDefault();btnWall.click();return;}

  if (e.key === 'Escape') {
    if(controller.state?.tangiblePlacementMode==='touch'&&conn?.isOpen())conn.send({type:'TangiblePlacementCancel'});
    map.cancel();
    updateToolUI(null, 0);
  }
});

function refresh(): void {
  const enabled = controller.enabled;
  const s=controller.state,touch=s?.tangiblePlacementMode==='touch',pending=s?.tangiblePlacement;
  placementMode.disabled=!controller.connected||!s;
  placementMode.value=touch?'touch':'manual';
  touchTools.hidden=!touch;
  btnArc.hidden=touch;btnWall.hidden=touch;btnClear.hidden=touch;
  for(const button of touchButtons){
    const id=Number(button.dataset.tangible);
    button.disabled=!enabled||s?.phase==='PAUSED';
    button.classList.toggle('active',pending?.id===id);
    button.setAttribute('aria-pressed',String(pending?.id===id));
    button.title=`Annoncer la prochaine pose · ${id===1?'1 / &':id===2?'2 / é':'3 / "'}`;
  }
  touchCancel.hidden=!pending;
  touchCancel.textContent=`Annuler · ${Math.max(0,Math.ceil(((pending?.expiresAt??0)-sync.now())/1000))} s`;
  if(touch){
    hint.textContent=pending?'Posez l’objet · deux contacts sur la table':'Choisissez l’objet à poser · cliquez sur la carte pour le retirer';
    if(!wasTouch)canvas.style.cursor='default';
  }
  if(!touch&&wasTouch)updateToolUI(null,0);
  wasTouch=touch;
  btnArc.disabled = !enabled;
  btnWall.disabled = !enabled;
  btnClear.disabled = !enabled;

  if (!controller.connected) {
    status.textContent = 'Déconnecté · reconnexion…';
    status.classList.remove('online');
  } else if (!enabled) {
    status.textContent = 'En attente du circuit';
    status.classList.remove('online');
  } else {
    status.textContent = s?.phase==='PAUSED'?'Pause':s?.phase==='READY'?'Circuit prêt':'En course';
    status.classList.add('online');
  }

  if (controller.state) {
    map.setState(controller.state);
  } else {
    map.draw();
  }
}

// Fluid 60fps render loop for real-time car tracking and 2-click live previews
function renderLoop(): void {
  map.draw();
  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);

// Resize handling
new ResizeObserver(() => {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  map.draw();
}).observe(canvas);

// Connect WebSocket
conn = connectWs('/ws/oz', {
  onOpen: () => controller.setConnected(true),
  onClose: () => {
    map.cancel();
    controller.setConnected(false);
  },
  onMessage: msg => {
    if (msg.type === 'State') {
      controller.applyState(sync.apply(msg.state, msg.t));
    }
  },
});

refresh();
