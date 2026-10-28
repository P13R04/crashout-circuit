import type { GameState, Team, Vec2 } from '../server/types.js';
import { glow } from './neon.js';
interface TrackedTangibleItem {
  id: string;
  team: Team | null;
  pos: Vec2;
  angle?: number;
  lengthPx?: number;
  widthPx?: number;
  birth: number;
}

interface TrackedArcItem {
  id: string;
  team: Team | null;
  pylon1: Vec2;
  pylon2: Vec2;
  birth: number;
}

interface DissolvingItem {
  kind: 'wall' | 'pylon' | 'arc';
  team: Team | null;
  pos?: Vec2;
  angle?: number;
  lengthPx?: number;
  widthPx?: number;
  pylon1?: Vec2;
  pylon2?: Vec2;
  start: number;
  dur: number;
}

/** Lifecycle feedback shared by both styles. It never changes an authoritative pose. */
export class TangibleTransitions {
  trackedWalls = new Map<string, TrackedTangibleItem>();
  trackedPylons = new Map<string, TrackedTangibleItem>();
  trackedArcs = new Map<string, TrackedArcItem>();
  dissolvingItems: DissolvingItem[] = [];
  private now = 0;
  private lastCue = -Infinity;
  private pendingCue: string | null = null;
  constructor(private sound: (kind: string) => void = () => {}) {}
  private cue(kind: string): void {
    const priority = (k: string) => k === 'arcFormed' ? 5 : k === 'arcBroken' ? 4 : k.startsWith('wall') ? 3 : 2;
    if (!this.pendingCue || priority(kind) > priority(this.pendingCue)) this.pendingCue = kind;
  }
  update(state: GameState, now: number): void {
    this.now = now;
    this.pendingCue = null;
    if (state.phase === 'LOBBY' || state.phase === 'MAP') {
      this.trackedWalls.clear();
      this.trackedPylons.clear();
      this.trackedArcs.clear();
      this.dissolvingItems.length = 0;
      this.lastCue = -Infinity;
      return;
    }

    // 1 — Walls
    const currentWallIds = new Set<string>();
    for (const w of state.walls) {
      currentWallIds.add(w.id);
      const existing = this.trackedWalls.get(w.id);
      if (!existing) {
        this.trackedWalls.set(w.id, {
          id: w.id,
          team: w.team,
          pos: { ...w.pos },
          angle: w.angle,
          lengthPx: w.lengthPx, widthPx: w.widthPx,
          birth: now,
        });
        this.cue('wallPlaced');
      } else {
        const d = Math.hypot(existing.pos.x - w.pos.x, existing.pos.y - w.pos.y);
        const aDiff = Math.abs(((existing.angle ?? 0) - w.angle + 540) % 360 - 180);
        if (d > 12 || aDiff > 6) {
          this.dissolvingItems.push({
            kind: 'wall',
            team: existing.team,
            pos: { ...existing.pos },
            angle: existing.angle,
            lengthPx: existing.lengthPx, widthPx: existing.widthPx,
            start: now,
            dur: 500,
          });
          existing.pos = { ...w.pos };
          existing.angle = w.angle;
          existing.birth = now;
          this.cue('wallPlaced');
        }
      }
    }
    for (const [id, existing] of this.trackedWalls) {
      if (!currentWallIds.has(id)) {
        this.dissolvingItems.push({
          kind: 'wall',
          team: existing.team,
          pos: { ...existing.pos },
          angle: existing.angle,
          lengthPx: existing.lengthPx, widthPx: existing.widthPx,
          start: now,
          dur: 500,
        });
        this.trackedWalls.delete(id);
        this.cue('wallRemoved');
      }
    }

    // 2 — Pylons
    const currentPylonIds = new Set<string>();
    for (const [id, t] of Object.entries(state.tangibles)) {
      if (t.status !== 'placed' || !t.active || t.kind !== 'pylon') continue;
      currentPylonIds.add(id);
      const pos = { x: t.x * state.params.logicalWidth, y: t.y * state.params.logicalHeight };
      const existing = this.trackedPylons.get(id);
      if (!existing) {
        this.trackedPylons.set(id, {
          id,
          team: t.team,
          pos,
          birth: now,
        });
        this.cue('pylonPlaced');
      } else {
        const d = Math.hypot(existing.pos.x - pos.x, existing.pos.y - pos.y);
        if (d > 12) {
          this.dissolvingItems.push({
            kind: 'pylon',
            team: existing.team,
            pos: { ...existing.pos },
            start: now,
            dur: 450,
          });
          existing.pos = pos;
          existing.birth = now;
          this.cue('pylonPlaced');
        }
      }
    }
    for (const [id, existing] of this.trackedPylons) {
      if (!currentPylonIds.has(id)) {
        this.dissolvingItems.push({
          kind: 'pylon',
          team: existing.team,
          pos: { ...existing.pos },
          start: now,
          dur: 450,
        });
        this.trackedPylons.delete(id);
        this.cue('pylonRemoved');
      }
    }

    // 3 — Arcs
    const currentArcIds = new Set<string>();
    for (const arc of state.arcs) {
      currentArcIds.add(arc.id);
      const existing = this.trackedArcs.get(arc.id);
      if (!existing) {
        this.trackedArcs.set(arc.id, {
          id: arc.id,
          team: arc.team,
          pylon1: { ...arc.pylon1 },
          pylon2: { ...arc.pylon2 },
          birth: now,
        });
        this.cue('arcFormed');
      } else {
        const d1 = Math.hypot(existing.pylon1.x - arc.pylon1.x, existing.pylon1.y - arc.pylon1.y);
        const d2 = Math.hypot(existing.pylon2.x - arc.pylon2.x, existing.pylon2.y - arc.pylon2.y);
        if (d1 > 12 || d2 > 12) {
          this.dissolvingItems.push({
            kind: 'arc',
            team: existing.team,
            pylon1: { ...existing.pylon1 },
            pylon2: { ...existing.pylon2 },
            start: now,
            dur: 500,
          });
          existing.pylon1 = { ...arc.pylon1 };
          existing.pylon2 = { ...arc.pylon2 };
          existing.birth = now;
          this.cue('arcFormed');
        }
      }
    }
    for (const [id, existing] of this.trackedArcs) {
      if (!currentArcIds.has(id)) {
        this.dissolvingItems.push({
          kind: 'arc',
          team: existing.team,
          pylon1: { ...existing.pylon1 },
          pylon2: { ...existing.pylon2 },
          start: now,
          dur: 500,
        });
        this.trackedArcs.delete(id);
        this.cue('arcBroken');
      }
    }

    // 4 — Cleanup finished dissolving items
    this.dissolvingItems = this.dissolvingItems.filter(item => now - item.start < item.dur).slice(-64);
    if (this.pendingCue && this.now-this.lastCue >= 450) {
      this.sound(this.pendingCue); this.lastCue = this.now;
    }
  }


  draw(ctx: CanvasRenderingContext2D, time: number, reduced: boolean, electric: string): void {
    ctx.save();
    for (const item of [...this.trackedWalls.values(), ...this.trackedPylons.values()]) {
      const f = (time - item.birth) / 600;
      if (f < 0 || f > 1) continue;
      const r = (item.lengthPx ? item.lengthPx * .6 : 35) + (reduced ? 0 : f * 22);
      glow(ctx, item.pos.x, item.pos.y, r, electric, (1 - f) * .4);
      if (!reduced) {
        ctx.globalAlpha = (1 - f) * .5; ctx.strokeStyle = electric; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(item.pos.x, item.pos.y, r, r * .6, (item.angle ?? 0) * Math.PI / 180, 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (const arc of this.trackedArcs.values()) {
      const f = Math.max(0, (time - arc.birth) / 600); if (f > 1) continue;
      glow(ctx, arc.pylon1.x + (arc.pylon2.x - arc.pylon1.x) * f, arc.pylon1.y + (arc.pylon2.y - arc.pylon1.y) * f, 30, electric, (1 - f) * .7);
    }
    for (const item of this.dissolvingItems) {
      const f = Math.max(0, (time - item.start) / item.dur); if (f >= 1) continue;
      ctx.globalAlpha = (1 - f) * .24; ctx.strokeStyle = electric; ctx.lineWidth = 1.5; ctx.setLineDash([3, 6]);
      if (item.kind === 'arc' && item.pylon1 && item.pylon2) {
        ctx.beginPath(); ctx.moveTo(item.pylon1.x, item.pylon1.y); ctx.lineTo(item.pylon2.x, item.pylon2.y); ctx.stroke();
      } else if (item.pos) {
        ctx.save(); ctx.translate(item.pos.x, item.pos.y); ctx.rotate((item.angle ?? 0) * Math.PI / 180);
        if (item.kind === 'wall') {
          const length=item.lengthPx??120,width=item.widthPx??16,shrink=reduced?1:1-.45*f*f;
          ctx.strokeRect(-length*shrink/2,-width/2,length*shrink,width);
          if(!reduced){
            ctx.fillStyle=electric;
            for(let i=0;i<8;i++){
              const x=(i/7-.5)*length*shrink,y=(i%2?1:-1)*(width/2+f*28),size=3*(1-f);
              ctx.fillRect(x-size/2,y-size/2,size,size);
            }
          }
        }
        else { ctx.beginPath(); ctx.arc(0, 0, 24 + (reduced ? 0 : f * 16), 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
    }
    ctx.restore();
  }
  /** A centre-out deployment scan over the intact, already collidable wall. */
  drawActivation(ctx: CanvasRenderingContext2D, time: number, reduced: boolean, electric: string): void {
    for(const wall of this.trackedWalls.values()){
      const f=(time-wall.birth)/600;if(f<0||f>=1)continue;
      const length=wall.lengthPx??120,width=wall.widthPx??12;
      ctx.save();ctx.translate(wall.pos.x,wall.pos.y);ctx.rotate((wall.angle??0)*Math.PI/180);
      ctx.globalAlpha=(1-f)*.75;ctx.strokeStyle=electric;ctx.lineWidth=2;
      if(reduced){ctx.strokeRect(-length/2,-width/2,length,width);}
      else {
        const front=length/2*(1-Math.pow(1-f,3));
        for(const side of [-1,1]){
          const x=side*front;glow(ctx,x,0,18,electric,.4);
          ctx.fillStyle='#efffff';ctx.fillRect(x-1,-width/2-3,2,width+6);
        }
        ctx.beginPath();ctx.moveTo(-front,-width/2);ctx.lineTo(front,-width/2);
        ctx.moveTo(-front,width/2);ctx.lineTo(front,width/2);ctx.stroke();
      }
      ctx.restore();
    }
  }

}
