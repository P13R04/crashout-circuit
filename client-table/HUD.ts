/**
 * HUD — the four corner panels (REQ-6.2), each rotated towards its own table edge.
 * Pilot panel: HP bar, stocked item, repair pad. Copilot panel: Ghost and Destroy
 * buttons with recharge rings, repair pad, "item armed" halo with countdown.
 */
import type { GameState, Team, Car } from '../server/types.js';
import {
  PANELS, PANEL_H, panelWidth, padLocal, JOY_LOCAL, ITEM_BTN_LOCAL, GHOST_BTN_LOCAL, DESTROY_BTN_LOCAL,
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
  if (kind === 'slingshot') { // crosshair
    ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
    ctx.moveTo(-r, 0); ctx.lineTo(-r * 0.3, 0);
    ctx.moveTo(r, 0);  ctx.lineTo(r * 0.3, 0);
    ctx.moveTo(0, -r); ctx.lineTo(0, -r * 0.3);
    ctx.moveTo(0, r);  ctx.lineTo(0, r * 0.3);
  } else { // compass
    ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    ctx.moveTo(0, -r * 0.6); ctx.lineTo(r * 0.25, 0); ctx.lineTo(0, r * 0.6); ctx.lineTo(-r * 0.25, 0); ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}

export class HUD {
  draw(ctx: Ctx, state: GameState, view: View): void {
    const now = view.now();
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
    const bx = -140, by = -62, bw = 290, bh = 22;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = frac > 0.5 ? '#3ddc84' : frac > 0.25 ? '#ffb020' : '#ff4040';
    ctx.fillRect(bx, by, bw * frac, bh);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`HP ${Math.round(car.hp)}`, bx + 8, by + 17);

    // Touchpad joystick: base, deadzone mark, axis hints and the knob
    const j = JOY_LOCAL;
    const stick = view.sticks[team];
    ctx.fillStyle = stick.active ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(j.x, j.y, j.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(j.x - j.r, j.y); ctx.lineTo(j.x + j.r, j.y);
    ctx.moveTo(j.x, j.y - j.r); ctx.lineTo(j.x, j.y + j.r);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AVANT', j.x, j.y - j.r + 14);
    ctx.fillText('ARRIÈRE', j.x, j.y + j.r - 6);
    const kx = j.x + stick.x * j.r, ky = j.y + stick.y * j.r;
    ctx.fillStyle = stick.active ? color : 'rgba(255,255,255,0.25)';
    ctx.shadowColor = color;
    ctx.shadowBlur = stick.active ? 16 : 0;
    ctx.beginPath(); ctx.arc(kx, ky, 26, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Item button: stocked item, tap to arm it (then the copilot has 5 s for the gesture)
    const b = ITEM_BTN_LOCAL;
    const armed = car.itemArmed;
    ctx.fillStyle = armed ? 'rgba(255,225,74,0.25)' : car.heldItem ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)';
    ctx.strokeStyle = armed ? '#ffe14a' : car.heldItem ? '#ffffff' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center';
    if (car.heldItem) {
      drawItemIcon(ctx, car.heldItem, b.x, b.y - 6, 18, armed ? '#ffe14a' : color);
      ctx.fillStyle = armed ? '#ffe14a' : 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(armed ? 'ARMÉ' : 'UTILISER', b.x, b.y + 26);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '11px monospace';
      ctx.fillText('aucun', b.x, b.y - 2);
      ctx.fillText('objet', b.x, b.y + 12);
    }
    ctx.textAlign = 'left';
    void now;
  }

  private drawCopilot(ctx: Ctx, panel: PanelLayout, state: GameState, view: View, now: number): void {
    const PANEL_W = panelWidth('copilot');
    const team = panel.team;
    const car = state.cars[team];
    const cd = state.cooldowns[team];
    const p = state.params;

    // Ghost
    const g = GHOST_BTN_LOCAL;
    const ghostActive = car.ghostUntil > now;
    const ghostLeft = Math.max(0, cd.ghost - now);
    const ghostFrac = ghostActive ? (car.ghostUntil - now) / (p.ghostS * 1000)
      : ghostLeft > 0 ? 1 - ghostLeft / (p.ghostCooldownS * 1000) : 1;
    ctx.fillStyle = ghostActive ? 'rgba(170,90,255,0.35)' : 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.fill();
    ring(ctx, g.x, g.y, g.r, ghostFrac, ghostActive ? '#b06cff' : ghostLeft > 0 ? '#6b7280' : '#3ddc84');
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText('FANTÔME', g.x, g.y + 5);
    if (ghostLeft > 0 && !ghostActive) ctx.fillText(`${Math.ceil(ghostLeft / 1000)}s`, g.x, g.y + g.r + 22);

    // Destroy wall
    const d = DESTROY_BTN_LOCAL;
    const dLeft = Math.max(0, cd.destroy - now);
    const dFrac = dLeft > 0 ? 1 - dLeft / (p.destroyCooldownS * 1000) : 1;
    const targeting = view.targeting && view.targeting.team === team && view.targeting.until > Date.now();
    ctx.fillStyle = targeting ? 'rgba(255,150,40,0.4)' : 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    ring(ctx, d.x, d.y, d.r, targeting ? (view.targeting!.until - Date.now()) / 3000 : dFrac,
      targeting ? '#ff9628' : dLeft > 0 ? '#6b7280' : '#3ddc84');
    ctx.fillStyle = '#fff';
    ctx.fillText('DÉTRUIRE', d.x, d.y + 5);
    if (dLeft > 0 && !targeting) ctx.fillText(`${Math.ceil(dLeft / 1000)}s`, d.x, d.y + d.r + 22);
    if (targeting) {
      ctx.fillStyle = '#ff9628';
      ctx.fillText('TOUCHEZ UN MUR', d.x, d.y - d.r - 10);
    }

    // Armed-item halo with countdown (5 s)
    if (car.itemArmed && car.heldItem) {
      const left = Math.max(0, car.itemArmExpiry - now);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);
      ctx.strokeStyle = `rgba(255,225,74,${0.5 + 0.5 * pulse})`;
      ctx.lineWidth = 4;
      ctx.shadowColor = '#ffe14a';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.roundRect(-PANEL_W / 2 + 4, -PANEL_H / 2 + 4, PANEL_W - 8, PANEL_H - 8, 16);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffe14a';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'right';
      const gesture = car.heldItem === 'slingshot' ? '3 doigts' : '2 doigts';
      ctx.fillText(`✦ OBJET ARMÉ · ${gesture} · ${(left / 1000).toFixed(1)}s`, PANEL_W / 2 - 14, -PANEL_H / 2 + 24);
      ctx.textAlign = 'left';
    }
    ctx.textAlign = 'left';
    void p;
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
