/**
 * Scénarios T-01 : génération du circuit à partir des deux tracés des joueurs.
 * Liens : server/MapGenerator.ts.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import type { Team, Vec2 } from '../../server/types.js';
import { generate, generatePreset, validateGeometry, generationInfo, selfCrossings } from '../../server/MapGenerator.js';
import { nearestOnTrack } from '../../server/geometry.js';
import { PLAY_AREA } from '../../server/layout.js';
import { test, section, rig, msg } from './harness.js';

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
