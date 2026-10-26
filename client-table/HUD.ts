/**
 * HUD — the four corner panels (REQ-6.2), each rotated towards its own table edge.
 * Pilot panel: HP, steering and repair. Copilot: POWER, tangible charging zone,
 * repair and neutral armed-item countdown.
 */
import type { GameState, Team, Car } from '../server/types.js';
import {
  PANELS, PANEL_H, panelWidth, padLocal, STEER_AREA_LOCAL, PEDAL_LOCAL, POWER_BTN_LOCAL, CHARGE_ZONE_LOCAL,
  type PanelLayout,
} from '../server/layout.js';
import { TEAM_COLOR, type View } from './view.js';
import { icon, contacts } from './icons.js';
import type { ThemeId } from './themes.js';
import { glow, NEON } from './neon.js';

type Ctx = CanvasRenderingContext2D;

function ring(ctx: Ctx, x: number, y: number, r: number, frac: number, color: string, width = 8): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (frac > 0) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac));
    ctx.stroke();
  }
}

/** Small vector icon for a stocked item. */
export function drawItemIcon(ctx: Ctx, kind: 'slingshot' | 'boost', x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (kind === 'slingshot') { // Y-shaped fork, elastic band and stone
    ctx.moveTo(0, r); ctx.lineTo(0, r * 0.1);
    ctx.moveTo(0, r * 0.1); ctx.lineTo(-r * 0.75, -r * 0.9);
    ctx.moveTo(0, r * 0.1); ctx.lineTo(r * 0.75, -r * 0.9);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, -r * 0.9);
    ctx.quadraticCurveTo(0, r * 0.1, r * 0.75, -r * 0.9);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, -r * 0.3, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  } else { // speed chevrons
    for (const dx of [-r * .45, r * .45]) {
      ctx.moveTo(dx - r * .3, -r * .8); ctx.lineTo(dx + r * .3, 0); ctx.lineTo(dx - r * .3, r * .8);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export class HUD {
  draw(ctx: Ctx, state: GameState, view: View): void {
    const now = state.phase === 'PAUSED' ? state.pausedAt : view.now();
    for (const panel of PANELS) {
      ctx.save();
      ctx.translate(panel.cx, panel.cy);
      ctx.rotate(panel.rot);
      this.drawFrame(ctx, panel, view.theme);
      if (panel.role === 'pilot') this.drawPilot(ctx, panel, state, view, now);
      else this.drawCopilot(ctx, panel, state, view, now);
      this.drawPad(ctx, panel, state, view);
      ctx.restore();
    }
  }

  private drawFrame(ctx: Ctx, panel: PanelLayout, theme: ThemeId): void {
    const PANEL_W = panelWidth(panel.role);
    const color = TEAM_COLOR[panel.team];
    const metal = ctx.createLinearGradient(0, -PANEL_H / 2, 0, PANEL_H / 2);
    metal.addColorStop(0, theme === 'scrap' ? '#35444b' : '#132039'); metal.addColorStop(.45, theme === 'scrap' ? '#1b282f' : '#0b1528'); metal.addColorStop(1, theme === 'scrap' ? '#101b21' : '#080e1c');
    ctx.fillStyle = metal; ctx.strokeStyle = '#344760'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 18);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ffffff07'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(-PANEL_W / 2 + 5, -PANEL_H / 2 + 5, PANEL_W - 10, PANEL_H - 10, 14); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      const x = side * (PANEL_W / 2 - 14);
      ctx.beginPath(); ctx.moveTo(x - side * 24, -PANEL_H / 2 + 1); ctx.lineTo(x, -PANEL_H / 2 + 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - side * 24, PANEL_H / 2 - 1); ctx.lineTo(x, PANEL_H / 2 - 1); ctx.stroke();
    }
    if (theme === 'scrap') {
      for (const x of [-PANEL_W / 2 + 10, PANEL_W / 2 - 10]) for (const y of [-PANEL_H / 2 + 11, PANEL_H / 2 - 11]) {
        ctx.fillStyle = '#03090d'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#9aafaf'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 1.5, y - 1); ctx.lineTo(x + 1.5, y + 1); ctx.stroke();
      }
    }
    ctx.fillStyle = color;
    ctx.font = '600 13px system-ui';
    ctx.textAlign = 'left';
    const left = -PANEL_W / 2 + 18;
    icon(ctx, panel.role === 'pilot' ? 'wheel' : 'power', left + 8, -77, 20, color);
    ctx.fillText(panel.role === 'pilot' ? 'PILOTE' : 'COPILOTE', left + 28, -71);
  }

  private drawPilot(ctx: Ctx, panel: PanelLayout, state: GameState, view: View, now: number): void {
    const team = panel.team;
    const car = state.cars[team];
    const color = TEAM_COLOR[team];

    // HP bar (animated towards the real value by the main loop)
    const frac = Math.max(0, Math.min(1, view.hpShown[team] / state.params.hpMax));
    const bx = -74, by = -65, bw = 108, bh = 18;
    icon(ctx, 'heart', bx - 20, by + 9, 20, frac > .25 ? color : '#ff6060');
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = frac > 0.5 ? '#61f4ba' : frac > 0.25 ? '#ffb020' : '#ff4040';
    ctx.fillRect(bx, by, bw * frac, bh);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(car.hp)}`, bx + 8, by + 15);

    // Full-turn left/right strip: crossing its centre changes direction without lifting.
    const stick = view.sticks[team];
    const area = STEER_AREA_LOCAL;
    ctx.fillStyle = stick.active ? `${color}19` : '#081323';
    ctx.strokeStyle = stick.active ? color : '#3e6177';
    ctx.lineWidth = stick.active ? 4 : 2;
    ctx.beginPath(); ctx.roundRect(area.x - area.w / 2, area.y - area.h / 2, area.w, area.h, 14); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(area.x, area.y - area.h / 2 + 12); ctx.lineTo(area.x, area.y + area.h / 2 - 12); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
    ctx.fillText('◀', area.x - area.w / 2 + 24, area.y + 10);
    ctx.fillText('▶', area.x + area.w / 2 - 24, area.y + 10);
    if (stick.active) {
      const knobX = area.x + stick.x * (area.w / 2 - 18);
      glow(ctx, knobX, area.y, 30, color, .6);
      ctx.fillStyle = '#e8fcff';
      ctx.beginPath(); ctx.arc(knobX, area.y, 12, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    icon(ctx, 'wheel', area.x, area.y, 36, stick.active ? '#ffffff33' : color);

    // Each team keeps its own lap counter, facing its players.
    icon(ctx, 'flag', -60, 28, 24, color);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`${Math.min(state.params.lapsToWin, car.lap + 1)}/${state.params.lapsToWin}`, -36, 36);
    if (state.driveMode === 'pedal') {
      const p = PEDAL_LOCAL;
      const active = view.localPedals[team];
      ctx.fillStyle = active ? `${color}66` : 'rgba(255,255,255,0.08)';
      ctx.strokeStyle = active ? '#ffffff' : color; ctx.lineWidth = active ? 4 : 2;
      ctx.beginPath(); ctx.roundRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 14); ctx.fill(); ctx.stroke();
      icon(ctx, 'pedal', p.x, p.y, 44, active ? '#fff' : color);
    }

    ctx.textAlign = 'left';
    void now;
  }

  private drawCopilot(ctx: Ctx, panel: PanelLayout, state: GameState, view: View, now: number): void {
    const car = state.cars[panel.team];
    const color = TEAM_COLOR[panel.team];
    const armed = car.itemArmed && now < car.itemArmExpiry;
    const docked = Object.entries(state.tangibles).filter(([, t]) => t.dockTeam === panel.team);
    const ready = docked.some(([, t]) => t.active);
    const canPower = !!car.heldItem;
    const b = POWER_BTN_LOCAL;
    if (canPower) glow(ctx, b.x, b.y, 62, armed ? NEON.gold : color, armed ? .3 : .15);
    ctx.fillStyle = armed ? '#ffce661f' : canPower ? `${color}14` : '#050d1c';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ring(ctx, b.x, b.y, b.r, armed ? (car.itemArmExpiry - now) / (state.params.armWindowS * 1000) : 1,
      armed ? '#ffce66' : canPower ? color : '#586078', 4);
    icon(ctx, 'power', b.x, b.y, 32, canPower ? armed ? '#ffce66' : '#fff' : '#586078');
    // Inventory sits above POWER. A short connector makes their relationship visible.
    if (car.heldItem) {
      drawItemIcon(ctx, car.heldItem, b.x + 82, -67, 14, armed ? '#ffce66' : color);
      ctx.strokeStyle = armed ? '#ffce66' : color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x + 70, -53); ctx.lineTo(b.x + 24, -25); ctx.stroke();
    }

    const z = CHARGE_ZONE_LOCAL;
    if (ready) glow(ctx, z.x, z.y, 65, NEON.mint, .17);
    ctx.fillStyle = ready ? '#61f4ba1a' : '#ffffff06';
    ctx.strokeStyle = ready ? '#61f4ba' : '#64748b';
    ctx.setLineDash(docked.length ? [] : [6, 7]); ctx.lineWidth = ready ? 3 : 2;
    ctx.beginPath(); ctx.roundRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 12); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    // Physical footprints distinguish the dock from the circular POWER / repair controls.
    ctx.strokeStyle = ready ? '#61f4ba' : '#94a3b8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(z.x - 30, z.y - 22, 40, 12, 3); ctx.stroke();
    ctx.beginPath(); ctx.arc(z.x + 21, z.y - 16, 8, 0, Math.PI * 2); ctx.stroke();
    icon(ctx, ready ? 'bolt' : 'target', z.x, z.y + 16, 23, ready ? '#61f4ba' : '#94a3b8');
    docked.forEach(([, tangible], i) => {
      ctx.fillStyle = tangible.active ? '#61f4ba' : '#94a3b8';
      ctx.beginPath(); ctx.arc(z.x + (i - (docked.length - 1) / 2) * 14, z.y + 40, 4, 0, Math.PI * 2); ctx.fill();
    });

    if (armed && car.heldItem) {
      // Neutral gold: either team can complete the armed gesture.
      if (state.testMode.allItems) {
        ctx.save(); ctx.translate(b.x, 81); ctx.scale(.7, .7);
        contacts(ctx, 2, -32, 0, '#ffce66'); contacts(ctx, 3, 32, 0, '#ffce66'); ctx.restore();
      } else contacts(ctx, car.heldItem === 'slingshot' ? 3 : 2, b.x, 81, '#ffce66');
      ctx.strokeStyle = '#ffce66'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(-226, -96, 452, 192, 16); ctx.stroke();
    }
    ctx.textAlign = 'left';
    void view;
  }

  /** Repair pad (160 px disc) with a ring filling while both partners hold their pad. */
  private drawPad(ctx: Ctx, panel: PanelLayout, state: GameState, view: View): void {
    const key = `${panel.team}-${panel.role}`;
    const held = view.localPads[key] || state.repairPads[key]?.held;
    const car: Car = state.cars[panel.team];
    const color = TEAM_COLOR[panel.team];
    const { x, y, r } = padLocal(panel.role);
    if (held) glow(ctx, x, y, r + 12, NEON.mint, .25);
    ctx.fillStyle = held ? 'rgba(97,244,186,0.12)' : car.disabled ? 'rgba(255,64,64,0.2)' : 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ring(ctx, x, y, r - 5, state.repairProgress[panel.team], '#61f4ba', 10);
    ctx.strokeStyle = held ? '#61f4ba' : color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    icon(ctx, 'wrench', x, y - 9, 40, held ? '#61f4ba' : car.disabled ? '#ff7070' : '#a9b6cd');
    // The pair shows which partner is holding; the outer ring shows joint progress.
    const partner = panel.role === 'pilot' ? 'copilot' : 'pilot';
    const partnerKey = `${panel.team}-${partner}`;
    const partnerHeld = view.localPads[partnerKey] || state.repairPads[partnerKey]?.held;
    for (const [dx, on] of [[-15, held], [15, partnerHeld]] as const) {
      ctx.fillStyle = on ? '#61f4ba' : '#ffffff15';
      ctx.strokeStyle = on ? '#61f4ba' : '#8190aa'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + dx, y + 30, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // One slow halo attracts attention only when repair is needed; no flashing text.
    if (car.disabled) {
      ctx.globalAlpha = view.reducedMotion ? .5 : .35 + .2 * Math.sin(view.visualTime / 450);
      ctx.strokeStyle = '#ff7070'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r - 13, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

export type { Team };
