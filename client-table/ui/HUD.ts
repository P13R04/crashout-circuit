/**
 * Dessine les commandes des quatre postes, la santé des voitures, les stocks et la progression des
 * réparations.
 * Liens : server/layout.ts, server/types.ts, client-table/view.ts, client-table/ui/icons.ts,
 * client-table/themes/themes.ts et les utilitaires importés ci-dessous.
 * Référencé par client-table/themes/neon/NeonEffects.ts, client-table/themes/neon/NeonObjects.ts, client-table/renderer/Renderer.ts.
 */
import { tablePanels } from '../../server/tableStations.js';
import type { GameState, Team } from '../../server/types.js';
import { drawPowerControl, drawRepairControl, powerInk } from '../../client-shared/ui/stationControls.js';
import {
  PANEL_H, panelWidth, padLocal, STEER_AREA_LOCAL, PEDAL_LOCAL, POWER_BTN_LOCAL, ITEM_SLOT_LOCAL, steerArea,
  type PanelLayout,
} from '../../server/layout.js';
import { TEAM_COLOR, type View } from '../view.js';
import { icon, contacts } from './icons.js';
import { themeLook, type ThemeId } from '../themes/themes.js';
import { armedPickup } from '../../server/rules/armedPickup.js';
import { glow, NEON } from '../themes/neon/neon.js';
import { drawRemotePilot, remotePilot } from './remotePilot.js';

/** Désigne le contexte Canvas 2D partagé par les fonctions de dessin du module. */
type Ctx = CanvasRenderingContext2D;

/** Dessine le pictogramme du bonus pour le stock copilote et les retours de ramassage. */
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

/** Dessine les commandes des quatre postes, la santé des voitures, les stocks et la progression des réparations. */
export class HUD {
  /** Dessine les quatre postes dans leur orientation avec les commandes de chaque rôle. */
  draw(ctx: Ctx, state: GameState, view: View): void {
    const now = state.phase === 'PAUSED' ? state.pausedAt : view.now();
    for (const panel of tablePanels(state)) {
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

  /** Dessine le panneau du poste avec les matériaux et les repères de son thème. */
  private drawFrame(ctx: Ctx, panel: PanelLayout, theme: ThemeId, state: GameState): void {
    const PANEL_W = panelWidth(panel.role,state.driveMode[panel.team]);
    const color = TEAM_COLOR[panel.team],look=themeLook(theme);
    const metal = ctx.createLinearGradient(0, -PANEL_H / 2, 0, PANEL_H / 2);
    metal.addColorStop(0,look.top);metal.addColorStop(.45,look.panel);metal.addColorStop(1,look.bottom);
    ctx.fillStyle = metal; ctx.strokeStyle = look.line; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, look.radius);
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
    if (theme === 'scrap'||theme==='mayhem') {
      for (const x of [-PANEL_W / 2 + 10, PANEL_W / 2 - 10]) for (const y of [-PANEL_H / 2 + 11, PANEL_H / 2 - 11]) {
        ctx.fillStyle = '#03090d'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#9aafaf'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 1.5, y - 1); ctx.lineTo(x + 1.5, y + 1); ctx.stroke();
      }
    }
    if(theme==='toy'){
      // Plastic lip and recessed screw heads, kept away from touch targets.
      ctx.strokeStyle='#e4ffed55';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-PANEL_W/2+25,-PANEL_H/2+6);ctx.lineTo(PANEL_W/2-25,-PANEL_H/2+6);ctx.stroke();
      for(const x of [-PANEL_W/2+12,PANEL_W/2-12]){ctx.fillStyle=look.button;ctx.beginPath();ctx.arc(x,0,4,0,Math.PI*2);ctx.fill();}
    }else if(theme==='classic'){
      ctx.fillStyle='#d8ddd880';for(let i=0;i<6;i++)if(i%2===0)ctx.fillRect(PANEL_W/2-58+i*6,-PANEL_H/2+7,6,4);
    }else if(theme==='mayhem'){
      ctx.strokeStyle='#bba07a38';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-PANEL_W/2+35,PANEL_H/2-8);ctx.lineTo(PANEL_W/2-40,PANEL_H/2-12);ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.font = '600 13px system-ui';
    ctx.textAlign = 'left';
    const left = -PANEL_W / 2 + 18;
    icon(ctx, panel.role === 'pilot' ? 'wheel' : 'power', left + 8, -62, 20, color);
    ctx.fillText(`${panel.team === 'A' ? 'CYAN' : 'ROSE'} · ${panel.role === 'pilot' ? 'PILOTE' : 'COPILOTE'}`, left + 28, -60);
  }

  /** Affiche la santé, les tours, la direction et la pédale éventuelle du pilote. */
  private drawPilot(ctx: Ctx, panel: PanelLayout, state: GameState, view: View, now: number): void {
    const team=panel.team,car=state.cars[team],color=TEAM_COLOR[team],mode=state.driveMode[team],look=themeLook(view.theme);
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
    const remote=remotePilot(state,team);
    if(remote){drawRemotePilot(ctx,area,remote,state.wiimotes?.[team]??null,color,look.button,look.line,look.ink);}
    else this.drawControls(ctx,state,view,team,color,look);
    if(!state.tutorial){
      icon(ctx,'flag',55,-60,15,color);ctx.fillStyle=look.ink;ctx.font='bold 14px monospace';ctx.textAlign='left';
      ctx.fillText(state.sessionMode==='tangibles-test'?`${car.lap+1}`:`${Math.min(state.params.lapsToWin,car.lap+1)}/${state.params.lapsToWin}`,68,-55);
    }
    void now;
  }

  /** Dessine la direction et la pédale tactiles du pilote qui conduit sur la table. */
  private drawControls(ctx: Ctx, state: GameState, view: View, team: Team, color: string, look: ReturnType<typeof themeLook>): void {
    const mode=state.driveMode[team],area=steerArea(mode);
    const stick=view.sticks[team],automatic=state.sessionMode==='tangibles-test';
    ctx.fillStyle=stick.active?color+'29':look.button;ctx.strokeStyle=stick.active?color:look.line;ctx.lineWidth=stick.active?3:2;
    ctx.beginPath();ctx.roundRect(area.x-area.w/2,area.y-area.h/2,area.w,area.h,Math.min(18,look.radius));ctx.fill();ctx.stroke();
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
  }

  /** Affiche POWER, le stock et l’état d’armement du copilote. */
  private drawCopilot(ctx: Ctx, panel: PanelLayout, state: GameState, view: View, now: number): void {
    const car=state.cars[panel.team],color=TEAM_COLOR[panel.team],armed=car.itemArmed&&!!car.heldItem,b=POWER_BTN_LOCAL;
    const locked=!!armedPickup(state)&&!armed;
    const ink = powerInk(color, !!car.heldItem, armed, locked);
    if(car.heldItem)glow(ctx,b.x,b.y,52,ink,armed?.25:.12);
    drawPowerControl(ctx, b, { theme: view.theme, teamColor: color, ink, stocked: !!car.heldItem, armed });
    if(car.heldItem){
      drawItemIcon(ctx,car.heldItem,ITEM_SLOT_LOCAL.x,ITEM_SLOT_LOCAL.y,12,ink);
      ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(b.x,-30);ctx.lineTo(b.x,-25);ctx.stroke();
    }
    if(armed){
      contacts(ctx,car.heldItem==='slingshot'?3:2,b.x,67,NEON.gold);
      const w=panelWidth('copilot');ctx.strokeStyle=NEON.gold+'80';ctx.lineWidth=2;
      ctx.beginPath();ctx.roundRect(-w/2+4,-PANEL_H/2+4,w-8,PANEL_H-8,14);ctx.stroke();
    }
    void view;void now;
  }

  /** Dessine la clé de réparation avec l’appui local et la progression partagée. */
  private drawPad(ctx: Ctx, panel: PanelLayout, state: GameState, view: View): void {
    const key = `${panel.team}-${panel.role}`;
    const held = view.localPads[key] || state.repairPads[key]?.held;
    const car = state.cars[panel.team];
    const color = TEAM_COLOR[panel.team];
    const { x, y, r } = padLocal(panel.role,state.driveMode[panel.team]);
    if (held) glow(ctx, x, y, r + 12, NEON.mint, .25);
    // The pair shows which partner is holding; the outer ring shows joint progress.
    const partner = panel.role === 'pilot' ? 'copilot' : 'pilot';
    const partnerKey = `${panel.team}-${partner}`;
    const partnerHeld = view.localPads[partnerKey] || state.repairPads[partnerKey]?.held;
    drawRepairControl(ctx, { x, y, r }, {
      theme: view.theme, teamColor: color, disabledCar: car.disabled,
      held: !!held, partnerHeld: !!partnerHeld, progress: state.repairProgress[panel.team],
    });
    // One slow halo attracts attention only when repair is needed; no flashing text.
    if (car.disabled) {
      ctx.globalAlpha = view.reducedMotion ? .5 : .35 + .2 * Math.sin(view.visualTime / 450);
      ctx.strokeStyle = '#ff7070'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r - 13, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

export type { Team };
