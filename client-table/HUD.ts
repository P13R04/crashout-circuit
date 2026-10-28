/**
 * HUD — the four corner panels (REQ-6.2), each rotated towards its own table edge.
 * Pilot panel: HP over steering and repair. Copilot: POWER and repair.
 * Armed items remain available without a countdown.
 */
import type { GameState, Team, Car } from '../server/types.js';
import {
  PANELS, PANEL_H, panelWidth, padLocal, STEER_AREA_LOCAL, PEDAL_LOCAL, POWER_BTN_LOCAL, steerArea,
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
      this.drawFrame(ctx, panel, view.theme, state);
      if (panel.role === 'pilot') this.drawPilot(ctx, panel, state, view, now);
      else this.drawCopilot(ctx, panel, state, view, now);
      this.drawPad(ctx, panel, state, view);
      ctx.restore();
    }
  }

  private drawFrame(ctx: Ctx, panel: PanelLayout, theme: ThemeId, state: GameState): void {
    const PANEL_W = panelWidth(panel.role,state.driveMode[panel.team]);
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
    icon(ctx, panel.role === 'pilot' ? 'wheel' : 'power', left + 8, -62, 20, color);
    ctx.fillText(panel.role === 'pilot' ? 'PILOTE' : 'COPILOTE', left + 28, -57);
  }

  private drawPilot(ctx: Ctx, panel: PanelLayout, state: GameState, view: View, now: number): void {
    const team=panel.team,car=state.cars[team],color=TEAM_COLOR[team],mode=state.driveMode[team];
    const area=steerArea(mode),actual=Math.max(0,car.hp/state.params.hpMax),shown=Math.max(actual,view.hpShown[team]/state.params.hpMax);
    // Health is directly above the two steering pedals, with a short trailing damage trace.
    const x=area.x-area.w/2,y=-43,w=area.w-34,h=15;
    const health=actual>.5?'#61f4ba':actual>.25?'#ffb65b':'#ff7070';
    ctx.fillStyle='#040b13';ctx.fillRect(x,y,w,h);
    ctx.fillStyle='#f6ffff88';ctx.fillRect(x,y,w*shown,h);
    ctx.fillStyle=health;ctx.fillRect(x,y,w*actual,h);
    ctx.strokeStyle='#09141d';ctx.lineWidth=2;
    for(let i=1;i<10;i++){ctx.beginPath();ctx.moveTo(x+w*i/10,y);ctx.lineTo(x+w*i/10,y+h);ctx.stroke();}
    ctx.strokeStyle=color+'66';ctx.lineWidth=1;ctx.strokeRect(x,y,w,h);
    ctx.fillStyle=health;ctx.font='bold 14px monospace';ctx.textAlign='right';ctx.fillText(`${Math.round(car.hp)}`,x+area.w,y+13);
    const stick=view.sticks[team],automatic=state.sessionMode==='tangibles-test';
    ctx.fillStyle=stick.active?color+'19':'#081323';ctx.strokeStyle=stick.active?color:'#3e6177';ctx.lineWidth=stick.active?3:2;
    ctx.beginPath();ctx.roundRect(area.x-area.w/2,area.y-area.h/2,area.w,area.h,12);ctx.fill();ctx.stroke();
    if(automatic)icon(ctx,'track',area.x,area.y,42,color);
    else{
      ctx.strokeStyle='#ffffff30';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(area.x,area.y-area.h/2+10);ctx.lineTo(area.x,area.y+area.h/2-10);ctx.stroke();
      for(const side of [-1,1]){
        const active=stick.active&&Math.sign(stick.x)===side;
        if(active){ctx.fillStyle=color+'38';ctx.fillRect(area.x+(side<0?-area.w/2+3:3),area.y-area.h/2+3,area.w/2-6,area.h-6);}
        ctx.fillStyle=active?'#fff':color;ctx.font='bold 28px monospace';ctx.textAlign='center';ctx.fillText(side<0?'◀':'▶',area.x+side*area.w/4,area.y+10);
      }
    }
    if(!automatic&&mode==='pedal'){
      const p=PEDAL_LOCAL,active=view.localPedals[team];ctx.fillStyle=active?color+'55':'#ffffff09';ctx.strokeStyle=active?'#fff':color;ctx.lineWidth=active?3:2;
      ctx.beginPath();ctx.roundRect(p.x-p.w/2,p.y-p.h/2,p.w,p.h,12);ctx.fill();ctx.stroke();icon(ctx,'pedal',p.x,p.y,32,active?'#fff':color);
    }
    icon(ctx,'flag',55,-60,15,color);ctx.fillStyle='#dceef4';ctx.font='bold 14px monospace';ctx.textAlign='left';
    ctx.fillText(state.sessionMode==='tangibles-test'?`${car.lap+1}`:`${Math.min(state.params.lapsToWin,car.lap+1)}/${state.params.lapsToWin}`,68,-55);
    void now;
  }

  private drawCopilot(ctx: Ctx, panel: PanelLayout, state: GameState, view: View, now: number): void {
    const car=state.cars[panel.team],color=TEAM_COLOR[panel.team],armed=car.itemArmed&&!!car.heldItem,b=POWER_BTN_LOCAL;
    const ink=armed?NEON.gold:car.heldItem?color:'#586078';
    if(car.heldItem)glow(ctx,b.x,b.y,52,ink,armed?.25:.12);
    ctx.fillStyle=armed?'#ffce661f':car.heldItem?color+'14':'#050d1c';
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
    ring(ctx,b.x,b.y,b.r,1,ink,armed?4:2);icon(ctx,'power',b.x,b.y,30,ink);
    if(car.heldItem){
      drawItemIcon(ctx,car.heldItem,b.x,-43,12,ink);
      ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(b.x,-30);ctx.lineTo(b.x,-25);ctx.stroke();
    }
    if(armed){
      contacts(ctx,car.heldItem==='slingshot'?3:2,b.x,67,NEON.gold);
      const w=panelWidth('copilot');ctx.strokeStyle=NEON.gold+'80';ctx.lineWidth=2;
      ctx.beginPath();ctx.roundRect(-w/2+4,-PANEL_H/2+4,w-8,PANEL_H-8,14);ctx.stroke();
    }
    void view;void now;
  }

  /** Repair pad (116 px disc) with a ring filling while both partners hold their pad. */
  private drawPad(ctx: Ctx, panel: PanelLayout, state: GameState, view: View): void {
    const key = `${panel.team}-${panel.role}`;
    const held = view.localPads[key] || state.repairPads[key]?.held;
    const car: Car = state.cars[panel.team];
    const color = TEAM_COLOR[panel.team];
    const { x, y, r } = padLocal(panel.role,state.driveMode[panel.team]);
    if (held) glow(ctx, x, y, r + 12, NEON.mint, .25);
    ctx.fillStyle = held ? 'rgba(97,244,186,0.12)' : car.disabled ? 'rgba(255,64,64,0.2)' : 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ring(ctx, x, y, r - 5, state.repairProgress[panel.team], '#61f4ba', 6);
    ctx.strokeStyle = held ? '#61f4ba' : color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    icon(ctx, 'wrench', x, y - 8, 30, held ? '#61f4ba' : car.disabled ? '#ff7070' : '#a9b6cd');
    // The pair shows which partner is holding; the outer ring shows joint progress.
    const partner = panel.role === 'pilot' ? 'copilot' : 'pilot';
    const partnerKey = `${panel.team}-${partner}`;
    const partnerHeld = view.localPads[partnerKey] || state.repairPads[partnerKey]?.held;
    for (const [dx, on] of [[-11, held], [11, partnerHeld]] as const) {
      ctx.fillStyle = on ? '#61f4ba' : '#ffffff15';
      ctx.strokeStyle = on ? '#61f4ba' : '#8190aa'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + dx, y + 24, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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
