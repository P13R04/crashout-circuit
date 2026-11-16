/**
 * Vérifie les règles de course, la création, les objets, le tutoriel et les commandes de la console avec un
 * état et une horloge contrôlés.
 * Les scénarios sont enregistrés par les modules de scripts/acceptance/, dans l'ordre d'import ci-dessous,
 * puis exécutés ici. Harnais commun : scripts/acceptance/harness.ts.
 * Liens : server/rules/GameRules.ts, server/PhysicsLoop.ts, server/track/MapGenerator.ts, server/layout.ts,
 * server/geometry.ts et les utilitaires importés par chaque module.
 * Lancé depuis les scripts npm de package.json.
 */
import { queue } from './acceptance/harness.js';
import './acceptance/track/mapGenerator.js';
import './acceptance/track/mapPhase.js';
import './acceptance/race/physics.js';
import './acceptance/tutorial/tutorialLessons.js';
import './acceptance/tutorial/tutorialTable.js';
import './acceptance/tangibles/tangibles.js';
import './acceptance/race/items.js';
import './acceptance/race/abilitiesRepair.js';
import './acceptance/race/testSwitchesBorderPull.js';
import './acceptance/tangibles/ozConsole.js';
import './acceptance/tangibles/ozFastConsole.js';

let passed = 0;
let failed = 0;
for (const item of queue) {
  if (!item.fn) { console.log(item.name); continue; }
  try { await item.fn(); passed++; console.log(`  ✓ ${item.name}`); }
  catch (e) { failed++; console.log(`  ✗ ${item.name}\n      ${(e as Error).message}`); }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
