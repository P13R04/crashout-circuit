/**
 * Relie les boutons, les raccourcis et le journal de la console à sa carte et à la connexion WebSocket.
 * Liens : client-oz/index.html, client-shared/net.ts, client-oz/OzMap.ts, client-oz/OzController.ts,
 * server/types.ts et les utilitaires importés ci-dessous.
 */
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
const quickUndo=document.getElementById('quick-undo') as HTMLButtonElement;
const quickDeselect=document.getElementById('quick-deselect') as HTMLButtonElement;

const objectList=document.getElementById('object-list')!;
const objectCards=new Map<number,{state:HTMLElement;toggle:HTMLButtonElement;remove:HTMLButtonElement}>();
// Crée une carte de commandes par tangible et branche ses boutons d’activation et de retrait.
for(const id of [1,2,3]){
  const card=document.createElement('article');card.className='object-card';
  const name=document.createElement('strong');name.textContent=id===1?'Mur':`Pilier ${id-1}`;
  const state=document.createElement('span');state.className='object-state';
  const actions=document.createElement('div');actions.className='object-actions';
  const toggle=document.createElement('button');toggle.type='button';toggle.dataset.objectToggle=String(id);
  const remove=document.createElement('button');remove.type='button';remove.textContent='Retirer';remove.dataset.objectRemove=String(id);remove.setAttribute('aria-label',`Retirer ${id===1?'le mur':`le pilier ${id-1}`}`);
  /** Envoie l’activation ou la désactivation demandée sur la carte de l’objet. */
  toggle.addEventListener('click',()=>{const t=controller.state?.tangibles[id];if(t&&conn?.isOpen())conn.send({type:'TangibleControl',id,action:t.active?'deactivate':'activate'});});
  /** Signale le retrait physique de l’objet depuis son bouton tactile. */
  remove.addEventListener('click',()=>{if(conn?.isOpen())conn.send({type:'TangibleRemoved',id});});
  actions.append(toggle,remove);card.append(name,state,actions);objectList.append(card);objectCards.set(id,{state,toggle,remove});
}
const sync = new StateSync();
let conn: Connection | undefined;
let wasTouch = false;

// OzController suit les modifications locales ; OzMap gère les contacts sur la carte.
const controller = new OzController(/* Transmet les modifications du contrôleur seulement lorsque la connexion est ouverte. */ (type, params) => {
  if (!conn?.isOpen()) return false;
  conn.send({ type, ...params });
  return true;
}, /* Rafraîchit les commandes après une modification de l’état local de la console. */ () => refresh());

/** Affiche l’outil manuel sélectionné et la prochaine étape de sa pose. */
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
  /** Expose à la carte l’autorisation courante des commandes du contrôleur. */
  enabled: () => controller.enabled,
  /** Fournit à la carte l’identifiant du tangible sélectionné. */
  selectedId: () => controller.selectedId,
  /** Traduit l’identifiant sélectionné en type de tangible pour sa prévisualisation. */
  selectedKind: () => (controller.selectedId === 1 ? 'wall' : 'pylon'),
  /** Indique à la carte qu’une nouvelle pose manuelle est en préparation. */
  preparing: () => controller.preparing,
  /** Fournit l’orientation provisoire du mur avant sa confirmation. */
  draftAngle: () => controller.draftAngle,
  /** Transmet le rangement demandé sur la carte au contrôleur des tangibles. */
  onDock: team => controller.dock(team),
  /** Synchronise la sélection de la carte avec celle du contrôleur. */
  onSelect: id => controller.select(id),
  /** Fait valider la nouvelle pose par le contrôleur avant son envoi au serveur. */
  onPlace: pose => controller.place(pose),
  /** Transmet une pose glissée au contrôleur pour sa prévisualisation et son envoi. */
  onMove: (id, x, y, angle) => controller.move(id, { x, y, angle }),
  /** Ouvre le groupe d’annulation correspondant au geste continu. */
  onDragStart: () => controller.beginGesture(),
  /** Ferme le groupe d’annulation lorsque le geste de carte se termine. */
  onDragEnd: () => controller.endGesture(),
  /** Signale au serveur que l’objet touché a été physiquement retiré. */
  onRemove: id => { if(conn?.isOpen())conn.send({type:'TangibleRemoved',id}); },

  /** Envoie les poses des deux piliers définies par l’outil manuel. */
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

  /** Envoie le centre et l’orientation du mur définis par les deux points de l’outil manuel. */
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

  /** Confirme la pose déplacée du mur ou du pilier en conservant l’orientation utile. */
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

  /** Adapte la consigne au tangible déplacé et au point de pose encore attendu. */
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

  /** Actualise la consigne après le choix d’un point de l’outil manuel. */
  onToolStep: (tool, step) => {
    updateToolUI(tool, step);
  },
});

/** Bascule l’outil manuel de pose de deux piliers. */
btnArc.addEventListener('click', () => {
  if (!controller.enabled) return;
  const current = map.getTool();
  map.setTool(current === 'arc' ? null : 'arc');
});

// Annonce de pose avec les doigts, annulation et orientation manuelle du mur.
/** Annule l’aperçu local puis demande le changement de méthode de pose au serveur. */
placementMode.addEventListener('change',()=>{
  map.cancel();
  if(conn?.isOpen())conn.send({type:'TangiblePlacementMode',mode:placementMode.value});
});
for(const button of touchButtons)/* Annonce le tangible choisi juste avant les contacts réels du joueur. */ button.addEventListener('click',()=>{
  if(conn?.isOpen())conn.send({type:'TangiblePrepare',id:Number(button.dataset.tangible)});
});
/** Annule l’annonce serveur et les outils de pose encore en cours sur la carte. */
touchCancel.addEventListener('click',()=>{if(conn?.isOpen())conn.send({type:'TangiblePlacementCancel'});map.cancel();updateToolUI(null,0);});
quickUndo.addEventListener('click',()=>controller.undo());
quickDeselect.addEventListener('click',()=>{controller.cancelPreparation();map.cancel();updateToolUI(null,0);});
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-remove-tangible]'))button.addEventListener('click',()=>{if(conn?.isOpen())conn.send({type:'TangibleRemoved',id:Number(button.dataset.removeTangible)});});
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-rotate-wall]'))/* Tourne le mur de l’incrément demandé depuis les boutons tactiles. */ button.addEventListener('click',()=>{map.cancel();controller.select(1);controller.rotate(Number(button.dataset.rotateWall));});

/** Bascule l’outil manuel de pose du mur. */
btnWall.addEventListener('click', () => {
  if (!controller.enabled) return;
  const current = map.getTool();
  map.setTool(current === 'wall' ? null : 'wall');
});

/** Retire les trois objets et efface toute manipulation locale inachevée. */
btnClear.addEventListener('click', () => {
  if (!conn?.isOpen()) return;
  map.cancel();
  conn.send({ type: 'TangibleRemoved', id: 1 });
  conn.send({ type: 'TangibleRemoved', id: 2 });
  conn.send({ type: 'TangibleRemoved', id: 3 });
  hint.textContent = 'Tous les obstacles ont été retirés.';
});

/** Télécharge le journal des tangibles en laissant le bouton réutilisable en cas d’erreur. */
document.getElementById('download-log')!.addEventListener('click',async()=>{
  const button=document.getElementById('download-log') as HTMLButtonElement;
  const status=document.getElementById('journal-status')!;button.disabled=true;status.textContent='';
  try{
    const response=await fetch('/api/oz-log',{cache:'no-store'});
    if(!response.ok)throw Error('journal');
    const file=new Blob([JSON.stringify(await response.json(),null,2)],{type:'application/json'}),url=URL.createObjectURL(file);
    const link=document.createElement('a');link.href=url;link.download=`tangibles-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.append(link);link.click();link.remove();/* Libère l’adresse du fichier téléchargé lorsqu’elle n’est plus nécessaire. */ setTimeout(()=>URL.revokeObjectURL(url),1000);
    status.textContent='Journal téléchargé.';
  }catch{status.textContent='Téléchargement indisponible. Réessayez.';}finally{button.disabled=false;}
});

/** Interprète les raccourcis de tangibles et d’annulation sans intercepter la saisie d’un champ. */
document.addEventListener('keydown', e => {
  if(e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))return;
  const shortcut=ozShortcut(e);
  const id=shortcut==='wall'?1:shortcut==='pylon1'?2:shortcut==='pylon2'?3:null;
  if(id && controller.state?.tangiblePlacementMode==='touch' && !e.repeat){
    e.preventDefault();touchButtons.find(/* Retrouve le bouton correspondant au numéro du tangible demandé au clavier. */ b=>Number(b.dataset.tangible)===id)?.click();return;
  }
  if(shortcut==='wall' && controller.state?.tangiblePlacementMode==='manual' && !e.repeat){e.preventDefault();btnWall.click();return;}

  if (e.key === 'Escape' || (!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.toLowerCase()==='a')) {
    e.preventDefault();
    if(controller.state?.tangiblePlacementMode==='touch'&&conn?.isOpen())conn.send({type:'TangiblePlacementCancel'});
    map.cancel();
    updateToolUI(null, 0);
  }
});

// État des commandes et consignes opérateur, y compris pendant le tutoriel.
/** Synchronise les boutons, les états des objets et les consignes opérateur avec la partie reçue. */
function refresh(): void {
  const enabled = controller.enabled;
  const s=controller.state,touch=s?.tangiblePlacementMode==='touch',pending=s?.tangiblePlacement;
  tutorialGuide.hidden=!s?.tutorial;
  if(s?.tutorial){
    const tut=s.tutorial;
    /** Résume l’intervention opérateur utile à l’étape actuelle de l’équipe. */
    const label=(team:'A'|'B')=>{
      const progress=tut.teams[team],id=tut.steps[progress.step];
      const name=team==='A'?'Cyan':'Rose';
      const action=id==='wall'?(progress.sub?'attendre le contact voiture / mur':'annoncer le mur (1), puis laisser le copilote le poser')
        :id==='pylon'?'annoncer les piliers (2, puis 3), laisser les copilotes les poser à portée d’arc'
        :id==='depot'?(['A','B'] as const).every(/* Attend que les deux équipes soient au rangement avant d’annoncer cette intervention commune. */ t=>!tut.steps[tut.teams[t].step]||tut.steps[tut.teams[t].step]==='depot')?'faire ranger les trois obstacles dans la réserve, puis les retirer sur la carte':'attendre la fin des essais de l’autre équipe'
        :!id?'terminé':'gestes et conduite · aucune intervention';
      return `${name} : ${action}`;
    };
    tutorialGuide.textContent=tut.finished?'Tutoriel terminé · les joueurs peuvent créer leur circuit.':`${label('A')} · ${label('B')}${!touch?' · Pour les poses avec les doigts : changer le mode de placement.':''}`;
  }
  placementMode.disabled=!controller.connected||!s;
  placementMode.value=touch?'touch':'manual';
  touchTools.hidden=false;
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
/** Redessine la carte à chaque image pour suivre les voitures et les aperçus locaux. */
function renderLoop(): void {
  map.draw();
  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);

// Portrait phones use the height of the map; a visible button changes orientation without a keyboard.
let quarter=0,manualQuarter=false;
/** Tourne la carte d’un quart de tour sans nécessiter de raccourci clavier. */
document.getElementById('view-rotate')!.addEventListener('click',()=>{manualQuarter=true;quarter=(quarter+1)%4;map.setQuarter(quarter);refresh();});
new ResizeObserver(/* Adapte la résolution et l’orientation de la carte à la place disponible sur le téléphone. */ ()=>{
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
  const next=rect.height>rect.width*1.15?1:0;
  if(!manualQuarter&&next!==quarter){quarter=next;map.setQuarter(quarter);}
  map.draw();
}).observe(document.getElementById('map-container')!);

conn=connectWs('/ws/oz',{
  /** Active le contrôleur dès que la connexion de la console est ouverte. */
  onOpen:()=>controller.setConnected(true),
  /** Annule la manipulation locale et désactive les commandes pendant la reconnexion. */
  onClose:()=>{map.cancel();controller.setConnected(false);},
  /** Réassemble les états reçus avant de les transmettre au contrôleur de la console. */
  onMessage:msg=>{if(msg.type==='State')controller.applyState(sync.apply(msg.state,msg.t));},
});
refresh();
