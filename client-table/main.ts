/**
 * Initialise la table et relie les paramètres HTML, le clavier, le réseau, l’audio et la boucle de dessin.
 * Liens : client-table/index.html, server/layout.ts, client-shared/net.ts, client-table/Renderer.ts,
 * server/types.ts et les utilitaires importés ci-dessous.
 */
import type { ServerMessage } from '../server/types.js';
import { createControls } from '../client-shared/controls.js';
import { StateSync, connectWs } from '../client-shared/net.js';
import { createView, showDividerRefusal, showMapError } from './view.js';
import { Renderer } from './Renderer.js';
import { SETTINGS_BUTTON } from '../server/layout.js';
import { GestureRecognizer } from './GestureRecognizer.js';
import { playFeedback, unlock, tableAudio } from './Sound.js';
import { THEMES, themeLook, loadTheme, saveTheme, type ThemeId } from './themes.js';
import { advanceVisualTime } from './VisualMotion.js';
import { applyTuning } from './gestureTuning.js';
import { formatGestureEntry, gestureLogCsv, recordGesture } from './GestureLog.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

// ── Canvas sizing (1920×1080 logical, ×2 for 4K) ──────────────────────────────
const LOGICAL_W = 1920;
const LOGICAL_H = 1080;

/** Ajuste la résolution du canvas et la position des paramètres à la taille réelle de la fenêtre. */
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
const view = createView(/* Fournit à la vue l’heure recalée sur le serveur. */ () => sync.now());
const renderer = new Renderer(ctx);
try{tableAudio.restore(window.localStorage);}catch{/* Audio preferences are optional. */}
const urlParams = new URLSearchParams(location.search);
view.tutorialMode='table';
// Themes are a local display setting: switching never sends a command or restarts a race.
const themeOptions = document.getElementById('theme-options')!;
// Construit les aperçus de thèmes conservés dans les paramètres de développement.
for (const theme of THEMES) {
  const button = document.createElement('button'); button.type = 'button';
  button.className = 'theme-option'; button.dataset.theme = theme.id;
  button.setAttribute('aria-label', theme.name);
  const swatch = document.createElement('span'); swatch.className = 'theme-swatch'; swatch.setAttribute('aria-hidden', 'true');
  for (const color of theme.colors) { const chip = document.createElement('i'); chip.style.background = color; swatch.append(chip); }
  const name = document.createElement('strong'); name.textContent = theme.name;
  const detail = document.createElement('small'); detail.textContent = theme.detail;
  button.append(swatch, name, detail); /* Applique le thème choisi dans les outils de développement. */ button.addEventListener('click', () => selectTheme(theme.id)); themeOptions.append(button);
}
/** Applique la palette aux couches Canvas et aux paramètres HTML sans redémarrer la partie. */
function selectTheme(id: ThemeId, persist=true): void {
  view.theme = id; try { if(persist)saveTheme(window.localStorage, id); } catch { /* Display preference still applies. */ }
  document.body.dataset.theme = id; canvas.dataset.theme = id;
  const look=themeLook(id);
  for(const [key,value] of Object.entries(look))document.body.style.setProperty(`--look-${key}`,typeof value==='number'?`${value}px`:value);
  for (const button of themeOptions.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.theme === id));
}
// Access to localStorage itself can be denied in embedded/private contexts.
selectTheme('scrap',false);
view.debug.on = false;
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
view.reducedMotion = motionPreference.matches || urlParams.get('motion') === '0';
/** Suit la préférence du navigateur pour réduire les animations sans modifier la course. */
motionPreference.addEventListener('change', e => { view.reducedMotion = e.matches || urlParams.get('motion') === '0'; });

const conn = connectWs('/ws', {
  /** Masque le statut de coupure et autorise à nouveau l’audio après connexion. */
  onOpen: () => { statusEl.hidden = true; tableAudio.connection(true); },
  /** Affiche la reconnexion, relâche les contacts et arrête les sons de la connexion perdue. */
  onClose: () => { tableAudio.connection(false); statusEl.textContent = 'Connexion perdue · Reconnexion…'; statusEl.hidden = false; gestures.releaseAll(); },
  onMessage: handleMessage,
});
/** Signale l’action locale à l’audio puis transmet la commande au serveur. */
const sendTable=(m:{type:string}&Record<string,unknown>)=>{tableAudio.uiCommand(m);conn.send(m);};
const controls = createControls(sendTable);
const gestures = new GestureRecognizer(canvas, view, sendTable);

// Paramètres de séance : accueil, difficulté, tours et chronomètre.
/** Demande le retour à l’accueil puis referme le panneau des paramètres. */
document.getElementById('settings-home')!.addEventListener('click',()=>{conn.send({type:'Reset'});pcTools.open=false;});
const difficultyInput=document.getElementById('race-difficulty') as HTMLSelectElement;
const lapsInput=document.getElementById('race-laps') as HTMLInputElement;
const timerInput=document.getElementById('race-timer') as HTMLInputElement;
const minutesInput=document.getElementById('race-minutes') as HTMLInputElement;
const timerDuration=document.getElementById('timer-duration')!;
const raceOptions=document.getElementById('race-options')!;
/** Envoie le niveau de difficulté sélectionné au serveur. */
difficultyInput.addEventListener('change',()=>conn.send({type:'RaceSettings',difficulty:difficultyInput.value}));
/** Envoie le nombre de tours uniquement lorsque le champ est valide. */
lapsInput.addEventListener('change',()=>{if(lapsInput.checkValidity())conn.send({type:'RaceSettings',lapsToWin:Number(lapsInput.value)});});
/** Envoie la durée choisie seulement lorsque le champ est valide ou que le chronomètre est désactivé. */
const sendTimer=()=>{if(!timerInput.checked||minutesInput.checkValidity())conn.send({type:'RaceSettings',sessionMaxSeconds:timerInput.checked?Math.round(Number(minutesInput.value)*60):0});};
/** Affiche la durée seulement lorsque le chronomètre est activé puis transmet le réglage. */
timerInput.addEventListener('change',()=>{timerDuration.hidden=!timerInput.checked;sendTimer();});/* Transmet la durée modifiée si le chronomètre est déjà utilisé. */ minutesInput.addEventListener('change',()=>{if(timerInput.checked)sendTimer();});
/** Répercute les réglages du serveur dans le menu sans écraser un champ en cours de saisie. */
function syncRaceOptions(): void {
  const s=view.state;if(!s)return;
  raceOptions.hidden=!!s.tutorial||s.phase==='RESULT';
  const editable=!s.tutorial&&s.phase!=='RESULT';
  difficultyInput.disabled=!editable;lapsInput.disabled=!editable||s.sessionMode==='tangibles-test';timerInput.disabled=lapsInput.disabled;
  if(document.activeElement!==difficultyInput)difficultyInput.value=s.params.difficulty;
  if(document.activeElement!==lapsInput)lapsInput.value=String(s.params.lapsToWin);
  timerInput.checked=s.params.sessionMaxSeconds>0;timerDuration.hidden=!timerInput.checked;minutesInput.disabled=!timerInput.checked||timerInput.disabled;
  if(s.params.sessionMaxSeconds>0&&document.activeElement!==minutesInput)minutesInput.value=String(s.params.sessionMaxSeconds/60);
}

// Choix de conduite et simulations conservés pour le lancement de développement.
const driveOptions=document.getElementById('drive-options')!;
const driveButtons={A:document.getElementById('drive-A')!,B:document.getElementById('drive-B')!};
for(const team of ['A','B'] as const)/* Demande le changement de conduite de l’équipe choisie dans le menu de développement. */ driveButtons[team].addEventListener('click',()=>conn.send({type:'ToggleDriveMode',team}));
/** Affiche les réglages de conduite seulement dans le lancement de développement et les phases compatibles. */
function syncDriveOptions(): void {
  const s=view.state;driveOptions.hidden=!s?.developerTools||!['LOBBY','READY','RACE','PAUSED'].includes(s.phase)||s.sessionMode==='tangibles-test';
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
/** Choisit le geste simulé et synchronise ses boutons lorsque les outils de développement l’autorisent. */
const setSim = (k: 'slingshot' | 'boost' | null): void => {
  if(k&&!view.state?.developerTools)return;
  simKind = simKind === k ? null : k;
  sim3.classList.toggle('armed', simKind === 'slingshot');
  sim2.classList.toggle('armed', simKind === 'boost');
  sim3.setAttribute('aria-pressed', String(simKind === 'slingshot'));
  sim2.setAttribute('aria-pressed', String(simKind === 'boost'));
  gestures.simulate(simKind);
};
/** Sélectionne le lance-pierre simulé pour l’essai à la souris. */
sim3.addEventListener('click', () => setSim('slingshot'));
/** Sélectionne l’accélération simulée pour l’essai à la souris. */
sim2.addEventListener('click', () => setSim('boost'));
/** Referme les paramètres lors d’un contact effectué hors du panneau. */
document.addEventListener('pointerdown',event=>{if(pcTools.open&&event.target instanceof Node&&!pcTools.contains(event.target))pcTools.open=false;});
/** Annule une simulation de geste lorsque son tiroir de paramètres est refermé. */
pcTools.addEventListener('toggle', () => { if (!pcTools.open && simKind) setSim(null); });
gestures.onSimChange = /* Actualise la consigne de simulation et relâche son bouton après usage ou refus du geste. */ (hint) => {
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
/** Demande l’invincibilité uniquement dans le lancement de développement. */
testInvincible.addEventListener('click', () =>
  view.state?.developerTools&&conn.send({ type: 'TestToggle', flag: 'invincible', on: !view.state?.testMode.invincible }));
/** Demande les stocks libres uniquement dans le lancement de développement. */
testItems.addEventListener('click', () =>
  view.state?.developerTools&&conn.send({ type: 'TestToggle', flag: 'allItems', on: !view.state?.testMode.allItems }));
/** Affiche les aides de test uniquement dans les modes qui les acceptent. */
function syncTestBar(): void {
  const st = view.state;
  const racing = st?.phase === 'RACE' || st?.phase === 'PAUSED';
  // The tutorial needs the real item rules: no free items, no invincibility switch
  testBar.classList.toggle('on', !!st?.developerTools && st?.mapMode === 'pc' && racing && !st.tutorial);
  simBar.classList.toggle('on', !!st?.developerTools && showSimulation && racing);
  if (!racing && simKind) setSim(null);
  testInvincible.classList.toggle('active', !!st?.testMode.invincible);
  testItems.classList.toggle('active', !!st?.testMode.allItems);
  testInvincible.setAttribute('aria-pressed', String(!!st?.testMode.invincible));
  testItems.setAttribute('aria-pressed', String(!!st?.testMode.allItems));
}

// Son : volumes du menu et déverrouillage audio au premier contact.
window.addEventListener('pointerdown',unlock,{capture:true});
/** Profite du premier appui clavier pour autoriser l’audio sans répéter l’ouverture du contexte. */
window.addEventListener('keydown',e=>{if(!e.repeat)unlock();},{capture:true});
/** Joue un clic discret pour les boutons et les tiroirs de l’interface HTML. */
document.addEventListener('click',e=>{if(e.target instanceof Element&&e.target.closest('button,summary'))playFeedback('ui');},{capture:true});
const audioToggle=document.getElementById('audio-enabled') as HTMLButtonElement;
const audioRanges={effects:document.getElementById('audio-effects') as HTMLInputElement,ambience:document.getElementById('audio-ambience') as HTMLInputElement,music:document.getElementById('audio-music') as HTMLInputElement};
/** Reporte les préférences de l’instance audio dans les boutons et les curseurs. */
function syncAudioSettings():void{
  audioToggle.setAttribute('aria-pressed',String(tableAudio.settings.enabled));audioToggle.textContent=tableAudio.settings.enabled?'Son activé':'Son coupé';
  for(const key of ['effects','ambience','music'] as const)audioRanges[key].value=String(Math.round(tableAudio.settings[key]*100));
}
/** Applique le réglage audio demandé en tolérant un stockage local inaccessible. */
function changeAudio(value:Parameters<typeof tableAudio.configure>[0]):void{
  try{tableAudio.configure(value,window.localStorage);}catch{tableAudio.configure(value);}syncAudioSettings();
}
/** Bascule le son de la table sans modifier séparément les volumes mémorisés. */
audioToggle.addEventListener('click',()=>changeAudio({enabled:!tableAudio.settings.enabled}));
for(const key of ['effects','ambience','music'] as const)/* Convertit le curseur de volume en proportion pour le groupe audio concerné. */ audioRanges[key].addEventListener('input',()=>changeAudio({[key]:Number(audioRanges[key].value)/100}));
/** Joue l’exemple sonore demandé pour régler les volumes. */
document.getElementById('audio-test')!.addEventListener('click',()=>tableAudio.preview());syncAudioSettings();
// Desktop local multiplayer adapter. It mirrors the table controls without
// leaking keyboard rules into the game engine: Q/D and ←/→ are the two
// extremes of the same continuous steering input; cars keep moving.
const down = new Set<string>();
const repairHeld: Record<'A' | 'B', boolean> = { A: false, B: false };
/** Normalise les lettres du clavier sans changer les noms des touches spéciales. */
const keyName = (e: KeyboardEvent) => e.key.length === 1 ? e.key.toLowerCase() : e.key;
/** Convertit les touches maintenues en commande de conduite pour l’équipe concernée. */
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
/** Renouvelle les commandes clavier maintenues avec la même cadence que le pilotage tactile. */
window.setInterval(() => {
  if (down.has('q') || down.has('d') || down.has('z')) sendSteer('A');
  if (down.has('ArrowLeft') || down.has('ArrowRight') || down.has('ArrowUp')) sendSteer('B');
}, 100);
/** Transforme l’appui simultané des deux touches de partenaires en maintien des pads de réparation. */
function updateKeyboardRepair(team: 'A' | 'B'): void {
  const active = team === 'A' ? down.has('a') && down.has('p') : down.has('m') && down.has('c');
  if (active === repairHeld[team]) return;
  repairHeld[team] = active;
  conn.send({ type: 'PadHold', team, role: 'pilot', on: active });
  conn.send({ type: 'PadHold', team, role: 'copilot', on: active });
}
/** Traduit les touches de jeu en commandes sans détourner la saisie des champs de paramètres. */
window.addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.closest('button, summary, input, textarea, select, a')) return;
  const key = keyName(e);
  if (view.state?.developerTools && key === 'F3' && !e.repeat && !down.has('F3')) view.debug.on = !view.debug.on;
  if (view.state?.developerTools && key === 'F4' && !e.repeat && !down.has('F4')) { e.preventDefault(); downloadGestureLog(); }
  if (down.has(key)) return;
  down.add(key);
  if (key === 'q' || key === 'd') sendSteer('A');
  if (key === 'ArrowLeft' || key === 'ArrowRight') { e.preventDefault(); sendSteer('B'); }
  if (key === 'z') sendSteer('A');
  if (key === 'ArrowUp') { e.preventDefault(); sendSteer('B'); }
  if (key === ' ') { e.preventDefault(); sendTable({ type: 'Pause' }); }
  if (key === 'a' || key === 'p') updateKeyboardRepair('A');
  if (key === 'm' || key === 'c') updateKeyboardRepair('B');
  // A/M alone press the copilot's POWER button. Waiting briefly lets the
  // A+P / M+C repair chord win when the two players press in rhythm.
  if ((key === 'a' || key === 'm') && !e.repeat) {
    const team: 'A' | 'B' = key === 'a' ? 'A' : 'B';
    /** Attend brièvement le second partenaire pour distinguer POWER de la combinaison de réparation. */
    window.setTimeout(() => {
      const combo = team === 'A' ? down.has('a') && down.has('p') : down.has('m') && down.has('c');
      if (!combo && down.has(key)) controls.power(team);
    }, 120);
  }
});
/** Relâche la direction, la pédale ou le pad correspondant à la touche levée. */
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
/** Relâche les gestes et les touches lors d’un changement de taille ou de plein écran. */
function releaseInputs(): void {
  gestures.releaseAll(); down.clear();
  sendSteer('A'); sendSteer('B'); updateKeyboardRepair('A'); updateKeyboardRepair('B');
}
/** Actualise le bouton de plein écran et annule les entrées devenues imprécises après le redimensionnement. */
function syncFullscreen(): void {
  const active = !!document.fullscreenElement;
  fullscreen.setAttribute('aria-pressed', String(active));
  fullscreen.querySelector('span')!.textContent = active ? 'Quitter le plein écran' : 'Plein écran';
  releaseInputs();
}
/** Bascule le plein écran et conserve un message lisible si le navigateur le refuse. */
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
/** Ferme les paramètres et sort du plein écran sur Échap sans mettre la course en pause. */
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  pcTools.open = false;
  if (document.fullscreenElement) void document.exitFullscreen().catch(/* Ignore un refus de sortie lorsque le navigateur a déjà quitté le plein écran lui-même. */ () => { /* Native Escape may already have exited. */ });
  // Keep the browser's default Escape behaviour and reserve Space for the game pause.
}, true);

/** Coupe les sons et relâche les gestes lorsque la page devient cachée. */
document.addEventListener('visibilitychange', () => { tableAudio.focus(!document.hidden); if (document.hidden) gestures.releaseAll(); });

// Round-trip time (server echo), used by the debug overlay (task 18)
/** Mesure régulièrement le trajet aller-retour vers le serveur avec un Ping. */
setInterval(() => conn.send({ type: 'Ping' }), 2000);

// Retours du serveur : état synchronisé, changements de phase et effets visuels.
/** Distribue les états, les phases et les retours du serveur entre la vue, les effets et les paramètres. */
function handleMessage(msg: ServerMessage): void {
  switch (msg.type) {
    // Réconcilie le snapshot avec la piste mémorisée, les gestes locaux et les réglages de l’interface.
    case 'State': {
      const prev = view.state;
      view.state = sync.apply(msg.state, msg.t);
      gestures.syncState();
      document.getElementById('theme-settings')!.hidden=!view.state.developerTools;
      if(!prev&&view.state.developerTools){view.debug.on=urlParams.get('debug')==='1';applyTuning(location.search);try{selectTheme(loadTheme(window.localStorage));}catch{/* Keep Ferraille. */}}
      if(!view.state.developerTools){view.debug.on=false;simBar.remove();testBar.remove();}
      view.tutorialMode=view.state.developerTools&&urlParams.get('tutorial')==='pc'?'pc':'table';
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
    // Nettoie les interactions et effets devenus inutiles lors du changement d’écran.
    case 'PhaseChange':
      view.effects.length = 0;
      recordGesture(view.debug.gestures, 'phase', { phase: msg.phase });
      if (msg.phase === 'RESULT' && view.state?.developerTools && urlParams.get('log') === '1') downloadGestureLog();
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
    // Transforme les événements du serveur en retours visuels, sonores et messages de dessin.
    case 'Feedback':
      recordGesture(view.debug.gestures, 'server', { kind: msg.kind, team: msg.team, x: Math.round(msg.x), y: Math.round(msg.y) });
      if (msg.kind === 'dividerTooShort' || msg.kind === 'dividerOutOfZone') {
        view.dividerSubmitting = false;
        showDividerRefusal(view, msg.kind === 'dividerTooShort' ? 'tooShort' : 'outOfZone');
      }
      view.effects.push({
        kind: msg.kind, itemKind:msg.itemKind, x: msg.x, y: msg.y, team: msg.team, start: view.visualTime, dur: effectDuration(msg.kind),
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
      playFeedback(msg.kind,{x:msg.x,y:msg.y});
      break;
    // Actualise la mesure du délai aller-retour affichée dans les outils de développement.
    case 'Pong':
      view.debug.rtt = Date.now() - msg.clientT;
      break;
  }
}

/** Choisit la durée d’affichage du retour visuel associé à l’événement. */
function effectDuration(kind: string): number {
  switch (kind) {
    case 'stoneHit': return 700;
    case 'fall': return 950;
    case 'pickup': return 800;
    case 'itemArmed': return 650;
    case 'itemUsed': return 400;
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

/** Actualise l’horloge visuelle, dessine la scène et collecte les mesures de rendu utiles au diagnostic. */
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
  tableAudio.update(view,now);
  renderSamples.push(performance.now() - renderStart);
  if (renderSamples.length > 120) renderSamples.shift();
  if (now - metricsAt > 1000) {
    metricsAt = now;
    const sorted = [...renderSamples].sort(/* Trie les temps de rendu pour mesurer le percentile des frames lentes. */ (a, b) => a - b);
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

/** Affiche les mesures et les dernières décisions de reconnaissance lorsque le diagnostic est autorisé. */
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
  // Latest touch decisions (issue #38): which finger became the pouch, widths, cancelled shots
  const lines = d.gestures.slice(-8);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(LOGICAL_W / 2 - 375, 36, 750, 4 + lines.length * 16);
  ctx.fillStyle = '#cfd8e3';
  ctx.textAlign = 'left';
  /** Affiche les dernières entrées de journal dans la surcouche de diagnostic. */
  lines.forEach((entry, i) => ctx.fillText(formatGestureEntry(entry).slice(0, 110), LOGICAL_W / 2 - 368, 50 + i * 16));
  ctx.restore();
}

/** Télécharge le journal des contacts et des décisions de la session de test. */
function downloadGestureLog(): void {
  try {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([gestureLogCsv(view.debug.gestures)], { type: 'text/csv' }));
    link.download = `session-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch { /* Downloads can be blocked; the overlay still shows the latest lines. */ }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
requestAnimationFrame(drawFrame);
