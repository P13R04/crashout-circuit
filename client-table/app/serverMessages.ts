/**
 * Traitement des messages du serveur : état synchronisé, changements de phase, retours visuels et mesure du délai.
 * Liens : server/types.ts (ServerMessage), client-shared/net.ts.
 * Appelé par client-table/main.ts dans l'ordre d'origine de l'initialisation de la table.
 */
import type { ServerMessage } from '../../server/types.js';
import { showDividerRefusal, showMapError } from '../view.js';
import { playFeedback } from '../sound/Sound.js';
import { loadTheme, type ThemeId } from '../themes/themes.js';
import { applyTuning } from '../gesture/gestureTuning.js';
import { recordGesture } from '../gesture/GestureLog.js';
import type { TableApp } from './tableApp.js';
import { downloadGestureLog } from './debugOverlay.js';

/** Ce que le traitement des messages doit pouvoir piloter dans les menus HTML. */
export interface MessageHooks {
  selectTheme: (id: ThemeId, persist?: boolean) => void;
  simBar: HTMLDivElement;
  testBar: HTMLDivElement;
  syncDriveOptions: () => void;
  syncRaceOptions: () => void;
  syncTestBar: () => void;
}

/** Construit la fonction qui distribue les messages du serveur entre la vue, les effets et les paramètres. */
export function createMessageHandler(app: TableApp, hooks: MessageHooks): (msg: ServerMessage) => void {
  const { view, sync, gestures, urlParams } = app;
  const { selectTheme, simBar, testBar, syncDriveOptions, syncRaceOptions, syncTestBar } = hooks;
  /** Distribue les états, les phases et les retours du serveur entre la vue, les effets et les paramètres. */
  function handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      // Réconcilie le snapshot avec la piste mémorisée, les gestes locaux et les réglages de l’interface.
      case 'State': {
        const prev = view.state;
        view.state = sync.apply(msg.state, msg.t);
        gestures.syncState();
        // L'ambiance est une préférence locale sûre : elle reste disponible pendant les séances publiques.
        document.getElementById('theme-settings')!.hidden=false;
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
        if (msg.phase === 'RESULT' && view.state?.developerTools && urlParams.get('log') === '1') downloadGestureLog(view);
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
  return handleMessage;
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
