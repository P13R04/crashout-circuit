/**
 * Renderer — Canvas 2D neon rendering of the table (REQ-6.1, §11 of the brief).
 * The caller scales the context to the 1920×1080 logical space.
 *
 * Performance: the static track layer (fill, walls, dashed centerline, start line)
 * is rendered once per track version into an offscreen canvas; neon shadowBlur is
 * applied per colour group (one path, one blur) instead of per segment.
 */
import type { GameState, Car, Team, Vec2, TrackGeometry } from '../server/types.js';
import { LOGICAL_W, LOGICAL_H, rotationTowardsTeam, PANELS } from '../server/layout.js';
import { HUD, drawItemIcon } from './HUD.js';
import { TEAM_COLOR, TEAM_NAME, type View } from './view.js';

type Ctx = CanvasRenderingContext2D;

const WALL_RED = '#ff3b3b';
const ARC_YELLOW = '#ffe14a';
const OUTER_COLOR = '#ff2bd6'; // magenta outer wall
const INNER_COLOR = '#00e5ff'; // cyan inner wall

export const START_BUTTON = { x: LOGICAL_W / 2 - 260, y: LOGICAL_H / 2 - 50, w: 520, h: 100 };
export const RESULT_BUTTON = { x: LOGICAL_W / 2 - 200, y: LOGICAL_H / 2 - 45, w: 400, h: 90 };

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

    if (state.phase === 'LOBBY') { this.drawLobby(ctx); return; }
    if (state.phase === 'MAP') { this.drawMap(ctx, state, view); return; }
    if (state.phase !== 'RACE' && state.phase !== 'RESULT') return;
    const now = view.now();

    if (state.track) this.drawTrack(ctx, state.track, state.trackVersion);
    this.drawPickups(ctx, state, now);
    this.drawGates(ctx, state, now);
    this.drawWalls(ctx, state, now);
    this.drawArcs(ctx, state, now);
    this.drawStones(ctx, state, now);
    for (const t of ['A', 'B'] as Team[]) this.drawCar(ctx, state.cars[t], now);
    this.drawEffects(ctx, view);
    this.hud.draw(ctx, state, view);
    this.drawDisabledAlerts(ctx, state);
    if (state.phase === 'RACE') this.drawCountdown(ctx, state, now);
    if (state.phase === 'RESULT') this.drawResult(ctx, state);
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
      ctx.fillText('Pilotes : joystick en bas du panneau · Copilotes : tracez, piégez, réparez', 0, -190);
      ctx.restore();
    }
    const b = START_BUTTON;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
    ctx.fillStyle = 'rgba(0,229,255,0.15)';
    ctx.strokeStyle = `rgba(0,229,255,${0.6 + 0.4 * pulse})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 20); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px monospace';
    ctx.fillText('COMMENCER', b.x + b.w / 2, b.y + 65);
    ctx.restore();
  }

  // ─── Track ────────────────────────────────────────────────────────────────

  private drawTrack(ctx: Ctx, track: TrackGeometry, version: number): void {
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

    // Dark surface between the two edges
    ctx.beginPath();
    path(track.outerEdge);
    path(track.innerEdge, true);
    ctx.fillStyle = '#0c1233';
    ctx.fill('evenodd');

    // Neon walls: one blurred path per colour
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    for (const [pts, color] of [[track.outerEdge, OUTER_COLOR], [track.innerEdge, INNER_COLOR]] as const) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      ctx.strokeStyle = color;
      ctx.beginPath();
      path(pts);
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
    if (!targets) return;
    const now = view.now();
    const t = performance.now();

    // Imposed points with their 60 px tolerance
    for (const team of ['A', 'B'] as Team[]) {
      const color = TEAM_COLOR[team];
      targets[team].forEach((p, i) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.strokeStyle = color; ctx.fillStyle = color;
        ctx.shadowColor = color; ctx.shadowBlur = 18;
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(0, 0, 14 + 3 * Math.sin(t / 250), 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#04081f';
        ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), 0, 6);
        ctx.restore();
      });
    }

    // Strokes as drawn
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
      ctx.restore();
    }

    // Instructions per copilot panel + shared countdown
    ctx.save();
    for (const panel of PANELS) {
      if (panel.role !== 'copilot') continue;
      ctx.save();
      ctx.translate(panel.cx, panel.cy);
      ctx.rotate(panel.rot);
      const team = panel.team;
      ctx.textAlign = 'center';
      ctx.fillStyle = TEAM_COLOR[team];
      ctx.font = 'bold 26px monospace';
      ctx.fillText(`COPILOTE ${TEAM_NAME[team]}`, 0, -40);
      ctx.font = '20px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('relie ① → ② du doigt', 0, -8);
      if (state.mapStrokes[team]) { ctx.fillStyle = '#3ddc84'; ctx.fillText('✓ tracé accepté', 0, 30); }
      else if (t - view.mapErrorAt[team] < 2500) { ctx.fillStyle = '#ff4040'; ctx.fillText('tracé invalide — recommence', 0, 30); }
      ctx.restore();
    }
    const left = Math.max(0, Math.ceil((state.mapDeadline - now) / 1000));
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(left), LOGICAL_W / 2, LOGICAL_H / 2 + 20);
    ctx.font = '22px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('DESSINEZ LE CIRCUIT', LOGICAL_W / 2, LOGICAL_H / 2 - 50);
    ctx.restore();
  }
}

export { drawItemIcon };
