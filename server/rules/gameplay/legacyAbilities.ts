/**
 * Anciennes capacités fantôme et destruction, conservées dans le moteur mais hors de l'interface actuelle.
 * Liens : server/rules/GameRules.ts.
 * Fonctions appelées par les méthodes de GameRules (server/rules/GameRules.ts), qui garde l'état et délègue ici.
 */
import type { AbilityMsg } from '../../types.js';
import { config } from '../../config.js';
import type { GameRules } from '../GameRules.js';

/** Conserve le traitement historique des capacités fantôme et destruction, absentes de l’interface actuelle. */
export function onAbility(rules: GameRules, msg: AbilityMsg): void {
  const s = rules.state;
  if (s.phase !== 'RACE') return;
  const team = msg.team;
  if (team !== 'A' && team !== 'B') return;
  const now = rules.now;
  const cd = s.cooldowns[team];
  const car = s.cars[team];

  if (msg.kind === 'ghost') {
    if (!s.testMode.allItems && now < cd.ghost) return;
    car.ghostUntil = now + config.ghostS * 1000;
    // Recharge starts when the ghost effect ends (T-08: 3 s, then 20 s)
    if (!s.testMode.allItems) cd.ghost = car.ghostUntil + config.ghostCooldownS * 1000;
    rules.host.feedback('ghost', car.pos.x, car.pos.y, team);
  } else if (msg.kind === 'destroy') {
    if ((!s.testMode.allItems && now < cd.destroy) || !msg.targetId) return;
    const target = s.walls.find(/* Retrouve le mur ciblé par l’ancienne capacité de destruction. */ w => w.id === msg.targetId) ?? s.arcs.find(/* Retrouve l’arc ciblé par l’ancienne capacité de destruction. */ a => a.id === msg.targetId);
    if (!target || target.team === team) return;
    target.disabledUntil = now + config.destroyDisableS * 1000;
    if (!s.testMode.allItems) cd.destroy = now + config.destroyCooldownS * 1000;
    const at = 'pos' in target ? target.pos : { x: (target.pylon1.x + target.pylon2.x) / 2, y: (target.pylon1.y + target.pylon2.y) / 2 };
    rules.host.feedback('wallDestroyed', at.x, at.y, team);
  }
}
