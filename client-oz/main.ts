import { StateSync, connectWs, type Connection } from '../client-shared/net.js';
import { OzMap, type OzTool } from './OzMap.js';
import { OzController, ozShortcut } from './OzController.js';
import type { Vec2 } from '../server/types.js';
import type { TangibleId } from '../server/tangibles.js';

const status = document.getElementById('status')!;
const hint = document.getElementById('hint')!;
const tutorialGuide = document.getElementById('tutorial-guide')!;
const btnArc = document.getElementById('btn-arc') as HTMLButtonElement;
const btnWall = document.getElementById('btn-wall') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const canvas = document.getElementById('oz-map') as HTMLCanvasElement;
const placementMode = document.getElementById('placement-mode') as HTMLSelectElement;
const touchTools = document.getElementById('touch-tools')!;
const touchCancel = document.getElementById('touch-cancel') as HTMLButtonElement;
const touchButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-tangible]')];

const login=document.getElementById('operator-login')!;
const consolePanel=document.getElementById('operator-console')!;
const loginError=document.getElementById('operator-error')!;
const loginSubmit=document.getElementById('operator-submit') as HTMLButtonElement;
const objectList=document.getElementById('object-list')!;
const objectCards=new Map<number,{state:HTMLElement;toggle:HTMLButtonElement;remove:HTMLButtonElement}>();
for(const id of [1,2,3]){
  const card=document.createElement('article');card.className='object-card';
  const name=document.createElement('strong');name.textContent=id===1?'Mur':`Pilier ${id-1}`;
  const state=document.createElement('span');state.className='object-state';
  const actions=document.createElement('div');actions.className='object-actions';
  const toggle=document.createElement('button');toggle.type='button';toggle.dataset.objectToggle=String(id);
  const remove=document.createElement('button');remove.type='button';remove.textContent='Retirer';remove.dataset.objectRemove=String(id);remove.setAttribute('aria-label',`Retirer ${id===1?'le mur':`le pilier ${id-1}`}`);
  toggle.addEventListener('click',()=>{const t=controller.state?.tangibles[id];if(t&&conn?.isOpen())conn.send({type:'TangibleControl',id,action:t.active?'deactivate':'activate'});});
  remove.addEventListener('click',()=>{if(conn?.isOpen())conn.send({type:'TangibleRemoved',id});});
  actions.append(toggle,remove);card.append(name,state,actions);objectList.append(card);objectCards.set(id,{state,toggle,remove});
}
const sync = new StateSync();
let conn: Connection | undefined;
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
  touchCancel.disabled=!controller.enabled||!tool;

  if (tool === 'arc') {
    if (step === 0) {
      hint.textContent = 'Touchez la carte pour poser le premier pilier.';
    } else {
      hint.textContent = 'Posez le second pilier à proximité du premier.';
    }
    canvas.style.cursor = 'crosshair';
  } else if (tool === 'wall') {
    if (step === 0) {
      hint.textContent = 'Touchez le premier point du mur.';
    } else {
      hint.textContent = 'Touchez le second point pour orienter le mur.';
    }
    canvas.style.cursor = 'crosshair';
  } else {
    hint.textContent = 'Choisissez un objet, ou touchez un objet posé pour le déplacer.';
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
        hint.textContent = 'Touchez la nouvelle position du mur.';
      } else {
        hint.textContent = 'Touchez le second point pour orienter le mur.';
      }
    } else if (id === 2) {
      hint.textContent = 'Touchez la nouvelle position du pilier 1.';
    } else if (id === 3) {
      hint.textContent = 'Touchez la nouvelle position du pilier 2.';
    } else {
      hint.textContent = 'Choisissez un objet, ou touchez un objet posé pour le déplacer.';
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
touchCancel.addEventListener('click',()=>{if(conn?.isOpen())conn.send({type:'TangiblePlacementCancel'});map.cancel();updateToolUI(null,0);});
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-rotate-wall]'))button.addEventListener('click',()=>{map.cancel();controller.select(1);controller.rotate(Number(button.dataset.rotateWall));});

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

document.getElementById('download-log')!.addEventListener('click',async()=>{
  const button=document.getElementById('download-log') as HTMLButtonElement;
  const status=document.getElementById('journal-status')!;button.disabled=true;status.textContent='';
  try{
    const response=await fetch('/api/oz-log',{cache:'no-store'});
    if(response.status===401){requireLogin('Saisissez de nouveau le code opérateur.');return;}
    if(!response.ok)throw Error('journal');
    const file=new Blob([JSON.stringify(await response.json(),null,2)],{type:'application/json'}),url=URL.createObjectURL(file);
    const link=document.createElement('a');link.href=url;link.download=`tangibles-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status.textContent='Journal téléchargé.';
  }catch{status.textContent='Téléchargement indisponible. Réessayez.';}finally{button.disabled=false;}
});

document.addEventListener('keydown', e => {
  if(e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))return;
  const shortcut=ozShortcut(e);
  const id=shortcut==='wall'?1:shortcut==='pylon1'?2:shortcut==='pylon2'?3:null;
  if(id && controller.state?.tangiblePlacementMode==='touch' && !e.repeat){
    e.preventDefault();touchButtons.find(b=>Number(b.dataset.tangible)===id)?.click();return;
  }
  if(shortcut==='wall' && controller.state?.tangiblePlacementMode==='manual' && !e.repeat){e.preventDefault();btnWall.click();return;}

  if (e.key === 'Escape' || (!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.toLowerCase()==='a')) {
    e.preventDefault();
    if(controller.state?.tangiblePlacementMode==='touch'&&conn?.isOpen())conn.send({type:'TangiblePlacementCancel'});
    map.cancel();
    updateToolUI(null, 0);
  }
});

function refresh(): void {
  const enabled = controller.enabled;
  const s=controller.state,touch=s?.tangiblePlacementMode==='touch',pending=s?.tangiblePlacement;
  tutorialGuide.hidden=!s?.tutorial;
  if(s?.tutorial){
    const tut=s.tutorial;
    const label=(team:'A'|'B')=>{
      const progress=tut.teams[team],id=tut.steps[progress.step];
      const name=team==='A'?'Cyan':'Rose';
      const action=id==='wall'?(progress.sub?'attendre le contact voiture / mur':'annoncer le mur (1), puis laisser le copilote le poser')
        :id==='pylon'?'annoncer les piliers (2, puis 3), laisser les copilotes les poser à portée d’arc'
        :id==='depot'?(['A','B'] as const).every(t=>!tut.steps[tut.teams[t].step]||tut.steps[tut.teams[t].step]==='depot')?'faire ranger les trois obstacles dans la réserve, puis les retirer sur la carte':'attendre la fin des essais de l’autre équipe'
        :!id?'terminé':'gestes et conduite · aucune intervention';
      return `${name} : ${action}`;
    };
    tutorialGuide.textContent=tut.finished?'Tutoriel terminé · les joueurs peuvent créer leur circuit.':`${label('A')} · ${label('B')}${!touch?' · Pour les poses avec les doigts : changer le mode de placement.':''}`;
  }
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
  touchCancel.disabled=!enabled||(!pending&&!map.hasOperation);
  touchCancel.textContent=pending?`Annuler · ${Math.max(0,Math.ceil((pending.expiresAt-sync.now())/1000))} s`:'Annuler';
  if(touch){
    hint.textContent=pending?'Posez l’objet · deux contacts sur la table':'Choisissez l’objet avant sa pose · touchez un objet sur la carte pour le retirer';
    if(!wasTouch)canvas.style.cursor='default';
  }
  if(!touch&&wasTouch)updateToolUI(null,0);
  wasTouch=touch;
  btnArc.disabled = !enabled;
  btnWall.disabled = !enabled;
  btnClear.disabled = !enabled;
  for(const [id,card]of objectCards){
    const t=s?.tangibles[id],placed=t?.status==='placed';
    card.state.textContent=!placed?'Dans la réserve':t.active?'Actif sur la piste':'Désactivé sur la piste';
    card.toggle.textContent=t?.active?'Désactiver':'Activer';card.toggle.disabled=!enabled||!placed;card.remove.disabled=!enabled||!placed;
    card.toggle.setAttribute('aria-label',`${t?.active?'Désactiver':'Activer'} ${id===1?'le mur':`le pilier ${id-1}`}`);
  }
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-rotate-wall]'))button.disabled=!enabled||!!touch||s?.tangibles[1]?.status!=='placed';

  if (!controller.connected) {
    status.textContent = 'Déconnecté · reconnexion…';
    status.classList.remove('online');
  } else if (!enabled) {
    status.textContent = 'En attente du circuit';
    status.classList.remove('online');
  } else {
    status.textContent = s?.phase==='PAUSED'?'Pause':s?.phase==='READY'?'Circuit prêt':s?.tutorial?'Tutoriel':'En course';
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

// Portrait phones use the height of the map; a visible button changes orientation without a keyboard.
let quarter=0,manualQuarter=false;
document.getElementById('view-rotate')!.addEventListener('click',()=>{manualQuarter=true;quarter=(quarter+1)%4;map.setQuarter(quarter);refresh();});
new ResizeObserver(()=>{
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
  const next=rect.height>rect.width*1.15?1:0;
  if(!manualQuarter&&next!==quarter){quarter=next;map.setQuarter(quarter);}
  map.draw();
}).observe(document.getElementById('map-container')!);

function requireLogin(message=''):void {
  conn?.close();conn=undefined;map.cancel();controller.setConnected(false);
  consolePanel.hidden=true;login.hidden=false;loginError.textContent=message;
}
function connectOperator():void {
  login.hidden=true;consolePanel.hidden=false;loginError.textContent='';conn?.close();
  conn=connectWs('/ws/oz',{
    onOpen:()=>controller.setConnected(true),
    onClose:()=>{map.cancel();controller.setConnected(false);},
    onUnauthorized:()=>requireLogin('Saisissez le code affiché sur l’ordinateur du jeu.'),
    onMessage:msg=>{if(msg.type==='State')controller.applyState(sync.apply(msg.state,msg.t));},
  });
}
document.getElementById('operator-form')!.addEventListener('submit',async event=>{
  event.preventDefault();loginSubmit.disabled=true;loginError.textContent='';
  try{
    const code=(document.getElementById('operator-code') as HTMLInputElement).value;
    const response=await fetch('/api/operator/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
    if(!response.ok){loginError.textContent='Code incorrect. Réessayez.';return;}
    (document.getElementById('operator-code') as HTMLInputElement).value='';connectOperator();
  }catch{loginError.textContent='Connexion au jeu indisponible.';}finally{loginSubmit.disabled=false;}
});
void fetch('/api/operator/session',{cache:'no-store'}).then(r=>r.json()).then(value=>{if(value.authorized)connectOperator();}).catch(()=>{loginError.textContent='Connexion au jeu indisponible.';});
refresh();
