/**
 * Vérifie les règles de course, la création, les objets, le tutoriel et les commandes de la console avec un
 * état et une horloge contrôlés.
 * Liens : server/GameRules.ts, server/PhysicsLoop.ts, server/MapGenerator.ts, server/layout.ts,
 * server/geometry.ts et les utilitaires importés ci-dessous.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import { OzMap } from '../client-oz/OzMap.js';
import { OzController, ozShortcut } from '../client-oz/OzController.js';
import { viewTransform, viewToWorld, worldToView } from '../client-oz/ozView.js';
import { rotateWall, wallEndpoints, physicalDimensions, wallContact } from '../client-shared/tangibleGeometry.js';
import type { GameState, Team, Vec2, Phase } from '../server/types.js';
import { GameRules, CAR_RADIUS, createInitialState } from '../server/GameRules.js';
import type { RulesHost } from '../server/GameRules.js';
import { PhysicsLoop } from '../server/PhysicsLoop.js';
import { config } from '../server/config.js';
import { generate, generatePreset, validateGeometry, generationInfo, selfCrossings } from '../server/MapGenerator.js';
import { nearestOnTrack, slingshotShot, isInsideTrackRibbon, clampToTrackRibbon } from '../server/geometry.js';
import { mock } from 'node:test';
import { GestureRecognizer } from '../client-table/GestureRecognizer.js';
import { createView } from '../client-table/view.js';
import { panelOf, localToWorld, chargeZoneTeam, nearestStationTeam, rotationTowardsTeam, CHARGE_ZONE_LOCAL, PLAY_AREA, depotPose } from '../server/layout.js';
import { TRACK_PRESENTATION_MS } from '../server/trackPresentation.js';
import { START_TUTORIAL_BUTTON } from '../client-table/Renderer.js';
import { TUTORIAL_END_BUTTON, tutorialSkipCenter } from '../client-table/TutorialOverlay.js';

const queue: Array<{ name: string; fn?: () => void | Promise<void> }> = [];
/** Enregistre ou exécute le scénario et l’ajoute au bilan de vérification. */
function test(name: string, fn: () => void | Promise<void>): void { queue.push({ name, fn }); }
/** Regroupe les scénarios suivants sous un même titre de résultat. */
function section(name: string): void { queue.push({ name }); }

// ─── Harness ─────────────────────────────────────────────────────────────────

/** Réunit les règles, la physique et l’horloge du scénario pour les assertions de jeu. */
interface Rig { state: GameState; rules: GameRules; physics: PhysicsLoop; clock: { now: number }; feedback: string[]; phases: Phase[]; advance(ms: number): void }

/** Prépare l’état, l’horloge et les dépendances contrôlées nécessaires au scénario. */
function rig(seed = 1): Rig {
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
function raceRig(): Rig {
  const r = rig();
  r.state.phase = 'RACE';
  r.rules.startRace(generatePreset());
  r.advance(3100);
  return r;
}

/** Ajoute l’horodatage requis à une commande fabriquée par le test. */
const msg = <T extends object>(o: T) => ({ t: 0, ...o });

/**
 * Place la fourche et la poche pour que la pierre atteigne la cible du scénario.
 * La fourche se situe à range pixels avant la cible et la poche à pull pixels derrière la fourche, dans le sens opposé au tir.
 */
function aim(target: Vec2, pull: number): { anchor: Vec2; pouch: Vec2 } {
  const { range } = slingshotShot({ x: 0, y: 0 }, { x: -pull, y: 0 }, config);
  const anchor = { x: target.x - range, y: target.y };
  return { anchor, pouch: { x: anchor.x - pull, y: anchor.y } };
}

/** Construit un tracé variable mais reproductible entre les deux raccords. */
function randomStroke(p1: Vec2, p2: Vec2, rnd: () => number): Vec2[] {
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  const off = (rnd() * 2 - 1) * 0.5 * len;
  const c = { x: mx - (dy / len) * off, y: my + (dx / len) * off };
  const pts: Vec2[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    pts.push({
      x: (1 - t) ** 2 * p1.x + 2 * (1 - t) * t * c.x + t * t * p2.x + (rnd() - 0.5) * 6,
      y: (1 - t) ** 2 * p1.y + 2 * (1 - t) * t * c.y + t * t * p2.y + (rnd() - 0.5) * 6,
    });
  }
  return pts;
}

// ─── T-01 ────────────────────────────────────────────────────────────────────

section('T-01 · MapGenerator');
/** Vérifie la validité et le temps de génération de cent paires de tracés aléatoires. */
test('100 random stroke pairs → valid circuit, no self-intersection, each < 3 s', () => {
  let s = 42;
  /** Produit le prochain tirage de la séquence déterministe du scénario. */
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  let worst = 0;
  const methods: Record<string, number> = {};
  for (let i = 0; i < 100; i++) {
    /** Ajoute une variation aléatoire bornée aux coordonnées du dessin de test. */
    const j = () => (rnd() * 2 - 1) * 150;
    const A1 = { x: 520 + j(), y: 400 + j() * 0.5 }, A2 = { x: 1400 + j(), y: 680 + j() * 0.5 };
    const B1 = { x: 1400 + j(), y: 400 + j() * 0.5 }, B2 = { x: 520 + j(), y: 680 + j() * 0.5 };
    const t0 = performance.now();
    const geo = generate(randomStroke(A1, A2, rnd), randomStroke(B1, B2, rnd), A1, A2, B1, B2);
    worst = Math.max(worst, performance.now() - t0);
    methods[generationInfo.method] = (methods[generationInfo.method] ?? 0) + 1;
    assert.ok(validateGeometry(geo), `generation ${i} produced an invalid circuit`);
    assert.equal(geo.centerline.length, 256);
    assert.equal(geo.checkpoints.length, 8);
    assert.equal(geo.pickupPositions.length, 4);
    assert.equal(geo.startPositions.length, 2);
    for (const w of geo.widths) assert.ok(w >= 90 && w <= 170, `width ${w}`);
    assert.equal(geo.outerEdge.length, 256);
    assert.equal(geo.innerEdge.length, 256);
    // Free of the corner HUD panels (R-22)
    for (const p of geo.outerEdge.concat(geo.innerEdge)) assert.ok(p.y > PLAY_AREA.y0 - 85 && p.y < PLAY_AREA.y1 + 85, `edge y=${p.y}`);
  }
  assert.ok(worst < 3000, `worst generation ${worst.toFixed(0)} ms`);
  console.log(`      worst case ${worst.toFixed(0)} ms; strategies: ${JSON.stringify(methods)}`);
});

/** Construit un demi-tracé bombé servant de circuit de référence. */
function bulge(a: Vec2, b: Vec2, amp: number, n = 60): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + amp * Math.sin(Math.PI * t) });
  }
  return out;
}
/** Mesure la distance du point testé à la boucle de référence. */
const distToLoop = (p: Vec2, loop: Vec2[]): number => Math.min(...loop.map(/* Mesure la distance au point de la boucle de référence. */ q => Math.hypot(p.x - q.x, p.y - q.y)));

/** Vérifie que deux petits tracés conservent leur forme sans être remplacés par le circuit prédéfini. */
test('issue #3: two ~100 px half-strokes give a circuit through both halves, not the preset', () => {
  const P1 = { x: 560, y: 540 }, P2 = { x: 1360, y: 540 };
  for (const amp of [60, 100, 150, 220]) {
    const A = bulge(P1, P2, amp), B = bulge(P2, P1, -amp);
    const geo = generate(A, B, P1, P2, P2, P1);
    assert.equal(generationInfo.method, 'closed loop union', `amplitude ${amp}`);
    assert.ok(!geo.preset && validateGeometry(geo), `amplitude ${amp}`);
    // the circuit stays the drawing: a half is only bulged when the loop would otherwise
    // be undrivable, and then no further than needed (never more than the 150 px minimum)
    const ys = geo.centerline.map(/* Extrait la coordonnée à comparer dans la géométrie de référence. */ p => p.y);
    const need = Math.max(amp, 90);
    assert.ok(Math.min(...ys) >= 540 - need - 15 && Math.max(...ys) <= 540 + need + 15,
      `amplitude ${amp}: ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)}`);
    // the middle of each drawn half is still on the circuit
    const apexA = A[30], apexB = B[30];
    const tol = Math.max(0, need - amp) + 25;
    assert.ok(distToLoop(apexA, geo.centerline) <= tol, `amplitude ${amp}: half A ${distToLoop(apexA, geo.centerline).toFixed(0)} px away`);
    assert.ok(distToLoop(apexB, geo.centerline) <= tol, `amplitude ${amp}: half B ${distToLoop(apexB, geo.centerline).toFixed(0)} px away`);
    // the start line is on P1's side
    assert.ok(Math.hypot(geo.startLine.pos.x - P1.x, geo.startLine.pos.y - P1.y) < 160);
  }
});
/** Vérifie la fidélité de la génération sur cent dessins possédant les mêmes raccords. */
test('issue #3: 100 random drawings with shared anchors never fall back to the preset', () => {
  let s = 7;
  /** Produit le prochain tirage de la séquence déterministe du scénario. */
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  for (let i = 0; i < 100; i++) {
    const len = 360 + rnd() * 540, ang = (rnd() - 0.5) * 0.8;
    const c = { x: 760 + rnd() * 400, y: 440 + rnd() * 200 };
    const P1 = { x: c.x - Math.cos(ang) * len / 2, y: c.y - Math.sin(ang) * len / 2 };
    const P2 = { x: c.x + Math.cos(ang) * len / 2, y: c.y + Math.sin(ang) * len / 2 };
    /** Construit un demi-circuit échantillonné dans le repère des deux raccords. */
    const half = (a: Vec2, b: Vec2, amp: number): Vec2[] => {
      const L = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
      return Array.from({ length: 61 }, /* Construit un point du demi-tracé avec une ondulation et un bruit reproductible. */ (_, k) => {
        const t = k / 60, d = amp * Math.sin(Math.PI * t) * (1 + 0.15 * Math.sin(6 * t)) + (rnd() - 0.5) * 4;
        return { x: a.x + (b.x - a.x) * t + nx * d, y: a.y + (b.y - a.y) * t + ny * d };
      });
    };
    const A = half(P1, P2, 70 + rnd() * 170), B = half(P2, P1, 70 + rnd() * 170);
    const geo = generate(A, B, P1, P2, P2, P1);
    assert.equal(generationInfo.method, 'closed loop union', `drawing ${i}`);
    assert.ok(validateGeometry(geo) && !geo.preset, `drawing ${i}`);
  }
});
/** Vérifie qu’un dessin difficile est lissé avant d’envisager un circuit de secours. */
test('issue #3: an undrivable drawing is smoothed, never replaced by the preset', () => {
  const P1 = { x: 560, y: 540 }, P2 = { x: 1360, y: 540 };
  // A: a loop that crosses itself ; B: pinched against the divider in the middle, with a dip across it
  const A = bulge(P1, P2, 170);
  const c = A[30];
  const loop = Array.from({ length: 25 }, /* Construit la petite boucle qui rend volontairement le dessin difficile à conduire. */ (_, k) => {
    const th = (k / 24) * 2 * Math.PI;
    return { x: c.x + 45 * Math.sin(th), y: c.y - 45 * (1 - Math.cos(th)) };
  });
  const strokeA = [...A.slice(0, 30), ...loop, ...A.slice(31)];
  const strokeB = bulge(P2, P1, -170).map(/* Ajoute quelques angles serrés au demi-tracé pour éprouver le lissage. */ (p, i) => (i > 24 && i < 36 ? { x: p.x, y: 540 + (i % 2 ? 6 : -8) } : p));
  const geo = generate(strokeA, strokeB, P1, P2, P2, P1);
  assert.notEqual(generationInfo.method, 'preset');
  assert.ok(!geo.preset && validateGeometry(geo));
  // still the players' circuit: both halves are close to it
  const ds = [...strokeA, ...strokeB].map(/* Mesure l’écart entre chaque point dessiné et la piste conservée. */ p => distToLoop(p, geo.centerline));
  const mean = ds.reduce(/* Additionne les écarts pour calculer la distance moyenne au dessin. */ (a, d) => a + d, 0) / ds.length;
  assert.ok(mean < 60, `mean distance to the drawing ${mean.toFixed(0)} px`);
});
/** Vérifie que les croisements volontaires du dessin restent présents dans la piste générée. */
test('self-crossing drawings: a figure of eight and a loop-de-loop are kept as drawn', () => {
  const P1 = { x: 560, y: 540 }, P2 = { x: 1360, y: 540 };
  /** Construit une portion ondulée pour tester les courbes et les croisements du circuit. */
  const wave = (a: Vec2, b: Vec2, amp: number): Vec2[] =>
    Array.from({ length: 121 }, /* Construit un point échantillonné de la courbe utilisée par le scénario. */ (_, i) => { const t = i / 120; return { x: a.x + (b.x - a.x) * t, y: 540 + amp * Math.sin(2 * Math.PI * t) }; });
  // each half crosses the divider once: the two halves, hooked on P1 and P2, make an 8
  const A = wave(P1, P2, -170), B = wave(P2, P1, -170);
  const r = rig();
  r.rules.enterMap('pc');
  r.rules.onMapDivider(msg({ type: 'MapDivider' as const, a: P1, b: P2 }));
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'A' as Team, pts: A }));
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'B' as Team, pts: B }));
  assert.ok(r.state.mapStrokes.A && r.state.mapStrokes.B, 'strokes crossing the divider are accepted');

  const geo = generate(A, B, P1, P2, P2, P1);
  assert.equal(generationInfo.method, 'closed loop union');
  assert.ok(!geo.preset && validateGeometry(geo));
  const crossings = selfCrossings(geo.centerline);
  assert.equal(crossings.length, 1, 'the circuit crosses itself once');
  assert.ok(crossings[0].sin >= 0.64, 'a clean crossing');
  // fidelity: the circuit is the 8 that was drawn
  const ds = [...A, ...B].map(/* Mesure la fidélité de la piste aux deux tracés avec leurs croisements. */ p => distToLoop(p, geo.centerline));
  assert.ok(ds.reduce(/* Additionne les écarts pour calculer la distance moyenne au dessin. */ (a, d) => a + d, 0) / ds.length < 25);
  // start line and checkpoints stay clear of the junction (the other branch would trigger them)
  for (const cp of [geo.startLine, ...geo.checkpoints]) {
    assert.ok(Math.hypot(cp.pos.x - crossings[0].at.x, cp.pos.y - crossings[0].at.y) > 130, 'checkpoint away from the junction');
  }
  // …and a lap can be completed on it
  const race = rig();
  race.state.phase = 'RACE';
  race.rules.startRace(geo);
  race.advance(3100);
  const car = race.state.cars.A;
  const n = geo.centerline.length;
  const startIdx = nearestOnTrack(geo.startLine.pos, geo).index;
  for (let k = 0; k <= n + 6; k++) {
    const p = geo.centerline[(startIdx - 3 + k + n) % n];
    const prev = { ...car.pos };
    car.pos = { x: p.x, y: p.y };
    race.rules.afterMove('A', prev, race.clock.now);
  }
  assert.equal(car.lap, 1);

  // and a car actually driving it goes through the junction (twice per lap) without falling
  const drive = rig();
  drive.state.phase = 'RACE';
  drive.rules.startRace(geo);
  drive.advance(3100);
  const d = drive.state.cars.A;
  let crossedJunction = 0, wasIn = false;
  for (let step = 0; step < 60 * 40 && d.lap < 1; step++) { // 40 s at most
    const idx = nearestOnTrack(d.pos, geo).index;
    const target = geo.centerline[(idx + 12) % n];
    let err = Math.atan2(target.y - d.pos.y, target.x - d.pos.x) - d.angle;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    drive.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: Math.max(-1, Math.min(1, err * 3)) }));
    drive.advance(1000 / 60);
    const inJ = Math.hypot(d.pos.x - crossings[0].at.x, d.pos.y - crossings[0].at.y) < 60;
    if (inJ && !wasIn) crossedJunction++;
    wasIn = inJ;
    assert.equal(d.disabled, false, `fell off the track at step ${step}`);
  }
  assert.equal(d.lap >= 1, true, 'completed a lap');
  assert.ok(crossedJunction >= 2, `went through the junction ${crossedJunction} times`);
});
/** Vérifie qu’une petite boucle dessinée dans une moitié est conservée et rendue praticable. */
test('self-crossing drawings: a loop drawn in a half is kept (blown up to a drivable size)', () => {
  const P1 = { x: 560, y: 540 }, P2 = { x: 1360, y: 540 };
  const base = bulge(P1, P2, 150, 160);
  // loop-de-loop going away from the divider: prolate trochoid inserted at x ≈ 960
  const at = 80, c0 = base[at];
  const loop = Array.from({ length: 61 }, /* Construit une boucle volontaire dans la moitié du joueur pour vérifier sa conservation. */ (_, k) => {
    const th = -Math.PI + (k / 60) * 2 * Math.PI;
    return { x: c0.x + 20 * th - 60 * Math.sin(th), y: c0.y + 60 * (1 + Math.cos(th)) };
  });
  const A = [...base.slice(0, at - 7), ...loop, ...base.slice(at + 7)];
  const B = bulge(P2, P1, -150, 160);
  const geo = generate(A, B, P1, P2, P2, P1);
  assert.equal(generationInfo.method, 'closed loop union');
  assert.ok(validateGeometry(geo) && !geo.preset);
  assert.ok(selfCrossings(geo.centerline).length >= 1, 'the loop crosses the rest of the track');
  const apex = loop[30];
  assert.ok(distToLoop(apex, geo.centerline) < 90, `the loop is still there (${distToLoop(apex, geo.centerline).toFixed(0)} px from its apex)`);
});
/** Compare la piste au dessin en dehors des deux raccords arrondis. */
test('the circuit is the drawing: ~1 px away from the anchors, only the two tips are rounded', () => {
  let s = 11;
  /** Produit le prochain tirage de la séquence déterministe du scénario. */
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  let farMeans: number[] = [];
  for (let i = 0; i < 60; i++) {
    // drawn inside the play area (outside it, the circuit is moved back in: that is the only change)
    const len = 400 + rnd() * 450, c = { x: 760 + rnd() * 400, y: 500 + rnd() * 80 };
    const room = Math.min(c.y - 305, 775 - c.y);
    const P1 = { x: c.x - len / 2, y: c.y }, P2 = { x: c.x + len / 2, y: c.y };
    const A = bulge(P1, P2, 100 + rnd() * (room - 100)), B = bulge(P2, P1, -(100 + rnd() * (room - 100)));
    const geo = generate(A, B, P1, P2, P2, P1);
    assert.equal(generationInfo.method, 'closed loop union');
    const far = [...A, ...B].filter(/* Écarte les pointes de raccord avant de mesurer la fidélité du reste du dessin. */ p => Math.hypot(p.x - P1.x, p.y - P1.y) > 140 && Math.hypot(p.x - P2.x, p.y - P2.y) > 140);
    const ds = far.map(/* Mesure les écarts du dessin suffisamment loin des raccords arrondis. */ p => distToLoop(p, geo.centerline));
    // (distToLoop uses the 256 vertices: the polyline lies within a few px of them)
    assert.ok(Math.max(...ds) < 14, `drawing ${i}: ${Math.max(...ds).toFixed(0)} px from the circuit`);
    farMeans = farMeans.concat(ds.reduce(/* Additionne les écarts pour calculer la distance moyenne au dessin. */ (a, d) => a + d, 0) / ds.length);
  }
  assert.ok(farMeans.reduce(/* Additionne les erreurs moyennes des dessins de la série. */ (a, d) => a + d, 0) / farMeans.length < 5);
});
/** Vérifie que seul le circuit prédéfini porte l’indicateur de secours. */
test('issue #3: the predefined circuit is flagged, a circuit built on the drawing is not', () => {
  assert.equal(generatePreset().preset, true);
  const fallback = generate([{ x: 0, y: 0 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 5, y: 5 }]);
  assert.equal(fallback.preset, true);
  const P1 = { x: 600, y: 540 }, P2 = { x: 1320, y: 540 };
  assert.equal(generate(bulge(P1, P2, 160), bulge(P2, P1, -160), P1, P2, P2, P1).preset, undefined);
});
/** Vérifie le circuit de secours lorsque les deux tracés sont invalides. */
test('invalid strokes fall back to the preset circuit', () => {
  const geo = generate([{ x: 0, y: 0 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 5, y: 5 }]);
  assert.ok(validateGeometry(geo));
});

// ─── MAP phase protocol ──────────────────────────────────────────────────────

section('MAP phase');
/** Vérifie que les raccords et les deux tracés attendent une validation avant de préparer la course. */
test('two shared divider contacts then two half-strokes wait for confirmation before RACE', () => {
  const r = rig();
  r.state.phase = 'LOBBY';
  r.rules.enterMap();
  assert.equal(r.state.phase, 'MAP');
  assert.equal(r.state.mapTargets, null);
  r.rules.onMapDivider(msg({ type: 'MapDivider' as const, a: { x: 480, y: 540 }, b: { x: 1440, y: 540 } }));
  const t = r.state.mapTargets!;
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'A' as Team, pts: [t.A[0], { x: t.A[0].x + 10, y: t.A[0].y }] }));
  assert.ok(r.feedback.includes('mapWrongEnd'));
  assert.equal(r.state.mapStrokes.A, false);
  const aStroke = [t.A[0], { x: 700, y: 680 }, { x: 1100, y: 760 }, t.A[1]];
  const bStroke = [t.B[0], { x: 1220, y: 390 }, { x: 820, y: 320 }, t.B[1]];
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'A' as Team, pts: aStroke }));
  r.rules.onStrokeDraw(msg({ type: 'StrokeDraw' as const, creator: 'B' as Team, pts: bStroke }));
  assert.equal(r.state.phase, 'MAP', 'players explicitly validate the completed drawing');
  r.rules.onGenerateTrack();
  // generation is asynchronous (Promise)
  return new Promise<void>(/* Attend la génération différée avant d’appliquer les assertions de départ. */ (resolve, reject) => setTimeout(/* Vérifie la piste prête et ses raccords une fois le travail de génération terminé. */ () => {
    try {
      assert.equal(r.state.phase, 'READY');
      assert.ok(r.state.track);
      assert.ok(r.state.trackPresentation);
      r.rules.beginRace();assert.equal(r.state.phase,'READY','finish draw must settle before a race can start');
      r.advance(TRACK_PRESENTATION_MS+150);
      r.rules.beginRace();
      assert.equal(r.state.phase, 'RACE');
      resolve();
    } catch (e) { reject(e); }
  }, 100));
});

/** Vérifie que les raccords trop proches ou hors zone produisent un refus explicite. */
test('issue #3: a refused divider is announced (too short, outside the table area)', () => {
  /** Prépare une création et soumet la paire de raccords que le scénario doit accepter ou refuser. */
  const asks = (a: Vec2, b: Vec2) => {
    const r = rig();
    r.rules.enterMap();
    r.rules.onMapDivider(msg({ type: 'MapDivider' as const, a, b }));
    return r;
  };
  let r = asks({ x: 700, y: 540 }, { x: 900, y: 540 });
  assert.equal(r.state.mapDivider, null);
  assert.deepEqual(r.feedback, ['dividerTooShort']);
  r = asks({ x: 100, y: 100 }, { x: 1000, y: 540 });
  assert.equal(r.state.mapDivider, null);
  assert.deepEqual(r.feedback, ['dividerOutOfZone']);
  r = asks({ x: 600, y: 540 }, { x: 1400, y: 900 });
  assert.deepEqual(r.feedback, ['dividerOutOfZone']);
  r = asks({ x: 600, y: 540 }, { x: 960, y: 540 }); // exactly 360 px
  assert.ok(r.state.mapDivider);
  assert.deepEqual(r.feedback, []);
});

/** Relie un canvas simulé à la reconnaissance pour collecter les commandes de la table. */
function tableClient(mode: 'table' | 'pc') {
  const handlers: Record<string, (e: unknown) => void> = {};
  const canvas = {
    /** Conserve le gestionnaire du navigateur simulé pour pouvoir lui rejouer un événement. */
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn; },
    /** Fournit les dimensions fixes du canvas de test pour convertir les contacts. */
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
    /** Remplace la capture du navigateur, inutile lorsque les événements sont rejoués directement. */
    setPointerCapture: () => {},
  } as unknown as HTMLCanvasElement;
  const view = createView(/* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ () => 0);
  const state = createInitialState();
  state.phase = 'MAP';
  state.mapMode = mode;
  view.state = state;
  const sent: Array<{ type: string } & Record<string, unknown>> = [];
  const gestures = new GestureRecognizer(canvas, view, /* Collecte la commande produite pour la comparer aux résultats attendus. */ m => sent.push(m));
  /** Construit l’événement de pointeur synthétique envoyé à la reconnaissance. */
  const ev = (id: number, p: Vec2, type: string, pointerType = 'touch') => ({ type, pointerId: id, clientX: p.x, clientY: p.y, pointerType, timeStamp: 0, /* Remplace l’annulation de l’événement natif dans le navigateur simulé. */ preventDefault() {} });
  return {
    view, sent, gestures,
    /** Rejoue la pose d’un doigt dans le gestionnaire de contacts du test. */
    down: (id: number, p: Vec2, pointerType?: string) => handlers.pointerdown(ev(id, p, 'pointerdown', pointerType)),
    /** Rejoue le déplacement d’un doigt maintenu dans le scénario. */
    move: (id: number, p: Vec2) => handlers.pointermove(ev(id, p, 'pointermove')),
    /** Rejoue le retrait d’un doigt pour terminer sa commande ou son geste. */
    up: (id: number, p: Vec2) => handlers.pointerup(ev(id, p, 'pointerup')),
    /** Rejoue une interruption système du contact sans la confondre avec un geste confirmé. */
    cancel: (id: number, p: Vec2) => handlers.pointercancel(ev(id, p, 'pointercancel')),
    /** Extrait les commandes de raccord envoyées par la table simulée. */
    dividers: () => sent.filter(/* Isole les poses de raccord pour vérifier le résultat de ce scénario. */ m => m.type === 'MapDivider'),
  };
}
/** Vérifie que le premier raccord survit au retrait du doigt et à une longue attente. */
test('guided MAP: P1 survives a lifted finger and a long wait, on table and PC', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    for (const mode of ['table', 'pc'] as const) {
      const c = tableClient(mode);
      const p1 = { x: 600, y: 540 }, p2 = { x: 1400, y: 540 };
      c.down(1, p1); c.up(1, p1);
      mock.timers.tick(60_000);
      assert.deepEqual(c.view.pendingDivider, [p1]);
      c.down(2, { x: 650, y: 540 }); c.up(2, { x: 650, y: 540 });
      assert.equal(c.dividers().length, 0);
      assert.equal(c.view.mapNotice!.reason, 'tooShort');
      assert.deepEqual(c.view.pendingDivider, [p1], 'refusing P2 preserves P1');
      c.down(3, { x: 60, y: 60 }); c.up(3, { x: 60, y: 60 });
      assert.match(c.view.mapNotice!.text, /zone/);
      assert.deepEqual(c.view.pendingDivider, [p1]);
      c.down(4, p2); c.up(4, p2);
      assert.equal(c.dividers().length, 1);
      assert.deepEqual(c.dividers()[0].a, p1);
      assert.deepEqual(c.dividers()[0].b, p2);
      c.down(5, { x: 1000, y: 500 });
      assert.equal(c.dividers().length, 1, 'extra contacts cannot replace a pending divider');
    }
  } finally { mock.timers.reset(); }
});

/** Vérifie qu’un doigt ayant placé un raccord ne devient pas implicitement un tracé. */
test('guided MAP: held placement contacts never turn into drawing contacts', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const c = tableClient('table');
    const p1 = { x: 600, y: 540 }, p2 = { x: 1400, y: 540 };
    c.down(1, p1); c.down(2, p2);
    assert.equal(c.dividers().length, 1);
    const state = c.view.state!;
    state.mapDivider = [p1, p2];
    state.mapTargets = { A: [p1, p2], B: [p2, p1] };
    c.move(1, { x: 800, y: 740 }); c.up(1, p2); c.up(2, p2);
    assert.equal(c.view.strokes.size, 0);
    assert.equal(c.sent.filter(/* Isole les tracés envoyés pour vérifier le résultat de ce scénario. */ m => m.type === 'StrokeDraw').length, 0);
  } finally { mock.timers.reset(); }
});

/** Vérifie l’ordre des équipes et le rejet des contacts concurrents ou des doublons réseau. */
test('guided MAP: active team keeps both anchors, concurrent fingers and in-flight duplicates are blocked', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    for (const mode of ['table', 'pc'] as const) {
      const c = tableClient(mode);
      const state = c.view.state!;
      const p1 = { x: 600, y: 540 }, p2 = { x: 1400, y: 540 };
      state.mapDivider = [p1, p2]; state.mapTargets = { A: [p1, p2], B: [p2, p1] };
      c.down(1, { x: 1000, y: 540 }); c.up(1, p1);
      assert.equal(c.view.strokes.size, 0, 'a stroke still starts inside a visible anchor');
      assert.match(c.view.mapNotice!.text, /deux points/);
      c.down(1, { x: 600, y: 636 }); c.up(1, p2);
      assert.equal(c.view.strokes.size, 0, 'outside the visible 95 px ring');
      c.down(1, { x: 600, y: 635 });
      c.move(1, { x: 950, y: 740 });
      c.down(2, p1); c.move(2, { x: 900, y: 680 }); c.up(2, p2);
      assert.equal(c.view.strokes.size, 1, 'second finger cannot replace first');
      c.up(1, p2);
      const sent = c.sent.filter(/* Isole les tracés envoyés pour vérifier le résultat de ce scénario. */ m => m.type === 'StrokeDraw');
      assert.equal(sent.length, 1);
      assert.deepEqual((sent[0].pts as Vec2[]).at(-1), p2, 'release position is included');
      c.down(1, p1); c.up(1, p2);
      assert.equal(c.sent.filter(/* Isole les tracés envoyés pour vérifier le résultat de ce scénario. */ m => m.type === 'StrokeDraw').length, 1, 'wait for server validation');
      state.mapStrokes.A = true;
      c.down(1, p1); c.move(1, { x: 950, y: 340 }); c.up(1, p2);
      const last = c.sent.filter(/* Isole les tracés envoyés pour vérifier le résultat de ce scénario. */ m => m.type === 'StrokeDraw').at(-1)!;
      assert.deepEqual((last.pts as Vec2[])[0], p2, 'backwards rose stroke is normalized before sending');
      assert.deepEqual(c.sent.filter(/* Isole les tracés envoyés pour vérifier le résultat de ce scénario. */ m => m.type === 'StrokeDraw').map(/* Extrait l’équipe créatrice des tracés envoyés pour vérifier l’ordre de dessin. */ m => m.creator), ['A', 'B']);
      assert.deepEqual([...c.view.strokes.values()].map(/* Extrait l’équipe des tracés locaux pour vérifier leur séparation. */ s => s.team), ['A', 'B'], 'same mouse id keeps both halves');
    }
  } finally { mock.timers.reset(); }
});

/** Vérifie qu’un tracé interrompu peut être recommencé sans faire avancer l’équipe. */
test('guided MAP: early release and cancellation can be retried without advancing', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const c = tableClient('table');
    const p1 = { x: 600, y: 540 }, p2 = { x: 1400, y: 540 };
    c.view.state!.mapDivider = [p1, p2];
    c.view.state!.mapTargets = { A: [p1, p2], B: [p2, p1] };
    c.down(1, p1); c.move(1, { x: 900, y: 720 }); c.up(1, { x: 1000, y: 700 });
    assert.match(c.view.mapNotice!.text, /Rejoignez l’autre point/);
    assert.ok([...c.view.strokes.values()][0].rejectedAt !== undefined);
    c.down(1, p1); c.move(1, p2); c.cancel(1, p2);
    assert.match(c.view.mapNotice!.text, /interrompu/);
    assert.equal(c.sent.filter(/* Isole les tracés envoyés pour vérifier le résultat de ce scénario. */ m => m.type === 'StrokeDraw').length, 0);
    c.down(1, p1); c.move(1, { x: 900, y: 720 });
    c.gestures.releaseAll();
    c.down(1, p1); c.move(1, { x: 900, y: 720 }); c.up(1, p2);
    assert.equal(c.sent.filter(/* Isole les tracés envoyés pour vérifier le résultat de ce scénario. */ m => m.type === 'StrokeDraw').length, 1, 'retry after lost connection/hidden tab');
  } finally { mock.timers.reset(); }
});

/** Vérifie que commencer par P2 conserve le parcours guidé et l’attribution des équipes. */
test('Baptiste: cyan may start at P2 without changing teams or bypassing the guided sequence', () => {
  mock.timers.enable({ apis: ['setTimeout','setInterval'] });
  try {
    const c=tableClient('table'),p1={x:600,y:540},p2={x:1400,y:540};
    c.view.state!.mapDivider=[p1,p2];c.view.state!.mapTargets={A:[p1,p2],B:[p2,p1]};
    c.down(1,p2);c.move(1,{x:950,y:730});c.up(1,p1);
    const sent=c.sent.filter(/* Isole les tracés envoyés pour vérifier le résultat de ce scénario. */ m=>m.type==='StrokeDraw');assert.equal(sent.length,1);assert.equal(sent[0].creator,'A');
    assert.deepEqual((sent[0].pts as Vec2[])[0],p1);assert.deepEqual((sent[0].pts as Vec2[]).at(-1),p2);
    c.down(2,p2);c.up(2,p1);assert.equal(c.sent.filter(/* Isole les tracés envoyés pour vérifier le résultat de ce scénario. */ m=>m.type==='StrokeDraw').length,1,'no second submission before acknowledgement');
    const r=rig();r.rules.enterMap();r.rules.onMapDivider(msg({type:'MapDivider',a:p1,b:p2}));
    r.rules.onStrokeDraw(msg({type:'StrokeDraw',creator:'A',pts:[p2,{x:950,y:730},p1]}));
    assert.equal(r.state.mapStrokes.A,true);assert.equal(r.state.mapStrokes.B,false);
  } finally {mock.timers.reset();}
});
/** Vérifie que les ramassables suivent la déformation puis reviennent avec la piste, même pendant leur réapparition. */
test('Baptiste: pickups follow a deformation even during their respawn, then return with the road', () => {
  const r=raceRig(),track=r.state.track!,p=r.state.pickups[0],original={...p.pos};
  const index=track.featureIndices.pickups[0],edge=track.outerEdge[index],center=track.centerline[index];
  const dx=edge.x-center.x,dy=edge.y-center.y,len=Math.hypot(dx,dy);
  p.respawnAt=r.clock.now+60_000;const respawn=p.respawnAt;
  r.rules.onBorderPull(msg({type:'BorderPull',team:'A',x:edge.x,y:edge.y,dx:dx/len*70,dy:dy/len*70}));
  r.clock.now+=500;r.rules.updateTrackDeformations(r.clock.now);
  assert.ok(Math.hypot(p.pos.x-original.x,p.pos.y-original.y)>40);
  assert.ok(isInsideTrackRibbon(p.pos,track,25));assert.equal(p.respawnAt,respawn,'moving the road never makes a collected bonus reappear');
  p.respawnAt=r.clock.now;r.rules.expire(r.clock.now);assert.equal(p.respawnAt,0);
  assert.deepEqual(p.pos,track.pickupPositions[0]);
  r.clock.now+=10_000;r.rules.updateTrackDeformations(r.clock.now);r.clock.now+=2000;r.rules.updateTrackDeformations(r.clock.now);
  assert.ok(Math.hypot(p.pos.x-original.x,p.pos.y-original.y)<1e-7);
});
/** Vérifie la marge des bonus par rapport au bord sans modifier la géométrie source. */
test('Baptiste: pickup placement keeps its margin from road edges without mutating the track', () => {
  const track=generatePreset(),index=25,at=track.centerline[index],edge=track.outerEdge[index];
  const outside={x:at.x+(edge.x-at.x)*3,y:at.y+(edge.y-at.y)*3};const before=JSON.stringify(track);
  const safe=clampToTrackRibbon(outside,track,25);
  assert.ok(isInsideTrackRibbon(safe,track,25));assert.equal(JSON.stringify(track),before);
  assert.notDeepEqual(safe,outside);
  assert.deepEqual(clampToTrackRibbon(at,track,25),at);
});

/** Vérifie côté serveur les raccords, l’ordre des demi-tracés et leur verrouillage après validation. */
test('guided MAP: server enforces order, endpoints, locked halves and final confirmation', async () => {
  const r = rig();
  r.rules.enterMap();
  const p1 = { x: 480, y: 540 }, p2 = { x: 1440, y: 540 };
  r.rules.onMapDivider(msg({ type: 'MapDivider', a: p1, b: p2 }));
  const a = [p1, { x: 700, y: 700 }, { x: 1100, y: 740 }, p2];
  const b = [p2, { x: 1200, y: 380 }, { x: 800, y: 340 }, p1];
  /** Soumet le demi-tracé de l’équipe aux règles de génération. */
  const submit = (creator: Team, pts: Vec2[]) => r.rules.onStrokeDraw(msg({ type: 'StrokeDraw', creator, pts }));
  submit('B', b);
  assert.equal(r.feedback.at(-1), 'mapWaitCyan');
  assert.equal(r.state.mapStrokes.B, false);
  submit('A', [{ x: 960, y: 540 }, ...a.slice(1)]);
  assert.equal(r.feedback.at(-1), 'mapWrongStart');
  submit('A', [p1, ...a.slice(1, -1), { x: 1440, y: 636 }]);
  assert.equal(r.feedback.at(-1), 'mapWrongEnd');
  submit('A', [p1, { x: 650, y: 350 }, { x: 800, y: 340 }, { x: 1000, y: 340 }, { x: 1200, y: 350 }, p2]);
  assert.equal(r.feedback.at(-1), 'mapWrongSide');
  assert.equal(r.state.mapStrokes.A, false);
  submit('A', a);
  assert.equal(r.feedback.at(-1), 'mapAccepted');
  assert.equal(r.state.mapStrokes.A, true);
  r.rules.onGenerateTrack();
  await Promise.resolve();
  assert.equal(r.state.phase, 'MAP', 'one accepted half is not enough');
  submit('A', a);
  assert.equal(r.feedback.at(-1), 'mapLocked');
  submit('B', [...b].reverse());
  assert.equal(r.feedback.at(-1), 'mapAccepted');
  assert.deepEqual(r.state.mapStrokes, { A: true, B: true });
  assert.equal(r.state.phase, 'MAP', 'two halves still require confirmation');
  submit('B', b);
  assert.equal(r.feedback.at(-1), 'mapLocked');
  r.rules.onGenerateTrack();
  await Promise.resolve();
  assert.equal(r.state.phase, 'READY');
  r.rules.resetToLobby();
  r.rules.enterMap();
  assert.deepEqual(r.state.mapStrokes, { A: false, B: false });
  assert.equal(r.state.mapDivider, null);
});

// ─── Physics ─────────────────────────────────────────────────────────────────

section('Vehicle & HP');
/** Vérifie la conduite par commande puis la chute réelle hors de la chaussée. */
test('car follows PilotInput then falls when it leaves the ribbon', () => {
  const r = raceRig();
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 0 }));
  r.advance(1500);
  assert.ok(r.state.cars.A.speed > 100, 'accelerates');
  r.advance(10000); // drive straight into the border at some point
  assert.equal(r.state.cars.A.hp, 0);
  assert.equal(r.state.cars.A.disabled, true);
  const hit = nearestOnTrack(r.state.cars.A.pos, r.state.track!);
  assert.ok(hit.distance > hit.halfWidth - 10, 'the car is no longer pushed back inside');
});
/** Vérifie que la commande de direction fait réellement tourner la voiture. */
test('steering turns the car', () => {
  const r = raceRig();
  const a0 = r.state.cars.A.angle;
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 1 }));
  r.advance(500);
  assert.notEqual(r.state.cars.A.angle, a0);
});
/** Vérifie l’indépendance des pilotes et le relâchement d’une commande trop ancienne. */
test('continuous pilot input is isolated per team and stale steering is neutralised', () => {
  const r = raceRig();
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 0.45 }));
  r.rules.onPilotInput('B', msg({ type: 'PilotInput' as const, team: 'B' as Team, throttle: 1, steer: -0.6 }));
  assert.equal(r.rules.inputs.A.steer, 0.45 * config.steerGain);
  assert.equal(r.rules.inputs.B.steer, -0.6 * config.steerGain);
  r.advance(config.pilotInputTimeoutMs + 50);
  assert.equal(r.rules.inputs.A.steer, 0);
  assert.equal(r.rules.inputs.B.steer, 0);
});
/** Compare le gain de direction des commandes clavier et tactiles. */
test('tactile and keyboard steering receive the same configured small turn gain', () => {
  const r = raceRig();
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 1 }));
  r.rules.onPilotInput('B', msg({ type: 'PilotInput' as const, team: 'B' as Team, throttle: 1, steer: 1 }));
  assert.equal(r.rules.inputs.A.steer, config.steerGain);
  assert.equal(r.rules.inputs.B.steer, config.steerGain);
});
/** Vérifie le choix de conduite par équipe avant et pendant une course. */
test('drive mode can be chosen before the race and toggled during the race per team', () => {
  const r = rig();
  assert.equal(r.state.phase, 'LOBBY');
  assert.equal(r.state.driveMode.A, 'auto');
  assert.equal(r.state.driveMode.B, 'auto');

  // Change mode before the race on the READY screen (Team A chooses pedal, Team B stays auto)
  r.state.phase = 'READY';
  r.rules.toggleDriveMode('A');
  assert.equal(r.state.driveMode.A, 'pedal');
  assert.equal(r.state.driveMode.B, 'auto');

  // Launch race and verify the chosen modes are preserved at start
  r.state.phase = 'RACE';
  r.rules.startRace(generatePreset());
  assert.equal(r.state.driveMode.A, 'pedal');
  assert.equal(r.state.driveMode.B, 'auto');
  assert.equal(r.rules.inputs.A.throttle, 0);
  assert.equal(r.rules.inputs.B.throttle, 1);

  // Toggle in race: Team B switches to pedal, Team A switches back to auto
  r.rules.toggleDriveMode('B');
  assert.equal(r.state.driveMode.A, 'pedal');
  assert.equal(r.state.driveMode.B, 'pedal');

  r.rules.toggleDriveMode('A');
  assert.equal(r.state.driveMode.A, 'auto');
  assert.equal(r.state.driveMode.B, 'pedal');
});

/** Vérifie l’ancienne commande qui bascule les deux équipes vers la conduite à pédale. */
test('compatibility drive-mode command switches both cars to held-pedal acceleration', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  r.rules.toggleDriveMode();
  assert.equal(r.state.driveMode.A, 'pedal');
  assert.equal(r.state.driveMode.B, 'pedal');
  car.speed = 100;
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 0, steer: 0 }));
  r.physics.step(r.clock.now += 100, 0.1);
  assert.ok(car.speed < 100 && car.speed > 0, 'released pedal coasts toward a stop');
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 0 }));
  const before = car.speed;
  r.physics.step(r.clock.now += 100, 0.1);
  assert.ok(car.speed > before, 'held pedal accelerates');
  car.speed = config.vMaxFwd;
  r.physics.step(r.clock.now += 100, 0.1);
  assert.equal(car.speed, config.vMaxPedal, 'pedal mode uses its lower maximum speed');
});
/** Vérifie que la pause fige le mouvement sans consommer la durée de course. */
test('pause freezes race motion and resumes without consuming race time', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  r.rules.togglePause();
  assert.equal(r.state.phase, 'PAUSED');
  const before = { ...car.pos };
  const startAt = r.state.sessionStartAt;
  r.advance(1000);
  assert.deepEqual(car.pos, before);
  r.rules.togglePause();
  assert.equal(r.state.phase, 'RACE');
  assert.ok(r.state.sessionStartAt >= startAt + 1000);
});
/** Vérifie que la pause conserve le bonus armé et la durée des obstacles temporaires. */
test('pause preserves the armed gesture window and temporary obstacle lifetimes', () => {
  const r = raceRig(); r.state.cars.A.heldItem = 'boost'; r.rules.onPower('A');
  r.state.walls.push({ id: 'temporary', team: 'A', pos: { x: 900, y: 500 }, angle: 0, lengthPx: 120, disabledUntil: 0, expiresAt: r.clock.now + 8000 });
  const armAt = r.state.cars.A.itemArmExpiry, wallAt = r.state.walls[0].expiresAt!;
  r.rules.togglePause(); r.advance(8000); const duration = r.clock.now - r.state.pausedAt;
  r.rules.togglePause();
  assert.equal(r.state.cars.A.itemArmExpiry, armAt);
  assert.equal(r.state.walls[0].expiresAt, wallAt + duration);
  r.rules.expire(r.clock.now); assert.equal(r.state.cars.A.itemArmed, true);
});
/** Vérifie qu’une pierre reprend au même point de sa trajectoire après une pause. */
test('pause keeps the elastic projectile at the same point of its flight when resumed', () => {
  const r = raceRig(); r.state.cars.A.heldItem = 'slingshot'; r.rules.onPower('A');
  r.rules.onSlingshot(msg({ type: 'Slingshot', team: 'A', ...aim(r.state.cars.B.pos, 120) }));
  r.clock.now += 200;
  const stone = r.state.stones[0];
  /** Calcule l’avancement de la pierre à l’instant contrôlé du test. */
  const fraction = () => (r.clock.now - stone.launchedAt) / (stone.impactAt - stone.launchedAt);
  const before = fraction();
  r.rules.togglePause(); r.advance(3000); r.rules.togglePause();
  assert.ok(Math.abs(fraction() - before) < 1e-9, 'the projectile resumes without jumping forward');
});
/** Vérifie qu’un tour est compté après le passage des checkpoints dans l’ordre. */
test('car can complete a lap by following the centerline (checkpoints in order)', () => {
  const r = raceRig();
  const track = r.state.track!;
  const car = r.state.cars.A;
  // Teleport along the centerline, one sample at a time
  const n = track.centerline.length;
  const startIdx = nearestOnTrack(track.startLine.pos, track).index;
  for (let k = 0; k <= n + 6; k++) {
    const p = track.centerline[(startIdx - 3 + k + n) % n];
    const prev = { ...car.pos };
    car.pos = { x: p.x, y: p.y };
    r.rules.afterMove('A', prev, r.clock.now);
  }
  assert.equal(car.lap, 1);
  assert.equal(car.checkpointIndex, 1);
});
/** Vérifie la fin de course lorsque le nombre de tours demandé est atteint. */
test('victory at lapsToWin → RESULT', () => {
  const r = raceRig();
  r.state.cars.B.lap = config.lapsToWin;
  r.advance(50);
  assert.equal(r.state.phase, 'RESULT');
  assert.equal(r.state.winner, 'B');
});
/** Vérifie que l’expiration du chronomètre donne la victoire à la voiture en tête. */
test('timeout → RESULT, leader wins', () => {
  const r = raceRig();
  r.rules.updateRaceSettings({type:'RaceSettings',t:0,sessionMaxSeconds:60});
  r.state.raceDeadline=r.clock.now-1;
  r.state.cars.A.checkpointIndex = 4;
  r.state.sessionStartAt = r.clock.now - config.sessionMaxSeconds * 1000 - 1;
  r.advance(50);
  assert.equal(r.state.phase, 'RESULT');
  assert.equal(r.state.winner, 'A');
});

// ─── Tutorial (issue #32) ────────────────────────────────────────────────────

section('Tutorial · independent lessons validated by real events');
/** Prépare un tutoriel et identifie les postes avant les exercices de jeu. */
function tutorialRig(mode: 'table' | 'pc' = 'table'): Rig {
  const r = rig();
  r.rules.startTutorial(mode);
  if(mode==='table')for(const team of ['A','B'] as const)for(const role of ['pilot','copilot'] as const){
    r.rules.onPadHold(msg({type:'PadHold' as const,team,role,on:true}));
    r.rules.onPadHold(msg({type:'PadHold' as const,team,role,on:false}));
  }
  r.advance(3100);
  return r;
}
/** Lit la leçon courante de l’équipe pour vérifier son avancement. */
const lesson = (r: Rig, team: Team) => r.state.tutorial!.steps[r.state.tutorial!.teams[team].step];
/** Fait avancer les étapes avec une garde pour atteindre la leçon étudiée sans boucler indéfiniment. */
function skipTo(r: Rig, team: Team, id: string): void {
  for (let guard = 0; lesson(r, team) !== id; guard++) {
    assert.ok(guard < 20, `lesson ${id} not reached`);
    r.rules.tutorialSkip(team);
  }
}
/** Déplace la voiture au point étudié puis applique les contacts des règles de jeu. */
function driveTo(r: Rig, team: Team, to: Vec2): void {
  const car = r.state.cars[team];
  const prev = { ...car.pos };
  car.pos = { x: to.x, y: to.y };
  r.rules.afterMove(team, prev, r.clock.now);
}
/** Envoie une commande pilote à l’équipe pendant l’exercice. */
const pilot = (r: Rig, team: Team, steer: number, throttle = 1) =>
  r.rules.onPilotInput(team, msg({ type: 'PilotInput' as const, team, throttle, steer }));

/** Vérifie les règles sans enjeu du tutoriel sur le circuit prédéfini. */
test('the tutorial is a race on the preset circuit with nothing at stake', () => {
  const r = tutorialRig();
  assert.equal(r.phases.at(-1), 'RACE');
  assert.equal(r.state.track?.preset, true);
  assert.deepEqual(r.state.tutorial!.teams, { A: { step: 1, sub: 0 }, B: { step: 1, sub: 0 } });
  assert.equal(r.state.tutorial!.finished, false);
  assert.equal(r.state.params.armWindowS, 0, 'armed inventory has no deadline, including in the tutorial');
  // the end of a race never interrupts a lesson
  r.state.cars.A.lap = config.lapsToWin;
  r.state.sessionStartAt = r.clock.now - config.sessionMaxSeconds * 1000 - 1;
  r.advance(100);
  assert.equal(r.state.phase, 'RACE');
  assert.equal(r.state.winner, null);
  // hits are shown, they never cost HP; a fall puts the car back on the road
  r.rules.damage(r.state.cars.A, 50, r.clock.now);
  assert.equal(r.state.cars.A.hp, config.hpMax);
  assert.ok(r.feedback.includes('hit'));
  r.rules.fallOffTrack('A', r.clock.now);
  assert.equal(r.state.cars.A.disabled, false);
  assert.ok(r.feedback.includes('fall'));
});

/** Vérifie que les quatre postes doivent se présenter avant les feux communs du tutoriel. */
test('four stations identify their team before the shared countdown, including diagonal copilots', () => {
  const r=rig();r.rules.startTutorial('table');
  const positions=structuredClone({A:r.state.cars.A.pos,B:r.state.cars.B.pos});
  r.advance(5000);assert.deepEqual({A:r.state.cars.A.pos,B:r.state.cars.B.pos},positions);
  pilot(r,'A',-1);pilot(r,'A',1);assert.equal(lesson(r,'A'),'identify');
  pad(r,'A','pilot',true);assert.equal(r.state.tutorial!.teams.A.sub,1);
  pad(r,'A','pilot',false);pad(r,'A','copilot',true);assert.equal(lesson(r,'A'),'steer');
  pilot(r,'A',-1);pilot(r,'A',1);assert.equal(lesson(r,'A'),'steer','steering waits for all four seats');
  pad(r,'B','pilot',true);pad(r,'B','copilot',true);
  assert.equal(r.state.sessionStartAt,r.clock.now+3000);
  r.advance(1000);assert.deepEqual({A:r.state.cars.A.pos,B:r.state.cars.B.pos},positions);
  assert.ok(!r.state.tutorial!.steps.includes('pedal'),'the table does not teach a settings change');
});

/** Vérifie le passage à la course après les deux équipes et le nettoyage complet des aides du tutoriel. */
test('tutorial to race requires both teams, preserves race settings and clears training objects and inputs', () => {
  const r=tutorialRig();r.state.params.lapsToWin=5;r.state.params.sessionMaxSeconds=240;
  r.rules.tutorialRace();assert.equal(r.state.phase,'RACE','cannot bypass an unfinished tutorial');
  for(const team of ['A','B'] as const)for(let i=0;i<20;i++)r.rules.tutorialSkip(team);
  assert.equal(r.state.tutorial!.finished,true);
  r.rules.tutorialRace();assert.equal(r.state.phase,'MAP');assert.equal(r.state.mapMode,'table');
  assert.equal(r.state.tutorial,null);assert.equal(r.state.sessionMode,'race');
  assert.equal(r.state.params.lapsToWin,5);assert.equal(r.state.params.sessionMaxSeconds,240);
  assert.equal(r.state.walls.length+r.state.arcs.length+r.state.boostGates.length+r.state.stones.length,0);
  assert.equal(r.state.tangiblePlacement,null);assert.ok(Object.values(r.state.repairPads).every(/* Vérifie qu’aucun pad maintenu du tutoriel ne survit au passage en course. */ p=>!p.held));
  r.rules.startRace(generatePreset(),true);assert.equal(r.state.phase,'READY');
  r.rules.beginRace();assert.equal(r.state.phase,'RACE');assert.ok(Math.abs(r.state.raceDeadline-r.state.sessionStartAt-240000)<.001);
  r.state.cars.A.lap=5;r.advance(3100);assert.equal(r.state.phase,'RESULT','normal scoring is restored');
});

/** Vérifie que le tutoriel refuse les aides clavier et adapte ses gestes à la souris. */
test('the PC test switches stay off in the tutorial; a mouse gets no two-finger border pull lesson', () => {
  const pc = tutorialRig('pc');
  assert.equal(pc.state.mapMode, 'pc');
  pc.rules.onTestToggle(msg({ type: 'TestToggle' as const, flag: 'allItems' as const, on: true }));
  pc.rules.onTestToggle(msg({ type: 'TestToggle' as const, flag: 'invincible' as const, on: true }));
  assert.deepEqual(pc.state.testMode, { invincible: false, allItems: false });
  assert.ok(!pc.state.tutorial!.steps.includes('borderPull'));
  assert.ok(tutorialRig('table').state.tutorial!.steps.includes('borderPull'));
});

/** Vérifie que seules les deux directions réellement essayées font avancer la bonne équipe. */
test('steer lesson needs both directions, and only the team that steered advances', () => {
  const r = tutorialRig();
  pilot(r, 'A', -0.2);
  assert.equal(lesson(r, 'A'), 'steer', 'a light touch is not a turn');
  pilot(r, 'A', -1);
  assert.equal(r.state.tutorial!.teams.A.sub, 1, 'left done');
  assert.equal(lesson(r, 'A'), 'steer');
  pilot(r, 'A', 1);
  assert.equal(lesson(r, 'A'), 'pickup');
  assert.deepEqual(r.state.tutorial!.teams.B, { step: 1, sub: 0 }, 'the other team is independent');
  assert.ok(r.feedback.includes('tutorialStep'));
});

/** Vérifie que diriger pendant les feux de départ ne valide pas la leçon. */
test('steering during the countdown does not count', () => {
  const r = rig();
  r.rules.startTutorial('table');
  for(const team of ['A','B'] as const)for(const role of ['pilot','copilot'] as const)r.rules.onPadHold(msg({type:'PadHold' as const,team,role,on:true}));
  pilot(r, 'A', -1); pilot(r, 'A', 1);
  assert.equal(lesson(r, 'A'), 'steer');
});

/** Vérifie la leçon clavier de pédale, depuis son activation jusqu’au retour en avance automatique. */
test('PC drive-mode lesson: pedal on, hold the pedal, back to auto; it follows the requested drive mode', () => {
  const r = tutorialRig('pc');
  skipTo(r, 'A', 'pedal');
  pilot(r, 'A', 0, 1);
  assert.equal(r.state.tutorial!.teams.A.sub, 0, 'the pedal does not exist in auto mode');
  r.rules.toggleDriveMode('A');
  assert.equal(r.state.tutorial!.teams.A.sub, 1);
  pilot(r, 'A', 0, 0.2);
  assert.equal(r.state.tutorial!.teams.A.sub, 1, 'a held pedal is needed');
  r.rules.toggleDriveMode('A'); // back too early
  assert.equal(r.state.tutorial!.teams.A.sub, 0);
  r.rules.toggleDriveMode('A');
  pilot(r, 'A', 0, 1);
  assert.equal(r.state.tutorial!.teams.A.sub, 2);
  assert.equal(lesson(r, 'A'), 'pedal');
  r.rules.toggleDriveMode('A');
  assert.equal(lesson(r, 'A'), 'pickup');
  assert.equal(r.state.driveMode.A, 'auto');
  assert.equal(r.state.driveMode.B, 'auto', 'A’s lesson never changes B’s mode');
  assert.equal(lesson(r, 'B'), 'steer');
});

/** Vérifie que les leçons avancent sur leurs vrais événements avec une progression indépendante par équipe. */
test('every lesson is completed by its real event, team B keeps its own pace', () => {
  const r = tutorialRig();
  const A = r.state.cars.A;
  pilot(r, 'A', -1); pilot(r, 'A', 1);

  // Shared pickups keep the same visible kind even when teams learn different bonuses.
  assert.equal(lesson(r, 'A'), 'pickup');
  assert.equal(A.heldItem, null);
  assert.ok(r.state.pickups.every(/* Vérifie que tous les bonus de la leçon sont immédiatement disponibles. */ p => p.respawnAt === 0));
  const slingPickup=r.state.pickups.find(/* Retrouve le ramassable de lance-pierre demandé par la leçon. */ p=>p.kind==='slingshot')!;
  driveTo(r,'A',r.state.pickups.find(/* Retrouve l’accélération à ramasser pour la suite du tutoriel. */ p=>p.kind==='boost')!.pos);
  assert.equal(A.heldItem,null,'the tutorial highlights the bonus for this lesson');
  driveTo(r, 'A', slingPickup.pos);
  assert.equal(A.heldItem, 'slingshot');
  assert.equal(lesson(r, 'A'), 'power');
  r.rules.onPower('B'); // the other team's POWER means nothing here
  assert.equal(lesson(r, 'A'), 'power');
  r.rules.onPower('A');
  assert.equal(lesson(r, 'A'), 'sling');
  assert.equal(A.itemArmExpiry, 0);

  // a short pull keeps the lesson, a real shot completes it and is harmless to the invincible target
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, team: 'A' as Team, ...aim(r.state.cars.B.pos, 10) }));
  assert.equal(lesson(r, 'A'), 'sling');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, team: 'A' as Team, ...aim(r.state.cars.B.pos, 120) }));
  assert.equal(lesson(r, 'A'), 'boostPickup');
  r.advance(config.stoneTelegraphS * 1000 + 100);
  assert.equal(r.state.cars.B.hp, config.hpMax, 'the stone costs nothing in the tutorial');

  // boost: pick up, arm, place a portal, drive through it
  driveTo(r, 'A', r.state.pickups.find(/* Retrouve une accélération disponible pour valider la progression de l’équipe. */ p=>p.kind==='boost')!.pos);
  assert.equal(A.heldItem, 'boost');
  r.rules.onPower('A');
  assert.equal(lesson(r, 'A'), 'boost');
  const at = { ...A.pos };
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: at.x + 60, y: at.y - 100 }, b: { x: at.x + 60, y: at.y + 100 } }));
  assert.equal(lesson(r, 'A'), 'boostCross');
  driveTo(r, 'A', { x: at.x + 120, y: at.y });
  assert.ok(r.feedback.includes('boostHit'));
  assert.equal(lesson(r, 'A'), 'borderPull');

  // border pull
  const track = r.state.track!, edge = track.outerEdge[40], center = track.centerline[40];
  const out = { x: edge.x - center.x, y: edge.y - center.y }, len = Math.hypot(out.x, out.y);
  r.rules.onBorderPull(msg({ type: 'BorderPull' as const, x: edge.x, y: edge.y, dx: out.x / len * 70, dy: out.y / len * 70, team: 'A' as Team }));
  assert.equal(lesson(r, 'A'), 'repair');

  // repair: the server breaks the car, both partners fix it
  assert.equal(A.disabled, true);
  r.rules.onPadHold(msg({ type: 'PadHold' as const, team: 'A' as Team, role: 'pilot' as const, on: true }));
  r.advance(1000);
  assert.equal(lesson(r, 'A'), 'repair', 'one pad is not enough');
  r.rules.onPadHold(msg({ type: 'PadHold' as const, team: 'A' as Team, role: 'copilot' as const, on: true }));
  r.advance(config.repairHoldS * 1000 + 300);
  assert.equal(lesson(r, 'A'), 'wall');
  assert.equal(A.disabled, false);
  assert.equal(A.hp, config.hpMax);

  // Table users place the physical wall; activation alone does not validate the grip.
  assert.equal(r.state.walls.length,0);
  place(r,1,A.pos.x/config.logicalWidth,A.pos.y/config.logicalHeight,0,true);
  r.advance(Math.max(config.invulnAfterHitS*1000,A.invulnUntil-r.clock.now)+100);
  const wall = r.state.walls.find(/* Retrouve le mur réel installé dans le scénario du tutoriel. */ w => w.id === 'wall-1')!;
  assert.equal(wall.team, null, 'physical wall is neutral');
  driveTo(r, 'A', wall.pos);
  assert.equal(lesson(r, 'A'), 'pylon');
  assert.equal(A.hp, config.hpMax);
  r.rules.onTangibleRemoved(msg({type:'TangibleRemoved' as const,id:1}));

  // Handle the two physical pillars before trying their real, neutral electric effect.
  place(r,2,.4,.5);assert.equal(lesson(r,'A'),'pylon','one pillar has a field but no arc');
  place(r,3,.5,.5);assert.equal(lesson(r,'A'),'arc');
  assert.ok(!r.state.arcs.some(/* Repère un arc de démonstration appartenant à l’alternative clavier. */ a=>a.id.startsWith('tut-')),'no virtual obstacle replaces the physical objects');
  r.advance(config.invulnAfterHitS*1000+100);
  const arc=r.state.arcs.find(/* Retrouve l’arc issu des vrais piliers plutôt qu’un obstacle de démonstration. */ a=>!a.id.startsWith('tut-'))!;
  driveTo(r,'A',{x:(arc.pylon1.x+arc.pylon2.x)/2,y:(arc.pylon1.y+arc.pylon2.y)/2});
  assert.equal(lesson(r,'A'),'depot');
  assert.equal(r.state.tutorial!.finished,false,'the end waits for the other team and for the physical objects');
  assert.deepEqual(r.state.tutorial!.teams.B,{step:1,sub:0});
  assert.equal(r.state.phase,'RACE');
});

/** Vérifie les nouvelles poses réelles puis le rangement commun avant la fin du tutoriel. */
test('table handling uses fresh placements, then both teams clear the physical track before continuing', () => {
  const r=tutorialRig();
  place(r,2,.4,.5);place(r,3,.5,.5);
  skipTo(r,'A','pylon');assert.equal(lesson(r,'A'),'pylon','an old arc does not validate handling');
  r.rules.onTangibleControl(msg({type:'TangibleControl' as const,id:2,action:'activate' as const}));
  assert.equal(r.state.tutorial!.teams.A.sub,0,'operator activation does not replace the touch lesson');
  place(r,2,.41,.5);assert.equal(r.state.tutorial!.teams.A.sub,1);
  place(r,3,.51,.5);assert.equal(lesson(r,'A'),'arc');
  r.rules.tutorialSkip('A');assert.equal(lesson(r,'A'),'depot');
  skipTo(r,'B','depot');assert.equal(lesson(r,'B'),'depot');
  for(const id of [1,2] as const)r.rules.onTangibleRemoved(msg({type:'TangibleRemoved' as const,id}));
  assert.equal(r.state.tutorial!.finished,false,'the last real obstacle must also be removed');
  r.rules.onTangibleRemoved(msg({type:'TangibleRemoved' as const,id:3}));
  assert.equal(r.state.tutorial!.finished,true);
});

/** Vérifie qu’un stock armé n’expire pas et qu’une zone inutilisée peut être réessayée. */
test('tutorial stock stays armed indefinitely; a portal nobody crosses can still be retried', () => {
  const r = tutorialRig();
  skipTo(r, 'A', 'sling');
  assert.equal(r.state.cars.A.itemArmed, true);
  r.advance(12_500);
  assert.equal(r.feedback.includes('itemLost'),false);
  assert.equal(lesson(r, 'A'), 'sling');
  assert.equal(r.state.cars.A.heldItem, 'slingshot');
  assert.equal(r.state.cars.A.itemArmed, true);
  r.rules.onPower('A');
  assert.equal(lesson(r, 'A'), 'sling');

  skipTo(r, 'A', 'boost');
  const at = r.state.cars.A.pos;
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: at.x + 300, y: at.y }, b: { x: at.x + 300, y: at.y + 200 } }));
  assert.equal(lesson(r, 'A'), 'boostCross');
  r.advance(config.boostGateLifeS * 1000 + 300);
  assert.equal(lesson(r, 'A'), 'boostPower');
  assert.equal(r.state.cars.A.heldItem, 'boost');
});

/** Vérifie qu’un vol de bonus ne prive pas l’équipe de la suite de son tutoriel. */
test('an armed item stolen by the other team does not leave the lesson without an item', () => {
  const r = tutorialRig();
  skipTo(r, 'A', 'sling');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, team: 'B' as Team, ...aim(r.state.cars.A.pos, 120) }));
  assert.equal(r.state.cars.A.heldItem, null, 'team A stock was used by the other team');
  assert.equal(lesson(r, 'B'), 'steer', 'team B has not reached the slingshot lesson');
  r.advance(100);
  assert.equal(lesson(r, 'A'), 'power', 'item consumed elsewhere: arm it again');
  assert.equal(r.state.cars.A.heldItem, 'slingshot');
});

/** Vérifie le nettoyage des étapes passées et l’attente des deux équipes pour terminer. */
test('skipping: lessons are left clean, a skipped repair puts the car back, the end needs both teams', () => {
  const r = tutorialRig();
  const steps = r.state.tutorial!.steps;
  skipTo(r, 'A', 'repair');
  assert.equal(r.state.cars.A.disabled, true);
  r.rules.tutorialSkip('A'); // repair → wall
  assert.equal(r.state.cars.A.disabled,false);assert.equal(r.state.cars.A.hp,config.hpMax);
  assert.ok(!r.state.walls.some(/* Vérifie qu’aucun mur temporaire de leçon ne subsiste après le nettoyage. */ w=>w.id.startsWith('tut-')),'the table uses physical objects');
  r.rules.tutorialSkip('A'); // wall → pylon
  r.rules.tutorialSkip('A'); // pylon → arc
  r.rules.tutorialSkip('A'); // arc → depot
  r.rules.tutorialSkip('A'); // depot → done
  assert.equal(r.state.tutorial!.teams.A.step, steps.length);
  assert.equal(r.state.tutorial!.finished, false);
  r.rules.tutorialSkip('A'); // nothing left to skip
  assert.equal(r.state.tutorial!.teams.A.step, steps.length);
  for (let i = 0; i < steps.length; i++) r.rules.tutorialSkip('B');
  assert.equal(r.state.tutorial!.finished, true);
  assert.equal(r.state.phase, 'RACE', 'the end screen is the table’s choice, the race is not over');
});

/** Vérifie qu’une étape de bonus passée laisse un stock compatible avec l’exercice suivant. */
test('a skipped item lesson still leaves the team able to continue', () => {
  const r = tutorialRig();
  skipTo(r, 'A', 'pickup');
  r.rules.tutorialSkip('A'); // pickup skipped → POWER with an item in hand
  assert.equal(lesson(r, 'A'), 'power');
  assert.equal(r.state.cars.A.heldItem, 'slingshot');
  r.rules.tutorialSkip('A'); // POWER skipped → armed slingshot
  assert.equal(lesson(r, 'A'), 'sling');
  assert.equal(r.state.cars.A.itemArmed, true);
  skipTo(r, 'A', 'boost'); // portal skipped too → nothing to cross
  r.rules.tutorialSkip('A');
  assert.equal(lesson(r, 'A'), 'borderPull');
});

/** Vérifie le démarrage du tutoriel depuis l’accueil et le retour à une partie normale après réinitialisation. */
test('the tutorial is only started from the lobby and a reset leaves a normal game behind', () => {
  const r = tutorialRig();
  r.rules.startTutorial('pc'); // already running: ignored
  assert.equal(r.state.mapMode, 'table');
  r.rules.tutorialSkip('A');
  r.rules.togglePause();
  r.rules.tutorialSkip('A'); // paused: ignored
  assert.equal(r.state.tutorial!.teams.A.step, 2);
  r.rules.togglePause();
  r.rules.resetToLobby();
  assert.equal(r.state.tutorial, null);
  assert.equal(r.state.params.armWindowS, config.armWindowS);
  assert.equal(r.state.walls.length + r.state.arcs.length, 0);
  r.rules.tutorialSkip('A'); // no tutorial: harmless
  r.rules.startRace(generatePreset());
  assert.equal(r.state.tutorial, null);
  r.state.cars.B.lap = config.lapsToWin;
  r.state.phase = 'RACE';
  r.advance(3100);
  assert.equal(r.state.phase, 'RESULT', 'a normal race ends again');
});

/** Vérifie les boutons tactiles du tutoriel, le passage d’étape par équipe et la création finale de course. */
test('tutorial buttons on the table: lobby entry keeps the table mode even with a mouse, SKIP is per team, the end screen prepares the race', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    /** Renvoie le centre du bouton utilisé pour les contacts du scénario. */
    const centre = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const c = tableClient('table');
    const state = c.view.state!;
    state.phase = 'LOBBY';
    c.down(1, centre(START_TUTORIAL_BUTTON), 'touch'); c.up(1, centre(START_TUTORIAL_BUTTON));
    c.down(2, centre(START_TUTORIAL_BUTTON), 'mouse'); c.up(2, centre(START_TUTORIAL_BUTTON));
    assert.deepEqual(c.sent.map(/* Extrait le type et le mode des commandes de lancement pour les assertions. */ m => [m.type, m.mode]), [['StartTutorial', 'table'], ['StartTutorial', 'table']]);

    state.phase = 'RACE';
    const at = tutorialSkipCenter('A');
    c.down(3, at); c.up(3, at);
    assert.equal(c.sent.filter(/* Isole les passages de leçon pour vérifier le résultat de ce scénario. */ m => m.type === 'TutorialSkip').length, 0, 'no tutorial, no button: the touch is an ordinary one');
    state.tutorial = { steps: ['steer', 'pedal'], teams: { A: { step: 0, sub: 0 }, B: { step: 1, sub: 0 } }, finished: false };
    for (const team of ['A', 'B'] as Team[]) {
      const p = tutorialSkipCenter(team);
      c.down(4, p); c.up(4, p);
    }
    assert.deepEqual(c.sent.filter(/* Isole les passages de leçon pour vérifier le résultat de ce scénario. */ m => m.type === 'TutorialSkip').map(/* Extrait l’équipe des passages d’étape pour vérifier leur attribution. */ m => m.team), ['A', 'B']);
    assert.ok(tutorialSkipCenter('A').y > 540 && tutorialSkipCenter('B').y < 540, 'each banner is on its own side of the table');
    state.tutorial.teams.B.step = 2; // team B has nothing left to skip
    const before = c.sent.length;
    c.down(5, tutorialSkipCenter('B')); c.up(5, tutorialSkipCenter('B'));
    assert.equal(c.sent.slice(before).filter(/* Isole les passages de leçon pour vérifier le résultat de ce scénario. */ m => m.type === 'TutorialSkip').length, 0);
    state.tutorial.finished = true;
    c.down(6, centre(TUTORIAL_END_BUTTON)); c.up(6, centre(TUTORIAL_END_BUTTON));
    assert.equal(c.sent.at(-1)!.type, 'TutorialRace');
  } finally { mock.timers.reset(); }
});

// ─── Pylons: T-03, T-04, T-10 ────────────────────────────────────────────────

section('Tangibles · neutral fixed objects');
/** Initialise l’ancien point d’entrée de rangement utilisé par les tests de compatibilité. */
function charge(r: Rig, id: 1|2|3, team: Team = 'A') {
  r.rules.onTangibleControl(msg({type:'TangibleControl',id,action:'dock',team}));
  r.rules.onTangibleControl(msg({type:'TangibleControl',id,action:'activate'}));
}
/** Pose le tangible avec les coordonnées du scénario en passant par les règles serveur. */
function place(r: Rig, id: 1 | 2 | 3, x = .5, y = .5, angle = 0, active = true) {
  if (!r.state.tangibles[id]) charge(r,id);
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id, x, y, angle, active }));
}
/** Pose un mur sur la trajectoire de la voiture pour étudier son choc. */
function placeBlocking(r: Rig) {
  const p = r.state.cars.A.pos;
  place(r, 1, p.x / config.logicalWidth, p.y / config.logicalHeight);
}
/** Vérifie la pose atomique d’un tangible neutre et l’absence d’effet de POWER sur son activation. */
test('atomic first placement fixes the kind and neutral ownership; POWER has no effect', () => {
  const r = raceRig(); place(r, 1, .4, .5, 20, false);
  assert.equal(r.state.tangibles[1].kind, 'wall');
  assert.equal(r.state.tangibles[1].team, null);
  assert.equal(r.state.walls.length, 0);
  r.rules.onPower('A'); assert.equal(r.state.tangibles[1].active, false);
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'activate' }));
  assert.equal(r.state.walls.length, 1);
  const placed = { ...r.state.tangibles[1] };
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'deactivate' }));
  assert.equal(r.state.walls.length, 0);
  assert.deepEqual(r.state.tangibles[1], { ...placed, active: false });
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'activate' }));
  assert.deepEqual(r.state.tangibles[1], placed);
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'configure', team: 'B', kind: 'pylon' }));
  assert.deepEqual(r.state.tangibles[1], placed, 'legacy configuration cannot change fixed type or neutrality');
});
/** Vérifie les dégâts et le rebond du même mur sur les deux équipes. */
test('T-03 neutral wall damages and bounces both teams', () => {
  for (const team of ['A', 'B'] as const) {
    const r = raceRig(), p = { ...r.state.cars[team].pos };
    place(r, 1, p.x / config.logicalWidth, p.y / config.logicalHeight);
    r.rules.afterMove(team, p, r.clock.now);
    assert.equal(r.state.cars[team].hp, config.hpMax - config.dmgWall);
    r.rules.afterMove(team, p, r.clock.now);
    assert.equal(r.state.cars[team].hp, config.hpMax - config.dmgWall, 'invulnerability still applies');
  }
});
/** Vérifie que les deux piliers forment un arc neutre qui ralentit les deux voitures. */
test('T-04 two fixed pylons form a neutral arc that slows both teams', () => {
  for (const team of ['A', 'B'] as const) {
    const r = raceRig(), car = r.state.cars[team], p = { ...car.pos };
    place(r, 2, (p.x - 100) / config.logicalWidth, p.y / config.logicalHeight);
    assert.equal(r.state.arcs.length, 0);
    place(r, 3, (p.x + 100) / config.logicalWidth, p.y / config.logicalHeight);
    assert.equal(r.state.arcs.length, 1); assert.equal(r.state.walls.length, 0);
    assert.equal(r.state.arcs[0].team, null);
    car.speed = 300; r.rules.afterMove(team, p, r.clock.now);
    assert.equal(car.hp, config.hpMax - config.dmgArc);
    assert.equal(car.speed, 300 * config.arcSlowFactor);
    assert.equal(car.slowUntil, r.clock.now + config.arcSlowS * 1000);
  }
});
/** Vérifie la limite exacte de distance entre les piliers pour former un arc. */
test(`arc includes exactly ${config.arcMaxDistPx} px, breaks beyond range, and unpaired pylons stay pylons`, () => {
  const r = raceRig(); place(r, 2, 600 / 1920, .5); place(r, 3, (600 + config.arcMaxDistPx) / 1920, .5);
  assert.equal(r.state.arcs.length, 1);
  place(r, 3, (600 + config.arcMaxDistPx + 1) / 1920, .5); assert.equal(r.state.arcs.length, 0);
  assert.equal(r.state.walls.length, 0);
  assert.equal(r.state.tangibles[2].kind, 'pylon');
});
/** Vérifie le rangement initial et la réutilisation immédiate des objets sans recharge. */
test('objects start inactive in the neutral depot and can be reused immediately without a copilot charging zone',()=>{
  const r=raceRig();
  for(const id of [1,2,3]){assert.equal(r.state.tangibles[id].status,'parked');assert.equal(r.state.tangibles[id].active,false);}
  for(const team of ['A','B'] as const){const p=panelOf(team,'copilot');assert.equal(chargeZoneTeam({x:p.cx,y:p.cy}),null);}
  place(r,2);assert.equal(r.state.tangibles[2].active,true);assert.equal(r.state.tangibles[2].team,null);
  r.rules.onTangibleRemoved(msg({type:'TangibleRemoved',id:2}));assert.equal(r.state.tangibles[2].status,'parked');
  place(r,2,.6);assert.equal(r.state.tangibles[2].status,'placed');assert.equal(r.state.tangibles[2].active,true);
  r.rules.resetToLobby();assert.deepEqual(r.state.tangibles,{});r.rules.startRace();assert.equal(r.state.walls.length,0);
});

/** Vérifie le rejet des poses invalides et la conservation d’une activation non précisée. */
test('invalid ids, phases, coordinates and activation are ignored; omitted activation is preserved', () => {
  const r = raceRig(); place(r, 2); place(r, 3, .6);
  r.rules.onTangibleRemoved(msg({ type: 'TangibleRemoved', id: 2 })); assert.equal(r.state.arcs.length, 0);
  const before = structuredClone(r.state.tangibles[3]);
  for (const value of [NaN, Infinity, -0.1, 1.1]) place(r, 3, value);
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 4 as 1, x: .5, y: .5, angle: 0, active: true }));
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 3, x: .5, y: .5, angle: 0, active: 'yes' as unknown as boolean }));
  assert.deepEqual(r.state.tangibles[3], before); assert.equal(r.state.tangibles[4], undefined);
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 3, action: 'deactivate' }));
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 3, x: .605, y: .5, angle: 0 }));
  assert.equal(r.state.tangibles[3].active, false);
  r.state.phase = 'RESULT'; place(r, 1); assert.equal(r.state.tangibles[1].status,'parked');
});

section('LEGO scale and recharge');
/** Vérifie la conversion des bases LEGO sur une table de 55 pouces indépendamment de sa résolution. */
test('55-inch active image maps LEGO 10×4 and 4×4 footprints, independent of display resolution', () => {
  const d = physicalDimensions(55);
  assert.ok(Math.abs(d.pxPerMm - 1.577) < .002);
  assert.equal(d.wallLengthPx / d.pxPerMm, 80);
  assert.equal(d.wallWidthPx / d.pxPerMm, 32);
  assert.equal(d.pylonBasePx / d.pxPerMm, 32);
  assert.equal(d.pylonFieldRadiusPx / d.pxPerMm, 42);
  assert.equal(physicalDimensions(55,3840,2160).wallLengthPx, d.wallLengthPx*2);
  assert.ok(Math.abs(physicalDimensions(65).wallWidthPx / d.wallWidthPx - 55/65) < 1e-9);
});
/** Vérifie les extrémités rectangulaires, la frange de tolérance et la sortie d’un contact déjà engagé dans le mur. */
test('rounded wall collision keeps rectangular ends, covers its fringe, and clears embedded cars', () => {
  const center = {x:960,y:540}, p=config;
  const radius=CAR_RADIUS+p.tangibleTolerancePx, hx=p.wallLengthPx/2, hy=p.wallWidthPx/2;
  /** Teste le contact d’une voiture immobile avec le mur aux dimensions physiques choisies. */
  const contact=(x:number,y:number)=>wallContact({x,y},{x,y},center,0,p.wallLengthPx,p.wallWidthPx,radius);
  assert.ok(contact(960,540+hy+radius-.1));
  assert.equal(contact(960,540+hy+radius+.1),null);
  assert.equal(contact(960+hx+radius+.1,540),null,'no exaggerated capsule end');
  assert.equal(contact(960+hx+radius*.8,540+hy+radius*.8),null,'rounded corners do not fill the bounding box');
  const embedded=contact(960,540)!;
  assert.equal(contact(embedded.point.x,embedded.point.y),null,'rebound pushes clear of the whole footprint');
  for(const angle of [0,45,90,175,270]){
    const a=angle*Math.PI/180,n={x:-Math.sin(a),y:Math.cos(a)};
    const from={x:960-n.x*200,y:540-n.y*200},to={x:960+n.x*200,y:540+n.y*200};
    const hit=wallContact(from,to,center,angle,p.wallLengthPx,p.wallWidthPx,radius);
    assert.ok(hit,'swept collision cannot tunnel through a rotated wall');
    assert.equal(wallContact(hit.point,hit.point,center,angle,p.wallLengthPx,p.wallWidthPx,radius),null);
  }
});
/** Vérifie qu’un pilier isolé produit déjà un champ électrique neutre au sol. */
test('a single neutral pillar has an electrical ground field that slows either car', () => {
  for(const team of ['A','B'] as const){
    const r=raceRig(),car=r.state.cars[team],at={...car.pos};
    place(r,2,(at.x+config.pylonFieldRadiusPx-3)/1920,at.y/1080);
    car.speed=200;r.rules.afterMove(team,at,r.clock.now);
    assert.equal(r.state.arcs.length,0);
    assert.equal(car.hp,config.hpMax-config.dmgArc);
    assert.equal(car.speed,200*config.arcSlowFactor);
  }
});
/** Vérifie les déplacements manuels successifs et la désactivation immédiate dans la réserve. */
test('manual repositioning is unlimited and parking disables all effects without charging or cooldown',()=>{
  const r=raceRig();place(r,1);
  for(const x of [.55,.6,.7,.4]){place(r,1,x,.5,30);assert.equal(r.state.tangibles[1].x,x);assert.equal(r.state.tangibles[1].active,true);}
  r.rules.onTangibleMoved(msg({type:'TangibleMoved',id:1,...depotPose(1),active:true}));
  assert.equal(r.state.tangibles[1].status,'parked');assert.equal(r.state.tangibles[1].active,false);assert.equal(r.state.walls.length,0);
  place(r,1,.7,.5,90);assert.equal(r.state.walls.length,1);assert.equal(r.state.tangibles[1].team,null);
});

// ─── Items: T-05, T-06, T-07 ─────────────────────────────────────────────────

section('Items');
/** Vérifie le ramassage avec un stock vide puis la réapparition du bonus après son délai. */
test('pickup: grabbed when stock empty, respawns after 15 s', () => {
  const r = raceRig();
  const pk = r.state.pickups[0];
  const car = r.state.cars.A;
  car.pos = { ...pk.pos };
  r.rules.afterMove('A', pk.pos, r.clock.now);
  assert.equal(car.heldItem, pk.kind);
  assert.ok(pk.respawnAt > r.clock.now);
  car.pos = { ...r.state.pickups[1].pos };
  car.heldItem = 'boost';
  r.rules.afterMove('A', car.pos, r.clock.now);
  assert.equal(car.heldItem, 'boost', 'no second pickup while stock is full');
  r.advance(config.pickupRespawnS * 1000 + 100);
  assert.equal(pk.respawnAt, 0);
});
/** Vérifie que le stock armé reste disponible sans limite jusqu’à un geste valide. */
test('armed inventory survives indefinite delay until a valid gesture consumes it', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  car.heldItem = 'slingshot';
  r.rules.onPower('A');
  assert.equal(car.itemArmed, true);
  r.advance(4900);
  assert.equal(car.itemArmed, true);
  r.clock.now+=3_600_000;r.rules.expire(r.clock.now);
  assert.equal(car.heldItem,'slingshot');assert.equal(car.itemArmed,true);
  assert.equal(r.feedback.includes('itemLost'),false);
  r.rules.onSlingshot(msg({type:'Slingshot',team:'A',...aim({x:900,y:500},120)}));assert.equal(car.heldItem,null);
});
/** Vérifie l’avertissement, les dégâts et l’étourdissement d’une vraie pierre sur les deux couleurs. */
test('T-06 slingshot: 0.8 s telegraph, then a full-HP car loses half its HP and is stunned ("stoneHit" feedback), any car inside the impact; a second stone breaks it', () => {
  const r = raceRig();
  const A = r.state.cars.A, B = r.state.cars.B;
  A.heldItem = 'slingshot';
  r.rules.onPower('A');
  const target = { ...B.pos };
  const shot = aim(target, 120);
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, team: 'A' as Team, ...shot }));
  assert.equal(r.state.stones.length, 1);
  assert.ok(Math.hypot(r.state.stones[0].target.x - target.x, r.state.stones[0].target.y - target.y) < 1, 'lands on the aimed point');
  assert.deepEqual(r.state.stones[0].from, shot.pouch, 'flies from the pouch');
  assert.equal(A.heldItem, null, 'item consumed');
  assert.ok(Math.abs(r.state.stones[0].impactAt - r.clock.now - config.stoneTelegraphS * 1000) < 1);
  r.advance(700);
  assert.equal(B.hp, config.hpMax, 'no damage during the warning');
  // Aim is a point in space: put the moving victim inside the impact radius
  // at the scheduled moment, without conflating this rule test with driving.
  B.pos = { ...target };
  r.clock.now += 200;
  r.rules.updateStones(r.clock.now);
  assert.equal(B.hp, Math.max(0, config.hpMax - config.dmgStone));
  assert.ok(config.dmgStone < config.hpMax && 2 * config.dmgStone >= config.hpMax, 'one stone wounds a full-HP car, two break it');
  assert.equal(B.disabled, false);
  assert.ok(r.feedback.includes('stoneHit'), 'hit feedback for the comic effect');
  assert.ok(Math.abs(B.stunUntil - r.clock.now - config.stunStoneS * 1000) < 1, 'stunned for the configured time');
  assert.equal(A.hp, config.hpMax);
  assert.equal(r.state.stones.length, 0);
  // Once the first impact's stun and invulnerability are over, a second stone breaks the car
  r.clock.now += 3000; B.stunUntil = 0; B.invulnUntil = 0;
  A.heldItem = 'slingshot'; r.rules.onPower('A');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, team: 'A' as Team, ...aim({ ...B.pos }, 120) }));
  r.clock.now += config.stoneTelegraphS * 1000; r.rules.updateStones(r.clock.now);
  assert.equal(B.hp, Math.max(0, config.hpMax - 2 * config.dmgStone));
  assert.equal(B.disabled, true, 'the second stone breaks the car');
});
/** Vérifie qu’un tir sans lance-pierre armé est ignoré. */
test('slingshot without armed slingshot is ignored', () => {
  const r = raceRig();
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, ...aim({ x: 900, y: 500 }, 120) }));
  assert.equal(r.state.stones.length, 0);
});
/** Vérifie qu’une traction trop courte ne tire pas et ne consomme pas le stock. */
test('slingshot: a pull shorter than the minimum does nothing and the item stays armed', () => {
  const r = raceRig();
  const A = r.state.cars.A;
  A.heldItem = 'slingshot';
  r.rules.onPower('A');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 900, y: 500 }, pouch: { x: 900, y: 500 + config.slingMinPullPx - 5 } }));
  assert.equal(r.state.stones.length, 0);
  assert.equal(A.itemArmed, true);
  assert.equal(A.heldItem, 'slingshot');
});
/** Vérifie le sens du tir et l’allongement de sa portée avec la traction. */
test('slingshot: the stone flies opposite to the pull and a longer pull goes farther', () => {
  /** Prépare une pierre armée puis vérifie son arrivée sur la cible du scénario. */
  const land = (pull: number) => {
    const r = raceRig();
    r.state.cars.A.heldItem = 'slingshot';
    r.rules.onPower('A');
    // fork at (900,540), pouch pulled straight down → the stone goes up
    r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 900, y: 700 }, pouch: { x: 900, y: 700 + pull } }));
    return r.state.stones[0].target;
  };
  const short = land(config.slingMinPullPx + 20), long = land(config.slingMaxPullPx);
  assert.equal(Math.round(short.x), 900, 'straight line');
  assert.ok(short.y < 700 && long.y < 700, 'opposite to the pull (up)');
  assert.ok(long.y < short.y, 'longer pull = farther landing');
  assert.ok(long.y >= 0 && long.y <= config.logicalHeight, 'kept inside the table');
});
/** Vérifie que la cible de la pierre reste dans les limites de la table. */
test('slingshot: the landing point is clamped to the table', () => {
  const r = raceRig();
  r.state.cars.A.heldItem = 'slingshot';
  r.rules.onPower('A');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 300, y: 200 }, pouch: { x: 300, y: 200 + config.slingMaxPullPx } }));
  const t = r.state.stones[0].target;
  assert.ok(t.y >= 0 && t.x >= 0 && t.x <= config.logicalWidth);
});
/** Vérifie les dimensions et l’intensité croissante des zones d’accélération. */
test('T-07 longer boost gate → stronger boost and acceleration zone properties', () => {
  /** Prépare une zone d’accélération et déplace la voiture à travers sa surface de test. */
  const crossWith = (len: number) => {
    const r = raceRig();
    const car = r.state.cars.A;
    car.heldItem = 'boost';
    r.rules.onPower('A');
    const c = { x: car.pos.x + 60, y: car.pos.y };
    r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: c.x, y: c.y - len / 2 }, b: { x: c.x, y: c.y + len / 2 } }));
    assert.equal(r.state.boostGates.length, 1);
    const gate = r.state.boostGates[0];
    assert.ok(gate.dir && typeof gate.dir.x === 'number' && typeof gate.dir.y === 'number', 'gate has propulsion direction');
    assert.equal(gate.depth, 60, 'gate has 60px depth acceleration zone');
    assert.equal(gate.createdAt, r.clock.now, 'gate has createdAt timestamp');
    car.speed = 200;
    const prev = { ...car.pos };
    car.pos = { x: c.x + 5, y: c.y };
    r.rules.afterMove('A', prev, r.clock.now);
    assert.equal(car.boostUntil, r.clock.now + config.boostDurationS * 1000, 'boost duration is 2s');
    return car.speed;
  };
  assert.ok(crossWith(400) > crossWith(120), 'k grows with the length');
});
/** Vérifie le déclenchement lors de l’entrée dans toute la surface du corridor d’accélération. */
test('T-07 boost zone triggers when entering the 2D acceleration corridor', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  car.heldItem = 'boost';
  r.rules.onPower('A');
  const c = { x: car.pos.x + 100, y: car.pos.y };
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: c.x, y: c.y - 80 }, b: { x: c.x, y: c.y + 80 } }));
  const gate = r.state.boostGates[0];
  // Car moves into the corridor ahead of AB
  car.speed = 200;
  const prev = { ...car.pos };
  car.pos = { x: c.x + gate.depth! / 2, y: c.y };
  r.rules.afterMove('A', prev, r.clock.now);
  assert.ok(car.boostUntil > r.clock.now, 'car triggered boost by entering the zone');
  assert.ok(car.speed > 200, 'speed increased');
  assert.ok(r.feedback.includes('boostHit'));
});
/** Vérifie qu’une zone d’accélération agit seulement sur la voiture de son équipe. */
test('T-07 boost zone affects allied car only, opponent ignores it', () => {
  const r = raceRig();
  r.state.cars.A.heldItem = 'boost';
  r.rules.onPower('A');
  const c = { x: 500, y: 500 };
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: c.x, y: c.y - 80 }, b: { x: c.x, y: c.y + 80 } }));
  const carB = r.state.cars.B;
  carB.speed = 200;
  const prevB = { x: c.x - 10, y: c.y };
  carB.pos = { x: c.x + 10, y: c.y };
  r.rules.afterMove('B', prevB, r.clock.now);
  assert.equal(carB.boostUntil, 0, 'opponent car does not receive allied boost');
  assert.equal(carB.speed, 200);
});
/** Vérifie la portée maximale des contacts et l’expiration de la zone d’accélération. */
test('boost gate rejects contacts over 400 px apart and expires after 8 s', () => {
  const r = raceRig();
  r.state.cars.A.heldItem = 'boost';
  r.rules.onPower('A');
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: 0, y: 0 }, b: { x: 450, y: 0 } }));
  assert.equal(r.state.boostGates.length, 0);
  assert.ok(r.state.cars.A.itemArmed, 'item stays armed after a rejected gesture');
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, team: 'A' as Team, a: { x: 0, y: 0 }, b: { x: 200, y: 0 } }));
  assert.equal(r.state.boostGates.length, 1);
  r.advance(config.boostGateLifeS * 1000 + 100);
  assert.equal(r.state.boostGates.length, 0);
});
/** Vérifie la réservation d’un seul stock armé et son utilisation possible par l’autre copilote. */
test('only the first stock arms globally; either nearby copilot may use it', () => {
  for (const [team, y] of [['A', 350], ['B', 750]] as const) {
    const r = raceRig();
    for (const t of ['A', 'B'] as Team[]) { r.state.cars[t].heldItem = 'slingshot'; r.rules.onPower(t); }
    r.rules.onSlingshot(msg({ type: 'Slingshot', anchor: { x: 1600, y }, pouch: { x: 1600, y: y + 100 } }));
    assert.equal(r.state.stones[0].team, team);
    assert.equal(r.state.cars.A.heldItem,null);assert.equal(r.state.cars.B.heldItem,'slingshot');assert.equal(r.state.cars.B.itemArmed,false);
  }
});

/** Vérifie la cohérence des postes en diagonale, de l’attribution des gestes et des messages orientés. */
test('diagonal teammates: corners, docking, gesture ownership and feedback orientation agree', () => {
  assert.deepEqual(panelOf('A', 'copilot'), { team: 'A', role: 'copilot', cx: 1760, cy: 90, rot: Math.PI });
  assert.deepEqual(panelOf('B', 'copilot'), { team: 'B', role: 'copilot', cx: 1760, cy: 990, rot: 0 });
  for (const team of ['A', 'B'] as const) {
    const pilot = panelOf(team, 'pilot'), copilot = panelOf(team, 'copilot');
    assert.notEqual(pilot.cy, copilot.cy);
    assert.notEqual(pilot.cx, copilot.cx);
    const zone = localToWorld(copilot, CHARGE_ZONE_LOCAL.x, CHARGE_ZONE_LOCAL.y);
    assert.equal(chargeZoneTeam(zone), null);
    assert.equal(nearestStationTeam(zone), team);
    assert.equal(rotationTowardsTeam(team, zone), copilot.rot);
    assert.equal(rotationTowardsTeam(team, { x: pilot.cx, y: pilot.cy }), pilot.rot);
    const r = raceRig();
    r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'dock', team, kind: 'wall' }));
    assert.equal(r.state.tangibles[1].status,'parked');assert.equal(r.state.tangibles[1].team,null);
  }
});

// ─── Abilities: T-08 ─────────────────────────────────────────────────────────

section('Abilities');
/** Vérifie l’ancienne capacité fantôme et sa durée de recharge. */
test('T-08 ghost: ignores hostile elements for 3 s, then 20 s recharge', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'ghost' as const }));
  assert.ok(car.ghostUntil - r.clock.now === config.ghostS * 1000);
  placeBlocking(r);
  r.rules.afterMove('A', car.pos, r.clock.now);
  assert.equal(car.hp, config.hpMax, 'ghost passes through the wall');
  const readyAt = r.state.cooldowns.A.ghost;
  assert.equal(readyAt - car.ghostUntil, config.ghostCooldownS * 1000);
  r.advance(5000);
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'ghost' as const }));
  assert.ok(car.ghostUntil < r.clock.now, 'cooldown prevents re-activation');
});
/** Vérifie l’ancienne destruction sur les murs neutres et les murs attribués hérités. */
test('destroy: disables a neutral wall but still spares legacy owned walls', () => {
  const r = raceRig(); place(r, 1, .2, .5);
  r.state.walls.push({ id: 'legacy-own', team: 'A', pos: { x: 1500, y: 500 }, angle: 0, lengthPx: 120, disabledUntil: 0 });
  r.rules.onAbility(msg({ type: 'Ability', team: 'A', kind: 'destroy', targetId: 'legacy-own' }));
  assert.equal(r.state.walls.find(/* Retrouve le mur hérité attribué à une équipe pour tester la compatibilité. */ w => w.id === 'legacy-own')!.disabledUntil, 0);
  r.rules.onAbility(msg({ type: 'Ability', team: 'A', kind: 'destroy', targetId: 'wall-1' }));
  const w = r.state.walls.find(/* Retrouve le mur neutre ciblé par l’ancienne capacité. */ x => x.id === 'wall-1')!;
  assert.equal(w.disabledUntil - r.clock.now, config.destroyDisableS * 1000);
  assert.equal(r.state.cooldowns.A.destroy - r.clock.now, config.destroyCooldownS * 1000);
  r.state.cars.A.pos = { ...w.pos }; r.rules.afterMove('A', w.pos, r.clock.now);
  assert.equal(r.state.cars.A.hp, config.hpMax);
});

// ─── Repair: T-09 ────────────────────────────────────────────────────────────

section('Repair');
/** Envoie le maintien ou le relâchement du pad de réparation étudié. */
const pad = (r: Rig, team: Team, role: 'pilot' | 'copilot', on: boolean) =>
  r.rules.onPadHold(msg({ type: 'PadHold' as const, team, role, on }));
/** Vérifie que la réparation demande les deux appuis et recommence dès qu’un partenaire lâche. */
test('T-09 repair needs BOTH pads; releasing one resets the gauge', () => {
  const r = raceRig();
  r.state.cars.A.hp = 0; r.state.cars.A.disabled = true;
  pad(r, 'A', 'pilot', true);
  r.advance(3000);
  assert.equal(r.state.repairProgress.A, 0, 'a single pad does nothing');
  assert.ok(r.state.cars.A.disabled);
  pad(r, 'A', 'copilot', true);
  r.advance(1000);
  assert.ok(r.state.repairProgress.A > 0.4 && r.state.repairProgress.A < 0.6);
  pad(r, 'A', 'pilot', false);
  r.advance(50);
  assert.equal(r.state.repairProgress.A, 0);
  pad(r, 'A', 'pilot', true);
  r.advance(config.repairHoldS * 1000 + 100);
  assert.equal(r.state.cars.A.hp, config.repairHpRestore);
  assert.equal(r.state.cars.A.disabled, false);
});
/** Vérifie la réapparition de la voiture réparée au dernier checkpoint. */
test('repair respawns a disabled car at the last checkpoint', () => {
  const r = raceRig();
  const car = r.state.cars.A;
  car.checkpointIndex = 3;
  car.pos = { x: 5, y: 5 };
  car.hp = 0; car.disabled = true;
  pad(r, 'A', 'pilot', true); pad(r, 'A', 'copilot', true);
  r.advance(config.repairHoldS * 1000 + 100);
  const cp = r.state.track!.checkpoints[2];
  assert.ok(Math.hypot(car.pos.x - cp.pos.x, car.pos.y - cp.pos.y) < 5);
});
/** Vérifie qu’une voiture détruite s’arrête et ignore les commandes du pilote. */
test('HP 0 → car stops and ignores the pilot', () => {
  const r = raceRig();
  r.rules.onPilotInput('A', msg({ type: 'PilotInput' as const, team: 'A' as Team, throttle: 1, steer: 0 }));
  r.advance(1000);
  r.rules.damage(r.state.cars.A, 999, r.clock.now);
  const p = { ...r.state.cars.A.pos };
  r.advance(1000);
  assert.deepEqual(r.state.cars.A.pos, p);
});

// ─── Border pull (C-07) ──────────────────────────────────────────────────────

section('PC test switches');
/** Envoie le réglage d’aide de test que le scénario doit accepter ou ignorer. */
const toggle = (r: Rig, flag: 'invincible' | 'allItems', on: boolean) =>
  r.rules.onTestToggle(msg({ type: 'TestToggle' as const, flag, on }));
/** Vérifie que les aides de test sont ignorées en dehors du mode clavier. */
test('test switches are ignored outside the PC mode', () => {
  const r = raceRig();
  r.state.mapMode = 'table';
  toggle(r, 'invincible', true);
  toggle(r, 'allItems', true);
  assert.deepEqual(r.state.testMode, { invincible: false, allItems: false });
});
/** Vérifie l’invincibilité de test face aux murs, à l’électricité, aux pierres et aux chutes. */
test('invincible: no damage from walls, arcs or stones, and a fall just respawns the car', () => {
  const r = raceRig();
  r.state.mapMode = 'pc';
  toggle(r, 'invincible', true);
  const A = r.state.cars.A;
  placeBlocking(r);
  r.rules.afterMove('A', A.pos, r.clock.now);
  assert.equal(A.hp, config.hpMax, 'wall');
  // stone right on the car
  r.state.cars.B.heldItem = 'slingshot';
  r.rules.onPower('B');
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, team: 'B' as Team, ...aim({ ...A.pos }, 120) }));
  r.advance(config.stoneTelegraphS * 1000 + 100);
  assert.equal(A.hp, config.hpMax, 'stone');
  assert.ok(A.stunUntil <= r.clock.now, 'no stun');
  // leaving the ribbon
  A.checkpointIndex = 3;
  r.rules.fallOffTrack('A', r.clock.now);
  assert.equal(A.disabled, false);
  assert.equal(A.hp, config.hpMax);
  const cp = r.state.track!.checkpoints[2];
  assert.ok(Math.hypot(A.pos.x - cp.pos.x, A.pos.y - cp.pos.y) < 5, 'back on the last checkpoint');
  // and switching it off restores the normal rules
  toggle(r, 'invincible', false);
  r.rules.damage(A, 10, r.clock.now);
  assert.equal(A.hp, config.hpMax - 10);
});
/** Vérifie que les stocks libres de test exigent encore POWER et la réservation du geste. */
test('allItems: free stock still needs POWER and respects the shared reservation', () => {
  const r = raceRig();
  r.state.mapMode = 'pc';
  toggle(r, 'allItems', true);
  r.advance(50);
  const A = r.state.cars.A;
  assert.equal(A.itemArmed,false);r.rules.onPower('A');assert.equal(A.itemArmed,true);
  // a boost gate works although the stocked item is a "slingshot"
  assert.equal(A.heldItem, 'slingshot');
  const c = { x: A.pos.x + 60, y: A.pos.y };
  r.rules.onBoostGate(msg({ type: 'BoostGate' as const, a: { x: c.x, y: c.y - 100 }, b: { x: c.x, y: c.y + 100 } }));
  assert.equal(r.state.boostGates.length, 1);
  r.advance(50);
  assert.equal(A.itemArmed,false,'refill does not auto-arm');r.rules.onPower('A');assert.equal(A.itemArmed,true);
  r.rules.onSlingshot(msg({ type: 'Slingshot' as const, anchor: { x: 900, y: 700 }, pouch: { x: 900, y: 800 } }));
  assert.equal(r.state.stones.length, 1);
  // abilities have no cooldown
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'ghost' as const }));
  assert.equal(r.state.cooldowns.A.ghost, 0);
  r.rules.onAbility(msg({ type: 'Ability' as const, team: 'A' as Team, kind: 'ghost' as const }));
  assert.ok(A.ghostUntil > r.clock.now);
  // switching off: nothing stays armed for free
  toggle(r, 'allItems', false);
  assert.equal(A.itemArmed, false);
});

section('Border pull');
/** Vérifie une déformation locale temporaire sans modification de largeur de chaussée. */
test('BorderPull shifts a local section, then reforms without changing its width', () => {
  const r = raceRig();
  const track = r.state.track!;
  const i = 40;
  const before = track.widths[i];
  const edge = track.outerEdge[i];
  const center = track.centerline[i];
  const outward = { x: edge.x - center.x, y: edge.y - center.y };
  const len = Math.hypot(outward.x, outward.y);
  /** Transmet la commande construite par le scénario au composant étudié. */
  const send = () => r.rules.onBorderPull(msg({ type: 'BorderPull' as const, x: edge.x, y: edge.y, dx: outward.x / len * 70, dy: outward.y / len * 70, team: 'A' as Team }));
  const base = { ...center };
  send();
  r.advance(config.trackDeformRampS * 1000 + 50);
  assert.equal(track.widths[i], before, 'road width is preserved');
  assert.ok(Math.hypot(track.centerline[i].x - base.x, track.centerline[i].y - base.y) > 40, 'centerline shifts');
  assert.equal(r.state.deformations.length, 1);

  // A fresh gesture is immediately accepted and begins easing the previous one home.
  send();
  assert.ok(r.state.deformations.some(/* Repère une déformation entrée dans sa phase de retour. */ d => d.releaseAt !== null), 'previous deformation reforms');
  r.advance((config.trackDeformRelaxS + config.trackDeformRampS + 0.2) * 1000);
  assert.equal(r.state.deformations.length, 1, 'only the latest deformation remains');
  r.advance((config.trackDeformHoldS + config.trackDeformRelaxS + 0.2) * 1000);
  assert.equal(r.state.deformations.length, 0, 'temporary deformation fully reforms');
  assert.ok(Math.hypot(track.centerline[i].x - base.x, track.centerline[i].y - base.y) < 1, 'reference path is restored');
});

// ─── Oz fallback & T-11 replay ───────────────────────────────────────────────

section('Oz console');
/** Vérifie qu’une relecture des poses et activations reproduit le même état tangible. */
test('T-11 replaying atomic placement, activation and removal reproduces tangible state', () => {
  const a = raceRig();
  place(a, 1); place(a, 2);
  a.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 1, x: .505, y: .5, angle: 5 }));
  a.rules.onTangibleRemoved(msg({ type: 'TangibleRemoved', id: 2 }));
  const b = raceRig();
  for (const e of a.rules.tangibleLog) {
    if (e.type === 'TangibleControl') b.rules.onTangibleControl(msg({ type: e.type, id: e.id as 1, action: e.action!, team: e.team, kind: e.kind }));
    else if (e.type === 'TangibleMoved') b.rules.onTangibleMoved(msg({ type: e.type, id: e.id as 1, x: e.x!, y: e.y!, angle: e.angle!, active: e.active }));
    else b.rules.onTangibleRemoved(msg({ type: e.type, id: e.id as 1 }));
  }
  assert.deepEqual(b.state.tangibles, a.state.tangibles);
  assert.deepEqual(b.state.walls, a.state.walls);
});
/** Vérifie que POWER ne peut armer le stock adverse ni renouveler artificiellement son armement. */
test('POWER cannot arm enemy stock, and repeated POWER cannot extend the window', () => {
  const r = raceRig(); r.state.cars.A.heldItem = 'boost';
  r.rules.onPower('B'); assert.equal(r.state.cars.A.itemArmed, false);
  r.rules.onPower('A'); const expiry = r.state.cars.A.itemArmExpiry;
  r.clock.now += 1000; r.rules.onPower('A'); assert.equal(r.state.cars.A.itemArmExpiry, expiry);
});
/** Vérifie qu’un lance-pierre volé consomme seulement son propriétaire et peut toucher les deux voitures. */
test('a stolen slingshot consumes only the owner stock and can hit either colour', () => {
  const r = raceRig(); r.state.cars.A.heldItem = 'slingshot'; r.rules.onPower('A');
  r.state.cars.B.heldItem = 'boost';
  r.rules.onSlingshot(msg({ type: 'Slingshot', team: 'B', ...aim(r.state.cars.A.pos, 120) }));
  assert.equal(r.state.cars.A.heldItem, null); assert.equal(r.state.cars.B.heldItem, 'boost');
  assert.equal(r.state.stones[0].team, 'B');
  r.clock.now += 1000; r.rules.updateStones(r.clock.now);
  assert.equal(r.state.cars.A.hp, Math.max(0, config.hpMax - config.dmgStone));
  assert.equal(r.state.cars.B.hp,Math.max(0, config.hpMax - config.dmgStone),'both starting cars are inside this impact');
  r.rules.onSlingshot(msg({ type: 'Slingshot', team: 'A', ...aim({ x: 900, y: 500 }, 120) }));
  assert.equal(r.state.stones.length, 0, 'same stock cannot be consumed twice');
});
/** Vérifie qu’une accélération volée appartient à l’équipe du geste sans intervention d’Oz. */
test('a stolen boost belongs to the gesturing team without Oz', () => {
  const r = raceRig(); r.state.cars.A.heldItem = 'boost'; r.rules.onPower('A');
  r.rules.onBoostGate(msg({ type: 'BoostGate', team: 'B', a: { x: 1500, y: 700 }, b: { x: 1700, y: 700 } }));
  assert.equal(r.state.boostGates[0].team, 'B'); assert.equal(r.state.cars.A.heldItem, null);
});

section('Wall manipulation');
/** Vérifie la rotation du second point autour du premier en conservant la longueur du mur. */
test('endpoint 2 rotates around a fixed endpoint 1 with constant length through all angles', () => {
  const anchor = { x: 800, y: 500 }, length = config.wallLengthPx;
  for (let degrees = -720; degrees <= 720; degrees += 7) {
    const angle = degrees * Math.PI / 180;
    const pose = rotateWall(anchor, { x: anchor.x + Math.cos(angle) * 300, y: anchor.y + Math.sin(angle) * 300 }, length)!;
    const [a, b] = wallEndpoints(pose, pose.angle, length);
    assert.ok(Math.hypot(a.x - anchor.x, a.y - anchor.y) < 1e-8);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - length) < 1e-8);
  }
  assert.equal(rotateWall(anchor, anchor, length), null, 'zero-length direction is ignored');
});
/** Vérifie le pivot de rotation côté serveur et le rejet des murs sur les commandes. */
test('server preserves the rotation anchor and rejects walls over the table controls', () => {
  const r = raceRig(); charge(r,1);
  const anchor = { x: 700, y: 500 };
  const pose = rotateWall(anchor, { x: 700, y: 900 }, config.wallLengthPx)!;
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 1, x: pose.x / config.logicalWidth, y: pose.y / config.logicalHeight, angle: pose.angle }));
  const [a] = GameRules.wallEnds(r.state.walls[0]);
  assert.ok(Math.hypot(a.x - anchor.x, a.y - anchor.y) < 1e-8);
  const before = { ...r.state.tangibles[1] };
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 1, x: 450 / 1920, y: 990 / 1080, angle: 0 }));
  assert.deepEqual(r.state.tangibles[1], before, 'wall endpoint cannot overlap pilot controls');
});
/** Vérifie que désactiver un pilier coupe son arc et que le réactiver restaure la paire. */
test('deactivating either pillar cuts its arc; reactivation restores the same pair', () => {
  const r = raceRig(); place(r, 2, .45); place(r, 3, .55);
  assert.equal(r.state.arcs.length, 1);
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 2, action: 'deactivate' })); assert.equal(r.state.arcs.length, 0);
  r.rules.onPower('B'); assert.equal(r.state.arcs.length, 0, 'POWER cannot reactivate it');
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 2, action: 'activate' })); assert.equal(r.state.arcs.length, 1);
});

/** Prépare une carte Oz avec un mur et des événements de pointeur simulés. */
function mapRig() {
  const r = raceRig(); place(r, 1);
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 1, x: .5, y: .5, angle: 0 }));
  const listeners = new Map<string, (event: PointerEvent) => void>();
  let draws = 0;
  const context = new Proxy({}, { /* Compte les commandes de dessin émises par le contexte Canvas simulé. */ get: () => /* Compte une commande de dessin émise avant tout nouveau snapshot. */ () => { draws++; } });
  const canvas = { width: 1920, height: 1080, /* Fournit le contexte Canvas de contrôle à la place du dessin réel. */ getContext: () => context,
    /** Fournit les dimensions fixes du canvas de test pour convertir les contacts. */
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    /** Conserve le gestionnaire du navigateur simulé pour pouvoir lui rejouer un événement. */
    addEventListener: (name: string, fn: (event: PointerEvent) => void) => listeners.set(name, fn), /* Remplace la capture du navigateur, inutile lorsque les événements sont rejoués directement. */ setPointerCapture: () => {} } as unknown as HTMLCanvasElement;
  const sent: Array<{ x: number; y: number; angle: number }> = [];
  const map = new OzMap(canvas, { /* Expose à la carte l’autorisation de manipulation fixée ou calculée par le scénario. */ enabled: () => true, /* Fournit l’identifiant de l’objet sélectionné dans la console simulée. */ selectedId: () => 1, /* Fournit le type du tangible attendu par la prévisualisation du test. */ selectedKind: () => 'wall', /* Indique si le scénario prépare une pose ou manipule un objet déjà présent. */ preparing: () => false, /* Fournit l’angle de prévisualisation imposé par le test. */ draftAngle: () => 0, /* Remplace ou collecte la validation de pose selon le contrôleur utilisé par le scénario. */ onPlace: () => false, /* Remplace ou transmet le début du regroupement des modifications d’un geste. */ onDragStart: () => {}, /* Remplace ou transmet la clôture du groupe de modifications du geste. */ onDragEnd: () => {},
    /** Remplace ou transmet le rangement du tangible sans utiliser l’interface HTML. */
    onDock: () => {}, /* Remplace ou transmet la sélection d’objet au contrôleur du scénario. */ onSelect: () => {}, /* Collecte ou transmet la pose provisoire produite par le glissement sur la carte. */ onMove: (_id, x, y, angle) => { sent.push({ x, y, angle }); return true; }, /* Collecte la pose de déplacement avec ses coordonnées normalisées pour vérifier son exactitude. */ onRelocateTangible: (id, pos, angle) => { sent.push({ x: pos.x / 1920, y: pos.y / 1080, angle: angle ?? 0 }); } });
  map.setState(r.state);
  /** Convertit le point étudié puis rejoue l’événement dans la carte Oz. */
  const pointer = (name: string, x: number, y: number, options: Partial<PointerEvent> = {}) => listeners.get(name)!({ pointerId: 1, clientX: x, clientY: y, /* Remplace l’annulation de l’événement natif dans le navigateur simulé. */ preventDefault: () => {}, ...options } as PointerEvent);
  return { map, sent, pointer, state: r.state, /* Renvoie le nombre de commandes de dessin émises par le contexte de test. */ draws: () => draws };
}
/** Vérifie la prévisualisation immédiate du pivot malgré la réception d’un ancien état réseau. */
test('rotation handle previews immediately and keeps its anchor despite older network snapshots', () => {
  const r = mapRig();
  r.pointer('pointerdown', (960+config.wallLengthPx/2)/2, 270); // endpoint 2 of a 120 px logical wall
  const before = r.draws();
  r.pointer('pointermove', 450, 400);
  assert.ok(r.draws() > before, 'draws before receiving a server update');
  r.map.setState(r.state); // old server pose, as can happen during a drag
  r.pointer('pointermove', 350, 270);
  r.pointer('pointerup', 350, 270);
  for (const pose of r.sent) {
    const [anchor] = wallEndpoints({ x: pose.x * 1920, y: pose.y * 1080 }, pose.angle, config.wallLengthPx);
    assert.ok(Math.hypot(anchor.x - (960-config.wallLengthPx/2), anchor.y - 540) < 1e-8);
  }
  assert.ok(r.sent.length >= 2);
});
/** Vérifie le décalage de prise au glissement et l’arrêt des envois après annulation. */
test('dragging the wall body preserves grab offset; cancelled drags stop sending', () => {
  const r = mapRig();
  r.pointer('pointerdown', 475, 270);
  assert.equal(r.sent.length, 0, 'picking an existing wall does not move it');
  r.pointer('pointermove', 485, 280);
  assert.ok(Math.abs(r.sent[0].x - 980 / 1920) < 1e-12); assert.ok(Math.abs(r.sent[0].y - 560 / 1080) < 1e-12);
  r.pointer('pointercancel', 485, 280);
  const count = r.sent.length;
  r.pointer('pointermove', 600, 300); assert.equal(r.sent.length, count);
});
/** Vérifie la tolérance du toucher bref et l’impossibilité pour un second doigt de voler le glissement. */
test('operator touch taps tolerate jitter and a second finger cannot steal the wall drag',()=>{
  const r=mapRig(),touch={pointerType:'touch',isPrimary:true};
  r.pointer('pointerdown',475,270,touch);
  r.pointer('pointermove',481,273,touch);
  r.pointer('pointerup',481,273,touch);
  assert.equal(r.sent.length,0,'a touch tap selects without moving the real wall');
  assert.equal(r.map.hasOperation,true,'pick and drop remains available without a keyboard');
  r.map.cancel();assert.equal(r.map.hasOperation,false);
  r.pointer('pointerdown',475,270,touch);
  r.pointer('pointerdown',350,220,{pointerId:2,pointerType:'touch',isPrimary:false});
  r.pointer('pointermove',600,400,{pointerId:2,pointerType:'touch',isPrimary:false});
  r.pointer('pointercancel',600,400,{pointerId:2,pointerType:'touch',isPrimary:false});
  assert.equal(r.sent.length,0);
  r.pointer('pointermove',500,290,touch);
  assert.equal(r.sent.length,1,'the original finger still owns the movement');
  r.pointer('pointercancel',500,290,touch);
  r.pointer('pointermove',550,330,touch);assert.equal(r.sent.length,1);
});

/** Vérifie qu’un retrait confirmé efface l’aperçu et empêche un déplacement tardif de ressusciter l’objet. */
test('a confirmed removal clears the drag preview and stops movement', () => {
  const r = mapRig(); r.pointer('pointerdown', 475, 270);
  const next = structuredClone(r.state);
  next.tangibles[1].active = false;
  r.map.setState(next);
  r.pointer('pointermove', 485, 280); r.pointer('pointerup', 485, 280);
  assert.equal(r.sent.length, 0, 'an absent object is not moved back onto the map by an older gesture');
});
/** Vérifie le déplacement du mur en deux touches définissant sa position puis son orientation. */
test('moving a wall with pick & drop supports 2-click positioning and orientation', () => {
  const r = mapRig();
  r.pointer('pointerdown', 480, 270); r.pointer('pointerup', 480, 270);
  r.pointer('pointerdown', 250, 250); r.pointer('pointerup', 250, 250);
  assert.equal(r.sent.length, 0, 'waiting for 2nd orientation click');
  r.pointer('pointerdown', 250, 300); r.pointer('pointerup', 250, 300);
  assert.equal(r.sent.length, 1);
  assert.ok(Math.hypot(r.sent[0].x - 500 / 1920, r.sent[0].y - 550 / 1080) < 1e-4);
  assert.equal(Math.round(r.sent[0].angle), 90);
});

section('Fast Oz console');
/** Prépare une console synchronisée avec collecte des commandes et horloge locale contrôlée. */
function operatorRig() {
  const r = raceRig(), sent: Array<{ type: string } & Record<string, unknown>> = [];
  r.state.tangibles[1].angle=0; // This console geometry fixture starts horizontally.
  let time = 0;
  const c = new OzController(/* Collecte la commande de pose du contrôleur sans utiliser de réseau réel. */ (type, params) => { sent.push({ type, ...params }); return true; }, /* Laisse cette notification sans effet dans le scénario local. */ () => {}, /* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ () => time);
  c.setConnected(true); c.applyState(structuredClone(r.state));
  /** Sélectionne l’objet et efface les commandes de préparation avant les assertions du scénario. */
  const ready = (id:1|2|3) => { c.select(id); sent.length=0; };
  return { c, sent, ready, source: r.state, /* Avance l’horloge locale de la console sans attendre le temps réel. */ tick: (ms: number) => { time += ms; } };
}
/** Vérifie la préparation locale et le maintien d’une pose invalide sans envoi au serveur. */
test('preparation and preview rotation are local; invalid placement stays prepared and is not sent', () => {
  const { c, sent, ready } = operatorRig(); ready(1);
  c.prepare(1); c.rotate(15); assert.equal(c.draftAngle, 15); assert.equal(sent.length, 0);
  assert.equal(c.place({ x: .01, y: .01, angle: 15 }), false);
  assert.equal(c.preparing, true); assert.equal(c.canUndo, false); assert.equal(sent.length, 0);
  c.cancelPreparation(); assert.equal(c.preparing, false);
});
/** Vérifie l’activation atomique et les modifications rapides à partir des poses optimistes. */
test('one placement atomically activates; rapid edits and undo use optimistic poses despite old snapshots', () => {
  const { c, sent, source, ready } = operatorRig(); ready(1);
  c.prepare(1); c.place({ x: .4, y: .5, angle: 15 });
  assert.equal(sent.length, 1); assert.equal(sent[0].active, true); assert.equal(c.preparing, false);
  c.applyState(structuredClone(source)); assert.equal(c.state!.tangibles[1].x, .4);
  c.move(1,{ x: .405, y: .5, angle: 15 }); c.undo();
  assert.equal(c.state!.tangibles[1].x, .4); assert.equal(c.state!.tangibles[1].active, true);
  c.undo(); assert.equal(c.state!.tangibles[1].status, 'parked'); assert.equal(c.canUndo, false);
});
/** Vérifie que seule la première pose du premier pilier prépare automatiquement le second. */
test('first pylon prepares the second only on its first placement', () => {
  const { c, ready } = operatorRig(); ready(2); ready(3); c.prepare(2); c.place({ x: .4, y: .5, angle: 0 });
  assert.equal(c.selectedId, 3); assert.equal(c.preparing, true);
  c.place({ x: .4 + (config.arcMaxDistPx - 10) / 1920, y: .5, angle: 0 }); assert.equal(c.preparing, false);
  assert.equal(c.state!.arcs.length, 1, 'arc preview follows optimistic pylons before a network reply');
  c.prepare(2); assert.equal(c.place({ x: .45, y: .5, angle: 0 }),true);
  assert.equal(c.selectedId, 2); assert.equal(c.preparing, false);
});
/** Vérifie la conservation de la pose lors d’un retrait puis d’une restauration. */
test('temporary removal preserves pose and type; restore and undo do not need configuration', () => {
  const { c, sent, ready } = operatorRig(); c.presence(); assert.equal(sent.length, 0); assert.ok(c.notice); ready(1);
  c.prepare(1); c.place({ x: .5, y: .5, angle: 35 }); const before = { ...c.state!.tangibles[1] };
  c.presence(false); assert.deepEqual(c.state!.tangibles[1], { ...before, active: false });
  c.presence(); assert.deepEqual(c.state!.tangibles[1], before);
  c.undo(); assert.equal(c.state!.tangibles[1].active, false);
});
/** Vérifie qu’une rotation ou un glissement répété s’annule comme une seule action. */
test('a repeated keyboard rotation or drag is undone in one action; keyboard rotation preserves center', () => {
  const { c, ready } = operatorRig(); ready(1); c.prepare(1); c.place({ x: .5, y: .5, angle: 0 });
  c.beginGesture(); for (let i = 0; i < 3; i++) c.rotate(5); c.endGesture();
  assert.equal(c.state!.tangibles[1].angle, 15); assert.equal(c.state!.tangibles[1].x, .5);
  c.undo(); assert.equal(c.state!.tangibles[1].angle, 0);
  c.beginGesture(); c.move(1, { x: .505, y: .5, angle: 0 }); c.move(1, { x: .51, y: .5, angle: 0 }); c.endGesture();
  c.undo(); assert.equal(c.state!.tangibles[1].x, .5);
});
/** Vérifie qu’une reconnexion ne rejoue pas les anciennes préparations et modifications. */
test('disconnect cancels preparation and queued previews; reconnect never replays commands', () => {
  const { c, sent, source, ready } = operatorRig(); ready(1); c.prepare(1); c.place({ x: .5, y: .5, angle: 0 }); c.prepare(2);
  const count = sent.length; c.setConnected(false); c.place({ x: .4, y: .5, angle: 0 });
  c.setConnected(true); assert.equal(c.enabled, false, 'wait for the full reconnect snapshot'); c.applyState(structuredClone(source));
  assert.equal(sent.length, count); assert.equal(c.preparing, false); assert.equal(c.state!.tangibles[1].status, 'parked');
  c.prepare(1); c.place({ x: .5, y: .5, angle: 0 }); c.applyState({ ...source, phase: 'LOBBY', tangibles: {} });
  assert.equal(c.canUndo, false); assert.equal(c.preparing, false); assert.equal(c.enabled, false);
});
/** Vérifie la réconciliation des aperçus avec les états confirmés ou rejetés. */
test('confirmed snapshots reconcile pending edits; rejected or reset state cannot keep an immortal preview', () => {
  const { c, source, tick, ready } = operatorRig(); ready(1); c.prepare(1); c.place({ x: .5, y: .5, angle: 0 });
  const confirmed = structuredClone(c.state!); c.applyState(confirmed);
  c.applyState({ ...source, tangibles: {} }); assert.equal(c.state!.tangibles[1], undefined);
  ready(1); c.prepare(1); c.place({ x: .5, y: .5, angle: 0 }); tick(1600); c.applyState(structuredClone(source));
  assert.equal(structuredClone(c.state!).tangibles[1].status, 'parked'); assert.equal(c.canUndo, false); assert.ok(c.notice.includes('resynchronisée'));
});
/** Vérifie les raccourcis AZERTY et pavé numérique sans détourner ceux du navigateur. */
test('shortcuts support AZERTY, numpad and modifiers without hijacking other browser shortcuts', () => {
  /** Construit un événement clavier avec les modificateurs demandés. */
  const event = (key: string, code = '', extra = {}) => ({ key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extra });
  assert.equal(ozShortcut(event('M')), null);
  assert.equal(ozShortcut(event('&', 'Digit1')), 'wall');
  assert.equal(ozShortcut(event('é', 'Digit2')), 'pylon1');
  assert.equal(ozShortcut(event('1', 'Numpad1')), 'wall');
  assert.equal(ozShortcut(event('2', 'Numpad2')), 'pylon1');
  assert.equal(ozShortcut(event('3', 'Numpad3')), 'pylon2');
  for (const [key, action] of [['ArrowLeft', 'left'], ['ArrowRight', 'right'], [' ', 'presence'], ['Delete', 'remove'], ['Escape', 'cancel'], ['r', 'view']]) assert.equal(ozShortcut(event(key)), action);
  assert.equal(ozShortcut(event('z', '', { ctrlKey: true })), 'undo');
  assert.equal(ozShortcut(event('r', '', { ctrlKey: true })), null);
  assert.equal(ozShortcut(event('m', '', { altKey: true })), null);
});
/** Vérifie l’aller-retour des coordonnées dans les quatre orientations de carte. */
test('all four view transforms round-trip valid edges, center and forbidden player stations', () => {
  for (let q = 0; q < 4; q++) for (const size of [[1920, 1080], [1280, 390], [700, 500], [390, 640], [844, 390], [320, 560]]) {
    const transform = viewTransform(size[0], size[1], 1920, 1080, q);
    for (const p of [{ x: 0, y: 0 }, { x: 1920, y: 1080 }, { x: 960, y: 540 }, { x: 1627, y: 972 }, { x: 60, y: 500 }]) {
      const restored = viewToWorld(worldToView(p, transform), transform);
      assert.ok(Math.hypot(restored.x - p.x, restored.y - p.y) < 1e-8);
    }
  }
});
/** Vérifie la sélection, le déplacement et le pivot dans les quatre orientations de carte. */
test('map placement, body dragging and rotation-handle picking work in all four views', () => {
  for (let q = 0; q < 4; q++) {
    const rig = operatorRig(), listeners = new Map<string, (e: PointerEvent) => void>();
    const canvas = { width: 1920, height: 1080,
      /** Fournit le contexte Canvas de contrôle à la place du dessin réel. */
      getContext: () => new Proxy({}, { /* Compte les commandes de dessin émises par le contexte Canvas simulé. */ get: () => /* Laisse cette notification sans effet dans le scénario local. */ () => {} }),
      /** Fournit les dimensions fixes du canvas de test pour convertir les contacts. */
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
      /** Conserve le gestionnaire du navigateur simulé pour pouvoir lui rejouer un événement. */
      addEventListener: (name: string, fn: (e: PointerEvent) => void) => listeners.set(name, fn), /* Remplace la capture du navigateur, inutile lorsque les événements sont rejoués directement. */ setPointerCapture() {} } as unknown as HTMLCanvasElement;
    const c = rig.c, map = new OzMap(canvas, { /* Expose à la carte l’autorisation de manipulation fixée ou calculée par le scénario. */ enabled: () => c.enabled, /* Fournit l’identifiant de l’objet sélectionné dans la console simulée. */ selectedId: () => c.selectedId,
      /** Fournit le type du tangible attendu par la prévisualisation du test. */
      selectedKind: () => 'wall', /* Indique si le scénario prépare une pose ou manipule un objet déjà présent. */ preparing: () => c.preparing, /* Fournit l’angle de prévisualisation imposé par le test. */ draftAngle: () => c.draftAngle,
      /** Remplace ou transmet le rangement du tangible sans utiliser l’interface HTML. */
      onDock: team => c.dock(team), /* Remplace ou transmet la sélection d’objet au contrôleur du scénario. */ onSelect: id => c.select(id), /* Remplace ou collecte la validation de pose selon le contrôleur utilisé par le scénario. */ onPlace: pose => c.place(pose), /* Collecte ou transmet la pose provisoire produite par le glissement sur la carte. */ onMove: (id, x, y, angle) => c.move(id, { x, y, angle }),
      /** Remplace ou transmet le début du regroupement des modifications d’un geste. */
      onDragStart: () => c.beginGesture(), /* Remplace ou transmet la clôture du groupe de modifications du geste. */ onDragEnd: () => c.endGesture() });
    const t = viewTransform(1920, 1080, 1920, 1080, q);
    /** Convertit le point étudié puis rejoue l’événement dans la carte Oz. */
    const pointer = (name: string, p: Vec2) => { const at = worldToView(p, t); listeners.get(name)!({ pointerId: 1, clientX: at.x / 2, clientY: at.y / 2, /* Remplace l’annulation de l’événement natif dans le navigateur simulé. */ preventDefault() {} } as PointerEvent); };
    map.setQuarter(q); rig.ready(1); map.setState(c.state!); c.prepare(1);
    pointer('pointermove', { x: 960, y: 540 }); assert.equal(rig.sent.length, 0);
    pointer('pointerdown', { x: 960, y: 540 }); pointer('pointerup', { x: 960, y: 540 }); map.setState(c.state!);
    assert.ok(Math.abs(c.state!.tangibles[1].x - .5) < 1e-10,'placement keeps the expected centre');
    pointer('pointerdown', { x: 930, y: 540 }); pointer('pointermove', { x: 945, y: 545 }); pointer('pointerup', { x: 945, y: 545 });
    assert.ok(Math.abs(c.state!.tangibles[1].x - 975 / 1920) < 1e-10,'body drag preserves its offset');
    map.setState(c.state!); const before = { ...c.state!.tangibles[1] };
    pointer('pointerdown', { x: 975+config.wallLengthPx/2, y: 545 }); pointer('pointermove', { x: 975+config.wallLengthPx/2, y: 550 }); pointer('pointerup', { x: 975+config.wallLengthPx/2, y: 550 });
    const [anchor] = wallEndpoints({ x: c.state!.tangibles[1].x * 1920, y: c.state!.tangibles[1].y * 1080 }, c.state!.tangibles[1].angle, config.wallLengthPx);
    assert.ok(Math.hypot(anchor.x - (before.x * 1920 - config.wallLengthPx/2), anchor.y - before.y * 1080) < 1e-8,'rotation preserves the fixed endpoint');
  }
});

let passed = 0;
let failed = 0;
for (const item of queue) {
  if (!item.fn) { console.log(item.name); continue; }
  try { await item.fn(); passed++; console.log(`  ✓ ${item.name}`); }
  catch (e) { failed++; console.log(`  ✗ ${item.name}\n      ${(e as Error).message}`); }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
