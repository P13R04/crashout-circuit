/**
 * Stock armé, lance-pierre et zones d'accélération : POWER, vol du geste, tir de la pierre et portails de boost.
 * Liens : server/armedPickup.ts, server/boostGeometry.ts, server/geometry.ts.
 * Fonctions appelées par les méthodes de GameRules (server/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { Team, Vec2, ItemKind, SlingshotMsg, BoostGate, BoostGateMsg, PowerMsg } from '../types.js';
import { orientBoostGate, hitsBoostGate } from '../boostGeometry.js';
import { armedPickup } from '../armedPickup.js';
import { config } from '../config.js';
import { dist, slingshotShot } from '../geometry.js';
import { nearestStationTeam } from '../layout.js';
import { CAR_RADIUS, clamp } from './rulesBasics.js';
import type { GameRules } from '../GameRules.js';

/** Arme le stock du copilote si aucun autre bonus ne réserve déjà le geste partagé. */
// POWER arme le stock du copilote ; la réservation commune est dans armedPickup.ts.
export function onPower(rules: GameRules, team: Team, _msg?: PowerMsg): void {
  if (rules.state.phase !== 'RACE' || rules.state.tangiblePlacement || armedPickup(rules.state)) return;
  const car = rules.state.cars[team];
  if (car.heldItem !== null && !car.itemArmed) {
    car.itemArmed = true;
    car.itemArmVersion++;
    car.itemArmExpiry = 0; // Armed until a valid gesture consumes the stock.
    rules.host.feedback('itemArmed', car.pos.x, car.pos.y, team);
  }
}

/** Retrouve le propriétaire du stock armé qui correspond au geste reçu. */
function resolveArmedTeam(rules: GameRules, kind: ItemKind, at: Vec2): Team | null {
  const armed=armedPickup(rules.state);
  void at;
  return armed && (armed.kind===kind || rules.state.testMode.allItems) ? armed.team : null;
}

/** Utilise l’équipe annoncée ou, à défaut, le poste copilote le plus proche du geste. */
function gestureTeam(rules: GameRules, at: Vec2, reported?: Team): Team {
  return reported === 'A' || reported === 'B' ? reported : nearestStationTeam(at);
}

/** Vide le stock utilisé et envoie le retour visuel de consommation à son propriétaire. */
function consumeItem(rules: GameRules, team: Team): void {
  const car = rules.state.cars[team],kind=car.heldItem;
  car.heldItem = null;
  car.itemArmed = false;
  car.itemArmExpiry = 0;
  if(kind)rules.host.feedback('itemUsed',car.pos.x,car.pos.y,team,kind);
}

/**
 * Valide le geste reçu puis consomme le stock armé pour créer une vraie pierre.
 * La pierre part de la poche vers la fourche ; une traction trop courte conserve le bonus armé pour réessayer.
 */
export function onSlingshot(rules: GameRules, msg: SlingshotMsg): void {
  rules.tickTangiblePlacement(rules.now);
  if (rules.state.tangiblePlacement) return;
  if (rules.state.phase !== 'RACE' || !msg.anchor || !msg.pouch) return;
  const anchor = { x: msg.anchor.x, y: msg.anchor.y };
  const pouch = { x: msg.pouch.x, y: msg.pouch.y };
  if (![anchor.x, anchor.y, pouch.x, pouch.y].every(Number.isFinite)) return;
  const shot = slingshotShot(anchor, pouch, config);
  if (!shot.valid) return;
  const owner = resolveArmedTeam(rules, 'slingshot', anchor);
  if (!owner) return;
  const team = gestureTeam(rules, anchor, msg.team);
  consumeItem(rules, owner);
  const now = rules.now;
  rules.state.stones.push({
    id: rules.nextId('stone'),
    from: pouch,
    target: shot.target,
    launchedAt: now,
    impactAt: now + config.stoneTelegraphS * 1000,
    team,
  });
  rules.host.feedback('stoneWarning', shot.target.x, shot.target.y, team);
}

/** Fait progresser les pierres et applique leurs dégâts aux voitures atteintes. */
export function updateStones(rules: GameRules, now: number): void {
  const s = rules.state;
  if (s.stones.length === 0) return;
  const remaining = [];
  for (const stone of s.stones) {
    if (stone.impactAt > now) { remaining.push(stone); continue; }
    rules.host.feedback('stoneImpact', stone.target.x, stone.target.y, stone.team);
    for(const victim of Object.values(s.cars)){
      if(victim.disabled||s.testMode.invincible||victim.respawnUntil>now||dist(victim.pos,stone.target)>config.stoneRadiusPx+CAR_RADIUS)continue;
      rules.damage(victim,config.dmgStone,now);
      victim.stunUntil=now+config.stunStoneS*1000;victim.speed=0;victim.velocity={x:0,y:0};
      rules.host.feedback('stoneHit',victim.pos.x,victim.pos.y,victim.team);
    }
  }
  s.stones = remaining;
}

/** Valide les deux contacts puis consomme le bonus armé pour créer une zone d’accélération. */
export function onBoostGate(rules: GameRules, msg: BoostGateMsg): void {
  rules.tickTangiblePlacement(rules.now);
  if (rules.state.tangiblePlacement) return;
  if (rules.state.phase !== 'RACE' || !msg.a || !msg.b) return;
  const a = { x: msg.a.x, y: msg.a.y };
  const b = { x: msg.b.x, y: msg.b.y };
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return;
  const len = dist(a, b);
  if (len < config.boostLenMinPx - 1e-6 || len > config.boostLenMaxPx + 1e-6) return;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const owner = resolveArmedTeam(rules, 'boost', mid);
  if (!owner) return;
  const team = gestureTeam(rules, mid, msg.team);
  consumeItem(rules, owner);
  addBoostGate(rules, team, a, b);
}

/** Oriente et installe la zone d’accélération dans le sens local du circuit. */
function addBoostGate(rules: GameRules, team: Team, a: Vec2, b: Vec2): void {
  const mid = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
  const pose = orientBoostGate(a,b,rules.state.track);
  rules.state.boostGates.push({
    id: rules.nextId('gate'),
    team,
    ...pose,
    expiresAt: rules.now + config.boostGateLifeS * 1000,
    createdAt: rules.now,
  });
  rules.host.feedback('boostGate', mid.x, mid.y, team);
}

/** Vérifie si le déplacement de la voiture traverse la surface active de la zone. */
export function carHitsBoostGate(rules: GameRules, prev: Vec2, pos: Vec2, g: BoostGate): boolean {
  return hitsBoostGate(prev,pos,g);
}

/** Déduit l’intensité d’accélération de l’espacement des deux contacts. */
export function boostFactor(rules: GameRules, a: Vec2, b: Vec2): number {
  return clamp(dist(a, b) / config.boostLenMaxPx, 0.3, 1);
}
