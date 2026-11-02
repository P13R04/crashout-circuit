/**
 * Simule plusieurs réglages du lance-pierre pour comparer la fréquence des impacts, les dégâts et le temps
 * passé en panne.
 * Liens : server/GameRules.ts, server/PhysicsLoop.ts, server/geometry.ts, server/config.ts, server/types.ts.
 * Lancé depuis les scripts npm de package.json.
 */
import { createInitialState, GameRules } from '../server/GameRules.js';
import { PhysicsLoop } from '../server/PhysicsLoop.js';
import { config } from '../server/config.js';
import { slingshotShot } from '../server/geometry.js';
import type { Team, Vec2, Difficulty } from '../server/types.js';

const TEAMS: Team[] = ['A', 'B'];
const RACE_S = 600;

/** Décrit les profils de joueurs simulés qui maintiennent leurs trajectoires pendant la mesure. */
const PLAYERS = {
  /** From the item being held to the shot (POWER, find the target, pull). */
  aimDelayS: 1.5,
  /** From a breakdown to the copilot putting a finger on the repair pad. */
  repairReactionS: 1.5,
  /** From picking up a boost to having used it (it frees the stock). */
  boostUseS: 2,
};

/** Décrit les réglages de dégâts et de rythme du lance-pierre comparés par la simulation. */
interface Variant { name: string; dmgStone: number; stunStoneS: number; pickupRespawnS: number }
/** Décrit la fréquence de tir, la précision et les autres paramètres d’un profil simulé. */
interface Skill { name: string; aimErrorPx: number }

/** Énumère les combinaisons de réglages à comparer avec les mêmes scénarios. */
const VARIANTS: Variant[] = [
  { name: 'actuel      (100 PV, 1 s, 15 s)', dmgStone: 100, stunStoneS: 1, pickupRespawnS: 15 },
  { name: 'dégâts 60   ( 60 PV, 1 s, 15 s)', dmgStone: 60, stunStoneS: 1, pickupRespawnS: 15 },
  { name: 'dégâts 50   ( 50 PV, 1.5 s, 15 s)', dmgStone: 50, stunStoneS: 1.5, pickupRespawnS: 15 },
  { name: 'dégâts 40   ( 40 PV, 1.5 s, 20 s)', dmgStone: 40, stunStoneS: 1.5, pickupRespawnS: 20 },
];
/** Énumère les profils de joueurs utilisés pour faire varier la précision des simulations. */
const SKILLS: Skill[] = [
  { name: 'tir parfait', aimErrorPx: 0 },
  { name: 'tir correct (±50 px)', aimErrorPx: 50 },
];

/** Construit un générateur reproductible à partir de la graine du scénario. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return /* Produit le prochain tirage de la séquence déterministe de simulation. */ () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

/** Regroupe les mesures de tirs, d’impacts, de pannes et de progression d’une simulation. */
interface Result {
  stonesPerMin: number;
  hitsPerMin: number;
  /** Mean time between a hit and the car driving again, in seconds. */
  outPerHitS: number;
  /** Share of the race a car is out of play, averaged over both cars. */
  outShare: number;
  /** Cars that were broken by a stone, per minute. */
  breaksPerMin: number;
  lapsA: number;
  lapsB: number;
}

/** Exécute une session d’équilibrage avec les paramètres et la graine demandés. */
function simulate(v: Variant, skill: Skill, difficulty: Difficulty, seed: number): Result {
  Object.assign(config, { dmgStone: v.dmgStone, stunStoneS: v.stunStoneS, pickupRespawnS: v.pickupRespawnS });
  const state = createInitialState();
  const clock = { now: 1_000_000 };
  state.params.difficulty = difficulty;
  const rng = makeRng(seed);
  let stones = 0, hits = 0, breaks = 0;
  const rules = new GameRules(state, {
    /** Applique la phase demandée à l’état contrôlé du test. */
    transition: phase => { state.phase = phase; },
    /** Remplace la diffusion réseau inutile dans ce test de règles locales. */
    broadcastFull() {},
    /** Enregistre le retour des règles pour pouvoir vérifier les événements produits. */
    feedback: kind => {
      if (kind === 'stoneWarning') stones++;
      else if (kind === 'stoneHit') hits++;
      else if (kind === 'carDisabled') breaks++;
    },
  }, /* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ () => clock.now, rng);
  const physics = new PhysicsLoop(state, rules, /* Laisse cette notification sans effet dans le scénario local. */ () => {}, /* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ () => clock.now);
  rules.startTangibleTest();
  rules.beginRace();

  const stepMs = 1000 / 60;
  /** Produit une erreur de visée gaussienne pour simuler les gestes des joueurs. */
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const heldSince: Record<Team, number> = { A: 0, B: 0 };
  const brokenSince: Record<Team, number> = { A: 0, B: 0 };
  const outSteps: Record<Team, number> = { A: 0, B: 0 };
  let raceSteps = 0;

  for (let i = 0; i < RACE_S * 60; i++) {
    clock.now += stepMs;
    physics.step(clock.now, 1 / 60);
    if (state.phase !== 'RACE' || clock.now < state.sessionStartAt + 5000) continue;
    raceSteps++;
    for (const team of TEAMS) {
      const car = state.cars[team], foe = state.cars[team === 'A' ? 'B' : 'A'];
      const out = car.disabled || car.stunUntil > clock.now || car.respawnUntil > clock.now;
      if (out) outSteps[team]++;

      // Copilot: repair pad
      // Players only repair a broken car: a wounded one keeps racing.
      const needsRepair = car.disabled;
      if (needsRepair && !brokenSince[team]) brokenSince[team] = clock.now;
      if (!needsRepair) brokenSince[team] = 0;
      const wantPad = needsRepair && clock.now - brokenSince[team] >= PLAYERS.repairReactionS * 1000;
      if (state.repairPads[`${team}-copilot`].held !== wantPad) {
        rules.onPadHold({ type: 'PadHold', t: 0, team, role: 'copilot', on: wantPad });
      }

      // Copilot: items
      if (car.heldItem === null) { heldSince[team] = 0; continue; }
      if (!heldSince[team]) heldSince[team] = clock.now;
      const held = (clock.now - heldSince[team]) / 1000;
      if (car.heldItem === 'boost') {
        if (held >= PLAYERS.boostUseS) { car.heldItem = null; car.itemArmed = false; }
        continue;
      }
      if (held < PLAYERS.aimDelayS || car.disabled || foe.disabled || foe.respawnUntil > clock.now) continue;
      if (!car.itemArmed) { rules.onPower(team); if (!car.itemArmed) continue; }
      // Aim where the opposing car will be when the stone lands.
      const lead = config.stoneTelegraphS;
      const target: Vec2 = {
        x: foe.pos.x + foe.velocity.x * lead + gauss() * skill.aimErrorPx,
        y: foe.pos.y + foe.velocity.y * lead + gauss() * skill.aimErrorPx,
      };
      const pull = 120;
      const { range } = slingshotShot({ x: 0, y: 0 }, { x: -pull, y: 0 }, config);
      const anchor = { x: target.x - range, y: target.y };
      rules.onSlingshot({ type: 'Slingshot', t: 0, team, anchor, pouch: { x: anchor.x - pull, y: anchor.y } });
      heldSince[team] = 0;
    }
  }

  const minutes = RACE_S / 60;
  const outTotal = outSteps.A + outSteps.B;
  return {
    stonesPerMin: stones / minutes,
    hitsPerMin: hits / minutes,
    // Out-of-play time of both cars, divided by the hits that caused it (stone hits
    // are the only damage source in this scenario: nobody places a wall or an arc).
    outPerHitS: hits ? (outTotal / 60) / hits : 0,
    outShare: outTotal / (2 * raceSteps),
    breaksPerMin: breaks / minutes,
    lapsA: state.cars.A.lap,
    lapsB: state.cars.B.lap,
  };
}

/** Formate une proportion en pourcentage lisible dans le bilan. */
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const initial = { ...config };

for (const difficulty of ['easy', 'hard'] as Difficulty[]) {
  console.log(`\n=== Difficulté ${difficulty} · course de ${RACE_S / 60} min · moyenne de 3 graines ===`);
  for (const skill of SKILLS) {
    console.log(`\n  ${skill.name}`);
    console.log('  réglage                              tirs/min  touches/min  pannes/min  hors-jeu/touche  temps hors-jeu  tours A/B');
    for (const v of VARIANTS) {
      const runs = [1, 2, 3].map(/* Répète le même réglage avec plusieurs graines pour limiter l’effet d’une seule session. */ seed => simulate(v, skill, difficulty, seed));
      /** Calcule la moyenne d’une mesure sur les simulations effectuées. */
      const avg = (f: (r: Result) => number) => runs.reduce(/* Additionne la mesure extraite de chaque simulation. */ (a, r) => a + f(r), 0) / runs.length;
      console.log(
        `  ${v.name.padEnd(36)} ${avg(/* Extrait la fréquence des tirs pour le bilan moyen. */ r => r.stonesPerMin).toFixed(1).padStart(7)}  ${avg(/* Extrait la fréquence des impacts pour le bilan moyen. */ r => r.hitsPerMin).toFixed(1).padStart(11)}  `
        + `${avg(/* Extrait la fréquence des pannes pour le bilan moyen. */ r => r.breaksPerMin).toFixed(1).padStart(10)}  ${(avg(/* Extrait le temps d’immobilisation par impact pour le bilan moyen. */ r => r.outPerHitS).toFixed(1) + ' s').padStart(15)}  `
        + `${pct(avg(/* Extrait la part de session passée hors de course. */ r => r.outShare)).padStart(13)}  ${avg(/* Extrait les tours cyan pour comparer la progression des équipes. */ r => r.lapsA).toFixed(1)}/${avg(/* Extrait les tours roses pour comparer la progression des équipes. */ r => r.lapsB).toFixed(1)}`,
      );
    }
  }
}
Object.assign(config, initial);
