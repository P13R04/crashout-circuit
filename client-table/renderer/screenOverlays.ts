/**
 * Écrans et commandes de session : accueil, compte à rebours, pause, départ de course et résultat.
 * Liens : client-table/ui/icons.ts, client-table/ui/HUD.ts.
 * Fonctions appelées par les méthodes de Renderer (server/Renderer.ts), qui garde l'état et délègue ici.
 */
import type { GameState } from '../../server/types.js';
import { LOGICAL_W, LOGICAL_H } from '../../server/layout.js';
import { TEAM_COLOR } from '../view.js';
import { icon, type Icon } from '../ui/icons.js';
import { tutorialIdentifying } from '../ui/TutorialOverlay.js';
import { themeLook } from '../themes/themes.js';
import { glow, NEON, plate } from '../themes/neon/neon.js';
import type { Ctx } from './rendererTypes.js';
import { START_TABLE_BUTTON, START_PC_BUTTON, START_TUTORIAL_BUTTON, START_TANGIBLE_TEST_BUTTON, RESULT_BUTTON, PAUSE_BUTTON, RACE_START_BUTTON } from './rendererButtons.js';
import { drawLobbyJoin } from './lobbyJoin.js';
import type { Renderer } from './Renderer.js';

/** Dessine l’accueil et ses boutons sans révéler les modes de test lors d’une séance publique. */
export function drawLobby(renderer: Renderer, ctx: Ctx, developerTools = false, seats?: GameState['seats']): void {
  ctx.save(); ctx.textAlign = 'center';
  for (const rot of [0, Math.PI]) {
    ctx.save(); ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2); ctx.rotate(rot);
    icon(ctx, 'track', 0, -295, 110, themeLook(renderer.theme).accent);
    ctx.fillStyle = '#fff'; glow(ctx, 0, -230, 330, '#5988c5', .2, .4);
    ctx.fillStyle = NEON.white; ctx.font = '800 64px system-ui';
    ctx.fillText('CRASHOUT', 0, -202);
    ctx.fillStyle = '#96bacd'; ctx.font = '500 22px monospace'; ctx.fillText('C I R C U I T', 0, -165); ctx.restore();
  }
  for (const [button, glyph, label, color] of [
    [START_TUTORIAL_BUTTON, 'draw', 'TUTORIEL', '#ffce66'],
    [START_TABLE_BUTTON, 'flag', 'COURSE', '#00e5ff'],
    ...(developerTools?[[START_PC_BUTTON, 'mouse', 'CLAVIER', '#ff4081'],[START_TANGIBLE_TEST_BUTTON, 'wrench', 'ESSAI OBJETS', '#61f4ba']] as const:[]),
  ] as const) {
    ctx.fillStyle = `${color}18`; ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(button.x, button.y, button.w, button.h, 18); ctx.fill(); ctx.stroke();
    icon(ctx, glyph, button.x + (button.w<300?30:74), button.y + button.h / 2, 34, color);
    // Only the mode name needs a second orientation. The symbol is shared.
    for (const rot of [0, Math.PI]) {
      ctx.save(); ctx.translate(button.x + button.w / 2 + 25, button.y + button.h / 2); ctx.rotate(rot);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${button.w<300?14:22}px monospace`; ctx.fillText(label, 0, button.w<300?21:28); ctx.restore();
    }
  }
  ctx.restore();
  if (renderer.lobbyJoin && seats) drawLobbyJoin(ctx, renderer.lobbyJoin, seats);
}

// ─── Overlays ─────────────────────────────────────────────────────────────
/** Affiche les feux de départ une fois les postes du tutoriel prêts. */
export function drawCountdown(renderer: Renderer, ctx: Ctx, state: GameState, now: number): void {
  if(tutorialIdentifying(state))return;
  const left = state.sessionStartAt - now;
  if (left > -600) {
    ctx.save();
    const started = left <= 0, stage = 3 - Math.ceil(left / 1000);
    if (started) ctx.globalAlpha = Math.max(0, 1 + left / 600);
    plate(ctx, LOGICAL_W / 2 - 154, LOGICAL_H / 2 - 48, 308, 96, 48, '#050c1dee', '#344d65');
    for (let i = 0; i < 3; i++) {
      const x = LOGICAL_W / 2 + (i - 1) * 92, y = LOGICAL_H / 2;
      const active = started || i <= stage, color = started ? NEON.mint : NEON.danger;
      if (active) glow(ctx, x, y, 54, color, .7);
      ctx.fillStyle = active ? color : '#1c2d42'; ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = active ? '#f0fcff80' : '#456078'; ctx.lineWidth = 1.5; ctx.stroke();
      if (active) { ctx.fillStyle = '#ffffff9a'; ctx.beginPath(); ctx.ellipse(x - 5, y - 8, 8, 4, -.3, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore(); return;
  }
  if (state.tutorial || state.sessionMode === 'tangibles-test') return;
  if(state.params.sessionMaxSeconds<=0)return;
  // Team laps live in their pilot panels. Only the enabled clock is repeated.
  const remaining = Math.max(0, (state.raceDeadline - now) / 1000);
  const mm = Math.floor(remaining / 60), ss = String(Math.floor(remaining % 60)).padStart(2, '0');
  ctx.save(); ctx.textAlign = 'center'; ctx.font = 'bold 24px monospace';
  for (const [y, rotation] of [[255, Math.PI], [825, 0]]) {
    ctx.save(); ctx.translate(LOGICAL_W / 2, y); ctx.rotate(rotation);
    ctx.fillStyle = '#080f26dd'; ctx.beginPath(); ctx.roundRect(-67, -23, 134, 46, 16); ctx.fill();
    icon(ctx, 'clock', -44, 0, 20, '#8d9ab4');
    ctx.fillStyle = remaining < 30 ? '#ffbe37' : '#d8e1f0'; ctx.fillText(`${mm}:${ss}`, 12, 8); ctx.restore();
  }
  ctx.restore();
}

/** Dessine le bouton commun de pause ou de reprise. */
export function drawPauseButton(renderer: Renderer, ctx: Ctx, label: string): void {
  const b = PAUSE_BUTTON;
  const look=themeLook(renderer.theme);ctx.save();ctx.fillStyle=look.panel+'ee';ctx.strokeStyle=look.line;ctx.lineWidth=2;
  ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(18,look.radius)); ctx.fill(); ctx.stroke();
  icon(ctx, label === 'PAUSE' ? 'pause' : 'play', b.x + b.w / 2, b.y + b.h / 2, 24);
  ctx.restore();
}

/** Dessine un bouton de validation à pictogramme avec les couleurs du thème. */
export function drawAction(renderer: Renderer, ctx: Ctx, b: { x: number; y: number; w: number; h: number }, glyph: Icon, color = '#00e5ff'): void {
  ctx.save();ctx.fillStyle=themeLook(renderer.theme).button+'f5';ctx.strokeStyle=color;ctx.lineWidth=4;
  glow(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w * .7, color, .16, .35);
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, b.h / 2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; icon(ctx, glyph, b.x + b.w / 2, b.y + b.h / 2, 42, color); ctx.restore();
}

/** Affiche le départ lorsque le circuit est prêt à être lancé. */
export function drawRaceReady(renderer: Renderer, ctx: Ctx, state: GameState): void {
  // Keep the generated track and the four stations visible before launching.
  drawAction(renderer, ctx, RACE_START_BUTTON, 'play');
  if (state.track?.preset) {
    ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#ffbe37'; ctx.font = 'bold 20px sans-serif';
    for (const rotation of [0, Math.PI]) {
      ctx.save(); ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2); ctx.rotate(rotation);
      ctx.fillText(state.sessionMode === 'tangibles-test' ? 'TEST TANGIBLES' : 'Circuit de secours', 0, 94); ctx.restore();
    }
    ctx.restore();
  }
}

/** Assombrit la piste et affiche la commande de reprise. */
export function drawPaused(renderer: Renderer, ctx: Ctx): void {
  ctx.save(); ctx.fillStyle = 'rgba(4,8,31,0.62)'; ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  drawAction(renderer, ctx, RACE_START_BUTTON, 'play'); ctx.restore();
}

/** Présente le résultat aux deux côtés de la table avec le retour à l’accueil. */
export function drawResult(renderer: Renderer, ctx: Ctx, state: GameState): void {
  ctx.save(); ctx.fillStyle = 'rgba(4,8,31,0.88)'; ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  const winner = state.winner;
  const color = winner === 'A' || winner === 'B' ? TEAM_COLOR[winner] : '#fff';
  // Compact score cards face both edges; a coloured trophy identifies the winner.
  for (const rotation of [0, Math.PI]) {
    ctx.save(); ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2); ctx.rotate(rotation);
    icon(ctx, 'trophy', 0, -240, 84, color);
    if (winner === 'draw') {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; ctx.fillText('Égalité', 0, -168);
    }
    for (const [team, x] of [['A', -140], ['B', 140]] as const) {
      const c = TEAM_COLOR[team];
      ctx.fillStyle = `${c}14`; ctx.strokeStyle = c; ctx.lineWidth = winner === team ? 4 : 1;
      ctx.beginPath(); ctx.roundRect(x - 100, -143, 200, 90, 16); ctx.fill(); ctx.stroke();
      icon(ctx, 'flag', x - 50, -107, 28, c);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 32px monospace'; ctx.fillText(String(state.cars[team].lap), x + 12, -96);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i < state.cars[team].checkpointIndex ? c : '#ffffff22';
        ctx.beginPath(); ctx.arc(x - 56 + i * 16, -71, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  drawAction(renderer, ctx, RESULT_BUTTON, 'replay'); ctx.restore();
}
