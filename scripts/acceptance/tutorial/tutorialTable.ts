/**
 * Scénarios du tutoriel (2/2) : rangement des tangibles, stock armé, passage des leçons et boutons de la table.
 * Liens : server/modes/Tutorial.ts, client-table/ui/TutorialOverlay.ts.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import type { Team } from '../../../server/types.js';
import { config } from '../../../server/config.js';
import { generatePreset } from '../../../server/track/MapGenerator.js';
import { mock } from 'node:test';
import { START_TUTORIAL_BUTTON } from '../../../client-table/renderer/Renderer.js';
import { TUTORIAL_END_BUTTON, tutorialSkipCenter } from '../../../client-table/ui/TutorialOverlay.js';
import { test, msg, aim } from '../harness.js';
import { tutorialRig, lesson, skipTo, tableClient, place } from '../scenarioActions.js';

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
