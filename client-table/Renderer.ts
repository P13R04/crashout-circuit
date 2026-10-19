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
    const now = view.now();

    if (state.track) this.drawTrack(ctx, state.track, state.trackVersion, state.deformations.length > 0);
    this.drawPickups(ctx, state, now);
    this.drawGates(ctx, state, now);
    this.drawWalls(ctx, state, now);
    this.drawArcs(ctx, state, now);
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
      [START_TABLE_BUTTON, 'JOUER SUR TABLE', '2 contacts simultanés pour partager le circuit', '#00e5ff'],
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
    const targets = state.mapTargets;
    const now = view.now();
    const t = performance.now();
    void now;

    // ── Phase 0: no divider yet ───────────────────────────────────────────
    if (!targets) {
      ctx.save();
      ctx.textAlign = 'center';

      // Title
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 22;
      ctx.font = 'bold 36px monospace';
      ctx.fillText('CR\u00c9ATION DU CIRCUIT \u00b7 POINTS D\u2019ANCRAGE', LOGICAL_W / 2, 140);
      ctx.shadowBlur = 0;

      // Subtitle / instructions
      ctx.font = '20px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      if (view.pendingDivider.length === 0) {
        ctx.fillText('Chaque \u00e9quipe pose un doigt sur la table (ou cliquez 2 points).', LOGICAL_W / 2, 180);
        ctx.fillStyle = 'rgba(0,229,255,0.7)';
        ctx.fillText('\u25b6 Touchez pour placer le premier point (P1 \u00b7 D\u00c9PART)', LOGICAL_W / 2, LOGICAL_H / 2);
      } else {
        ctx.fillText('Premier point enregistr\u00e9 ! Placez le second point pour cr\u00e9er la ligne de s\u00e9paration.', LOGICAL_W / 2, 180);
        ctx.fillStyle = 'rgba(255,64,129,0.85)';
        ctx.fillText('\u25b6 Touchez pour placer le second point (P2)', LOGICAL_W / 2, LOGICAL_H / 2 + 100);
      }

      // Render pending point 1 if placed
      if (view.pendingDivider.length >= 1) {
        const p1 = view.pendingDivider[0];
        const pulse = 4 * Math.sin(t / 200);
        ctx.save();
        ctx.translate(p1.x, p1.y);
        ctx.strokeStyle = '#00e5ff'; ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 24;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 95, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(0, 0, 95 + pulse * 2, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#00e5ff';
        ctx.beginPath(); ctx.arc(0, 0, 12 + pulse, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px monospace';
        ctx.fillText('P1 \u00b7 D\u00c9PART', 0, -110);
        ctx.restore();
      }

      // Display transient notice banner if active
      if (view.mapNotice && view.mapNotice.until > t) {
        const n = view.mapNotice;
        ctx.fillStyle = n.color ?? '#ff4081';
        ctx.shadowColor = n.color ?? '#ff4081'; ctx.shadowBlur = 12;
        ctx.font = 'bold 22px monospace';
        ctx.fillText(n.text, LOGICAL_W / 2, LOGICAL_H - 120);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
      return;
    }

    // ── Phase 1: divider set, teams draw ────────────────────────────────
    const divider = state.mapDivider!;
    const [da, db] = divider;
    const dLen = Math.hypot(db.x - da.x, db.y - da.y) || 1;
    const dux = (db.x - da.x) / dLen, duy = (db.y - da.y) / dLen;
    // Left normal = team A side
    const nx = -duy, ny = dux;

    // Half-plane tinted fills (clearly visible team colors)
    const farEnough = Math.max(LOGICAL_W, LOGICAL_H) * 2;
    for (const [team, side] of [['A', 1], ['B', -1]] as [Team, number][]) {
      const color = TEAM_COLOR[team];
      ctx.save();
      ctx.beginPath();
      // Polygon covering the full half, constructed by offsetting both ends of
      // the divider outward and then sweeping sideways to fill the half-plane.
      const ox = nx * side * farEnough;
      const oy = ny * side * farEnough;
      const ex = dux * farEnough, ey = duy * farEnough;
      ctx.moveTo(da.x - ex, da.y - ey);
      ctx.lineTo(da.x - ex + ox, da.y - ey + oy);
      ctx.lineTo(db.x + ex + ox, db.y + ey + oy);
      ctx.lineTo(db.x + ex, db.y + ey);
      ctx.closePath();
      ctx.fillStyle = state.mapStrokes[team] ? `${color}28` : `${color}14`;
      ctx.fill();
      ctx.strokeStyle = `${color}44`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Glowing divider line (extended to canvas edges)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(da.x - dux * farEnough, da.y - duy * farEnough);
    ctx.lineTo(db.x + dux * farEnough, db.y + duy * farEnough);
    ctx.stroke();
    ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.restore();

    // Zone labels at the midpoint of each half
    const mid = { x: (da.x + db.x) / 2, y: (da.y + db.y) / 2 };
    const labelOffset = 180;
    for (const [team, side] of [['A', 1], ['B', -1]] as [Team, number][]) {
      const color = TEAM_COLOR[team];
      const lx = mid.x + nx * side * labelOffset;
      const ly = mid.y + ny * side * labelOffset;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(team === 'B' ? Math.PI : 0);
      ctx.textAlign = 'center';
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
      ctx.font = 'bold 26px monospace';
      ctx.fillText(`ZONE ${TEAM_NAME[team]}`, 0, 0);
      ctx.shadowBlur = 0;
      if (!state.mapStrokes[team]) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '17px monospace';
        ctx.fillText('tracez entre P1 et P2 dans cette zone', 0, 28);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '14px monospace';
        ctx.fillText('(dans le sens de votre choix)', 0, 48);
      } else {
        ctx.fillStyle = '#3ddc84'; ctx.font = 'bold 18px monospace';
        ctx.fillText('\u2713 trac\u00e9 accept\u00e9', 0, 28);
      }
      ctx.restore();
    }

    // ── Anchor points (shared P1 / P2) ───────────────────────────────────
    // P1 = divider[0] = departure anchor for the circuit
    // P2 = divider[1] = opposite anchor
    // Both teams may start at P1 or at P2 in either direction
    const anchors: [Vec2, string, string, string, string][] = [
      [da, 'P1', TEAM_COLOR.A, TEAM_COLOR.B, 'D\u00c9PART / ANCRE (P1)'],
      [db, 'P2', TEAM_COLOR.B, TEAM_COLOR.A, 'ANCRE (P2)'],
    ];
    for (const [anchor, label, color1, color2, tag] of anchors) {
      const pulse = 3 * Math.sin(t / 280);
      ctx.save();
      ctx.translate(anchor.x, anchor.y);
      // Outer tolerance ring (white)
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.shadowBlur = 14; ctx.shadowColor = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 95, 0, Math.PI * 2); ctx.stroke();
      // Two-color ring representing both teams
      ctx.strokeStyle = color1; ctx.shadowColor = color1; ctx.lineWidth = 4; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(0, 0, 95, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.strokeStyle = color2; ctx.shadowColor = color2;
      ctx.beginPath(); ctx.arc(0, 0, 95, Math.PI / 2, -Math.PI / 2); ctx.stroke();
      ctx.shadowBlur = 0;
      // Centre disc
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 10 + pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#04081f'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
      ctx.fillText(label, 0, 4);
      // Tag above
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 10;
      ctx.font = 'bold 15px monospace';
      ctx.fillText(tag, 0, -114);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // ── Live strokes as drawn ─────────────────────────────────────────────
    for (const s of view.strokes.values()) {
      if (s.pts.length < 2) continue;
      const rejected = s.rejectedAt !== undefined && t - s.rejectedAt < 1500;
      ctx.save();
      ctx.strokeStyle = rejected ? '#ff4040' : TEAM_COLOR[s.team];
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 14;
      ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      for (const p of s.pts) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      // Live tip glow
      if (!s.done) {
        const tip = s.pts[s.pts.length - 1];
        ctx.fillStyle = TEAM_COLOR[s.team]; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(tip.x, tip.y, 8 + 3 * Math.sin(t / 180), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // ── Centre: generate button or waiting hint ───────────────────────────
    ctx.textAlign = 'center';
    const ready = state.mapStrokes.A && state.mapStrokes.B;
    if (ready) {
      const b = MAP_GENERATE_BUTTON;
      const pulseBtn = 0.5 + 0.5 * Math.sin(t / 300);
      ctx.fillStyle = `rgba(0,229,255,${0.2 + 0.15 * pulseBtn})`;
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 4;
      ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 18); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 26px monospace';
      ctx.fillText('FERMER LE CIRCUIT \u25b6', b.x + b.w / 2, b.y + 40);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '15px monospace';
      ctx.fillText('D\u00e9part sur le point P1', b.x + b.w / 2, b.y + 68);
    } else {
      ctx.font = '22px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('CIRCUIT FERM\u00c9 \u00b7 2 DEMI-TRAC\u00c9S', LOGICAL_W / 2, LOGICAL_H / 2 - 50);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '17px monospace';
      const aDone = state.mapStrokes.A;
      const bDone = state.mapStrokes.B;
      const statusText = !aDone && !bDone
        ? 'Chaque \u00e9quipe trace sa moiti\u00e9 entre P1 et P2'
        : aDone ? 'Trac\u00e9 Cyan pr\u00eat \u2014 En attente du trac\u00e9 Rose...' : 'Trac\u00e9 Rose pr\u00eat \u2014 En attente du trac\u00e9 Cyan...';
      ctx.fillText(statusText, LOGICAL_W / 2, LOGICAL_H / 2 - 18);
    }
    ctx.restore();
  }
}

export { drawItemIcon };
