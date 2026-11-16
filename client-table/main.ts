/**
 * Initialise la table et relie les paramètres HTML, le clavier, le réseau, l’audio et la boucle de dessin.
 * Liens : client-table/index.html, server/layout.ts, client-shared/net.ts, client-table/renderer/Renderer.ts,
 * server/types.ts et les utilitaires importés ci-dessous.
 */
import { createControls } from '../client-shared/controls.js';
import { StateSync, connectWs } from '../client-shared/net.js';
import type { ServerMessage } from '../server/types.js';
import { createView } from './view.js';
import { Renderer } from './renderer/Renderer.js';
import { GestureRecognizer } from './gesture/GestureRecognizer.js';
import { tableAudio } from './sound/Sound.js';
import type { TableApp } from './app/tableApp.js';
import { setupCanvasSizing } from './app/canvasSizing.js';
import { setupDisplayPreferences } from './app/displayPreferences.js';
import { setupRaceSettingsPanel } from './app/raceSettingsPanel.js';
import { setupSimulationTools } from './app/simulationTools.js';
import { setupAudioSettings } from './app/audioSettings.js';
import { setupKeyboardControls } from './app/keyboardControls.js';
import { setupFullscreenControls } from './app/fullscreenControls.js';
import { createMessageHandler } from './app/serverMessages.js';
import { loadLobbyJoin } from './renderer/lobbyJoin.js';
import { startRenderLoop } from './app/renderLoop.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
setupCanvasSizing(canvas);
const ctx = canvas.getContext('2d')!;

// ── État, vue et modules ──
const sync = new StateSync();
const view = createView(/* Fournit à la vue l’heure recalée sur le serveur. */ () => sync.now());
const renderer = new Renderer(ctx);
try{tableAudio.restore(window.localStorage);}catch{/* Audio preferences are optional. */}
const urlParams = new URLSearchParams(location.search);
view.tutorialMode='table';

/** Traite les messages du serveur ; remplacé par le vrai traitement une fois les menus branchés. */
let handleServerMessage: (msg: ServerMessage) => void = () => {};
const conn = connectWs('/ws', {
  /** Masque le statut de coupure et autorise à nouveau l’audio après connexion. */
  onOpen: () => {
    statusEl.hidden = true;
    tableAudio.connection(true);
    void loadLobbyJoin().then(invite => { renderer.lobbyJoin = invite; }).catch(() => { renderer.lobbyJoin = null; });
  },
  /** Affiche la reconnexion, relâche les contacts et arrête les sons de la connexion perdue. */
  onClose: () => { tableAudio.connection(false); statusEl.textContent = 'Connexion perdue · Reconnexion…'; statusEl.hidden = false; gestures.releaseAll(); },
  onMessage: (msg) => handleServerMessage(msg),
});
/** Signale l’action locale à l’audio puis transmet la commande au serveur. */
const sendTable=(m:{type:string}&Record<string,unknown>)=>{tableAudio.uiCommand(m);conn.send(m);};
const controls = createControls(sendTable);
const gestures = new GestureRecognizer(canvas, view, sendTable);
const pcTools = document.getElementById('pc-tools') as HTMLDetailsElement;
const app: TableApp = { canvas, ctx, view, sync, renderer, urlParams, conn, sendTable, controls, gestures, pcTools };

// ── Menus HTML, clavier et plein écran ──
const { selectTheme } = setupDisplayPreferences(app);
const { syncRaceOptions, syncDriveOptions } = setupRaceSettingsPanel(app);
const { simBar, testBar, syncTestBar } = setupSimulationTools(app);
setupAudioSettings();
const keyboard = setupKeyboardControls(app);
setupFullscreenControls(app, keyboard);

// Round-trip time (server echo), used by the debug overlay (task 18)
/** Mesure régulièrement le trajet aller-retour vers le serveur avec un Ping. */
setInterval(() => conn.send({ type: 'Ping' }), 2000);

// ── Retours du serveur, puis boucle de rendu ──
handleServerMessage = createMessageHandler(app, { selectTheme, simBar, testBar, syncDriveOptions, syncRaceOptions, syncTestBar });
startRenderLoop(app);
