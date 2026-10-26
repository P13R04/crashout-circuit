/**
 * TutorialOverlay — what the table shows during the guided tutorial (issue #32).
 *
 * Each team gets a banner on its own side of the table with its current lesson, its
 * progress and a SKIP button, plus a pulsing outline on the control to use. Texts are
 * short on purpose. Once both teams are done, an end screen sends everybody back home.
 * Progress itself is decided by the server (`state.tutorial`); this file only draws it
 * and tells GestureRecognizer where the buttons are.
 */
import type { GameState, Team, Vec2, TutorialStepId } from '../server/types.js';
import {
  LOGICAL_W, LOGICAL_H, panelOf, localToWorld, worldToLocal, padLocal,
  STEER_AREA_LOCAL, PEDAL_LOCAL, POWER_BTN_LOCAL, type PanelLayout,
} from '../server/layout.js';
import { icon } from './icons.js';
import { TEAM_COLOR, TEAM_NAME } from './view.js';

type Ctx = CanvasRenderingContext2D;
type Rect = { x: number; y: number; w: number; h: number };

/** Free strip between the two corner panels of a side, clear of the pause / mode buttons. */
const BANNER = { w: 680, h: 120 };
const BANNER_AT: Record<Team, PanelLayout> = {
  A: { team: 'A', role: 'pilot', cx: 1080, cy: LOGICAL_H - 158, rot: 0 },
  B: { team: 'B', role: 'pilot', cx: 1080, cy: 158, rot: Math.PI },
};
/** In the banner's own frame (origin = centre, "up" = away from the team). */
const SKIP_LOCAL: Rect = { x: BANNER.w / 2 - 18 - 92, y: 8, w: 92, h: 44 };
export const TUTORIAL_END_BUTTON: Rect = { x: LOGICAL_W / 2 - 200, y: LOGICAL_H / 2 - 45, w: 400, h: 90 };

const TOUCH_MARGIN = 8;

export type TutorialButton = { kind: 'skip'; team: Team } | { kind: 'end' };

/** Which tutorial button, if any, is under a touch. */
export function tutorialButtonAt(state: GameState, p: Vec2): TutorialButton | null {
  const tutorial = state.tutorial;
  if (!tutorial) return null;
  if (tutorial.finished) {
    const b = TUTORIAL_END_BUTTON;
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h ? { kind: 'end' } : null;
  }
  for (const team of ['A', 'B'] as Team[]) {
    if (!tutorial.steps[tutorial.teams[team].step]) continue; // done: no button
    const l = worldToLocal(BANNER_AT[team], p.x, p.y);
    const b = SKIP_LOCAL;
    if (l.x >= b.x - TOUCH_MARGIN && l.x <= b.x + b.w + TOUCH_MARGIN && l.y >= b.y - TOUCH_MARGIN && l.y <= b.y + b.h + TOUCH_MARGIN) {
      return { kind: 'skip', team };
    }
  }
  return null;
}

/** Centre of a team's SKIP button on the table (where it is drawn and hit-tested). */
export function tutorialSkipCenter(team: Team): Vec2 {
  return localToWorld(BANNER_AT[team], SKIP_LOCAL.x + SKIP_LOCAL.w / 2, SKIP_LOCAL.y + SKIP_LOCAL.h / 2);
}

// ─── Texts ───────────────────────────────────────────────────────────────────

const KEYS: Record<'steer' | 'pedal' | 'power' | 'repair', Record<Team, string>> = {
  steer: { A: 'Q puis D', B: '← puis →' },
  pedal: { A: 'Z', B: '↑' },
  power: { A: 'A', B: 'M' },
  repair: { A: 'A + P', B: 'M + C' },
};

interface Lesson { text: string; hint?: string }

function lessonOf(id: TutorialStepId, sub: number, team: Team, pc: boolean): Lesson {
  switch (id) {
    case 'steer':
      return {
        text: 'Glissez à gauche, puis à droite.',
        hint: `${sub & 1 ? '✓' : '○'} gauche   ${sub & 2 ? '✓' : '○'} droite${pc ? `   ·   clavier : ${KEYS.steer[team]}` : ''}`,
      };
    case 'pedal':
      return sub === 0
        ? { text: 'Passez votre pilote en PÉDALE.', hint: 'Bouton près du poste pilote.' }
        : sub === 1
          ? { text: 'Maintenez la pédale.', hint: pc ? `clavier : maintenez ${KEYS.pedal[team]}` : undefined }
          : { text: 'Repassez en AUTO.', hint: 'Bouton près du poste pilote.' };
    case 'pickup':
      return { text: 'Roulez sur un objet pour le ramasser.' };
    case 'power':
      return { text: 'Copilote : armez avec ⏻.', hint: pc ? `clavier : ${KEYS.power[team]}` : 'Puis réalisez le geste.' };
    case 'sling':
      return pc
        ? { text: 'Lance-pierre : cliquez, tirez, relâchez.', hint: 'Visez devant la voiture adverse' }
        : { text: 'Posez 3 doigts, tirez-en un, relâchez.', hint: 'La pierre part à l’opposé de la traction' };
    case 'boostPickup':
      return { text: 'Ramassez un boost.' };
    case 'boostPower':
      return { text: 'Armez le boost avec ⏻.', hint: pc ? `clavier : ${KEYS.power[team]}` : undefined };
    case 'boost':
      return pc
        ? { text: 'Paramètres → Boost, puis deux clics.', hint: 'Écartez les deux contacts.' }
        : { text: 'Posez 2 doigts écartés sur la piste.', hint: 'Devant votre voiture.' };
    case 'boostCross':
      return { text: 'Traversez le portail jaune.' };
    case 'borderPull':
      return { text: 'À 2 doigts, tirez un bord vers l’extérieur.' };
    case 'repair':
      return {
        text: 'Maintenez ensemble les deux clés.',
        hint: pc ? `clavier : maintenez ${KEYS.repair[team]}` : 'Si l’un des deux lâche, la jauge retombe',
      };
    case 'wall':
      return { text: 'Touchez le mur avec votre voiture.', hint: 'Ici, sans dégât' };
    case 'arc':
      return { text: 'Traversez l’arc électrique.', hint: 'Ici, sans dégât' };
    case 'pylon':
      return { text: 'Oz : chargez et posez les deux piliers.', hint: 'Sans Oz : passez cette étape.' };
  }
}

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const attempt = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(attempt).width > maxWidth) { lines.push(line); line = word; }
    else line = attempt;
  }
  if (line) lines.push(line);
  return lines;
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

/** `driveMode` is the shared PILOTAGE button, owned by the renderer. */
export function drawTutorial(ctx: Ctx, state: GameState, now: number, driveMode: Record<Team, Rect>): void {
  const tutorial = state.tutorial;
  if (!tutorial) return;
  if (tutorial.finished) { drawEnd(ctx); return; }
  const pulse = 0.5 + 0.5 * Math.sin(now / 220);
  for (const team of ['A', 'B'] as Team[]) {
    drawHighlights(ctx, state, team, pulse, driveMode[team]);
    drawBanner(ctx, state, team);
  }
}

function drawBanner(ctx: Ctx, state: GameState, team: Team): void {
  const tutorial = state.tutorial!;
  const progress = tutorial.teams[team];
  const total = tutorial.steps.length;
  const id = tutorial.steps[progress.step];
  const color = TEAM_COLOR[team];
  const at = BANNER_AT[team];
  const { w, h } = BANNER;
  ctx.save();
  ctx.translate(at.cx, at.cy);
  ctx.rotate(at.rot);
  ctx.fillStyle = 'rgba(4,8,31,0.95)';
  ctx.strokeStyle = id ? color : '#3ddc84';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 16); ctx.fill(); ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = id ? color : '#3ddc84';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`${TEAM_NAME[team]} · ${id ? `ÉTAPE ${progress.step + 1}/${total}` : 'TERMINÉ'}`, -w / 2 + 18, -h / 2 + 24);
  // progress bar
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(-w / 2 + 18, -h / 2 + 32, w - 36, 4);
  ctx.fillStyle = id ? color : '#3ddc84';
  ctx.fillRect(-w / 2 + 18, -h / 2 + 32, (w - 36) * (progress.step / total), 4);

  if (!id) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
    ctx.fillText('✓ Tout est vu', -w / 2 + 18, 6);
    ctx.fillStyle = '#b7c2da'; ctx.font = '16px sans-serif';
    ctx.fillText('L’autre équipe continue.', -w / 2 + 18, 36);
    ctx.restore();
    return;
  }

  const lesson = lessonOf(id, progress.sub, team, state.mapMode === 'pc');
  const textWidth = SKIP_LOCAL.x - 14 - (-w / 2 + 18);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 21px sans-serif';
  wrap(ctx, lesson.text, textWidth).slice(0, 3).forEach((line, i) => ctx.fillText(line, -w / 2 + 18, -h / 2 + 62 + i * 25));
  if (lesson.hint) {
    ctx.fillStyle = '#b7c2da'; ctx.font = '15px sans-serif';
    ctx.fillText(lesson.hint, -w / 2 + 18, h / 2 - 12);
  }

  const b = SKIP_LOCAL;
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('PASSER ▸', b.x + b.w / 2, b.y + b.h / 2 + 5);
  ctx.restore();
}

/** Pulsing outline on the thing to use, so the lesson also *shows* where to act. */
function drawHighlights(ctx: Ctx, state: GameState, team: Team, pulse: number, driveMode: Rect): void {
  const tutorial = state.tutorial!;
  const progress = tutorial.teams[team];
  const id = tutorial.steps[progress.step];
  if (!id) return;
  const color = TEAM_COLOR[team];
  ctx.save();
  ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10 + 12 * pulse; ctx.lineWidth = 3 + 2 * pulse;

  const inPanel = (role: 'pilot' | 'copilot', draw: () => void): void => {
    const panel = panelOf(team, role);
    ctx.save(); ctx.translate(panel.cx, panel.cy); ctx.rotate(panel.rot); draw(); ctx.restore();
  };
  const box = (r: Rect): void => { ctx.beginPath(); ctx.roundRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12, 14); ctx.stroke(); };
  const centred = (r: { x: number; y: number; w: number; h: number }): Rect => ({ x: r.x - r.w / 2, y: r.y - r.h / 2, w: r.w, h: r.h });
  const circle = (x: number, y: number, r: number): void => { ctx.beginPath(); ctx.arc(x, y, r + 6 + 4 * pulse, 0, Math.PI * 2); ctx.stroke(); };

  switch (id) {
    case 'steer':
      inPanel('pilot', () => box(centred(STEER_AREA_LOCAL)));
      break;
    case 'pedal':
      if (progress.sub === 1) inPanel('pilot', () => box(centred(PEDAL_LOCAL)));
      else box(driveMode);
      break;
    case 'pickup': case 'boostPickup':
      for (const p of state.pickups) if (p.respawnAt === 0) circle(p.pos.x, p.pos.y, 26);
      break;
    case 'power': case 'boostPower':
      inPanel('copilot', () => circle(POWER_BTN_LOCAL.x, POWER_BTN_LOCAL.y, POWER_BTN_LOCAL.r));
      break;
    case 'repair':
      for (const role of ['pilot', 'copilot'] as const) {
        const pad = padLocal(role);
        inPanel(role, () => circle(pad.x, pad.y, pad.r));
      }
      break;
    case 'boostCross':
      for (const g of state.boostGates) if (g.team === team) circle((g.a.x + g.b.x) / 2, (g.a.y + g.b.y) / 2, 40);
      break;
    case 'wall':
      for (const w of state.walls) if (w.id === `tut-wall-${team}`) circle(w.pos.x, w.pos.y, w.lengthPx / 2);
      break;
    case 'arc':
      for (const a of state.arcs) if (a.id === `tut-arc-${team}`) circle((a.pylon1.x + a.pylon2.x) / 2, (a.pylon1.y + a.pylon2.y) / 2, 60);
      break;
    default:
      break;
  }
  ctx.restore();
}

function drawEnd(ctx: Ctx): void {
  ctx.save();
  ctx.fillStyle = 'rgba(4,8,31,0.84)'; ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  ctx.textAlign = 'center';
  for (const rot of [0, Math.PI]) { // readable from both long edges
    ctx.save();
    ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2);
    ctx.rotate(rot);
    ctx.fillStyle = '#3ddc84'; ctx.shadowColor = '#3ddc84'; ctx.shadowBlur = 24;
    ctx.font = 'bold 76px monospace';
    ctx.fillText('PRÊTS', 0, -200);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '28px monospace';
    ctx.fillText('Prêts pour la course.', 0, -140);
    ctx.restore();
  }
  const b = TUTORIAL_END_BUTTON;
  ctx.fillStyle = 'rgba(61,220,132,0.16)'; ctx.strokeStyle = '#3ddc84'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 16); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 32px monospace';
  ctx.fillText('ACCUEIL', b.x + b.w / 2, b.y + 56);
  ctx.restore();
}
