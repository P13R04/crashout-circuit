/**
 * Vérifie les règles de course, la création, les objets, le tutoriel et les commandes de la console avec un
 * état et une horloge contrôlés.
 * Les scénarios sont enregistrés par les modules de scripts/acceptance/, dans l'ordre d'import ci-dessous,
 * puis exécutés ici. Harnais commun : scripts/acceptance/harness.ts.
 * Liens : server/GameRules.ts, server/PhysicsLoop.ts, server/MapGenerator.ts, server/layout.ts,
 * server/geometry.ts et les utilitaires importés par chaque module.
 * Lancé depuis les scripts npm de package.json.
 */
import { queue } from './acceptance/harness.js';
import './acceptance/mapGenerator.js';
import './acceptance/mapPhase.js';
import './acceptance/physics.js';
import './acceptance/tutorialLessons.js';
import './acceptance/tutorialTable.js';
import './acceptance/tangibles.js';
import './acceptance/items.js';
import './acceptance/abilitiesRepair.js';
import './acceptance/testSwitchesBorderPull.js';
import './acceptance/ozConsole.js';
import './acceptance/ozFastConsole.js';

let passed = 0;
let failed = 0;
for (const item of queue) {
  if (!item.fn) { console.log(item.name); continue; }
  try { await item.fn(); passed++; console.log(`  ✓ ${item.name}`); }
  catch (e) { failed++; console.log(`  ✗ ${item.name}\n      ${(e as Error).message}`); }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
