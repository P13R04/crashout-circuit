/**
 * Expiration des effets et contacts après déplacement : murs, piliers, ramassables, portails, checkpoints et rebonds.
 * Liens : server/PhysicsLoop.ts, server/tangibles/tangibleGeometry.ts.
 * Fonctions appelées par les méthodes de GameRules (server/rules/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { Team, Vec2, Car } from '../../types.js';
import { config } from '../../config.js';
import { dist, distToSegment, segmentsIntersect, wrapAngle, clampToTrackRibbon } from '../../geometry.js';
import { TUTORIAL_PICKUP_RESPAWN_S } from '../../modes/Tutorial.js';
import { wallContact } from '../../tangibles/tangibleGeometry.js';
import { CAR_RADIUS, WALL_HALF_THICKNESS, PICKUP_RADIUS, TEAMS, clamp } from '../session/rulesBasics.js';
import type { GameRules } from '../GameRules.js';

/** Retire les effets terminés, fait réapparaître les bonus et actualise les besoins du tutoriel. */
export function expire(rules: GameRules, now: number): void {
  const s = rules.state;
  s.boostGates = s.boostGates.filter(/* Conserve les accélérations dont la durée d’existence n’est pas écoulée. */ g => g.expiresAt > now);
  s.walls = s.walls.filter(/* Conserve les murs permanents et les murs de démonstration encore valables. */ w => !w.expiresAt || w.expiresAt > now);

  for (const p of s.pickups) {
    if (p.respawnAt !== 0 && p.respawnAt <= now) {
      p.respawnAt = 0; p.kind = s.tutorial ? (p.id%2===0?'slingshot':'boost') : rules.randomItem();
      if (s.track) p.pos = clampToTrackRibbon(s.track.pickupPositions[p.id] ?? p.pos, s.track, 25);
    }
  }
  for (const team of TEAMS) {
    const car = s.cars[team];
    if (s.testMode.allItems) {
      // Test mode refills stock, but POWER still uses the shared reservation.
      car.heldItem ??= 'slingshot';
      car.itemArmExpiry = 0;
    }
  }
  rules.tutorial?.tick();
}

/** Traite le ramassage, les accélérations, les collisions électriques et les checkpoints après le déplacement d’une voiture. */
export function afterMove(rules: GameRules, team: Team, prev: Vec2, now: number): void {
  const s = rules.state;
  const car = s.cars[team];
  const track = s.track;
  if (!track || car.disabled || car.respawnUntil>now) return;

  // Ramassage des bonus ; la réapparition est réglée dans expire.
  if (car.heldItem === null) {
    for (const p of s.pickups) {
      const expected = rules.tutorial?.forcedItem(team);
      if (p.respawnAt === 0 && (!expected || p.kind===expected) && dist(car.pos, p.pos) <= PICKUP_RADIUS) {
        car.heldItem = p.kind;
        p.respawnAt = now + (s.tutorial ? TUTORIAL_PICKUP_RESPAWN_S : config.pickupRespawnS) * 1000;
        rules.host.feedback('pickup', p.pos.x, p.pos.y, team, p.kind);
        break;
      }
    }
  }

  // Traversée d’une zone d’accélération de son équipe.
  if (car.boostUntil <= now) {
    for (const g of s.boostGates) {
      if (g.team !== team) continue;
      if (rules.carHitsBoostGate(prev, car.pos, g)) {
        const k = rules.boostFactor(g.a, g.b);
        car.boostK = k;
        car.boostUntil = now + config.boostDurationS * 1000;
        car.speed = Math.max(car.speed, 0) * (1 + config.boostGain * k);
        rules.host.feedback('boostHit', car.pos.x, car.pos.y, team);
        break;
      }
    }
  }

  // Chocs contre les murs, champs des piliers et arcs électriques.
  if (car.ghostUntil <= now && car.invulnUntil <= now && !s.testMode.invincible) {
    for (const w of s.walls) {
      if (w.team === team || w.disabledUntil > now) continue;
      const hit = wallContact(prev, car.pos, w.pos, w.angle, w.lengthPx,
        w.widthPx ?? WALL_HALF_THICKNESS * 2, CAR_RADIUS + (w.tolerancePx ?? 0));
      if (hit) {
        rules.damage(car, config.dmgWall, now);
        car.invulnUntil = now + config.invulnAfterHitS * 1000;
        car.pos = hit.point;
        reflect(rules, car, hit.normal.x, hit.normal.y);
        rules.tutorial?.onObstacleHit(team, 'wall');
        break;
      }
    }
    if (car.invulnUntil <= now) {
      for (const t of Object.values(s.tangibles)) {
        if (!t.active || t.status !== 'placed' || t.kind !== 'pylon') continue;
        const at = { x: t.x * config.logicalWidth, y: t.y * config.logicalHeight };
        if (distToSegment(at, prev, car.pos) > config.pylonFieldRadiusPx + CAR_RADIUS) continue;
        rules.damage(car, config.dmgArc, now,'electricHit');
        car.invulnUntil = now + config.invulnAfterHitS * 1000;
        car.slowUntil = now + config.arcSlowS * 1000;
        car.speed *= config.arcSlowFactor;
        rules.tutorial?.onObstacleHit(team, 'arc');
        break;
      }
    }
    if (car.invulnUntil <= now) {
      for (const arc of s.arcs) {
        if (arc.team === team || arc.disabledUntil > now) continue;
        if (Math.min(distToSegment(car.pos, arc.pylon1, arc.pylon2), distToSegment(arc.pylon1, prev, car.pos), distToSegment(arc.pylon2, prev, car.pos)) <= CAR_RADIUS + WALL_HALF_THICKNESS || segmentsIntersect(prev, car.pos, arc.pylon1, arc.pylon2)) {
          rules.damage(car, config.dmgArc, now,'electricHit');
          car.invulnUntil = now + config.invulnAfterHitS * 1000;
          car.slowUntil = now + config.arcSlowS * 1000;
          car.speed *= config.arcSlowFactor;
          rules.tutorial?.onObstacleHit(team, 'arc');
          break;
        }
      }
    }
  }

  // Checkpoints et comptage des tours.
  const cp = track.checkpoints[car.checkpointIndex];
  if (cp) {
    const half = 110;
    const a = { x: cp.pos.x + cp.normal.x * half, y: cp.pos.y + cp.normal.y * half };
    const b = { x: cp.pos.x - cp.normal.x * half, y: cp.pos.y - cp.normal.y * half };
    const tan = { x: cp.normal.y, y: -cp.normal.x };
    const forward = (car.pos.x - prev.x) * tan.x + (car.pos.y - prev.y) * tan.y > 0;
    if (forward && segmentsIntersect(prev, car.pos, a, b)) {
      if (car.checkpointIndex === 0) car.lap++;
      car.checkpointIndex = (car.checkpointIndex + 1) % track.checkpoints.length;
      rules.host.feedback('checkpoint', cp.pos.x, cp.pos.y, team);
    }
  }
}

/** Éloigne la voiture du segment touché et réfléchit sa vitesse pour produire le rebond. */
export function bounceOffSegment(rules: GameRules, car: Car, a: Vec2, b: Vec2): void {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((car.pos.x - a.x) * dx + (car.pos.y - a.y) * dy) / len2, 0, 1);
  const cx = a.x + dx * t, cy = a.y + dy * t;
  let nx = car.pos.x - cx, ny = car.pos.y - cy;
  const d = Math.hypot(nx, ny);
  if (d < 1e-6) { nx = -dy; ny = dx; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; }
  else { nx /= d; ny /= d; }
  const push = CAR_RADIUS + WALL_HALF_THICKNESS + 1;
  car.pos = { x: cx + nx * push, y: cy + ny * push };
  reflect(rules, car, nx, ny);
}

/** Projette la direction de la voiture sur la normale du contact pour calculer sa direction de rebond. */
export function reflect(rules: GameRules, car: Car, nx: number, ny: number): void {
  const hx = Math.cos(car.angle), hy = Math.sin(car.angle);
  const vx = hx * car.speed, vy = hy * car.speed;
  const vn = vx * nx + vy * ny;
  if (vn >= 0) return; // already moving away
  const rx = (vx - 2 * vn * nx) * 0.6;
  const ry = (vy - 2 * vn * ny) * 0.6;
  const sp = Math.hypot(rx, ry);
  if (sp < 1e-6) { car.speed = 0; return; }
  const forward = car.speed >= 0;
  car.angle = wrapAngle(Math.atan2(forward ? ry : -ry, forward ? rx : -rx));
  car.speed = forward ? sp : -sp;
}
