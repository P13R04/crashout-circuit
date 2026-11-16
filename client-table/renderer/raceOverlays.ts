/**
 * Surcouches de course : feux de reprise, bonus attendu, zones neutres, pierres, projectile, lance-pierre et alertes.
 * Liens : client-table/HUD.ts, server/armedPickup.ts.
 * Fonctions appelées par les méthodes de Renderer (server/Renderer.ts), qui garde l'état et délègue ici.
 */
import type { GameState, Team, Vec2 } from '../../server/types.js';
import { LOGICAL_W, LOGICAL_H, rotationTowardsTeam, TANGIBLE_DEPOT, NEUTRAL_CONTROLS, inTangibleDepot } from '../../server/layout.js';
import { drawItemIcon } from '../HUD.js';
import { TEAM_COLOR, type SlingPreview } from '../view.js';
import { icon, contacts } from '../icons.js';
import { themeLook } from '../themes.js';
import { armedPickup, RESPAWN_COUNTDOWN_MS } from '../../server/armedPickup.js';
import type { Ctx } from './rendererTypes.js';
import type { Renderer } from '../Renderer.js';

/** Affiche les feux rouges puis verts au-dessus des voitures réparées avant leur reprise. */
export function drawRespawnLights(renderer: Renderer, ctx: Ctx,state: GameState,now:number): void {
  for(const car of Object.values(state.cars)){
    const until=car.respawnUntil;if(!until||car.disabled||now>until+650)continue;
    const remaining=until-now,green=remaining<=0,lit=Math.max(1,Math.min(3,Math.ceil((RESPAWN_COUNTDOWN_MS-remaining)/1000)));
    ctx.save();ctx.translate(car.pos.x,car.pos.y-48);
    ctx.fillStyle='#07121dee';ctx.strokeStyle='#a4becb88';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(-34,-14,68,28,8);ctx.fill();ctx.stroke();
    for(let i=0;i<3;i++){ctx.fillStyle=green?'#61f4ba':i<lit?'#ff8664':'#273342';ctx.beginPath();ctx.arc((i-1)*20,0,6,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
}

/** Affiche le pictogramme du seul bonus dont le geste est actuellement armé sur la table. */
export function drawExpectedBonus(renderer: Renderer, ctx: Ctx,state: GameState): void {
  if(state.tutorial||!['RACE','PAUSED'].includes(state.phase))return;
  const expected=armedPickup(state);if(!expected)return;
  ctx.save();ctx.translate(960,170);ctx.fillStyle=themeLook(renderer.theme).panel+'ed';ctx.strokeStyle=themeLook(renderer.theme).accent+'90';ctx.lineWidth=2;
  ctx.beginPath();ctx.roundRect(-45,-32,90,64,12);ctx.fill();ctx.stroke();
  drawItemIcon(ctx,expected.kind,0,-8,14,'#ffce66');contacts(ctx,expected.kind==='boost'?2:3,0,18,'#ffce66');ctx.restore();
}

/** Dessine la réserve des tangibles et la zone de commandes neutres. */
export function drawNeutralZones(renderer: Renderer, ctx: Ctx,state: GameState): void {
  ctx.save();
  for(const r of [TANGIBLE_DEPOT,NEUTRAL_CONTROLS]){
    const look=themeLook(renderer.theme);ctx.fillStyle=look.panel+'ee';ctx.strokeStyle=look.line+'88';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.roundRect(r.x,r.y,r.w,r.h,themeLook(renderer.theme).radius);ctx.fill();ctx.stroke();
  }
  for(const t of Object.values(state.tangibles))if(t.status==='parked'){
    const at={x:t.x*LOGICAL_W,y:t.y*LOGICAL_H};if(!inTangibleDepot(at))continue;
    ctx.save();ctx.translate(at.x,at.y);ctx.rotate(t.angle*Math.PI/180);ctx.strokeStyle='#a0b7bf';ctx.fillStyle='#798e9814';ctx.setLineDash([4,5]);ctx.lineWidth=2;
    const l=t.kind==='wall'?state.params.wallLengthPx:state.params.pylonBasePx,w=t.kind==='wall'?state.params.wallWidthPx:state.params.pylonBasePx;
    ctx.beginPath();ctx.roundRect(-l/2,-w/2,l,w,5);ctx.fill();ctx.stroke();ctx.setLineDash([]);
    if(t.kind==='pylon')icon(ctx,'bolt',0,0,20,'#8fa5ad');
    else{ctx.beginPath();for(let x=-l/2+12;x<l/2;x+=16){ctx.moveTo(x,-w/2+5);ctx.lineTo(x-8,w/2-5);}ctx.stroke();}
    ctx.restore();
  }
  ctx.restore();
}

/** Dessine les pierres en vol et les avertissements d’impact destinés aux deux équipes. */
export function drawStones(renderer: Renderer, ctx: Ctx, state: GameState, now: number): void {
  const total = state.params.stoneTelegraphS * 1000;
  for (const s of state.stones) {
    const left = Math.max(0, s.impactAt - now);
    const t = 1 - left / total; // 0 → 1
    const R = state.params.stoneRadiusPx;
    drawProjectile(renderer, ctx, s.from, s.target, s.launchedAt, s.impactAt, now);
    ctx.save();
    ctx.translate(s.target.x, s.target.y);
    ctx.strokeStyle = '#ff2a2a';
    ctx.fillStyle = `rgba(255,42,42,${0.12 + 0.25 * t})`;
    ctx.shadowColor = '#ff2a2a';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R * (2.2 - 1.2 * t), 0, Math.PI * 2); ctx.stroke(); // closing ring
    ctx.shadowBlur = 0;
    // upright for the closest player of the targeted (opposing) team
    const victim: Team = s.team === 'A' ? 'B' : 'A';
    ctx.rotate(rotationTowardsTeam(victim, s.target));
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    icon(ctx, 'target', 0, -R - 23, 28, '#ff7070');
    ctx.restore();
  }
}

/** Interpole la pierre entre sa poche et sa cible avec une petite hauteur visuelle. */
function drawProjectile(renderer: Renderer, ctx: Ctx, from: Vec2, to: Vec2, launchedAt: number, impactAt: number, now: number): void {
  const span = Math.max(1, impactAt - launchedAt);
  const f = Math.max(0, Math.min(1, (now - launchedAt) / span));
  /** Calcule un point intermédiaire sur la trajectoire dessinée. */
  const at = (k: number) => ({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
  /** Calcule le léger arc visuel qui donne du relief au projectile sans modifier son impact. */
  const lift = (k: number) => 22 * Math.sin(Math.PI * k);
  const p = at(f), h = lift(f);
  ctx.save();
  // comet trail
  const t0 = Math.max(0, f - 0.22);
  const q = at(t0);
  const grad = ctx.createLinearGradient(q.x, q.y - lift(t0), p.x, p.y - h);
  grad.addColorStop(0, 'rgba(255,200,120,0)');
  grad.addColorStop(1, 'rgba(255,200,120,0.85)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(q.x, q.y - lift(t0)); ctx.lineTo(p.x, p.y - h); ctx.stroke();
  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
  // the stone
  ctx.fillStyle = '#ffebc5';
  ctx.shadowColor = '#ffad62';
  ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.arc(p.x, p.y - h, 7 + 3 * Math.sin(Math.PI * f), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/**
 * Dessine la fourche, l’élastique et la cible du lance-pierre en préparation.
 * L’élastique relie les deux appuis à la poche ; les pointillés, la cible et la jauge prévisualisent le tir.
 */
export function drawSling(renderer: Renderer, ctx: Ctx, state: GameState, sling: SlingPreview | null): void {
  if (!sling) return;
  const { anchors, pouch, shot, idle } = sling;
  const prm = state.params;
  const ready = !idle && shot.valid;
  const power = Math.max(0, Math.min(1, (shot.pull - prm.slingMinPullPx) / Math.max(1, prm.slingMaxPullPx - prm.slingMinPullPx)));
  const band = ready ? `hsl(${Math.round(55 - 55 * power)}, 100%, 62%)` : 'rgba(255,255,255,0.55)';
  const fork = { x: (anchors[0].x + anchors[1].x) / 2, y: (anchors[0].y + anchors[1].y) / 2 };
  const teamColor = sling.team ? TEAM_COLOR[sling.team] : '#ffffff';

  ctx.save();
  if (ready) {
    // flight line through the fork and the landing zone
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 12]);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(fork.x, fork.y); ctx.lineTo(shot.target.x, shot.target.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ff2a2a';
    ctx.fillStyle = 'rgba(255,42,42,0.12)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(shot.target.x, shot.target.y, prm.stoneRadiusPx, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (idle) {
    // Nobody has been pulled yet: the three contacts look alike, no role is suggested
    // (the landing order does not tell which finger will be the pouch).
    ctx.strokeStyle = teamColor; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]); ctx.globalAlpha = .4;
    ctx.beginPath(); ctx.moveTo(anchors[0].x, anchors[0].y); ctx.lineTo(pouch.x, pouch.y); ctx.lineTo(anchors[1].x, anchors[1].y); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = teamColor;
    ctx.globalAlpha = 0.7;
    for (const c of [anchors[0], anchors[1], pouch]) { ctx.beginPath(); ctx.arc(c.x, c.y, 15, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  } else {
    // elastic band: anchor 1 → pouch → anchor 2
    ctx.strokeStyle = band;
    ctx.shadowColor = band;
    ctx.shadowBlur = ready ? 16 : 0;
    ctx.lineWidth = 4 + 6 * power;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(anchors[0].x, anchors[0].y);
    ctx.lineTo(pouch.x, pouch.y);
    ctx.lineTo(anchors[1].x, anchors[1].y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // fork fingers and pouch
    ctx.fillStyle = teamColor;
    for (const a of anchors) { ctx.beginPath(); ctx.arc(a.x, a.y, 15, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = ready ? '#ffebc5' : 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(pouch.x, pouch.y, 12, 0, Math.PI * 2); ctx.fill();
  }
  // strength read-out, upright for the team that holds the item
  ctx.save();
  const labelAt = idle
    ? { x: (anchors[0].x + anchors[1].x + pouch.x) / 3, y: (anchors[0].y + anchors[1].y + pouch.y) / 3 }
    : pouch;
  ctx.translate(labelAt.x, labelAt.y);
  ctx.rotate(sling.team ? rotationTowardsTeam(sling.team, fork) : 0);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = power >= (i + 1) / 5 ? teamColor : '#ffffff30';
    ctx.fillRect(-33 + i * 14, 28, 10, 8 + i * 3);
  }
  ctx.restore();
  ctx.restore();
}

/** Indique la panne au poste de la voiture concernée avec une lecture orientée vers ses joueurs. */
export function drawDisabledAlerts(renderer: Renderer, ctx: Ctx, state: GameState): void {
  for (const team of ['A', 'B'] as Team[]) {
    const car = state.cars[team];
    if (!car.disabled) continue;
    ctx.save(); ctx.translate(car.pos.x, car.pos.y); ctx.rotate(rotationTowardsTeam(team, car.pos));
    ctx.fillStyle = '#080f26ee'; ctx.beginPath(); ctx.arc(0, -38, 21, 0, Math.PI * 2); ctx.fill();
    icon(ctx, 'wrench', 0, -38, 27, '#ff7070'); ctx.restore();
  }
}
