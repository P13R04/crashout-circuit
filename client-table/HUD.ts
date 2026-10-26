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
import { TEAM_COLOR, TEAM_NAME, type View } from './view.js';

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
  } else { // compass
    ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    ctx.moveTo(0, -r * 0.6); ctx.lineTo(r * 0.25, 0); ctx.lineTo(0, r * 0.6); ctx.lineTo(-r * 0.25, 0); ctx.closePath();
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
      this.drawFrame(ctx, panel);
      if (panel.role === 'pilot') this.drawPilot(ctx, panel, state, view, now);
      else this.drawCopilot(ctx, panel, state, view, now);
      this.drawPad(ctx, panel, state, view);
      ctx.restore();
    }
  }

  private drawFrame(ctx: Ctx, panel: PanelLayout): void {
    const PANEL_W = panelWidth(panel.role);
    const color = TEAM_COLOR[panel.team];
    ctx.fillStyle = 'rgba(6,10,32,0.88)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${panel.role === 'pilot' ? 'PILOTE' : 'COPILOTE'} · ${TEAM_NAME[panel.team]}`, -PANEL_W / 2 + (panel.role === 'pilot' ? 190 : 16), -PANEL_H / 2 + 24);
  }

  private drawPilot(ctx: Ctx, panel: PanelLayout, state: GameState, view: View, now: number): void {
    const team = panel.team;
    const car = state.cars[team];
    const color = TEAM_COLOR[team];

    // HP bar (animated towards the real value by the main loop)
    const frac = Math.max(0, Math.min(1, view.hpShown[team] / state.params.hpMax));
    const bx = -80, by = -62, bw = 110, bh = 22;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = frac > 0.5 ? '#3ddc84' : frac > 0.25 ? '#ffb020' : '#ff4040';
    ctx.fillRect(bx, by, bw * frac, bh);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`HP ${Math.round(car.hp)}`, bx + 8, by + 17);

    // Full-turn left/right strip: crossing its centre changes direction without lifting.
    const stick = view.sticks[team];
    const area = STEER_AREA_LOCAL;
    ctx.fillStyle = stick.active ? `${color}33` : 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = stick.active ? '#ffffff' : color;
    ctx.lineWidth = stick.active ? 4 : 2;
    ctx.beginPath(); ctx.roundRect(area.x - area.w / 2, area.y - area.h / 2, area.w, area.h, 14); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(area.x, area.y - area.h / 2 + 12); ctx.lineTo(area.x, area.y + area.h / 2 - 12); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
    ctx.fillText('◀', area.x - area.w / 2 + 24, area.y + 10);
    ctx.fillText('▶', area.x + area.w / 2 - 24, area.y + 10);
    if (stick.active) {
      const knobX = area.x + stick.x * (area.w / 2 - 18);
      ctx.fillStyle = '#fff'; ctx.shadowColor = color; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(knobX, area.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('DIRECTION · GLISSEZ', area.x, 94);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    const isPedal = typeof state.driveMode === 'string'
      ? (state.driveMode as unknown as string) === 'pedal'
      : state.driveMode[team] === 'pedal';
    if (!isPedal) {
      ctx.fillText('CONDUITE', -20, 34);
      ctx.fillText('POWER AU COPILOTE', -20, 54);
    } else {
      const p = PEDAL_LOCAL;
      const active = view.localPedals[team];
      ctx.fillStyle = active ? `${color}66` : 'rgba(255,255,255,0.08)';
      ctx.strokeStyle = active ? '#ffffff' : color; ctx.lineWidth = active ? 4 : 2;
      ctx.beginPath(); ctx.roundRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
      ctx.fillText('ACCÉLÉRER', p.x, p.y - 4);
      ctx.font = '20px monospace'; ctx.fillText('▲', p.x, p.y + 25);
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
    ctx.fillStyle = armed ? '#ffe14a33' : canPower ? `${color}22` : '#ffffff08';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ring(ctx, b.x, b.y, b.r, armed ? (car.itemArmExpiry - now) / (state.params.armWindowS * 1000) : 1,
      armed ? '#ffe14a' : canPower ? color : '#586078', 4);
    // Universal power symbol, independent of the stocked bonus.
    ctx.strokeStyle = armed ? '#ffe14a' : '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(b.x, b.y - 6, 13, -Math.PI * 0.35, Math.PI * 1.35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x, b.y - 24); ctx.lineTo(b.x, b.y - 7); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 12px monospace';
    ctx.fillText('POWER', b.x, b.y + 25);

    const z = CHARGE_ZONE_LOCAL;
    ctx.fillStyle = ready ? '#3ddc8422' : '#ffffff08';
    ctx.strokeStyle = ready ? '#3ddc84' : color;
    ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 12); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ready ? '#3ddc84' : '#fff'; ctx.font = 'bold 11px monospace';
    ctx.fillText(ready ? 'ACTIVÉ' : docked.length ? 'INACTIF' : 'TANGIBLE', z.x, z.y - 9);
    ctx.font = '11px monospace';
    ctx.fillText(docked.length ? docked.map(([id]) => `#${id}`).join(' ') : 'DÉPOSER ICI', z.x, z.y + 12);
    ctx.fillStyle = '#ffffff99'; ctx.font = '10px monospace';
    ctx.fillText(ready ? 'replacer sur piste' : 'activation par Oz', z.x, z.y + 32);

    // A stocked icon is information only; POWER is the only activation button.
    if (car.heldItem) {
      drawItemIcon(ctx, car.heldItem, -180, 79, 9, armed ? '#ffe14a' : color);
      ctx.fillStyle = armed ? '#ffe14a' : '#ffffffaa'; ctx.textAlign = 'left'; ctx.font = '11px monospace';
      const gesture = state.testMode.allItems ? '3 ou 2 doigts' : car.heldItem === 'slingshot' ? '3 doigts' : '2 doigts';
      ctx.fillText(armed ? `${gesture} · ${Math.max(0, (car.itemArmExpiry - now) / 1000).toFixed(1)}s · VOLABLE` : 'Objet en stock', -162, 83);
    }
    if (armed) {
      ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 3;
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
    ctx.fillStyle = held ? 'rgba(61,220,132,0.28)' : car.disabled ? 'rgba(255,64,64,0.2)' : 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ring(ctx, x, y, r - 5, state.repairProgress[panel.team], '#3ddc84', 10);
    ctx.strokeStyle = held ? '#3ddc84' : color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RÉPARATION', x, y - 4);
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(held ? 'maintenez…' : 'pad à 2', x, y + 14);
    ctx.textAlign = 'left';

    // Breakdown alert, blinking on the pilot's panel (REQ-6.1.4)
    if (car.disabled && panel.role === 'pilot' && Math.floor(performance.now() / 400) % 2 === 0) {
      ctx.fillStyle = '#ff4040';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText("HORS D'USAGE", 95, 40);
      ctx.textAlign = 'left';
    }
  }
}

export type { Team };
