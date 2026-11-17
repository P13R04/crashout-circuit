/**
 * Création du circuit : raccords P1/P2, tracés des deux équipes, validation et génération de la piste.
 * Liens : server/track/MapGenerator.ts, server/track/mapCreation.ts, server/layout.ts.
 * Fonctions appelées par les méthodes de GameRules (server/rules/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { Team, Vec2, StrokeDrawMsg, MapDividerMsg } from '../../types.js';
import { nearestOnTrack } from '../../geometry.js';
import { generate, randomizeRaceStart, validateStroke } from '../../track/MapGenerator.js';
import { lockTableFormat, playAreaFor } from '../../tableStations.js';
import { checkDivider } from '../../layout.js';
import { activeMapTeam, mapEndpointError, mapStrokeEndpoints } from '../../track/mapCreation.js';
import { MAX_STROKE_POINTS } from './rulesBasics.js';
import type { GameRules } from '../GameRules.js';

/** Prépare la création à deux équipes et réinitialise les points, les tracés et les objets de session. */
export function enterMap(rules: GameRules, mode: 'table' | 'pc' = 'table'): void {
  const s = rules.state;
  lockTableFormat(s);
  s.mapTargets = null;
  s.mapDivider = null;
  s.mapStrokes = { A: false, B: false };
  // Creation never advances by itself: players validate it explicitly.
  s.mapDeadline = 0;
  s.mapMode = mode;
  s.track = null;
  s.trackPresentation = null;
  s.deformations = [];
  s.trackVersion++;
  rules.strokes = { A: null, B: null };
  rules.generating = false;
  s.walls = []; s.arcs = []; s.boostGates = []; s.stones = []; s.pickups = [];
  s.tangibles = {};
  s.winner = null;
  rules.host.transition('MAP', { deadline: s.mapDeadline, mode });
  rules.host.broadcastFull();
}

/**
 * Valide les deux points de raccord et attribue les demi-tracés aux équipes.
 * L’équipe A dessine de a vers b et l’équipe B de b vers a : la séparation reste le repère commun jusqu’au circuit final.
 */
export function onMapDivider(rules: GameRules, msg: MapDividerMsg): void {
  const s = rules.state;
  if (s.phase !== 'MAP' || s.mapDivider || rules.generating) return;
  const a = msg.a, b = msg.b;
  if (![a?.x, a?.y, b?.x, b?.y].every(Number.isFinite)) return;
  // Same rule as the table's immediate check (layout.checkDivider): too short, or
  // outside the free area of the table. The refusal is shown, never silent.
  const verdict = checkDivider(a, b, playAreaFor(s));
  if (verdict !== 'ok') {
    rules.host.feedback(verdict === 'tooShort' ? 'dividerTooShort' : 'dividerOutOfZone', a.x, a.y, 'A');
    return;
  }
  s.mapDivider = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  s.mapTargets = { A: [s.mapDivider[0], s.mapDivider[1]], B: [s.mapDivider[1], s.mapDivider[0]] };
  rules.host.broadcastFull();
}

/** Vérifie le tracé de l’équipe active avant de le conserver pour la génération. */
export function onStrokeDraw(rules: GameRules, msg: StrokeDrawMsg): void {
  const s = rules.state;
  if (s.phase !== 'MAP' || !s.mapTargets || !s.mapDivider || rules.generating) return;
  const team = msg.creator;
  if (team !== 'A' && team !== 'B') return;
  const [p1, p2] = s.mapTargets[team];
  if (s.mapStrokes[team] || activeMapTeam(s) !== team) {
    rules.host.feedback(s.mapStrokes[team] ? 'mapLocked' : 'mapWaitCyan', p1.x, p1.y, team);
    return;
  }
  let pts = (msg.pts ?? [])
    .filter(/* Écarte les points de tracé manquants ou dont les coordonnées ne sont pas finies. */ p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .slice(0, MAX_STROKE_POINTS)
    .map(/* Copie uniquement les coordonnées utiles des points acceptés. */ p => ({ x: p.x, y: p.y }));
  const error = mapEndpointError(pts, p1, p2)
    ?? (!validateStroke(pts, p1, p2) ? 'mapError' : null)
    ?? (!staysInHalf(rules, team, pts, s.mapDivider) ? 'mapWrongSide' : null);
  if (error) {
    const last = pts[pts.length - 1] ?? p1;
    rules.host.feedback(error, last.x, last.y, team);
    return;
  }
  const [drawStart, drawEnd] = mapStrokeEndpoints(pts[0], p1, p2);
  if (drawStart === p2) pts = pts.reverse();
  // Once accepted, lock the endpoints exactly to the common anchors. This
  // makes a near miss inside the target ring a clean, continuous circuit.
  pts[0] = { ...p1 };
  pts[pts.length - 1] = { ...p2 };
  rules.strokes[team] = pts;
  s.mapStrokes[team] = true;
  rules.host.broadcastFull();
  rules.host.feedback('mapAccepted', drawEnd.x, drawEnd.y, team);
}

/** Accepte la validation seulement lorsque les deux tracés sont disponibles. */
export function onGenerateTrack(rules: GameRules): void {
  if (rules.state.phase !== 'MAP' || !rules.strokes.A || !rules.strokes.B || rules.generating) return;
  void buildTrack(rules);
}

/**
 * Contrôle que les points d’un tracé restent du côté de la ligne attribué à son équipe.
 * Un circuit en huit est accepté ; le tracé est refusé seulement si sa majorité appartient à la moitié adverse.
 */
function staysInHalf(rules: GameRules, team: Team, pts: Vec2[], divider: [Vec2, Vec2]): boolean {
  const [a, b] = divider;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const own = pts.filter(/* Retient les points situés dans la moitié du dessin attribuée à l’équipe. */ p => (rules.mapSide[team] * (dx * (p.y - a.y) - dy * (p.x - a.x))) / len >= 0).length;
  return own >= 0.4 * pts.length;
}

/** Conserve une création au rythme des joueurs sans terminer automatiquement un dessin incomplet. */
export function tickMap(rules: GameRules, now: number): void {
  const s = rules.state;
  // MAP is intentionally player-paced: time never erases a drawing attempt.
  void now;
}

/** Construit le circuit des joueurs puis prépare sa présentation avant le départ. */
async function buildTrack(rules: GameRules): Promise<void> {
  if (rules.generating) return;
  rules.generating = true;
  await Promise.resolve();
  if(rules.state.phase!=='MAP'||!rules.state.mapTargets){rules.generating=false;return;}
  const t = rules.state.mapTargets;
  const a = rules.strokes.A ?? [];
  const b = rules.strokes.B ?? [];
  const started = Date.now();
  const track = generate(a, b, t.A[0], t.A[1], t.B[0], t.B[1], playAreaFor(rules.state));
  console.log(`[GameRules] Track generated in ${Date.now() - started} ms`);
  const originIndex=nearestOnTrack(t.A[0],track).index;
  rules.startRace(randomizeRaceStart(track,rules.rng), true, {startedAt:rules.now+120,originIndex});
}
