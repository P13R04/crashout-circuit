/**
 * Harnais commun des scénarios d’acceptation : file des tests, titres de section, banc de règles et horloge simulée.
 * Liens : scripts/acceptance.ts et les modules de scripts/acceptance/.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import type { GameState, Vec2, Phase } from '../../server/types.js';
import { GameRules, createInitialState } from '../../server/rules/GameRules.js';
import type { RulesHost } from '../../server/rules/GameRules.js';
import { PhysicsLoop } from '../../server/PhysicsLoop.js';
import { config } from '../../server/config.js';
import { generatePreset } from '../../server/track/MapGenerator.js';
import { slingshotShot } from '../../server/geometry.js';

export const queue: Array<{ name: string; fn?: () => void | Promise<void> }> = [];
/** Enregistre ou exécute le scénario et l’ajoute au bilan de vérification. */
export function test(name: string, fn: () => void | Promise<void>): void { queue.push({ name, fn }); }
/** Regroupe les scénarios suivants sous un même titre de résultat. */
export function section(name: string): void { queue.push({ name }); }
/** Réunit les règles, la physique et l’horloge du scénario pour les assertions de jeu. */
export interface Rig { state: GameState; rules: GameRules; physics: PhysicsLoop; clock: { now: number }; feedback: string[]; phases: Phase[]; advance(ms: number): void }

/** Prépare l’état, l’horloge et les dépendances contrôlées nécessaires au scénario. */
export function rig(seed = 1): Rig {
  const clock = { now: 1_000_000 };
  const state = createInitialState();
  state.params.difficulty='hard';
  const feedback: string[] = [];
  const phases: Phase[] = [];
  const host: RulesHost = {
    /** Enregistre le retour des règles pour pouvoir vérifier les événements produits. */
    feedback: (kind) => { feedback.push(kind); },
    /** Applique la phase demandée à l’état contrôlé du test. */
    transition: (phase) => { state.phase = phase; phases.push(phase); },
    /** Remplace la diffusion réseau inutile dans ce test de règles locales. */
    broadcastFull: () => {},
  };
  let s = seed;
  /** Produit des tirages reproductibles afin de pouvoir rejouer le même circuit. */
  const rng = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const rules = new GameRules(state, host, /* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ () => clock.now, rng);
  const physics = new PhysicsLoop(state, rules, /* Laisse cette notification sans effet dans le scénario local. */ () => {}, /* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ () => clock.now);
  /** Fait avancer l’horloge et la simulation pendant la durée demandée. */
  const advance = (ms: number) => {
    const dt = 1 / config.physicsHz;
    for (let t = 0; t < ms; t += dt * 1000) { clock.now += dt * 1000; physics.step(clock.now, dt); }
  };
  return { state, rules, physics, clock, feedback, phases, advance };
}

/** Prépare une course sur le circuit prédéfini avec les feux de départ déjà écoulés. */
export function raceRig(): Rig {
  const r = rig();
  r.state.phase = 'RACE';
  r.rules.startRace(generatePreset());
  r.advance(3100);
  return r;
}

/** Ajoute l’horodatage requis à une commande fabriquée par le test. */
export const msg = <T extends object>(o: T) => ({ t: 0, ...o });

/**
 * Place la fourche et la poche pour que la pierre atteigne la cible du scénario.
 * La fourche se situe à range pixels avant la cible et la poche à pull pixels derrière la fourche, dans le sens opposé au tir.
 */
export function aim(target: Vec2, pull: number): { anchor: Vec2; pouch: Vec2 } {
  const { range } = slingshotShot({ x: 0, y: 0 }, { x: -pull, y: 0 }, config);
  const anchor = { x: target.x - range, y: target.y };
  return { anchor, pouch: { x: anchor.x - pull, y: anchor.y } };
}
