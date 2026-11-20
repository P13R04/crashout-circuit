/**
 * Scénarios du tutoriel (1/2) : démarrage, leçons de conduite et leçons validées par de vrais événements.
 * Liens : server/modes/Tutorial.ts, server/rules/GameRules.ts.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import type { Team } from '../../../server/types.js';
import { config } from '../../../server/config.js';
import { generatePreset } from '../../../server/track/MapGenerator.js';
import { test, section, rig, msg, aim } from '../harness.js';
import { tutorialRig, lesson, skipTo, driveTo, pilot, place, pad } from '../scenarioActions.js';

section('Tutorial · independent lessons validated by real events');
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
