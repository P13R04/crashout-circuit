/**
 * Renderer — Canvas 2D neon rendering of the table (REQ-6.1, §11 of the brief).
 * The caller scales the context to the 1920×1080 logical space.
 *
 * Static deck, lights, code sheets and vehicle bodies are cached in dedicated layers.
 * Only local energy paths, bounded trails and feedback change every frame.
 */
import type { GameState, Team, Vec2 } from '../server/types.js';
import { LOGICAL_W, LOGICAL_H, rotationTowardsTeam, PLAY_AREA, TANGIBLE_DEPOT, NEUTRAL_CONTROLS, SETTINGS_BUTTON, inTangibleDepot } from '../server/layout.js';
import { HUD, drawItemIcon } from './HUD.js';
import { TEAM_COLOR, type View, type SlingPreview } from './view.js';
import { icon, contacts, type Icon } from './icons.js';
import { drawTutorial } from './TutorialOverlay.js';
import { TangibleTransitions } from './TangibleTransitions.js';
import { playFeedback } from './Sound.js';
import { ScrapBackdrop } from './ScrapBackdrop.js';
import { ScrapTrack } from './ScrapTrack.js';
import { themeLook, type ThemeId, type CircuitTheme } from './themes.js';
import { CircuitTrack } from './CircuitTrack.js';
import { ThemeWorld } from './ThemeWorld.js';
import { VoidBackdrop } from './VoidBackdrop.js';
import { NeonTrack } from './NeonTrack.js';
import { NeonVehicles } from './NeonVehicles.js';
import { NeonObjects } from './NeonObjects.js';
import { NeonEffects } from './NeonEffects.js';
import { armedPickup, RESPAWN_COUNTDOWN_MS } from '../server/armedPickup.js';
import { drawTangibleTouchPreview } from './TangibleTouchPreview.js';
import { glow, NEON, plate } from './neon.js';
import { activeMapTeam, inMapAnchor, mapStrokeEndpoints, MAP_ANCHOR_RADIUS } from '../server/mapCreation.js';

type Ctx = CanvasRenderingContext2D;

export const START_TABLE_BUTTON = { x: LOGICAL_W / 2 - 260, y: LOGICAL_H / 2 - 144, w: 520, h: 60 };
export const START_PC_BUTTON = { x: LOGICAL_W / 2 - 260, y: LOGICAL_H / 2 - 68, w: 520, h: 60 };
export const START_TUTORIAL_BUTTON = { x: LOGICAL_W / 2 - 260, y: LOGICAL_H / 2 + 8, w: 520, h: 60 };
export const START_TANGIBLE_TEST_BUTTON = { x: LOGICAL_W / 2 - 260, y: LOGICAL_H / 2 + 84, w: 520, h: 60 };
export const RESULT_BUTTON = { x: LOGICAL_W / 2 - 200, y: LOGICAL_H / 2 - 45, w: 400, h: 90 };
export const PAUSE_BUTTON = { x: LOGICAL_W / 2 - 58, y: 35, w: 116, h: 76 };
export const DRIVE_MODE_BUTTONS = { A: SETTINGS_BUTTON, B: SETTINGS_BUTTON };
export const DRIVE_MODE_BUTTON = DRIVE_MODE_BUTTONS.A;
export const MAP_GENERATE_BUTTON = { x: LOGICAL_W / 2 - 180, y: LOGICAL_H / 2 - 44, w: 360, h: 88 };
export const RACE_START_BUTTON = { x: LOGICAL_W / 2 - 180, y: LOGICAL_H / 2 - 44, w: 360, h: 88 };
/** Reset button located in the vertical middle on the far right edge of the screen. */

export class Renderer {
  private hud = new HUD();
  private transitions = new TangibleTransitions(playFeedback);
  private backdrop = new VoidBackdrop();
  private track = new NeonTrack();
  private scrapTrack = new ScrapTrack();
  private scrapBackdrop = new ScrapBackdrop();
  // Fall visibility belongs to the vehicle, not to its selected presentation.
  private fallen = new Set<Team>();
  private scrapVehicles = new NeonVehicles('scrap', this.fallen);
  private scrapObjects = new NeonObjects('scrap');
  private worlds = new Map<CircuitTheme, { track:CircuitTrack; backdrop:ThemeWorld; vehicles:NeonVehicles; objects:NeonObjects }>();
  private world(id:CircuitTheme) {
    let world=this.worlds.get(id);
    if(!world){world={track:new CircuitTrack(id),backdrop:new ThemeWorld(id),vehicles:new NeonVehicles(id,this.fallen),objects:new NeonObjects(id)};this.worlds.set(id,world);}
    return world;
  }
  private theme: ThemeId = 'neon';
  private vehicles = new NeonVehicles('neon', this.fallen);
  private objects = new NeonObjects();
  private effects = new NeonEffects();
  private time = 0;
  private reducedMotion = false;

  constructor(private ctx: Ctx) {}

  get stats(): { trackBuilds: number; trailPoints: number } {
    return { trackBuilds: this.track.builds + this.scrapTrack.builds + [...this.worlds.values()].reduce((n,w)=>n+w.track.builds,0), trailPoints: this.theme === 'scrap' ? this.scrapVehicles.trailPoints : this.theme === 'neon' ? this.vehicles.trailPoints : this.world(this.theme).vehicles.trailPoints };
  }

  /** Complete table frame; the caller owns the logical-to-device transform. */
  render(view: View): void {
    const state = view.state;
    const ctx = this.ctx;
    if (this.theme !== view.theme) { this.vehicles.clearTrails(); this.scrapVehicles.clearTrails(); for(const w of this.worlds.values())w.vehicles.clearTrails(); this.theme = view.theme; }
    const industrial = this.theme === 'scrap';
    const world = this.theme !== 'neon' && this.theme !== 'scrap' ? this.world(this.theme) : null;
    const look = themeLook(this.theme);
    const vehicles = world?.vehicles ?? (industrial ? this.scrapVehicles : this.vehicles);
    const objects = world?.objects ?? (industrial ? this.scrapObjects : this.objects);
    const track = world?.track ?? (industrial ? this.scrapTrack : this.track);
    if (state) this.transitions.update(state, view.visualTime);
    this.reducedMotion = view.reducedMotion;
    this.time = view.visualTime;
    if(world)world.backdrop.draw(ctx,this.time,view.reducedMotion,state?.phase==='MAP',state?.track??null,state?.phase==='LOBBY'?'lobby':state?.phase==='MAP'?'map':'race');
    else (industrial?this.scrapBackdrop:this.backdrop).draw(ctx,this.time,view.reducedMotion,state?.phase==='MAP');
    if (!state) return;

    if (state.phase === 'LOBBY') { vehicles.clear(); this.drawLobby(ctx); return; }
    if (state.phase === 'MAP') { vehicles.clear(); this.drawMap(ctx, state, view);  return; }
    if (state.phase !== 'READY' && state.phase !== 'RACE' && state.phase !== 'PAUSED' && state.phase !== 'RESULT') return;
    const now = state.phase === 'PAUSED' ? state.pausedAt : view.now();

    if (state.track) track.draw(ctx, state.track, state.trackVersion, this.time, this.reducedMotion);
    vehicles.drawTrails(ctx, state, this.time, now, this.reducedMotion);
    objects.drawPickups(ctx, state, this.time, this.reducedMotion);
    objects.drawGates(ctx, state, now, this.time, this.reducedMotion);
    this.transitions.draw(ctx, this.time, this.reducedMotion, look.electric);
    objects.drawWalls(ctx, state, now, this.time, this.reducedMotion);
    objects.drawArcs(ctx, state, now, this.time, this.reducedMotion);
    objects.drawPylons(ctx, state, this.time, this.reducedMotion);
    this.transitions.drawActivation(ctx, this.time, this.reducedMotion, look.electric);
    this.drawStones(ctx, state, now);
    for (const t of ['A', 'B'] as Team[]) vehicles.draw(ctx, state.cars[t], this.time, now, this.reducedMotion, view.effects);
    this.drawRespawnLights(ctx,state,now);
    this.effects.draw(ctx, view);
    this.drawSling(ctx, state, view.sling);
    drawTangibleTouchPreview(ctx, view);
    this.drawExpectedBonus(ctx,state);
    this.hud.draw(ctx, state, view);
    this.drawDisabledAlerts(ctx, state);
    this.drawNeutralZones(ctx,state);
    if (state.phase === 'READY') { this.drawRaceReady(ctx, state); }
    if (state.phase === 'RACE') { this.drawCountdown(ctx, state, now); this.drawPauseButton(ctx, 'PAUSE'); }
    if (state.phase === 'PAUSED') { this.drawPaused(ctx); this.drawPauseButton(ctx, 'REPRENDRE'); }
    if (state.phase === 'RESULT') this.drawResult(ctx, state);
    drawTutorial(ctx, state, this.reducedMotion ? 0 : this.time, DRIVE_MODE_BUTTONS);

  }

  private drawRespawnLights(ctx: Ctx,state: GameState,now:number):void {
    for(const car of Object.values(state.cars)){
      const until=car.respawnUntil;if(!until||car.disabled||now>until+650)continue;
      const remaining=until-now,green=remaining<=0,lit=Math.max(1,Math.min(3,Math.ceil((RESPAWN_COUNTDOWN_MS-remaining)/1000)));
      ctx.save();ctx.translate(car.pos.x,car.pos.y-48);
      ctx.fillStyle='#07121dee';ctx.strokeStyle='#a4becb88';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(-34,-14,68,28,8);ctx.fill();ctx.stroke();
      for(let i=0;i<3;i++){ctx.fillStyle=green?'#61f4ba':i<lit?'#ff8664':'#273342';ctx.beginPath();ctx.arc((i-1)*20,0,6,0,Math.PI*2);ctx.fill();}
      ctx.restore();
    }
  }

  private drawExpectedBonus(ctx: Ctx,state: GameState):void {
    if(state.tangiblePlacement||!['RACE','PAUSED'].includes(state.phase))return;
    const expected=armedPickup(state);if(!expected)return;
    ctx.save();ctx.translate(960,170);ctx.fillStyle=themeLook(this.theme).panel+'ed';ctx.strokeStyle=themeLook(this.theme).accent+'90';ctx.lineWidth=2;
    ctx.beginPath();ctx.roundRect(-45,-32,90,64,12);ctx.fill();ctx.stroke();
    drawItemIcon(ctx,expected.kind,0,-8,14,'#ffce66');contacts(ctx,expected.kind==='boost'?2:3,0,18,'#ffce66');ctx.restore();
  }

  private drawNeutralZones(ctx: Ctx,state: GameState): void {
    ctx.save();
    for(const r of [TANGIBLE_DEPOT,NEUTRAL_CONTROLS]){
      const look=themeLook(this.theme);ctx.fillStyle=look.panel+'ee';ctx.strokeStyle=look.line+'88';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.roundRect(r.x,r.y,r.w,r.h,themeLook(this.theme).radius);ctx.fill();ctx.stroke();
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


  private drawLobby(ctx: Ctx): void {
    ctx.save(); ctx.textAlign = 'center';
    for (const rot of [0, Math.PI]) {
      ctx.save(); ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2); ctx.rotate(rot);
      icon(ctx, 'track', 0, -295, 110, themeLook(this.theme).accent);
      ctx.fillStyle = '#fff'; glow(ctx, 0, -230, 330, '#5988c5', .2, .4);
      ctx.fillStyle = NEON.white; ctx.font = '800 64px system-ui';
      ctx.fillText('CRASHOUT', 0, -202);
      ctx.fillStyle = '#96bacd'; ctx.font = '500 22px monospace'; ctx.fillText('C I R C U I T', 0, -165); ctx.restore();
    }
    for (const [button, glyph, label, color] of [
      [START_TABLE_BUTTON, 'touch', 'TABLE', '#00e5ff'],
      [START_PC_BUTTON, 'mouse', 'PC', '#ff4081'],
      [START_TUTORIAL_BUTTON, 'draw', 'TUTORIEL', '#ffce66'],
      [START_TANGIBLE_TEST_BUTTON, 'wrench', 'TEST TANGIBLES', '#61f4ba'],
    ] as const) {
      ctx.fillStyle = `${color}18`; ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(button.x, button.y, button.w, button.h, 18); ctx.fill(); ctx.stroke();
      icon(ctx, glyph, button.x + 74, button.y + button.h / 2, 34, color);
      // Only the mode name needs a second orientation. The symbol is shared.
      for (const rot of [0, Math.PI]) {
        ctx.save(); ctx.translate(button.x + button.w / 2 + 25, button.y + button.h / 2); ctx.rotate(rot);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 20px monospace'; ctx.fillText(label, 0, 26); ctx.restore();
      }
    }
    ctx.restore();
  }

  /** Red warning circle during the telegraph, with a label oriented to the targeted team. */
  private drawStones(ctx: Ctx, state: GameState, now: number): void {
    const total = state.params.stoneTelegraphS * 1000;
    for (const s of state.stones) {
      const left = Math.max(0, s.impactAt - now);
      const t = 1 - left / total; // 0 → 1
      const R = state.params.stoneRadiusPx;
      this.drawProjectile(ctx, s.from, s.target, s.launchedAt, s.impactAt, now);
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

  /** The stone in flight: a lit disc that rises and falls above its ground shadow. */
  private drawProjectile(ctx: Ctx, from: Vec2, to: Vec2, launchedAt: number, impactAt: number, now: number): void {
    const span = Math.max(1, impactAt - launchedAt);
    const f = Math.max(0, Math.min(1, (now - launchedAt) / span));
    const at = (k: number) => ({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
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
   * Slingshot while it is being drawn: the elastic from the two fork fingers to the
   * pulled pouch, the dotted flight line, the landing zone and the strength.
   */
  private drawSling(ctx: Ctx, state: GameState, sling: SlingPreview | null): void {
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

  /** "Vehicle out of order" text next to the car, oriented to its team's nearest player. */
  private drawDisabledAlerts(ctx: Ctx, state: GameState): void {
    for (const team of ['A', 'B'] as Team[]) {
      const car = state.cars[team];
      if (!car.disabled) continue;
      ctx.save(); ctx.translate(car.pos.x, car.pos.y); ctx.rotate(rotationTowardsTeam(team, car.pos));
      ctx.fillStyle = '#080f26ee'; ctx.beginPath(); ctx.arc(0, -38, 21, 0, Math.PI * 2); ctx.fill();
      icon(ctx, 'wrench', 0, -38, 27, '#ff7070'); ctx.restore();
    }
  }

  // ─── Overlays ─────────────────────────────────────────────────────────────

  private drawCountdown(ctx: Ctx, state: GameState, now: number): void {
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

  private drawPauseButton(ctx: Ctx, label: string): void {
    const b = PAUSE_BUTTON;
    const look=themeLook(this.theme);ctx.save();ctx.fillStyle=look.panel+'ee';ctx.strokeStyle=look.line;ctx.lineWidth=2;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(18,look.radius)); ctx.fill(); ctx.stroke();
    icon(ctx, label === 'PAUSE' ? 'pause' : 'play', b.x + b.w / 2, b.y + b.h / 2, 24);
    ctx.restore();
  }


  private drawAction(ctx: Ctx, b: { x: number; y: number; w: number; h: number }, glyph: Icon, color = '#00e5ff'): void {
    ctx.save();ctx.fillStyle=themeLook(this.theme).button+'f5';ctx.strokeStyle=color;ctx.lineWidth=4;
    glow(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w * .7, color, .16, .35);
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, b.h / 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; icon(ctx, glyph, b.x + b.w / 2, b.y + b.h / 2, 42, color); ctx.restore();
  }

  private drawRaceReady(ctx: Ctx, state: GameState): void {
    // Keep the generated track and the four stations visible before launching.
    this.drawAction(ctx, RACE_START_BUTTON, 'play');
    if (state.track?.preset) {
      ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#ffbe37'; ctx.font = 'bold 20px sans-serif';
      for (const rotation of [0, Math.PI]) {
        ctx.save(); ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2); ctx.rotate(rotation);
        ctx.fillText(state.sessionMode === 'tangibles-test' ? 'TEST TANGIBLES' : 'Circuit de secours', 0, 94); ctx.restore();
      }
      ctx.restore();
    }
  }

  private drawPaused(ctx: Ctx): void {
    ctx.save(); ctx.fillStyle = 'rgba(4,8,31,0.62)'; ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    this.drawAction(ctx, RACE_START_BUTTON, 'play'); ctx.restore();
  }

  private drawResult(ctx: Ctx, state: GameState): void {
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
    this.drawAction(ctx, RESULT_BUTTON, 'replay'); ctx.restore();
  }

  private drawMap(ctx: Ctx, state: GameState, view: View): void {
    const t = performance.now();
    const motion = this.reducedMotion ? 0 : this.time;
    const team = activeMapTeam(state);
    ctx.save();

    if (!state.mapTargets || !state.mapDivider) {
      ctx.strokeStyle = view.pendingDivider.length ? TEAM_COLOR.B : TEAM_COLOR.A;
      ctx.lineWidth = 2; ctx.setLineDash([12, 10]);
      ctx.strokeRect(PLAY_AREA.x0, PLAY_AREA.y0, PLAY_AREA.x1 - PLAY_AREA.x0, PLAY_AREA.y1 - PLAY_AREA.y0);
      ctx.setLineDash([]);
      const first = view.pendingDivider[0];
      if (first) this.drawMapAnchor(ctx, first, 'P1', 'POINT CYAN', TEAM_COLOR.A, 'A', false, t);
      if (!first) icon(ctx, 'touch', LOGICAL_W / 2, LOGICAL_H / 2, 64, '#00e5ff88');
    } else {
      const [a, b] = state.mapDivider;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      const nx = -uy, ny = ux;
      const far = 4000;
      for (const [sideTeam, side] of [['A', 1], ['B', -1]] as const) {
        ctx.beginPath();
        ctx.moveTo(a.x - ux * far, a.y - uy * far);
        ctx.lineTo(a.x - ux * far + nx * side * far, a.y - uy * far + ny * side * far);
        ctx.lineTo(b.x + ux * far + nx * side * far, b.y + uy * far + ny * side * far);
        ctx.lineTo(b.x + ux * far, b.y + uy * far);
        ctx.closePath();
        ctx.fillStyle = TEAM_COLOR[sideTeam] + (sideTeam === team ? '14' : '04');
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([12, 12]);
      ctx.beginPath();
      ctx.moveTo(a.x - ux * far, a.y - uy * far);
      ctx.lineTo(b.x + ux * far, b.y + uy * far); ctx.stroke(); ctx.setLineDash([]);

      // Only the active team's direction is shown. Curved chevrons leave the divider
      // towards its half-plane, without suggesting that the straight divider is a road.
      if (team && ![...view.strokes.values()].some(s => s.team === team && !s.done)) {
        const [from, to] = state.mapTargets[team];
        this.drawMapArrow(ctx, from, to, TEAM_COLOR[team], motion);
      }

      for (const [key, stroke] of view.strokes) {
        if (stroke.rejectedAt !== undefined && t - stroke.rejectedAt >= 1500) {
          view.strokes.delete(key);
          continue;
        }
        if (stroke.pts.length < 2) continue;
        const accepted = state.mapStrokes[stroke.team];
        ctx.save();
        ctx.globalAlpha = accepted && team ? 0.6 : 1;
        ctx.strokeStyle = stroke.rejectedAt !== undefined ? '#ff4040' : TEAM_COLOR[stroke.team];
        ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = accepted ? 6 : 14;
        ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(stroke.pts[0].x, stroke.pts[0].y);
        for (const p of stroke.pts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke(); ctx.restore();
      }

      if (team) {
        const activeStroke = [...view.strokes.values()].find(s => s.team === team && !s.done);
        const [from, to] = mapStrokeEndpoints(activeStroke?.pts[0], ...state.mapTargets[team]);
        const nearTarget = activeStroke && inMapAnchor(activeStroke.pts[activeStroke.pts.length - 1], to);
        const label = (p: Vec2) => inMapAnchor(p, state.mapDivider![0]) ? 'P1' : 'P2';
        this.drawMapAnchor(ctx, from, label(from), 'DÉPART', TEAM_COLOR[team], team, !activeStroke, t);
        this.drawMapAnchor(ctx, to, label(to), activeStroke ? nearTarget ? 'RELÂCHEZ ICI' : 'ARRIVÉE' : 'DÉPART', TEAM_COLOR[team], team, true, t);
      } else {
        this.drawMapAnchor(ctx, a, 'P1', '✓ RELIÉ', TEAM_COLOR.A, 'A', false, t);
        this.drawMapAnchor(ctx, b, 'P2', '✓ RELIÉ', TEAM_COLOR.B, 'B', false, t);
        this.drawAction(ctx, MAP_GENERATE_BUTTON, 'track');
      }
    }

    // Stable instruction bands outside the drawing area, facing both long edges.
    this.drawMapInstructions(ctx, state, view, t);
    ctx.restore();
  }

  private drawMapInstructions(ctx: Ctx, state: GameState, view: View, t: number): void {
    const placed = !!state.mapTargets;
    const team = placed ? activeMapTeam(state) : view.pendingDivider.length ? 'B' : 'A';
    const step = placed ? team === 'A' ? 2 : team === 'B' ? 3 : 4 : view.pendingDivider.length ? 1 : 0;
    const color = team ? TEAM_COLOR[team] : '#3ddc84';
    const waiting = view.dividerSubmitting || [...view.strokes.values()].some(s => s.submitting);
    const action = waiting ? 'Validation…' : !placed ? `Placez P${step + 1}` : team ? 'Reliez les deux points' : 'Créer le circuit';
    const notice = view.mapNotice && view.mapNotice.until > t ? view.mapNotice : null;
    for (const [y, rotation] of [[120, Math.PI], [960, 0]]) {
      ctx.save(); ctx.translate(LOGICAL_W / 2, y); ctx.rotate(rotation);
      ctx.fillStyle = '#080f26dd'; ctx.beginPath(); ctx.roundRect(-290, -58, 580, 116, 24); ctx.fill();
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 82;
        const c = i < step ? '#3ddc84' : i === step ? color : '#56627b';
        if (i < 4) { ctx.strokeStyle = '#ffffff18'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 24, -18); ctx.lineTo(x + 58, -18); ctx.stroke(); }
        ctx.strokeStyle = c; ctx.lineWidth = i === step ? 3 : 1;
        ctx.beginPath(); ctx.arc(x, -18, 23, 0, Math.PI * 2); ctx.stroke();
        if (i < step) icon(ctx, 'check', x, -18, 20, c);
        else if (i < 2) {
          ctx.fillStyle = TEAM_COLOR[i === 0 ? 'A' : 'B']; ctx.beginPath(); ctx.arc(x, -18, 7, 0, Math.PI * 2); ctx.fill();
        } else icon(ctx, i === 4 ? 'track' : 'draw', x, -18, 23, i === 2 ? TEAM_COLOR.A : i === 3 ? TEAM_COLOR.B : c);
      }
      ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.font = 'bold 23px sans-serif';
      ctx.fillText(action, 0, 36);
      if (notice) {
        ctx.fillStyle = '#080f26f5'; ctx.beginPath(); ctx.roundRect(-340, -126, 680, 47, 15); ctx.fill();
        ctx.fillStyle = notice.color ?? '#ff7070'; ctx.font = 'bold 22px sans-serif'; ctx.fillText(notice.text, 0, -95);
      }
      ctx.restore();
    }
  }

  private drawMapAnchor(ctx: Ctx, point: Vec2, label: string, role: string, color: string, team: Team, pulse: boolean, t: number): void {
    const done = role.startsWith('✓');
    const arriving = role === 'ARRIVÉE' || role === 'RELÂCHEZ ICI';
    const ready = role === 'RELÂCHEZ ICI';
    const c = ready || done ? '#3ddc84' : color;
    ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(team === 'B' ? Math.PI : 0);
    // The visual boundary is exactly the input radius; animation stays outside it.
    ctx.fillStyle = '#080f26ee'; ctx.strokeStyle = c; ctx.lineWidth = ready ? 7 : 3;
    ctx.setLineDash(arriving && !ready ? [10, 8] : []);
    ctx.beginPath(); ctx.arc(0, 0, MAP_ANCHOR_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    if (pulse && !this.reducedMotion) {
      ctx.globalAlpha = .25 + .12 * Math.sin(this.time / 400); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, MAP_ANCHOR_RADIUS + 9, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    icon(ctx, done || ready ? 'check' : arriving ? 'flag' : 'touch', 0, -12, 47, c);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 22px monospace'; ctx.fillText(label, 0, 48);
    ctx.restore();
  }

  private drawMapArrow(ctx: Ctx, from: Vec2, to: Vec2, color: string, t: number): void {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    // Reversing from/to for rose naturally bends towards the opposite half.
    const normal = { x: -dy / len, y: dx / len };
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    let bow = Math.min(240, len * 0.35);
    // Keep the guide visible even with steeply rotated or edge-adjacent anchors.
    if (normal.x > 0) bow = Math.min(bow, (LOGICAL_W - 70 - mid.x) / normal.x);
    if (normal.x < 0) bow = Math.min(bow, (70 - mid.x) / normal.x);
    if (normal.y > 0) bow = Math.min(bow, (820 - mid.y) / normal.y);
    if (normal.y < 0) bow = Math.min(bow, (260 - mid.y) / normal.y);
    const control = { x: mid.x + normal.x * bow, y: mid.y + normal.y * bow };
    const at = (u: number): Vec2 => ({
      x: (1-u)*(1-u)*from.x + 2*(1-u)*u*control.x + u*u*to.x,
      y: (1-u)*(1-u)*from.y + 2*(1-u)*u*control.y + u*u*to.y,
    });
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const u = 0.22 + ((i / 3 + t / 4000) % 1) * 0.56;
      const p = at(u);
      if (inMapAnchor(p, from) || inMapAnchor(p, to)) continue;
      const ahead = at(u + 0.01);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(ahead.y - p.y, ahead.x - p.x));
      ctx.globalAlpha = 0.85; ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(0, 0); ctx.lineTo(-12, 10); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

export { drawItemIcon };
