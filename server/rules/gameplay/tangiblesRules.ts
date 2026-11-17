/**
 * Tangibles neutres : annonce de pose, pose tactile ou manuelle, activation, retrait et arc électrique.
 * Liens : server/tangibles/tangibles.ts, server/tangibles/tangibleTouch.ts, server/tangibles/tangibleGeometry.ts.
 * Fonctions appelées par les méthodes de GameRules (server/rules/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { Vec2, Wall, Tangible, SeatId, TangibleControlMsg, TangibleMovedMsg, TangibleRemovedMsg, TangiblePlacementMode, TangibleTouchPlacedMsg } from '../../types.js';
import { tablePanels } from '../../tableStations.js';
import { config } from '../../config.js';
import { inTangibleDepot, depotPose } from '../../layout.js';
import { TUTORIAL_OBSTACLE_PREFIX } from '../../modes/Tutorial.js';
import { tangibleArc, tangibleDefinition, validTangiblePose } from '../../tangibles/tangibles.js';
import { tangibleTouchPose, TANGIBLE_WAIT_MS } from '../../tangibles/tangibleTouch.js';
import type { GameRules } from '../GameRules.js';

/** Change la méthode de pose des tangibles et annule une éventuelle annonce en cours. */
export function setTangiblePlacementMode(rules: GameRules, mode: TangiblePlacementMode): void {
  if (mode !== 'manual' && mode !== 'touch') return;
  rules.state.tangiblePlacementMode = mode;
  cancelTangiblePlacement(rules);
  rules.host.broadcastFull();
}

/** Construit la pose inactive de l’objet à sa place dans la réserve neutre. */
export function parkedTangible(rules: GameRules, id:number): Tangible {
  return {...depotPose(id),kind:tangibleDefinition(id)!.kind,team:null,active:false,status:'parked',dockTeam:null};
}

/** Retire l’ancien effet de l’objet et crée une autorisation unique pour ses prochains contacts. */
export function prepareTangiblePlacement(rules: GameRules, id: number, by?: SeatId): void {
  if (rules.state.tangiblePlacementMode !== 'touch' || !tangibleDefinition(id)
    || !['READY','RACE'].includes(rules.state.phase)) return;
  rules.state.tangibles[id]=parkedTangible(rules, id);
  rebuildTangibles(rules);
  rules.state.tangiblePlacement = {id:id as 1|2|3, token:++rules.placementToken, expiresAt:rules.now+TANGIBLE_WAIT_MS, ...(by ? { by } : {})};
  rules.host.broadcastFull();
}

/** Supprime l’annonce de pose sans modifier les objets déjà présents. */
export function cancelTangiblePlacement(rules: GameRules): void {
  if (!rules.state.tangiblePlacement) return;
  rules.state.tangiblePlacement = null;
  rules.host.broadcastFull();
}

/** Annule une annonce périmée ou devenue incompatible avec la phase de jeu. */
export function tickTangiblePlacement(rules: GameRules, now: number): void {
  const pending=rules.state.tangiblePlacement;
  if (pending && (now>=pending.expiresAt || !['READY','RACE'].includes(rules.state.phase))) cancelTangiblePlacement(rules);
}

/** Valide le jeton et les contacts puis installe le tangible à la pose recalculée par le serveur. */
export function onTangibleTouchPlaced(rules: GameRules, msg: TangibleTouchPlacedMsg): void {
  tickTangiblePlacement(rules, rules.now);
  const s=rules.state, pending=s.tangiblePlacement, definition=tangibleDefinition(msg.id);
  if(s.tangiblePlacementMode!=='touch'||!pending||!definition||pending.id!==msg.id||pending.token!==msg.token
)return;
  const pose=tangibleTouchPose(definition.kind,msg.a,msg.b,s.params,tablePanels(s));
  if(!pose)return;
  // The single-use grant is consumed atomically; delayed/replayed packets cannot move it.
  s.tangiblePlacement=null;
  const parked=inTangibleDepot({x:pose.x*s.params.logicalWidth,y:pose.y*s.params.logicalHeight});
  s.tangibles[msg.id]={...pose,kind:definition.kind,team:null,active:!parked,status:parked?'parked':'placed',dockTeam:null,placementOrigin:{...pose}};
  rules.tangibleLog.push({t:rules.now,type:'TangibleMoved',id:msg.id,...pose,active:!parked});
  rebuildTangibles(rules);
  rules.tutorial?.onTangiblePlaced(msg.id);
  rules.host.broadcastFull();
}

/** Active, désactive ou range le tangible demandé par la console. */
export function onTangibleControl(rules: GameRules, msg: TangibleControlMsg): void {
  const id = Number(msg.id), definition = tangibleDefinition(id);
  if (!definition || !['READY', 'RACE', 'PAUSED'].includes(rules.state.phase)) return;
  if (!['dock','activate','deactivate'].includes(msg.action)) return;
  if (rules.state.tangiblePlacement?.id === id) cancelTangiblePlacement(rules);
  if (msg.action === 'dock') {
    // Compatibility for older consoles: bringing an object back simply removes it.
    onTangibleRemoved(rules, {type:'TangibleRemoved',t:msg.t,id:msg.id});
    return;
  } else if (msg.action === 'activate' || msg.action === 'deactivate') {
    const t = rules.state.tangibles[id];
    if (!t) return;
    t.active = msg.action === 'activate' && t.status === 'placed';
  } else return;
  rules.tangibleLog.push({ t: rules.now, type: 'TangibleControl', id, action: msg.action });
  rebuildTangibles(rules);
}

/** Valide et applique une pose manuelle reçue de la console lorsque ce mode est actif. */
export function onTangibleMoved(rules: GameRules, msg: TangibleMovedMsg): void {
  if (rules.state.tangiblePlacementMode === 'touch') return;
  const id = Number(msg.id), definition = tangibleDefinition(id);
  if (!definition || !['READY', 'RACE', 'PAUSED'].includes(rules.state.phase)
    || ![msg.x, msg.y, msg.angle].every(Number.isFinite) || msg.x<0 || msg.x>1 || msg.y<0 || msg.y>1
    || (msg.active !== undefined && typeof msg.active !== 'boolean')) return;
  if (!validTangiblePose(definition.kind, msg, config, tablePanels(rules.state))) return;
  const old = rules.state.tangibles[id];
  const { x, y } = msg, angle = ((msg.angle % 360) + 360) % 360;
  const parked=inTangibleDepot({x:x*config.logicalWidth,y:y*config.logicalHeight});
  const active = parked ? false : msg.active ?? (old?.status==='placed'?old.active:true);
  const placementOrigin = { x, y, angle };
  rules.state.tangibles[id] = { x, y, angle, active, kind: definition.kind, team: null,
    dockTeam: null, status: parked?'parked':'placed', placementOrigin };
  rules.tangibleLog.push({ t: rules.now, type: 'TangibleMoved', id, x, y, angle, active });
  rebuildTangibles(rules);
  rules.tutorial?.onTangiblePlaced(id);
}

/** Retire l’effet de l’objet et le remet inactif dans la réserve. */
export function onTangibleRemoved(rules: GameRules, msg: TangibleRemovedMsg): void {
  const id = Number(msg.id);
  if (!tangibleDefinition(id) || !['READY', 'RACE', 'PAUSED'].includes(rules.state.phase)) return;
  if (rules.state.tangiblePlacement?.id === id) cancelTangiblePlacement(rules);
  rules.tangibleLog.push({ t: rules.now, type: 'TangibleRemoved', id });
  rules.state.tangibles[id]=parkedTangible(rules, id);
  rebuildTangibles(rules);
}

/** Reconstruit les murs et l’arc actifs à partir des poses des trois objets neutres. */
export function rebuildTangibles(rules: GameRules): void {
  const s = rules.state;
  const oldDisabled = new Map([...s.walls, ...s.arcs].map(/* Conserve les échéances de désactivation avant de reconstruire les obstacles. */ w => [w.id, w.disabledUntil]));
  s.walls = s.walls.filter(/* Conserve les murs temporaires de démonstration pendant la reconstruction des tangibles. */ w => w.expiresAt);
  s.arcs = s.arcs.filter(/* Conserve les arcs du tutoriel clavier qui ne proviennent pas de la paire réelle. */ a => a.id.startsWith(TUTORIAL_OBSTACLE_PREFIX));
  /** Convertit une pose normalisée de tangible en pixels logiques de la table. */
  const px = (t: { x: number; y: number }): Vec2 => ({ x: t.x * config.logicalWidth, y: t.y * config.logicalHeight });
  const wall = s.tangibles[1];
  if (wall?.active && wall.status === 'placed') s.walls.push({ id: 'wall-1', team: null, pos: px(wall), angle: wall.angle,
    lengthPx: config.wallLengthPx, widthPx: config.wallWidthPx, tolerancePx: config.tangibleTolerancePx, disabledUntil: oldDisabled.get('wall-1') ?? 0 });
  const arc = tangibleArc(s.tangibles, config);
  if (arc) s.arcs.push({ ...arc, disabledUntil: oldDisabled.get(arc.id) ?? 0 });
  rules.tutorial?.onTangibles();
}

/** Calcule les extrémités du mur à partir de son centre, de son angle et de sa longueur. */
export function wallEnds(w: Pick<Wall, 'pos' | 'angle' | 'lengthPx'>): [Vec2, Vec2] {
  const a = (w.angle * Math.PI) / 180;
  const hx = (Math.cos(a) * w.lengthPx) / 2;
  const hy = (Math.sin(a) * w.lengthPx) / 2;
  return [{ x: w.pos.x - hx, y: w.pos.y - hy }, { x: w.pos.x + hx, y: w.pos.y + hy }];
}
