/**
 * Scénarios de la phase MAP : ancres, tracés guidés, validation et préparation de la course.
 * Liens : server/rules/GameRules.ts, server/track/mapCreation.ts, client-table/gesture/GestureRecognizer.ts.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import type { Team, Vec2 } from '../../../server/types.js';
import { generatePreset } from '../../../server/track/MapGenerator.js';
import { isInsideTrackRibbon, clampToTrackRibbon } from '../../../server/geometry.js';
import { mock } from 'node:test';
import { TRACK_PRESENTATION_MS } from '../../../server/track/trackPresentation.js';
import { test, section, rig, raceRig, msg } from '../harness.js';
import { tableClient } from '../scenarioActions.js';

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
