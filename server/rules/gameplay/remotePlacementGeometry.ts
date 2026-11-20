/**
 * Prépare la géométrie d'une action à distance pour le serveur et l'aperçu mobile.
 * Liens : server/tangibles/tangibleTouch.ts, server/track/boostGeometry.ts, server/geometry.ts.
 */
import type { GameParams, GameState, PlacementFailure, RemotePlacementTarget, Vec2 } from '../../types.js';
import { isInsideTrackRibbon, slingshotShot } from '../../geometry.js';
import { insidePanel, inTangibleDepot, type PanelLayout } from '../../layout.js';
import { tablePanels } from '../../tableStations.js';
import { tangibleDefinition, type TangibleId } from '../../tangibles/tangibles.js';
import { tangibleTouchPose } from '../../tangibles/tangibleTouch.js';
import type { TangiblePose } from '../../tangibles/tangibleGeometry.js';
import { BOOST_MIN_WIDTH, orientBoostGate } from '../../track/boostGeometry.js';
import { armedPickup } from '../armedPickup.js';

type Failure = { reason: PlacementFailure };
export type PreparedPlacement = Failure
  | { kind: 'tangible'; id: TangibleId; pose: TangiblePose; a: Vec2; b: Vec2 }
  | { kind: 'boost'; a: Vec2; b: Vec2; gate: ReturnType<typeof orientBoostGate> }
  | { kind: 'slingshot'; anchor: Vec2; pouch: Vec2; shot: ReturnType<typeof slingshotShot> };

/** Valide l'intention et applique les mêmes calculs que les contacts physiques. */
export function prepareRemotePlacement(state: GameState, target: RemotePlacementTarget): PreparedPlacement {
  if (state.phase !== 'RACE' || !state.track) return { reason: 'phase' };
  if (state.tangiblePlacement) return { reason: 'busy' };
  if (!target || !inTable(target.pos, state.params)) return { reason: 'outside-table' };
  if (!Number.isFinite(target.angle)) return { reason: 'invalid' };
  const panels = tablePanels(state);
  if (blocked(target.pos, panels)) return { reason: 'blocked-zone' };
  if (target.kind === 'tangible') return prepareTangible(state, target, panels);
  if (target.kind !== 'boost' && target.kind !== 'slingshot') return { reason: 'invalid' };
  const armed = armedPickup(state);
  if (armed?.kind !== target.kind || armed.team !== target.arm?.team || armed.version !== target.arm?.version) {
    return { reason: 'not-armed' };
  }
  return target.kind === 'boost' ? prepareBoost(state, target, panels) : prepareShot(state.params, target, panels);
}

/** Calcule la prise qui donne un mur à l'angle du tracé ou un pilier centré. */
function prepareTangible(state: GameState, target: Extract<RemotePlacementTarget, { kind: 'tangible' }>,
  panels: readonly PanelLayout[]): PreparedPlacement {
  if (state.tangiblePlacementMode !== 'touch') return { reason: 'wrong-mode' };
  const definition = tangibleDefinition(target.id);
  if (!definition) return { reason: 'invalid' };
  const grip = 60 * state.params.pylonBasePx / 32;
  const angle = definition.kind === 'wall' ? target.angle - 90 : 0;
  const [a, b] = opposing(target.pos, angle, grip);
  if (![a, b].every(point => inTable(point, state.params))) return { reason: 'outside-table' };
  const pose = tangibleTouchPose(definition.kind, a, b, state.params, panels);
  if (!pose || [a, b].some(point => blocked(point, panels))) return { reason: 'blocked-zone' };
  return { kind: 'tangible', id: target.id, pose, a, b };
}

/** Calcule le segment transverse puis le corridor orienté par les règles du boost. */
function prepareBoost(state: GameState, target: Extract<RemotePlacementTarget, { kind: 'boost' }>,
  panels: readonly PanelLayout[]): PreparedPlacement {
  const { width, pos, angle } = target, { params } = state;
  if (!Number.isFinite(width) || width < Math.max(BOOST_MIN_WIDTH, params.boostLenMinPx)
    || width > params.boostLenMaxPx) return { reason: 'invalid' };
  if (!isInsideTrackRibbon(pos, state.track!, 0)) return { reason: 'outside-track' };
  const [a, b] = opposing(pos, angle, width);
  const gate = orientBoostGate(a, b, state.track);
  const points = [a, b, gate.a, gate.b];
  if (!points.every(point => inTable(point, params))) return { reason: 'outside-table' };
  if (points.some(point => blocked(point, panels))) return { reason: 'blocked-zone' };
  return { kind: 'boost', a, b, gate };
}

/** Calcule la traction et l'impact réels depuis la poche et l'angle choisis. */
function prepareShot(params: GameParams, target: Extract<RemotePlacementTarget, { kind: 'slingshot' }>,
  panels: readonly PanelLayout[]): PreparedPlacement {
  if (!Number.isFinite(target.power) || target.power < 0 || target.power > 1) return { reason: 'invalid' };
  const pull = params.slingMinPullPx + Math.max(1e-7, (params.slingMaxPullPx - params.slingMinPullPx) * target.power);
  const direction = unit(target.angle);
  const pouch = target.pos;
  const anchor = { x: pouch.x + direction.x * pull, y: pouch.y + direction.y * pull };
  if (!inTable(anchor, params)) return { reason: 'out-of-range' };
  if (blocked(anchor, panels)) return { reason: 'blocked-zone' };
  const shot = slingshotShot(anchor, pouch, params);
  return shot.valid ? { kind: 'slingshot', anchor, pouch, shot } : { reason: 'out-of-range' };
}

/** Écarte les coordonnées non finies et les contacts hors de la table. */
function inTable(point: Vec2 | undefined, params: GameParams): point is Vec2 {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.y >= 0 && point.x <= params.logicalWidth && point.y <= params.logicalHeight;
}

/** Protège les commandes physiques et la réserve neutre. */
function blocked(point: Vec2, panels: readonly PanelLayout[]): boolean {
  return insidePanel(point, 0, panels) || inTangibleDepot(point);
}

/** Convertit les degrés en vecteur unitaire dans les axes de la carte. */
function unit(degrees: number): Vec2 {
  const radians = (degrees % 360) * Math.PI / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

/** Place deux contacts de part et d'autre du centre. */
function opposing(pos: Vec2, angle: number, length: number): [Vec2, Vec2] {
  const axis = unit(angle), dx = axis.x * length / 2, dy = axis.y * length / 2;
  return [{ x: pos.x - dx, y: pos.y - dy }, { x: pos.x + dx, y: pos.y + dy }];
}
