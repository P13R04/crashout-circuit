/**
 * Renderer — Canvas 2D neon rendering of the table (REQ-6.1, §11 of the brief).
 * The caller scales the context to the 1920×1080 logical space.
 *
 * Performance: the static track layer (fill, walls, dashed centerline, start line)
 * is rendered once per track version into an offscreen canvas; neon shadowBlur is
 * applied per colour group (one path, one blur) instead of per segment.
 */
import type { GameState, Car, Team, Vec2, TrackGeometry } from '../server/types.js';
import { LOGICAL_W, LOGICAL_H, rotationTowardsTeam, PANELS, PLAY_AREA } from '../server/layout.js';
import { HUD, drawItemIcon } from './HUD.js';
import { TEAM_COLOR, TEAM_NAME, type View, type SlingPreview } from './view.js';
import { activeMapTeam, inMapAnchor, MAP_ANCHOR_RADIUS } from '../server/mapCreation.js';

type Ctx = CanvasRenderingContext2D;

const WALL_RED = '#ff3b3b';
const ARC_YELLOW = '#ffe14a';
const OUTER_COLOR = '#ff2bd6'; // magenta outer wall
const INNER_COLOR = '#00e5ff'; // cyan inner wall

export const START_TABLE_BUTTON = { x: LOGICAL_W / 2 - 260, y: LOGICAL_H / 2 - 82, w: 520, h: 72 };
export const START_PC_BUTTON = { x: LOGICAL_W / 2 - 260, y: LOGICAL_H / 2 + 20, w: 520, h: 72 };
export const RESULT_BUTTON = { x: LOGICAL_W / 2 - 200, y: LOGICAL_H / 2 - 45, w: 400, h: 90 };
export const PAUSE_BUTTON = { x: LOGICAL_W / 2 - 58, y: 14, w: 116, h: 38 };
export const DRIVE_MODE_BUTTON = { x: LOGICAL_W / 2 - 120, y: 58, w: 240, h: 38 };
export const MAP_GENERATE_BUTTON = { x: LOGICAL_W / 2 - 180, y: LOGICAL_H / 2 - 44, w: 360, h: 88 };
export const RACE_START_BUTTON = { x: LOGICAL_W / 2 - 180, y: LOGICAL_H / 2 - 44, w: 360, h: 88 };
/** Reset button located in the vertical middle on the far right edge of the screen. */
export const RESET_BUTTON = { x: LOGICAL_W - 134, y: LOGICAL_H / 2 - 32, w: 118, h: 64 };

function wallEnds(pos: Vec2, angleDeg: number, len: number): [Vec2, Vec2] {
  const a = (angleDeg * Math.PI) / 180;
  const hx = (Math.cos(a) * len) / 2, hy = (Math.sin(a) * len) / 2;
  return [{ x: pos.x - hx, y: pos.y - hy }, { x: pos.x + hx, y: pos.y + hy }];
}

export class Renderer {
  private hud = new HUD();
  private trackLayer: HTMLCanvasElement | null = null;
  private trackLayerKey = '';

  constructor(private ctx: Ctx) {}

  /** Frame for every phase except LOBBY (drawn by main.ts). */
  render(view: View): void {
    const state = view.state;
    if (!state) return;
    const ctx = this.ctx;

    if (state.phase === 'LOBBY') { this.drawLobby(ctx); this.drawResetButton(ctx); return; }
    if (state.phase === 'MAP') { this.drawMap(ctx, state, view); this.drawResetButton(ctx); return; }
    if (state.phase !== 'READY' && state.phase !== 'RACE' && state.phase !== 'PAUSED' && state.phase !== 'RESULT') return;
    const now = state.phase === 'PAUSED' ? state.pausedAt : view.now();

    if (state.track) this.drawTrack(ctx, state.track, state.trackVersion, state.deformations.length > 0);
    this.drawPickups(ctx, state, now);
    this.drawGates(ctx, state, now);
    this.drawWalls(ctx, state, now);
    this.drawArcs(ctx, state, now);
    this.drawPylons(ctx, state);
    this.drawStones(ctx, state, now);
    for (const t of ['A', 'B'] as Team[]) this.drawCar(ctx, state.cars[t], now);
    this.drawEffects(ctx, view);
    this.drawSling(ctx, state, view.sling);
    this.hud.draw(ctx, state, view);
    this.drawDisabledAlerts(ctx, state);
    if (state.phase === 'READY') this.drawRaceReady(ctx, state);
    if (state.phase === 'RACE') { this.drawCountdown(ctx, state, now); this.drawPauseButton(ctx, 'PAUSE'); this.drawDriveModeButton(ctx, state); }
    if (state.phase === 'PAUSED') { this.drawPauseButton(ctx, 'REPRENDRE'); this.drawPaused(ctx); }
    if (state.phase === 'RESULT') this.drawResult(ctx, state);
    this.drawResetButton(ctx);
  }

  private drawResetButton(ctx: Ctx): void {
    const b = RESET_BUTTON;
    ctx.save();
    // Glowing neon red/coral badge on the right edge
    ctx.fillStyle = 'rgba(255, 36, 72, 0.18)';
    ctx.strokeStyle = '#ff3366';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#ff3366';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RESET', b.x + b.w / 2, b.y + b.h / 2 - 9);

    ctx.fillStyle = 'rgba(255, 205, 220, 0.78)';
    ctx.font = '11px monospace';
    ctx.fillText('\u21ba ACCUEIL', b.x + b.w / 2, b.y + b.h / 2 + 13);
    ctx.restore();
  }

  // ─── Lobby ────────────────────────────────────────────────────────────────

  private drawLobby(ctx: Ctx): void {
    ctx.save();
    ctx.textAlign = 'center';
    for (const rot of [0, Math.PI]) { // readable from both long edges
      ctx.save();
      ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2);
      ctx.rotate(rot);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 24;
      ctx.font = 'bold 84px monospace';
      ctx.fillText('CRASHOUT CIRCUIT', 0, -250);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '28px monospace';
      ctx.fillText('Pilotes : direction continue · Copilotes : tracez, piégez, réparez', 0, -190);
      ctx.restore();
    }
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
    for (const [button, label, detail, color] of [
      [START_TABLE_BUTTON, 'JOUER SUR TABLE', 'Points et tracés : cyan d’abord, puis rose', '#00e5ff'],
      [START_PC_BUTTON, 'MODE PC · SÉQUENTIEL', 'clics et demi-tracés l’un après l’autre', '#ff4081'],
    ] as const) {
      ctx.fillStyle = `${color}22`; ctx.strokeStyle = color === '#00e5ff' ? `rgba(0,229,255,${0.6 + 0.4 * pulse})` : color;
      ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(button.x, button.y, button.w, button.h, 16); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 26px monospace';
      ctx.fillText(label, button.x + button.w / 2, button.y + 33);
      ctx.fillStyle = 'rgba(255,255,255,0.58)'; ctx.font = '14px monospace';
      ctx.fillText(detail, button.x + button.w / 2, button.y + 57);
    }
    ctx.restore();
  }

  // ─── Track ────────────────────────────────────────────────────────────────

  private drawTrack(ctx: Ctx, track: TrackGeometry, version: number, dynamic = false): void {
    // During a pull the geometry changes every frame. Painting directly avoids
    // allocating a full-screen cached canvas at the simulation rate.
    if (dynamic) { this.paintTrack(ctx, track); return; }
    const canvas = ctx.canvas;
    const key = `${version}:${canvas.width}x${canvas.height}`;
    if (!this.trackLayer || this.trackLayerKey !== key) {
      const layer = document.createElement('canvas');
      layer.width = canvas.width;
      layer.height = canvas.height;
      const lctx = layer.getContext('2d')!;
      lctx.scale(canvas.width / LOGICAL_W, canvas.height / LOGICAL_H);
      this.paintTrack(lctx, track);
      this.trackLayer = layer;
      this.trackLayerKey = key;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.trackLayer, 0, 0);
    ctx.restore();
  }

  private paintTrack(ctx: Ctx, track: TrackGeometry): void {
    const path = (pts: Vec2[], reverse = false): void => {
      const list = reverse ? [...pts].reverse() : pts;
      ctx.moveTo(list[0].x, list[0].y);
      for (let i = 1; i < list.length; i++) ctx.lineTo(list[i].x, list[i].y);
      ctx.closePath();
    };
    const c = track.centerline;
    const n = c.length;

    // Dark surface: the band of local half-width around the centerline (exactly what the
    // physics counts as "on the track"), so that a track crossing itself is one surface
    ctx.strokeStyle = '#0c1233';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      ctx.lineWidth = (track.widths[i] + track.widths[j]) / 2;
      ctx.beginPath();
      ctx.moveTo(c[i].x, c[i].y);
      ctx.lineTo(c[j].x, c[j].y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // Neon walls: one blurred path per colour. Where another part of the track runs
    // over a wall (a crossing), the wall is left out so the junction stays open.
    const cum: number[] = [0];
    for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(c[i % n].x - c[i - 1].x, c[i % n].y - c[i - 1].y));
    const covered = (pt: Vec2, k: number): boolean => {
      for (let m = 0; m < n; m++) {
        const g = Math.abs(cum[m] - cum[k]);
        if (Math.min(g, cum[n] - g) < 200) continue;
        if (Math.hypot(pt.x - c[m].x, pt.y - c[m].y) < track.widths[m] / 2 - 1) return true;
      }
      return false;
    };
    ctx.lineWidth = 5;
    for (const [pts, color] of [[track.outerEdge, OUTER_COLOR], [track.innerEdge, INNER_COLOR]] as const) {
      const hidden = pts.map((pt, k) => covered(pt, k));
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      ctx.strokeStyle = color;
      ctx.beginPath();
      if (!hidden.some(Boolean)) path(pts);
      else {
        for (let k = 0; k < n; k++) {
          const k2 = (k + 1) % n;
          if (hidden[k] || hidden[k2]) continue;
          ctx.moveTo(pts[k].x, pts[k].y);
          ctx.lineTo(pts[k2].x, pts[k2].y);
        }
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Dashed grey centerline
    ctx.strokeStyle = 'rgba(180,190,210,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 16]);
    ctx.beginPath();
    path(track.centerline);
    ctx.stroke();
    ctx.setLineDash([]);

    // Checkpoints: faint ticks; the start line: white bar across the track
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    for (let i = 1; i < track.checkpoints.length; i++) {
      const cp = track.checkpoints[i];
      const idx = this.closestIndex(track, cp.pos);
      const half = track.widths[idx] / 2;
      ctx.beginPath();
      ctx.moveTo(cp.pos.x + cp.normal.x * half, cp.pos.y + cp.normal.y * half);
      ctx.lineTo(cp.pos.x - cp.normal.x * half, cp.pos.y - cp.normal.y * half);
      ctx.stroke();
    }
    const sl = track.startLine;
    const sIdx = this.closestIndex(track, sl.pos);
    const sHalf = track.widths[sIdx] / 2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(sl.pos.x + sl.normal.x * sHalf, sl.pos.y + sl.normal.y * sHalf);
    ctx.lineTo(sl.pos.x - sl.normal.x * sHalf, sl.pos.y - sl.normal.y * sHalf);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  private closestIndex(track: TrackGeometry, p: Vec2): number {
    let best = 0, bd = Infinity;
    track.centerline.forEach((c, i) => {
      const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  // ─── Game objects ─────────────────────────────────────────────────────────

  private drawPickups(ctx: Ctx, state: GameState, now: number): void {
    for (const p of state.pickups) {
      const available = p.respawnAt === 0;
      ctx.save();
      ctx.globalAlpha = available ? 1 : 0.18;
      ctx.shadowColor = available ? '#ffffff' : 'transparent';
      ctx.shadowBlur = available ? 12 : 0;
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(available ? now / 1500 : 0);
      drawItemIcon(ctx, p.kind, 0, 0, 18, p.kind === 'slingshot' ? '#ff7a59' : '#ffd400');
      ctx.restore();
    }
  }

  private drawGates(ctx: Ctx, state: GameState, now: number): void {
    for (const g of state.boostGates) {
      const left = g.expiresAt - now;
      if (left < 1500 && Math.floor(now / 150) % 2 === 0) continue; // blink before expiry
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = '#ffd400';
      ctx.shadowColor = '#ffd400';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y); ctx.lineTo(g.b.x, g.b.y); ctx.stroke();
      ctx.lineWidth = 4;
      for (const e of [g.a, g.b]) { ctx.beginPath(); ctx.arc(e.x, e.y, 12, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
  }

  /** Elements are semi-transparent next to the car of the team that owns them (R-09). */
  private ownerAlpha(state: GameState, team: Team, p: Vec2): number {
    const own = state.cars[team].pos;
    return Math.hypot(own.x - p.x, own.y - p.y) < 90 ? 0.35 : 1;
  }

  private drawWalls(ctx: Ctx, state: GameState, now: number): void {
    for (const w of state.walls) {
      const [a, b] = wallEnds(w.pos, w.angle, w.lengthPx);
      const disabled = w.disabledUntil > now;
      ctx.save();
      ctx.globalAlpha = this.ownerAlpha(state, w.team, w.pos);
      if (disabled) {
        ctx.strokeStyle = 'rgba(160,160,170,0.7)';
        ctx.setLineDash([8, 8]);
        ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = WALL_RED;
        ctx.shadowColor = WALL_RED;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 8;
      }
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      ctx.fillStyle = TEAM_COLOR[w.team];
      for (const e of [a, b]) { ctx.beginPath(); ctx.arc(e.x, e.y, 7, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }

  private drawArcs(ctx: Ctx, state: GameState, now: number): void {
    for (const arc of state.arcs) {
      const disabled = arc.disabledUntil > now;
      ctx.save();
      const mid = { x: (arc.pylon1.x + arc.pylon2.x) / 2, y: (arc.pylon1.y + arc.pylon2.y) / 2 };
      ctx.globalAlpha = this.ownerAlpha(state, arc.team, mid);
      const dx = arc.pylon2.x - arc.pylon1.x, dy = arc.pylon2.y - arc.pylon1.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      if (disabled) {
        ctx.strokeStyle = 'rgba(160,160,170,0.7)';
        ctx.setLineDash([8, 8]);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(arc.pylon1.x, arc.pylon1.y); ctx.lineTo(arc.pylon2.x, arc.pylon2.y); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // animated lightning: jagged polyline re-rolled ~20 times a second
        const seed = Math.floor(now / 50);
        ctx.strokeStyle = ARC_YELLOW;
        ctx.shadowColor = ARC_YELLOW;
        ctx.shadowBlur = 16;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(arc.pylon1.x, arc.pylon1.y);
        const segs = Math.max(6, Math.round(len / 18));
        for (let i = 1; i < segs; i++) {
          const t = i / segs;
          const jitter = (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453 % 1) * 22 - 11;
          ctx.lineTo(arc.pylon1.x + dx * t + nx * jitter, arc.pylon1.y + dy * t + ny * jitter);
        }
        ctx.lineTo(arc.pylon2.x, arc.pylon2.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = TEAM_COLOR[arc.team];
      for (const e of [arc.pylon1, arc.pylon2]) { ctx.beginPath(); ctx.arc(e.x, e.y, 9, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }

  private drawPylons(ctx: Ctx, state: GameState): void {
    for (const [id, t] of Object.entries(state.tangibles)) {
      if (t.status !== 'placed' || !t.active || t.kind !== 'pylon') continue;
      const x = t.x * state.params.logicalWidth, y = t.y * state.params.logicalHeight;
      ctx.save(); ctx.strokeStyle = TEAM_COLOR[t.team]; ctx.fillStyle = '#101a30'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
      ctx.fillText(id, x, y + 4); ctx.restore();
    }
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
      ctx.fillText('⚠ PIERRE', 0, -R - 14);
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
      ctx.fillStyle = teamColor;
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
    const label = idle ? 'tirez en arrière' : ready ? `${Math.round(power * 100)} %` : 'tirez plus';
    ctx.fillText(label, 0, 36);
    ctx.restore();
    ctx.restore();
  }

  private drawCar(ctx: Ctx, car: Car, now: number): void {
    const color = TEAM_COLOR[car.team];
    const ghost = car.ghostUntil > now;
    const invuln = car.invulnUntil > now;
    const stunned = car.stunUntil > now;
    ctx.save();
    ctx.translate(car.pos.x, car.pos.y);

    // HP bar under the car (always upright)
    const hpFrac = Math.max(0, car.hp / 100);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-18, 18, 36, 5);
    ctx.fillStyle = hpFrac > 0.5 ? '#3ddc84' : hpFrac > 0.25 ? '#ffb020' : '#ff4040';
    ctx.fillRect(-18, 18, 36 * hpFrac, 5);

    ctx.rotate(car.angle);
    if (now < car.boostUntil) { // speed streak
      ctx.strokeStyle = 'rgba(255,212,0,0.7)';
      ctx.lineWidth = 3;
      for (const o of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(-14, o); ctx.lineTo(-34 - Math.random() * 10, o); ctx.stroke(); }
    }
    ctx.globalAlpha = car.disabled ? 0.45 : ghost ? 0.4 : invuln && Math.floor(now / 90) % 2 === 0 ? 0.35 : 1;
    ctx.shadowColor = ghost ? '#b06cff' : stunned ? '#ffe14a' : color;
    ctx.shadowBlur = ghost ? 22 : 14;
    ctx.fillStyle = car.disabled ? '#666' : color;
    // 24×14 arrow
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, -9);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 9);
    ctx.closePath();
    ctx.fill();
    if (ghost) { ctx.strokeStyle = '#b06cff'; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.restore();
  }

  /** "Vehicle out of order" text next to the car, oriented to its team's nearest player. */
  private drawDisabledAlerts(ctx: Ctx, state: GameState): void {
    if (Math.floor(performance.now() / 400) % 2 !== 0) return;
    for (const t of ['A', 'B'] as Team[]) {
      const car = state.cars[t];
      if (!car.disabled) continue;
      ctx.save();
      ctx.translate(car.pos.x, car.pos.y);
      ctx.rotate(rotationTowardsTeam(t, car.pos));
      ctx.fillStyle = '#ff4040';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EN PANNE', 0, -26);
      ctx.restore();
    }
  }

  // ─── Effects ──────────────────────────────────────────────────────────────

  private drawEffects(ctx: Ctx, view: View): void {
    const t = performance.now();
    view.effects = view.effects.filter(e => t - e.start < e.dur);
    for (const e of view.effects) {
      const k = (t - e.start) / e.dur; // 0 → 1
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1 - k;
      switch (e.kind) {
        case 'stoneImpact': {
          ctx.strokeStyle = '#ff6a3a'; ctx.fillStyle = '#ffb36a';
          ctx.shadowColor = '#ff6a3a'; ctx.shadowBlur = 20;
          ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(0, 0, 20 + 90 * k, 0, Math.PI * 2); ctx.stroke();
          for (let i = 0; i < 14; i++) { // debris particles
            const a = (i / 14) * Math.PI * 2 + i, d = 20 + 110 * k * (0.5 + (i % 3) / 3);
            ctx.fillRect(Math.cos(a) * d - 2, Math.sin(a) * d - 2, 5, 5);
          }
          break;
        }
        case 'wallDestroyed': {
          ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(0, 0, 30 + 60 * k, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'repairDone': {
          ctx.strokeStyle = '#3ddc84'; ctx.lineWidth = 6; ctx.shadowColor = '#3ddc84'; ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.arc(0, 0, 20 + 70 * k, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'boostHit': case 'boostGate': {
          ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(0, 0, 15 + 50 * k, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'pickup': {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, 10 + 40 * k, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'ghost': {
          ctx.strokeStyle = '#b06cff'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(0, 0, 14 + 60 * k, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'stoneHit': {
          // Comic burst above the car: pops with an overshoot, shakes, then fades
          const pop = k < 0.12 ? (k / 0.12) * 1.3 : k < 0.25 ? 1.3 - ((k - 0.12) / 0.13) * 0.3 : 1;
          ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
          ctx.translate(Math.sin(t / 35) * (k < 0.4 ? 3 : 0), -52);
          ctx.rotate(rotationTowardsTeam(e.team, { x: e.x, y: e.y }) + (e.tilt ?? 0));
          ctx.scale(pop, pop);
          const text = e.text ?? 'POW !';
          ctx.font = 'bold 34px Impact, monospace';
          const R = Math.max(62, ctx.measureText(text).width * 0.62);
          ctx.beginPath();
          for (let i = 0; i < 20; i++) {
            const a = (i / 20) * Math.PI * 2;
            const r = i % 2 === 0 ? R : R * 0.68;
            const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.72;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = '#ffd400';
          ctx.strokeStyle = '#ff2a2a';
          ctx.lineWidth = 6;
          ctx.shadowColor = '#ff8a00';
          ctx.shadowBlur = 20;
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 5;
          ctx.strokeStyle = '#ffffff';
          ctx.strokeText(text, 0, 2);
          ctx.fillStyle = '#d4001a';
          ctx.fillText(text, 0, 2);
          break;
        }
        case 'hit': {
          ctx.fillStyle = '#ff4040';
          ctx.beginPath(); ctx.arc(0, 0, 10 + 24 * k, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'itemLost': {
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
          ctx.fillText('objet perdu', 0, -20 - 30 * k);
          break;
        }
      }
      ctx.restore();
    }
  }

  // ─── Overlays ─────────────────────────────────────────────────────────────

  private drawCountdown(ctx: Ctx, state: GameState, now: number): void {
    const left = state.sessionStartAt - now;
    if (left > -600) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 30;
      ctx.font = 'bold 200px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = left > 0 ? 1 : Math.max(0, 1 + left / 600);
      ctx.fillText(left > 0 ? String(Math.ceil(left / 1000)) : 'GO!', LOGICAL_W / 2, LOGICAL_H / 2);
      ctx.restore();
      return;
    }
    // Lap counters in the centre top/bottom, readable from both sides
    const total = state.params.lapsToWin;
    const remaining = Math.max(0, state.params.sessionMaxSeconds - (now - state.sessionStartAt) / 1000);
    ctx.save();
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    const mm = Math.floor(remaining / 60), ss = String(Math.floor(remaining % 60)).padStart(2, '0');
    for (const rot of [0, Math.PI]) {
      ctx.save();
      ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2);
      ctx.rotate(rot);
      ctx.translate(0, 340);
      ctx.fillStyle = TEAM_COLOR.A;
      ctx.fillText(`A  tour ${Math.min(total, state.cars.A.lap + 1)}/${total}`, -170, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(`${mm}:${ss}`, 0, 0);
      ctx.fillStyle = TEAM_COLOR.B;
      ctx.fillText(`B  tour ${Math.min(total, state.cars.B.lap + 1)}/${total}`, 170, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawPauseButton(ctx: Ctx, label: string): void {
    const b = PAUSE_BUTTON;
    ctx.save(); ctx.fillStyle = 'rgba(4,8,31,0.82)'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText(label, b.x + b.w / 2, b.y + 24); ctx.restore();
  }

  private drawDriveModeButton(ctx: Ctx, state: GameState): void {
    const b = DRIVE_MODE_BUTTON;
    const pedal = state.driveMode === 'pedal';
    ctx.save(); ctx.fillStyle = pedal ? 'rgba(255,190,55,0.35)' : 'rgba(4,8,31,0.82)';
    ctx.strokeStyle = pedal ? '#ffbe37' : '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`PILOTAGE · ${pedal ? 'PÉDALE' : 'AUTO'}`, b.x + b.w / 2, b.y + 24); ctx.restore();
  }

  private drawRaceReady(ctx: Ctx, state: GameState): void {
    const b = RACE_START_BUTTON;
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,31,0.56)'; ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.fillStyle = 'rgba(255,64,129,0.18)'; ctx.strokeStyle = '#ff4081'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 31px monospace'; ctx.textAlign = 'center';
    ctx.fillText('LANCER LA COURSE', b.x + b.w / 2, b.y + 55);
    // The drawing could not be used: say so before the race, once for each side of the table
    if (state.track?.preset) {
      for (const rot of [0, Math.PI]) {
        ctx.save();
        ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2);
        ctx.rotate(rot);
        ctx.fillStyle = '#ffb300'; ctx.shadowColor = '#ffb300'; ctx.shadowBlur = 12;
        ctx.font = 'bold 26px monospace';
        ctx.fillText('CIRCUIT PRÉDÉFINI UTILISÉ', 0, -b.h / 2 - 62);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '19px monospace';
        ctx.fillText('Vos deux tracés n’ont pas pu former un circuit valide.', 0, -b.h / 2 - 32);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  private drawPaused(ctx: Ctx): void {
    ctx.save(); ctx.fillStyle = 'rgba(4,8,31,0.68)'; ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 64px monospace'; ctx.textAlign = 'center';
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 22; ctx.fillText('PAUSE', LOGICAL_W / 2, LOGICAL_H / 2); ctx.restore();
  }

  private drawResult(ctx: Ctx, state: GameState): void {
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,31,0.82)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.textAlign = 'center';
    const w = state.winner;
    const color = w === 'A' || w === 'B' ? TEAM_COLOR[w] : '#ffffff';
    for (const rot of [0, Math.PI]) { // readable from both long edges
      ctx.save();
      ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2);
      ctx.rotate(rot);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 24;
      ctx.font = 'bold 84px monospace';
      ctx.fillText(w === 'draw' ? 'ÉGALITÉ' : `ÉQUIPE ${TEAM_NAME[w as Team]} GAGNE`, 0, -230);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '30px monospace';
      const ranking = (['A', 'B'] as Team[])
        .map(t => ({ t, p: state.cars[t].lap * 8 + state.cars[t].checkpointIndex, c: state.cars[t] }))
        .sort((a, b) => b.p - a.p);
      ranking.forEach((r, i) => {
        ctx.fillStyle = TEAM_COLOR[r.t];
        ctx.fillText(`${i + 1}. ${TEAM_NAME[r.t]} — ${r.c.lap} tour(s) · ${Math.round(r.c.hp)} HP`, 0, -140 + i * 44);
      });
      ctx.restore();
    }
    const b = RESULT_BUTTON;
    ctx.fillStyle = 'rgba(0,229,255,0.15)';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px monospace';
    ctx.fillText('NOUVELLE PARTIE', b.x + b.w / 2, b.y + 56);
    ctx.restore();
  }

  // ─── MAP phase (task 2: collaborative drawing) ────────────────────────────

  private drawMap(ctx: Ctx, state: GameState, view: View): void {
    const t = performance.now();
    const team = activeMapTeam(state);
    ctx.save();

    if (!state.mapTargets || !state.mapDivider) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2; ctx.setLineDash([12, 10]);
      ctx.strokeRect(PLAY_AREA.x0, PLAY_AREA.y0, PLAY_AREA.x1 - PLAY_AREA.x0, PLAY_AREA.y1 - PLAY_AREA.y0);
      ctx.setLineDash([]);
      const first = view.pendingDivider[0];
      if (first) this.drawMapAnchor(ctx, first, 'P1', 'POINT CYAN', TEAM_COLOR.A, 'A', false, t);
      // This instruction belongs inside the placement area, away from the saved point.
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '20px sans-serif';
      ctx.fillText('Placez les points dans ce cadre', LOGICAL_W / 2, PLAY_AREA.y0 + 28);
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
      if (team) {
        const [from, to] = state.mapTargets[team];
        this.drawMapArrow(ctx, from, to, TEAM_COLOR[team], t);
      }

      for (const [sideTeam, side] of [['A', 1], ['B', -1]] as const) {
        const x = Math.max(270, Math.min(1650, (a.x + b.x) / 2 + nx * side * 235));
        const y = Math.max(300, Math.min(780, (a.y + b.y) / 2 + ny * side * 235));
        ctx.save(); ctx.translate(x, y); ctx.rotate(sideTeam === 'B' ? Math.PI : 0);
        ctx.textAlign = 'center'; ctx.font = 'bold 23px sans-serif';
        ctx.fillStyle = state.mapStrokes[sideTeam] ? '#3ddc84'
          : sideTeam === team ? TEAM_COLOR[sideTeam] : 'rgba(255,255,255,0.35)';
        ctx.fillText(state.mapStrokes[sideTeam] ? '✓ ' + TEAM_NAME[sideTeam] + ' VALIDÉ'
          : sideTeam === team ? 'VOTRE ZONE · ' + TEAM_NAME[sideTeam] : 'ROSE · PATIENTEZ', 0, 0);
        ctx.restore();
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
        const [from, to] = state.mapTargets[team];
        const activeStroke = [...view.strokes.values()].find(s => s.team === team && !s.done);
        const nearTarget = activeStroke && inMapAnchor(activeStroke.pts[activeStroke.pts.length - 1], to);
        this.drawMapAnchor(ctx, from, team === 'A' ? 'P1' : 'P2', 'DÉPART', TEAM_COLOR[team], team, !activeStroke, t);
        this.drawMapAnchor(ctx, to, team === 'A' ? 'P2' : 'P1', nearTarget ? 'RELÂCHEZ ICI' : 'ARRIVÉE', TEAM_COLOR[team], team, true, t);
      } else {
        this.drawMapAnchor(ctx, a, 'P1', '✓ RELIÉ', TEAM_COLOR.A, 'A', false, t);
        this.drawMapAnchor(ctx, b, 'P2', '✓ RELIÉ', TEAM_COLOR.B, 'B', false, t);
        const button = MAP_GENERATE_BUTTON;
        // Same hit area from both sides; two labels face the two teams.
        ctx.fillStyle = '#073544'; ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(button.x, button.y, button.w, button.h, 18); ctx.fill(); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif';
        ctx.fillText('GÉNÉRER LE CIRCUIT ▶', LOGICAL_W / 2, LOGICAL_H / 2 + 28);
        ctx.save(); ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2 - 28); ctx.rotate(Math.PI);
        ctx.fillText('GÉNÉRER LE CIRCUIT ▶', 0, 0); ctx.restore();
      }
    }

    // Stable instruction bands outside the drawing area, facing both long edges.
    this.drawMapInstructions(ctx, state, view, t);
    ctx.restore();
  }

  private drawMapInstructions(ctx: Ctx, state: GameState, view: View, t: number): void {
    const placed = !!state.mapTargets;
    const team = placed ? activeMapTeam(state) : view.pendingDivider.length ? 'B' : 'A';
    const color = team ? TEAM_COLOR[team] : '#3ddc84';
    const step = placed ? team === 'A' ? 2 : team === 'B' ? 3 : 4 : view.pendingDivider.length ? 1 : 0;
    const labels = ['P1 CYAN', 'P2 ROSE', 'TRACÉ CYAN', 'TRACÉ ROSE', 'CIRCUIT'];
    const title = !placed ? 'PLACEMENT DES POINTS' : team ? 'TRACÉ ' + (team === 'A' ? '1' : '2') + '/2' : 'CIRCUIT PRÊT À GÉNÉRER';
    const action = !placed
      ? team === 'A' ? 'ÉQUIPE CYAN · Touchez pour placer P1' : 'ÉQUIPE ROSE · Touchez pour placer P2'
      : team ? 'ÉQUIPE ' + TEAM_NAME[team] + ' · Tracez de ' + (team === 'A' ? 'P1 vers P2' : 'P2 vers P1') : 'Les deux équipes ont terminé';
    const waiting = [...view.strokes.values()].some(s => s.submitting);
    const hint = view.dividerSubmitting || waiting ? 'Validation en cours…'
      : !placed ? team === 'A' ? 'Un joueur par équipe · Cyan d’abord, puis rose' : 'P1 reste en place · Écartez suffisamment les deux points'
      : team ? 'Maintenez le doigt · Dessinez dans votre zone · Relâchez dans la cible'
      : 'Touchez « Générer le circuit » pour voir votre piste';
    const notice = view.mapNotice && view.mapNotice.until > t ? view.mapNotice : null;

    for (const [y, rotation] of [[120, Math.PI], [960, 0]]) {
      ctx.save(); ctx.translate(LOGICAL_W / 2, y); ctx.rotate(rotation);
      ctx.fillStyle = 'rgba(4,8,31,0.96)'; ctx.strokeStyle = color + '77'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(-640, -92, 1280, 184, 20); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'center';
      labels.forEach((label, i) => {
        const x = (i - 2) * 226;
        ctx.fillStyle = i === step ? color : i < step ? '#88b9a2' : '#727990';
        ctx.font = (i === step ? 'bold ' : '') + '15px sans-serif';
        ctx.fillText((i < step ? '✓ ' : (i + 1) + ' · ') + label, x, -61);
        if (i === step) { ctx.fillStyle = color; ctx.fillRect(x - 80, -51, 160, 3); }
      });
      ctx.fillStyle = color; ctx.font = 'bold 18px sans-serif'; ctx.fillText(title, 0, -20);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 30px sans-serif'; ctx.fillText(action, 0, 17);
      ctx.fillStyle = '#b7c2da'; ctx.font = '19px sans-serif'; ctx.fillText(hint, 0, 47);
      if (notice) {
        ctx.fillStyle = notice.color ?? '#ff4040'; ctx.font = 'bold 19px sans-serif';
        ctx.fillText(notice.text, 0, 76);
      }
      ctx.restore();
    }
  }

  private drawMapAnchor(ctx: Ctx, point: Vec2, label: string, role: string, color: string, team: Team, pulse: boolean, t: number): void {
    ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(team === 'B' ? Math.PI : 0);
    // Keep the radius exact: the decorative pulse is an outer halo, not a changing hit area.
    ctx.fillStyle = '#080f26'; ctx.strokeStyle = color; ctx.lineWidth = 4;
    ctx.shadowColor = color; ctx.shadowBlur = pulse ? 16 + 8 * Math.sin(t / 220) : 6;
    ctx.beginPath(); ctx.arc(0, 0, MAP_ANCHOR_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    if (pulse) {
      ctx.globalAlpha = 0.3 + 0.2 * Math.sin(t / 220); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, MAP_ANCHOR_RADIUS + 8, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.font = 'bold 18px sans-serif';
    ctx.fillText(role, 0, -26);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 38px sans-serif'; ctx.fillText(label, 0, 18);
    ctx.fillStyle = '#b7c2da'; ctx.font = '15px sans-serif';
    ctx.fillText(role === 'DÉPART' ? 'PARTEZ ICI' : role === 'ARRIVÉE' ? 'REJOIGNEZ ICI' : '', 0, 48);
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
