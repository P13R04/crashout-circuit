/**
 * Simulation à la souris des gestes à plusieurs doigts : clics du portail de boost et lance-pierre.
 * Liens : client-table/gesture/gestureTuning.ts.
 * Fonctions appelées par les méthodes de GestureRecognizer (server/GestureRecognizer.ts), qui garde l'état et délègue ici.
 */
import type { Vec2 } from '../../../server/types.js';
import { slingshotShot } from '../../../server/geometry.js';
import { tuning } from '../gestureTuning.js';
import { SIM_FORK_HALF_PX } from '../gestureConstants.js';
import type { Contact } from '../gestureTypes.js';
import type { GestureRecognizer } from '../GestureRecognizer.js';

/** Choisit le geste de test à reproduire avec une souris lorsque les outils de développement sont actifs. */
export function simulate(recognizer: GestureRecognizer, kind: 'slingshot' | 'boost' | null): void {
  recognizer.sim = kind ? { kind } : null;
  recognizer.onSimChange(!kind ? '' : kind === 'slingshot'
    ? 'Maintenez le clic sur la fourche, tirez en arrière, relâchez pour tirer'
    : 'Touchez deux points pour placer le boost');
}

/** Accumule les deux clics servant de contacts à une zone d’accélération simulée. */
export function simClick(recognizer: GestureRecognizer, p: Vec2): void {
  const sim = recognizer.sim;
  if (!sim || sim.kind !== 'boost') return;
  if (!sim.first) { sim.first = p; recognizer.onSimChange('Cliquez le 2e point du portail'); return; }
  const d = Math.hypot(p.x - sim.first.x, p.y - sim.first.y);
  const mid = { x: (p.x + sim.first.x) / 2, y: (p.y + sim.first.y) / 2 };
  const team = recognizer.armedTeam('boost', mid);
  if (!team) recognizer.onSimChange("Aucune équipe n'a armé de boost (POWER d'abord)");
  else if (d > tuning.boostMaxPx) recognizer.onSimChange('Rapprochez les deux points');
  else { recognizer.controls.gesture('boost', team, sim.first, p); recognizer.onSimChange(''); }
  recognizer.sim = null;
}

/** Construit la fourche et la poche virtuelles pendant la traction à la souris. */
export function updateSimSling(recognizer: GestureRecognizer, c: Contact): void {
  const state = recognizer.state;
  if (!state || !recognizer.simSling) return;
  const anchor = recognizer.simSling.anchor;
  const pouch: Vec2 = { x: c.x, y: c.y };
  const shot = slingshotShot(anchor, pouch, state.params);
  // Virtual anchors either side of the pull axis, so the elastic looks like a Y
  const nx = -shot.dir.y, ny = shot.dir.x;
  recognizer.view.sling = {
    team: recognizer.armedTeam('slingshot', anchor),
    anchors: [
      { x: anchor.x + nx * SIM_FORK_HALF_PX, y: anchor.y + ny * SIM_FORK_HALF_PX },
      { x: anchor.x - nx * SIM_FORK_HALF_PX, y: anchor.y - ny * SIM_FORK_HALF_PX },
    ],
    pouch,
    idle: shot.pull < 4,
    shot,
  };
}

/** Valide la traction simulée puis envoie le même message qu’un geste tactile. */
export function releaseSimSling(recognizer: GestureRecognizer, c: Contact): void {
  const state = recognizer.state;
  const sim = recognizer.simSling;
  recognizer.simSling = null;
  recognizer.view.sling = null;
  if (!state || !sim) return;
  const shot = slingshotShot(sim.anchor, { x: c.x, y: c.y }, state.params);
  if (!shot.valid) {
    recognizer.onSimChange(`Tirez plus en arrière (au moins ${state.params.slingMinPullPx} px)`);
    return; // the simulation stays armed: try again
  }
  const team = recognizer.armedTeam('slingshot', sim.anchor);
  if (team) recognizer.controls.gesture('slingshot', team, sim.anchor, { x: c.x, y: c.y });
  recognizer.sim = null;
  recognizer.onSimChange('');
}
