/**
 * Déformation temporaire du circuit : traction au bord, relaxation et réalignement des éléments de piste.
 * Liens : server/geometry.ts, server/track/generation/trackFeatures.ts.
 * Fonctions appelées par les méthodes de GameRules (server/rules/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { Team, Vec2, TrackGeometry, BorderPullMsg } from '../../types.js';
import { config } from '../../config.js';
import { dist, nearestOnTrack, trackTangent, clampToTrackRibbon } from '../../geometry.js';
import { rebuildEdges } from '../../track/MapGenerator.js';
import { tablePanels } from '../../tableStations.js';
import { nearestStationTeam, insidePanel, TANGIBLE_DEPOT, rectContains } from '../../layout.js';
import { clamp } from '../session/rulesBasics.js';
import type { GameRules } from '../GameRules.js';

/** Valide la traction du bord puis la transmet au calcul de déformation temporaire. */
export function onBorderPull(rules: GameRules, msg: BorderPullMsg): void {
  rules.tickTangiblePlacement(rules.now);
  if (rules.state.tangiblePlacement) return;
  const s = rules.state;
  const track = s.track;
  if (s.phase !== 'RACE' || !track || ![msg.x, msg.y, msg.dx, msg.dy].every(Number.isFinite)) return;
  const pull = Math.hypot(msg.dx, msg.dy);
  if (pull < 20 || pull > config.trackDeformMaxShiftPx * 1.8) return;
  if(msg.gestureId!==undefined && (typeof msg.gestureId!=='string'||!/^[-\w]{1,80}$/.test(msg.gestureId)))return;
  if(msg.end!==undefined&&typeof msg.end!=='boolean')return;
  const team = msg.team ?? nearestStationTeam({ x: msg.x, y: msg.y });
  if(msg.index!==undefined&&(!Number.isInteger(msg.index)||msg.index<0||msg.index>=track.centerline.length))return;
  deformTrack(rules, { x: msg.x, y: msg.y }, { x: msg.dx, y: msg.dy }, team,msg.gestureId,msg.end,msg.index);
}

/**
 * Crée ou actualise une traction locale en bornant son amplitude et sa durée.
 * Les deux bords suivent le même déplacement latéral pour créer une chicane temporaire, et un nouveau geste peut commencer pendant le retour du précédent.
 */
function deformTrack(rules: GameRules, at: Vec2, drag: Vec2, team: Team, gestureId?:string, ended=false, indexHint?:number): void {
  const track = rules.state.track;
  if (!track) return;
  const id=gestureId?`deform-${team}-${gestureId}`:`deform-${++rules.deformCounter}`;
  const existing=rules.state.deformations.find(/* Retrouve la déformation déjà créée par le même geste continu. */ d=>d.id===id);
  if(existing?.gestureEnded || existing?.releaseAt)return;
  const hit=nearestOnTrack(at,track);
  const index=existing?.index??indexHint??hit.index;
  if(!existing&&indexHint!==undefined&&Math.min(dist(at,track.innerEdge[indexHint]),dist(at,track.outerEdge[indexHint]))>80)return;
  if(!existing&&dist(at,indexHint!==undefined?track.centerline[index]:hit.closest)<1e-6)return;
  const tangent=trackTangent(track,index),normal={x:-tangent.y,y:tangent.x};
  const origin=indexHint!==undefined?track.centerline[index]:hit.closest;
  const side=(at.x-origin.x)*normal.x+(at.y-origin.y)*normal.y<0?-1:1;
  const edge=existing?{x:existing.dx,y:existing.dy}:{x:normal.x*side,y:normal.y*side};
  const edgeLen=Math.hypot(edge.x,edge.y);if(edgeLen<1e-6)return;
  const outward={x:edge.x/edgeLen,y:edge.y/edgeLen},projected=drag.x*outward.x+drag.y*outward.y;
  if(projected<20)return;
  let amount=Math.min(config.trackDeformMaxShiftPx,projected);
  // One uniform limit preserves the requested shape and clears the screen/UI.
  /** Vérifie que le déplacement proposé conserve toute la portion déformée hors des commandes et des bords. */
  const panels = tablePanels(rules.state);
  const safe=(shift:number)=>{
    const n=track.baseCenterline.length,radius=config.trackDeformRadiusPoints;
    for(let offset=-radius;offset<=radius;offset++){
      const i=(index+offset+n)%n,base=track.baseCenterline[i],f=Math.cos(offset/(radius+1)*Math.PI/2);
      const p={x:base.x+outward.x*shift*f,y:base.y+outward.y*shift*f},margin=track.widths[i]/2+12;
      if(p.x<margin||p.x>config.logicalWidth-margin||p.y<margin||p.y>config.logicalHeight-margin||insidePanel(p,margin,panels)
        ||rectContains({x:TANGIBLE_DEPOT.x-margin,y:TANGIBLE_DEPOT.y-margin,w:TANGIBLE_DEPOT.w+2*margin,h:TANGIBLE_DEPOT.h+2*margin},p))return false;
    }
    return true;
  };
  if(!safe(amount)){let low=0,high=amount;for(let i=0;i<10;i++){const mid=(low+high)/2;if(safe(mid))low=mid;else high=mid;}amount=low;}
  if(amount<20)return;
  const now=rules.now;
  if(existing){
    const moved=Math.abs(existing.dx-outward.x*amount)+Math.abs(existing.dy-outward.y*amount)>1e-6;
    existing.dx=outward.x*amount;existing.dy=outward.y*amount;existing.holdUntil=now+config.trackDeformHoldS*1000;existing.gestureEnded=ended;
    updateTrackDeformations(rules, now,moved);return;
  }

  // There is one active gesture only. Older local shifts remain briefly as
  // they ease home, which makes repeated interventions continuous.
  for (const deformation of rules.state.deformations) {
    if (deformation.releaseAt === null) deformation.releaseAt = now;
  }
  rules.state.deformations.push({
    id,
    index,
    dx: outward.x * amount,
    dy: outward.y * amount,
    createdAt: now,
    releaseAt: null,
    strength: 0,
    holdUntil:now+(config.trackDeformRampS+config.trackDeformHoldS)*1000,
    gestureEnded:ended,
  });
  updateTrackDeformations(rules, now);
  rules.host.feedback('trackDeformed', hit.closest.x, hit.closest.y, team);
}

/** Recompose la piste depuis sa forme de base avec les déplacements temporaires encore actifs. */
export function updateTrackDeformations(rules: GameRules, now: number, force = false): void {
  const track = rules.state.track;
  if (!track || rules.state.deformations.length === 0) return;
  const rampMs = config.trackDeformRampS * 1000;
  const holdMs = config.trackDeformHoldS * 1000;
  const relaxMs = config.trackDeformRelaxS * 1000;
  let changed = force;

  for (const d of rules.state.deformations) {
    if (d.releaseAt === null && now >= (d.holdUntil ?? d.createdAt + rampMs + holdMs)) d.releaseAt = now;
    const next = d.releaseAt === null
      ? clamp((now - d.createdAt) / rampMs, 0, 1)
      : clamp(1 - (now - d.releaseAt) / relaxMs, 0, 1);
    if (Math.abs(next - d.strength) > 1e-5) changed = true;
    d.strength = next;
  }
  // A just-created pull starts at strength 0, so only discard a deformation
  // once its release animation has actually reached zero.
  const kept = rules.state.deformations.filter(/* Conserve les tractions maintenues et celles dont le retour n’est pas terminé. */ d => d.releaseAt === null || d.strength > 0);
  if (kept.length !== rules.state.deformations.length) changed = true;
  rules.state.deformations = kept;

  if (!changed) return;
  const n = track.baseCenterline.length;
  const radius = config.trackDeformRadiusPoints;
  track.centerline = track.baseCenterline.map(/* Applique les déplacements actifs au point de base sans cumuler les déformations au-delà de la limite. */ (base, i) => {
    let x = base.x, y = base.y, shiftX=0, shiftY=0, weight=0;
    for (const d of rules.state.deformations) {
      const delta = Math.abs(i - d.index);
      const circular = Math.min(delta, n - delta);
      if (circular > radius) continue;
      const falloff = Math.cos((circular / (radius + 1)) * Math.PI / 2);
      const w=d.strength*falloff;shiftX+=d.dx*w;shiftY+=d.dy*w;weight+=w;
    }
    return { x:x+shiftX/Math.max(1,weight), y:y+shiftY/Math.max(1,weight) };
  });
  rebuildEdges(track);
  alignTrackFeatures(rules, track);
  rules.state.trackVersion++;
}

/** Repositionne les éléments accrochés à la piste après une déformation de la chaussée. */
function alignTrackFeatures(rules: GameRules, track: TrackGeometry): void {
  /** Calcule la direction locale de la piste déformée pour y réaligner les éléments attachés. */
  const tangent = (index: number) => {
    const n = track.centerline.length;
    const a = track.centerline[(index - 1 + n) % n];
    const b = track.centerline[(index + 1) % n];
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  };
  /** Replace chaque checkpoint sur son ancrage et sa direction de piste déformée. */
  track.checkpoints.forEach((checkpoint, i) => {
    const index = track.featureIndices.checkpoints[i];
    checkpoint.pos = { ...track.centerline[index] };
    const t = tangent(index);
    checkpoint.normal = { x: -t.y, y: t.x };
  });
  const start = track.featureIndices.start;
  const t = tangent(start);
  track.startLine = { pos: { ...track.centerline[start] }, normal: { x: -t.y, y: t.x } };
  // Baptiste's pickups follow their own anchor when the road is pulled, even while respawning.
  /** Replace chaque bonus sur son ancrage en conservant sa marge de chaussée. */
  track.featureIndices.pickups.forEach((index, i) => {
    const direction = tangent(index), normal = { x: -direction.y, y: direction.x };
    const lateral = (track.widths[index] / 2) * .3 * (i % 2 === 0 ? 1 : -1);
    const at = track.centerline[index];
    const safe = clampToTrackRibbon({ x: at.x + normal.x*lateral, y: at.y + normal.y*lateral }, track, 25);
    track.pickupPositions[i] = safe;
    if (rules.state.pickups[i]) rules.state.pickups[i].pos = { ...safe };
  });
}

/** Indique qu’un bord revient à sa place et qu’une petite marge de sécurité doit être conservée. */
export function isTrackReforming(rules: GameRules): boolean {
  return rules.state.deformations.some(/* Signale qu’au moins une déformation est dans sa phase de retour. */ d => d.releaseAt !== null);
}
