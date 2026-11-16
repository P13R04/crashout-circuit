/**
 * Placement du départ, des checkpoints et des ramassables sur un circuit calculé.
 * Liens : server/track/generation/trackValidation.ts, server/geometry.ts.
 * Réexporté par server/track/MapGenerator.ts, qui reste la façade de la génération du circuit.
 */
import type { Vec2, TrackGeometry } from '../../types.js';
import { config } from '../../config.js';
import { clampToTrackRibbon } from '../../geometry.js';
import { CHECKPOINT_COUNT, PICKUP_COUNT, START_LATERAL_OFFSET } from './generationLimits.js';
import { dist, add, sub, scale, normalize, perpendicular } from './vectorMath.js';
import type { BaseGeometry } from './trackGeometry.js';
import { cumulative, selfCrossings, junctionMask } from './trackValidation.js';

/** Calcule la direction de la piste autour du point indiqué. */
function tangentAt(centerline: Vec2[], idx: number): Vec2 {
  const n = centerline.length;
  return normalize(sub(centerline[(idx + 1) % n], centerline[(idx - 1 + n) % n]));
}

/**
 * Place la ligne de départ, les voitures, les checkpoints et les emplacements initiaux des bonus.
 * Le checkpoint 0 est la ligne de départ ; les huit checkpoints sont répartis depuis cette ligne, dont le nouveau franchissement termine le tour.
 */
export function placeFeatures(geo: BaseGeometry, randomStart = true, preferredStart?: Vec2, rng: () => number = Math.random): TrackGeometry {
  const { centerline, widths } = geo;
  const n = centerline.length;
  const cum = cumulative(centerline);
  const junction = junctionMask(centerline, widths, selfCrossings(centerline, cum), cum);

  let startIdx = 0;
  if (preferredStart) {
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = dist(centerline[i], preferredStart);
      if (d < bestDist) {
        bestDist = d;
        startIdx = i;
      }
    }
  } else {
    // A roulette among the safe straight sections → start line. This makes the
    // finishing line uncertain while never placing it in a tight bend.
    const windowSize = 10;
    const candidates: Array<{ idx: number; curv: number }> = [];
    for (let i = 0; i < n; i++) {
      let totalCurv = 0;
      for (let j = 0; j < windowSize; j++) {
        const prev = centerline[(i + j - 1 + n) % n];
        const curr = centerline[(i + j) % n];
        const next = centerline[(i + j + 1) % n];
        const t1 = normalize(sub(curr, prev));
        const t2 = normalize(sub(next, curr));
        totalCurv += Math.abs(t1.x * t2.y - t1.y * t2.x);
      }
      candidates.push({ idx: (i + windowSize / 2) % n, curv: totalCurv });
    }
    /** Classe les portions candidates du départ des plus droites aux plus courbées. */
    candidates.sort((a, b) => a.curv - b.curv);
    // Keep the line and the two cars clear of another branch at a crossing.
    const clear=candidates.filter(/* Écarte un départ ou une position de voiture trop proche d’un croisement. */ c=>!junction[c.idx]&&!junction[(c.idx-3+n)%n]);
    const pool=clear.length?clear:candidates;
    const safePool = pool.slice(0, Math.max(1, Math.floor(pool.length * 0.18)));
    startIdx = (randomStart ? safePool[Math.min(safePool.length-1,Math.floor(Math.max(0,rng()) * safePool.length))] : safePool[0]).idx;
  }

  // Preferred drawing anchors may be on a junction; keep checkpoints ordered and clear.
  if (junction[startIdx]) {
    for (let d = 1; d <= 40; d++) {
      const k = [(startIdx + d) % n, (startIdx - d + n) % n].find(/* Cherche un indice voisin qui ne se trouve pas sur une jonction. */ q => !junction[q]);
      if (k !== undefined) { startIdx = k; break; }
    }
  }

  const checkpoints: Array<{ pos: Vec2; normal: Vec2 }> = [];
  const checkpointIndices: number[] = [];
  let prevOff = -5;
  for (let c = 0; c < CHECKPOINT_COUNT; c++) {
    const target = c === 0 ? 0 : Math.round((c / CHECKPOINT_COUNT) * n);
    let off = target;
    for (let d = 0; d <= 40; d++) {
      /** Vérifie que le checkpoint proposé reste ordonné et hors des zones de croisement. */
      const ok = (o: number) => o > prevOff + 4 && o < n - 4 && !junction[(startIdx + o) % n];
      if (c === 0) break;
      if (ok(target + d)) { off = target + d; break; }
      if (ok(target - d)) { off = target - d; break; }
    }
    prevOff = off;
    const idx = (startIdx + off) % n;
    checkpoints.push({ pos: centerline[idx], normal: perpendicular(tangentAt(centerline, idx)) });
    checkpointIndices.push(idx);
  }

  const startNormal = perpendicular(tangentAt(centerline, startIdx));
  const startLine = { pos: centerline[startIdx], normal: startNormal };

  // Side-by-side, slightly behind the line so neither car starts past it
  const behind = (startIdx - 3 + n) % n;
  const behindNormal = perpendicular(tangentAt(centerline, behind));
  const startPositions: Vec2[] = [
    add(centerline[behind], scale(behindNormal, START_LATERAL_OFFSET)),
    add(centerline[behind], scale(behindNormal, -START_LATERAL_OFFSET)),
  ];

  // 4 pickup spots, halfway between checkpoint pairs
  const pickupPositions: Vec2[] = [];
  const pickupIndices: number[] = [];
  const baseGeo = { centerline, widths };
  for (let p = 0; p < PICKUP_COUNT; p++) {
    const idx = (startIdx + Math.round(((p + 0.5) / PICKUP_COUNT) * n)) % n;
    const normal = perpendicular(tangentAt(centerline, idx));
    const halfW = (widths[idx] ?? config.trackWidthBasePx) / 2;
    const lateral = halfW * 0.3 * (p % 2 === 0 ? 1 : -1);
    const rawPos = add(centerline[idx], scale(normal, lateral));
    pickupPositions.push(clampToTrackRibbon(rawPos, baseGeo, 25));
    pickupIndices.push(idx);
  }

  return {
    ...geo,
    baseCenterline: centerline.map(/* Conserve une copie indépendante de la ligne centrale d’origine. */ p => ({ ...p })),
    checkpoints, startLine, startPositions, pickupPositions,
    featureIndices: { checkpoints: checkpointIndices, start: startIdx, starts: [behind, behind], pickups: pickupIndices },
  };
}

/** Tire un départ sûr et redistribue les bonus du circuit généré. */
export function randomizeRaceStart(track: TrackGeometry, rng: () => number = Math.random): TrackGeometry {
  return randomizePickups(placeFeatures(track, true, undefined, rng),rng);
}

/** Choisit des positions espacées sur la chaussée tout en évitant le départ et les croisements. */
export function randomizePickups(track:TrackGeometry,rng:()=>number=Math.random):TrackGeometry {
  const c=track.centerline,n=c.length,cum=cumulative(c);
  const junction=junctionMask(c,track.widths,selfCrossings(c,cum),cum);
  const candidates=Array.from({length:n},/* Énumère les indices de piste à mélanger pour le placement aléatoire. */ (_,i)=>i);
  /** Borne le tirage aléatoire pour qu’il reste un indice exploitable dans les candidats. */
  const random=()=>Math.max(0,Math.min(.999999999,rng()));
  for(let i=n-1;i>0;i--){const j=Math.floor(random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
  const positions:Vec2[]=[],indices:number[]=[];
  for(const strict of [true,false])for(const i of candidates){
    if(indices.includes(i)||positions.length>=PICKUP_COUNT)continue;
    if(dist(c[i],track.startLine.pos)<135||track.startPositions.some(/* Écarte une position de bonus trop proche des voitures au départ. */ p=>dist(c[i],p)<90))continue;
    if(strict&&(junction[i]||track.checkpoints.some(/* Écarte une position de bonus trop proche d’un checkpoint lors de la recherche stricte. */ cp=>dist(c[i],cp.pos)<60)))continue;
    const normal=perpendicular(tangentAt(c,i)),lateral=track.widths[i]/2*.3*(positions.length%2===0?1:-1);
    const at=clampToTrackRibbon(add(c[i],scale(normal,lateral)),track,25);
    if(positions.some(/* Écarte un candidat trop proche d’un ramassable déjà choisi. */ p=>dist(p,at)<140)||dist(at,track.startLine.pos)<120)continue;
    positions.push(at);indices.push(i);
  }
  // Valid generated tracks normally provide many candidates. Keep four objects even for legacy tiny fixtures.
  for(let i=positions.length;i<PICKUP_COUNT;i++){positions.push({...track.pickupPositions[i]});indices.push(track.featureIndices.pickups[i]);}
  return {...track,pickupPositions:positions,featureIndices:{...track.featureIndices,pickups:indices}};
}
