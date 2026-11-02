/**
 * Rejoue des contacts tactiles pour vérifier les gestes, leurs tolérances et leur séparation des commandes
 * des postes.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';

// The recognizer pulls in the renderer module, which only needs a DOM shape at call time.
const g = globalThis as Record<string, unknown>;
g.document = { /* Remplace la recherche d’élément HTML lorsque le scénario utilise seulement un canvas simulé. */ getElementById: () => null, /* Fournit un élément minimal permettant d’initialiser le rendu hors navigateur. */ createElement: () => ({ /* Fournit le contexte Canvas de contrôle à la place du dessin réel. */ getContext: () => null, style: {} }) };

const { GestureRecognizer } = await import('../client-table/GestureRecognizer.js');
const { createView } = await import('../client-table/view.js');
const { tuning, DEFAULT_TUNING, applyTuning } = await import('../client-table/gestureTuning.js');
const { formatGestureEntry, gestureLogCsv, GESTURE_LOG_MAX, recordGesture } = await import('../client-table/GestureLog.js');

/** Laisse passer le délai nécessaire aux confirmations tactiles du scénario. */
const sleep = (ms: number) => new Promise(/* Attend le délai nécessaire au traitement asynchrone du scénario. */ r => setTimeout(r, ms));

/** Conserve les appuis de direction et de pédale du pilote simulé. */
type Held = 'slingshot' | 'boost' | null;

/** Prépare l’état, l’horloge et les dépendances contrôlées nécessaires au scénario. */
function rig(held: Held = 'slingshot') {
  const handlers: Record<string, (e: unknown) => void> = {};
  const canvas = {
    /** Conserve le gestionnaire du navigateur simulé pour pouvoir lui rejouer un événement. */
    addEventListener: (n: string, f: (e: unknown) => void) => { handlers[n] = f; },
    /** Fournit les dimensions fixes du canvas de test pour convertir les contacts. */
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
    /** Remplace la capture du navigateur, inutile lorsque les événements sont rejoués directement. */
    setPointerCapture: () => {},
  };
  const view = createView(/* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ () => Date.now());
  /** Construit le stock et l’état minimal d’une voiture pour reconnaître les gestes du test. */
  const car = (team: string, armed: boolean) => ({
    team, itemArmed: armed, heldItem: armed ? held : null, itemArmExpiry: Date.now() + 600_000, pos: { x: 100, y: 100 },
  });
  // Only the fields the recognizer reads; no track, so no contact is on a track edge.
  view.state = {
    phase: 'RACE', mapMode: 'table', track: null, driveMode: { A: 'auto', B: 'auto' },
    cars: { A: car('A', true), B: car('B', false) },
    cooldowns: { A: { ghost: 0, destroy: 0 }, B: { ghost: 0, destroy: 0 } },
    testMode: { invincible: false, allItems: false },
    params: { slingMinPullPx: 40, slingMaxPullPx: 260, slingMinRangePx: 220, slingMaxRangePx: 900, logicalWidth: 1920, logicalHeight: 1080, stoneRadiusPx: 60 },
    walls: [], arcs: [],
  } as never;
  const sent: Array<Record<string, unknown>> = [];
  const recognizer = new GestureRecognizer(canvas as never, view, /* Collecte la commande produite pour la comparer aux résultats attendus. */ m => sent.push(m));
  let size = 1; // reported contact width and height, as a PCAP panel would
  /** Construit l’événement de pointeur synthétique envoyé à la reconnaissance. */
  const ev = (type: string, id: number, x: number, y: number) =>
    ({ type, pointerId: id, clientX: x, clientY: y, pointerType: 'touch', width: size, height: size, timeStamp: Date.now(), /* Remplace l’annulation de l’événement natif dans le navigateur simulé. */ preventDefault() {} });
  return {
    view, sent, recognizer,
    /** Change la largeur simulée du contact pour vérifier le rejet des paumes. */
    setSize: (px: number) => { size = px; },
    /** Rejoue la pose d’un doigt dans le gestionnaire de contacts du test. */
    down: (id: number, x: number, y: number) => handlers.pointerdown(ev('pointerdown', id, x, y)),
    /** Rejoue le déplacement d’un doigt maintenu dans le scénario. */
    move: (id: number, x: number, y: number) => handlers.pointermove(ev('pointermove', id, x, y)),
    /** Rejoue le retrait d’un doigt pour terminer sa commande ou son geste. */
    up: (id: number, x: number, y: number) => handlers.pointerup(ev('pointerup', id, x, y)),
    /** Rejoue une interruption système du contact sans la confondre avec un geste confirmé. */
    cancel: (id: number, x: number, y: number) => handlers.pointercancel(ev('pointercancel', id, x, y)),
  };
}

// Fork fingers 1 and 2 side by side, finger 3 below them.
const F1 = { x: 880, y: 500 }, F2 = { x: 1000, y: 500 }, F3 = { x: 940, y: 600 };

/** Pose les trois doigts de référence en laissant à la reconnaissance leurs délais d’arrivée. */
async function land(r: ReturnType<typeof rig>): Promise<void> {
  r.down(1, F1.x, F1.y); await sleep(4);
  r.down(2, F2.x, F2.y); await sleep(4);
  r.down(3, F3.x, F3.y); await sleep(4);
}

/** Déplace progressivement le doigt mobile pour former la traction à tester. */
async function pullDown(r: ReturnType<typeof rig>, id: number, from: { x: number; y: number }, px: number): Promise<void> {
  for (let d = 25; d <= px; d += 25) { r.move(id, from.x, from.y + d); await sleep(3); }
}

/** Vérifie que le point calculé reste à la distance de tolérance de la référence. */
function near(actual: { x: number; y: number }, expected: { x: number; y: number }, msg?: string): void {
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 0.01, `${msg ?? 'point'}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

const results: Array<[string, boolean, string?]> = [];
/** Enregistre ou exécute le scénario et l’ajoute au bilan de vérification. */
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); results.push([name, true]); } catch (e) { results.push([name, false, (e as Error).message]); }
}

/** Vérifie qu’une traction du troisième doigt suivie de son retrait tire une seule pierre dans le sens opposé. */
await test('pulling the third finger back and lifting it fires one shot opposite to the pull', async () => {
  const r = rig();
  r.view.state!.cars.A.itemArmed = false; r.view.state!.cars.A.heldItem = null;
  r.view.state!.cars.B.itemArmed = true; r.view.state!.cars.B.heldItem = 'slingshot';
  await land(r);
  await pullDown(r, 3, F3, 150);
  assert.equal(r.view.sling?.idle, false);
  r.up(3, F3.x, F3.y + 150);
  assert.equal(r.sent.length, 1);
  const m = r.sent[0] as { type: string; anchor: { x: number; y: number }; pouch: { x: number; y: number }; team: string };
  assert.equal(m.type, 'Slingshot');
  near(m.anchor, { x: 940, y: 500 }, 'anchor');
  near(m.pouch, { x: 940, y: 750 }, 'pouch');
  assert.equal(m.team, 'A', 'the fork is nearer the cyan station: it can steal the item armed by rose');
});

/** Vérifie que trois doigts immobiles ne déclenchent pas de frappe immédiate. */
await test('three resting fingers are no instant strike (no message after the settle delay)', async () => {
  const r = rig();
  await land(r);
  await sleep(400);
  assert.deepEqual(r.sent, []);
  r.up(3, F3.x, F3.y);
  assert.deepEqual(r.sent, []); // nothing was pulled: no shot
});

/** Vérifie que l’aperçu ne choisit pas la poche avant qu’un doigt se distingue par son mouvement. */
await test('the preview shows no role until one finger has clearly moved', async () => {
  const r = rig();
  await land(r);
  assert.equal(r.view.sling?.idle, true);
  r.move(3, F3.x, F3.y + 5); // under the threshold
  assert.equal(r.view.sling?.idle, true);
  r.move(3, F3.x, F3.y + 40);
  assert.equal(r.view.sling?.idle, false);
});

/** Vérifie qu’un léger glissement du deuxième doigt ne vole pas le rôle de poche au troisième. */
await test('REGRESSION fingers 2/3: finger 2 sliding while settling does not steal the pouch from finger 3', async () => {
  const r = rig();
  await land(r);
  r.move(2, F2.x + 22, F2.y + 8); // finger 2 slides ~23 px: it looks like a pouch for a moment
  assert.equal(r.view.sling?.idle, false);
  await pullDown(r, 3, F3, 150); // the real pull
  r.up(3, F3.x, F3.y + 150);
  const m = r.sent[0] as { anchor: { x: number; y: number }; pouch: { x: number; y: number } };
  assert.ok(m, 'a shot is fired');
  near(m.pouch, { x: 940, y: 750 }, 'finger 3 is the pouch');
  near(m.anchor, { x: (F1.x + F2.x + 22) / 2, y: (F1.y + F2.y + 8) / 2 }, 'fork = fingers 1 and 2 at their current position');
});

/** Vérifie que le rôle de poche dépend du doigt tiré et non de son ordre d’arrivée. */
await test('whichever finger is pulled is the pouch (roles do not depend on the landing order)', async () => {
  const r = rig();
  await land(r);
  await pullDown(r, 2, F2, 150); // finger 2 pulled this time
  r.up(2, F2.x, F2.y + 150);
  const m = r.sent[0] as { anchor: { x: number; y: number }; pouch: { x: number; y: number } };
  near(m.pouch, { x: F2.x, y: F2.y + 150 }, 'pouch');
  near(m.anchor, { x: (F1.x + F3.x) / 2, y: (F1.y + F3.y) / 2 }, 'fork');
});

/** Vérifie qu’un appui fixe levé reste mémorisé sans déclencher le tir. */
await test('a fork lift stays latched and never fires before the pouch release', async () => {
  const r = rig();
  await land(r);
  await pullDown(r, 3, F3, 150);
  r.up(1, F1.x, F1.y);
  assert.equal(r.sent.length,0);await sleep(300);
  assert.equal(r.sent.length, 0);
  r.up(2, F2.x, F2.y);
  r.up(3, F3.x, F3.y + 150);
  assert.equal(r.sent.length, 1, 'the other fingers do not fire anything else');
});

/** Vérifie le refus d’une traction inférieure au minimum. */
await test('a pull shorter than the minimum fires nothing', async () => {
  const r = rig();
  r.down(1, F1.x, F1.y); await sleep(4);
  r.down(2, F2.x, F2.y); await sleep(4);
  r.down(3, 940, 515); await sleep(4); // lands 15 px from the fork centre
  r.move(3, 940, 535); // moved 20 px (a role is chosen) but the elastic is only 35 px long
  assert.equal(r.view.sling?.idle, false);
  assert.equal(r.view.sling?.shot.valid, false);
  r.up(3, 940, 535);
  assert.deepEqual(r.sent, []);
});

/** Vérifie qu’une annulation système ne libère pas une pierre. */
await test('a cancelled touch (pointercancel) does not fire the shot', async () => {
  const r = rig();
  await land(r);
  await pullDown(r, 3, F3, 150);
  r.cancel(3, F3.x, F3.y + 150);
  assert.deepEqual(r.sent, []);
});

/** Vérifie que trois doigts restent sans effet tant qu’aucun lance-pierre n’est armé. */
await test('without an armed slingshot, three fingers do nothing', async () => {
  const r = rig();
  (r.view.state as { cars: { A: { itemArmed: boolean } } }).cars.A.itemArmed = false;
  await land(r);
  await pullDown(r, 3, F3, 150);
  r.up(3, F3.x, F3.y + 150);
  assert.deepEqual(r.sent, []);
  assert.equal(r.view.sling, null);
});

/** Vérifie qu’une prise de deux doigts espacés crée la zone lorsque le bon bonus est armé. */
await test('two fingers 100–400 px apart still open a boost gate with a boost armed', async () => {
  const r = rig('boost');
  r.down(1, 800, 500); r.down(2, 1000, 500);
  await sleep(300);
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].type, 'BoostGate');
});

/** Vérifie que seul le bouton copilote produit POWER et que l’ancien emplacement pilote reste inerte. */
await test('only the copilot POWER button emits activation, the former pilot item zone is inert', async () => {
  const { localToWorld, panelOf, POWER_BTN_LOCAL } = await import('../server/layout.js');
  for (const team of ['A', 'B'] as const) {
    const r = rig();
    const at = localToWorld(panelOf(team, 'copilot'), POWER_BTN_LOCAL.x, POWER_BTN_LOCAL.y);
    r.down(1, at.x, at.y); r.up(1, at.x, at.y);
    assert.deepEqual(r.sent, [{ type: 'Power', team, role: 'copilot' }]);
    r.sent.length = 0;
    const former = localToWorld(panelOf(team, 'pilot'), -20, 45);
    r.down(2, former.x, former.y); r.up(2, former.x, former.y);
    assert.equal(r.sent.filter(/* Isole les armements de bonus pour vérifier le résultat de ce scénario. */ m=>m.type==='Power').length,0,'pilot controls never arm stock');
  }
});

/** Vérifie que les pads en coins opposés réparent bien la même équipe. */
await test('two repair contacts in opposite corners belong to the same team', async () => {
  const { localToWorld, panelOf, padLocal } = await import('../server/layout.js');
  for (const team of ['A', 'B'] as const) {
    const r = rig(null);
    for (const [id, role] of [[1, 'pilot'], [2, 'copilot']] as const) {
      const pad = padLocal(role), at = localToWorld(panelOf(team, role), pad.x, pad.y);
      r.down(id, at.x, at.y);
    }
    assert.deepEqual(r.sent, [
      { type: 'PadHold', team, role: 'pilot', on: true },
      { type: 'PadHold', team, role: 'copilot', on: true },
    ]);
    r.recognizer.releaseAll();
  }
});

/** Vérifie la conservation de la pédale maintenue pendant les changements de direction. */
await test('the shared control adapter preserves held-pedal throttle across steering and releases', async () => {
  const { localToWorld, panelOf, PEDAL_LOCAL, STEER_AREA_LOCAL, steerArea } = await import('../server/layout.js');
  const r = rig(); r.view.state!.driveMode.A = 'pedal';
  const pedal = localToWorld(panelOf('A', 'pilot'), PEDAL_LOCAL.x, PEDAL_LOCAL.y);
  const steer = localToWorld(panelOf('A', 'pilot'), steerArea('pedal').x - 30, steerArea('pedal').y);
  r.down(1, pedal.x, pedal.y);
  assert.equal(r.sent.at(-1)!.throttle, 1);
  r.down(2, steer.x, steer.y);
  // The continuous steering heartbeat also carries the currently held pedal.
  await sleep(30);
  assert.equal(r.sent.at(-1)!.steer, -1); assert.equal(r.sent.at(-1)!.throttle, 1);
  r.up(1, pedal.x, pedal.y);
  assert.equal(r.sent.at(-1)!.steer, -1); assert.equal(r.sent.at(-1)!.throttle, 0);
  r.up(2, steer.x, steer.y);
  assert.equal(r.sent.at(-1)!.steer, 0); assert.equal(r.sent.at(-1)!.throttle, 0);
});

/** Vérifie que la reprise centrale ne fonctionne qu’en pause et consomme son contact. */
await test('the central resume icon works only while paused, and consumes the touch', async () => {
  const r = rig(null);
  r.down(1, 960, 540); r.up(1, 960, 540);
  assert.deepEqual(r.sent, [], 'the same location is ordinary track during the race');
  r.view.state!.phase = 'PAUSED';
  r.down(2, 960, 540); r.up(2, 960, 540);
  assert.deepEqual(r.sent, [{ type: 'Pause' }]);
  assert.equal(r.view.sling, null);
});

/** Vérifie que les anciens boutons de conduite et l’espace des paramètres n’activent rien sur le canvas. */
await test('former mode buttons and neutral settings space never toggle drive mode on the canvas',async()=>{
  const {SETTINGS_BUTTON}=await import('../server/layout.js');
  for(const phase of ['LOBBY','READY','RACE'] as const){const r=rig(null);r.view.state!.phase=phase;r.down(1,SETTINGS_BUTTON.x+30,SETTINGS_BUTTON.y+30);r.up(1,SETTINGS_BUTTON.x+30,SETTINGS_BUTTON.y+30);assert.equal(r.sent.length,0);}
});

/** Vérifie l’entrée distincte de l’essai autonome lorsque le développement l’autorise. */
await test('the tangible-test lobby entry starts its own mode without changing the other entries', async () => {
  const { START_TANGIBLE_TEST_BUTTON, START_TABLE_BUTTON, START_PC_BUTTON, START_TUTORIAL_BUTTON } = await import('../client-table/Renderer.js');
  for (const [button, expected] of [[START_TANGIBLE_TEST_BUTTON,'StartTangibleTest'],[START_TABLE_BUTTON,'StartGame'],[START_PC_BUTTON,'StartGame'],[START_TUTORIAL_BUTTON,'StartTutorial']] as const) {
    const r=rig(null);r.view.state!.phase='LOBBY';r.view.state!.developerTools=true;
    const x=button.x+button.w/2,y=button.y+button.h/2;
    r.down(1,x,y);r.up(1,x,y);assert.equal(r.sent.length,1);assert.equal(r.sent[0].type,expected);
  }
});
/** Vérifie qu’un joueur ne peut toucher les anciennes régions invisibles des modes de test. */
await test('participants cannot activate invisible keyboard or tangible-test lobby regions',async()=>{
 const {START_PC_BUTTON,START_TANGIBLE_TEST_BUTTON}=await import('../client-table/Renderer.js');
 for(const b of [START_PC_BUTTON,START_TANGIBLE_TEST_BUTTON]){const r=rig(null);r.view.state!.phase='LOBBY';r.view.state!.developerTools=false;r.down(1,b.x+b.w/2,b.y+b.h/2);r.up(1,b.x+b.w/2,b.y+b.h/2);assert.equal(r.sent.length,0);}
});
/** Vérifie que seul un nouveau contact après la présentation du circuit peut lancer le départ. */
await test('the start button stays inert during construction and roulette, then accepts a fresh tap',async()=>{
  const {RACE_START_BUTTON:b}=await import('../client-table/Renderer.js');
  const {TRACK_PRESENTATION_MS}=await import('../server/trackPresentation.js');
  const r=rig(null);r.view.state!.phase='READY';r.view.state!.trackPresentation={startedAt:1000,originIndex:0};
  let now=1000;r.view.now=/* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ ()=>now;
  /** Rejoue un toucher bref au centre d’un bouton sans maintenir son contact. */
  const tap=(id:number)=>{r.down(id,b.x+b.w/2,b.y+b.h/2);r.up(id,b.x+b.w/2,b.y+b.h/2);};
  tap(1);now=1000+TRACK_PRESENTATION_MS-1;tap(2);assert.equal(r.sent.length,0);
  now=1000+TRACK_PRESENTATION_MS;tap(3);assert.equal(r.sent.at(-1)?.type,'BeginRace');r.recognizer.releaseAll();
});
/** Vérifie les contacts pilotes ignorés en essai autonome et les commandes copilotes conservées. */
await test('automatic test consumes pilot touches while copilot POWER and repair remain available', async () => {
  const r=rig();r.view.state!.sessionMode='tangibles-test';
  // Pilot A steering strip, repair pad, and former drive-mode selector.
  for(const [x,y] of [[155,970],[620,970],[370,829]]){r.down(1,x,y);r.up(1,x,y);}
  assert.equal(r.sent.length,0);
  const { panelOf,localToWorld,POWER_BTN_LOCAL,padLocal }=await import('../server/layout.js');
  const panel=panelOf('A','copilot'),power=localToWorld(panel,POWER_BTN_LOCAL.x,POWER_BTN_LOCAL.y);
  r.down(3,power.x,power.y);r.up(3,power.x,power.y);
  assert.equal(r.sent.at(-1)?.type,'Power');
  const pad=padLocal('copilot'),at=localToWorld(panel,pad.x,pad.y);
  r.down(4,at.x,at.y);r.up(4,at.x,at.y);
  assert.deepEqual(r.sent.filter(/* Isole les changements d’appui de réparation pour vérifier le résultat de ce scénario. */ m=>m.type==='PadHold').map(/* Extrait le rôle et le maintien de chaque commande de réparation. */ m=>[m.role,m.on]),[['copilot',true],['copilot',false]]);
});

/** Vérifie le suivi continu des deux doigts sur une traction aussi ample que le mur. */
await test('a border pull follows the two fingers through a full wall-sized drag instead of consuming the first movement',async()=>{
  const {generatePreset}=await import('../server/MapGenerator.js');
  const r=rig('boost'),track=generatePreset();r.view.state!.track=track;
  const index=Math.floor(track.centerline.length/4),at=track.outerEdge[index],centre=track.centerline[index],d=Math.hypot(at.x-centre.x,at.y-centre.y),out={x:(at.x-centre.x)/d,y:(at.y-centre.y)/d};
  // Adjacent samples on the same edge supply actual, nearby grab points.
  const b=track.outerEdge[(index+1)%track.outerEdge.length];r.down(1,at.x,at.y);r.down(2,b.x,b.y);
  for(let amount=30;amount<=220;amount+=30){r.move(1,at.x+out.x*amount,at.y+out.y*amount);r.move(2,b.x+out.x*amount,b.y+out.y*amount);await sleep(35);}
  r.up(1,at.x+out.x*220,at.y+out.y*220);r.up(2,b.x+out.x*220,b.y+out.y*220);
  const pulls=r.sent.filter(/* Isole les déformations de piste pour vérifier le résultat de ce scénario. */ m=>m.type==='BorderPull');assert.ok(pulls.length>=4,'one gesture streams its growing displacement');
  assert.equal(new Set(pulls.map(/* Recense les identifiants de déformation pour vérifier la continuité d’un même geste. */ m=>m.gestureId)).size,1);assert.equal(pulls.at(-1)!.end,true);
  assert.ok(Math.hypot(pulls.at(-1)!.dx as number,pulls.at(-1)!.dy as number)>150,'the final pull is much larger than its first 20 px');
  assert.equal(r.sent.filter(/* Isole les créations de zone d’accélération pour vérifier le résultat de ce scénario. */ m=>m.type==='BoostGate').length,0);
});

/** Vérifie la prise tolérante près d’un virage et la traction suivant sa normale locale. */
await test('bend grabs accept fingers inside and outside the edge and drag perpendicular to the local tangent',async()=>{
  const {generatePreset}=await import('../server/MapGenerator.js');const {trackTangent}=await import('../server/geometry.js');
  const r=rig('boost'),track=generatePreset();r.view.state!.track=track;
  const index=42;
  /** Construit un contact près du bord local de la piste en tenant compte de la tangente. */
  const point=(i:number,offset:number)=>{const t=trackTangent(track,i),edge=track.outerEdge[i],centre=track.centerline[i],side=(edge.x-centre.x)*(-t.y)+(edge.y-centre.y)*t.x<0?-1:1;return{x:edge.x-t.y*side*offset,y:edge.y+t.x*side*offset};};
  const a=point(index,35),b=point(index+2,-35),t=trackTangent(track,index+1),edge=track.outerEdge[index+1],centre=track.centerline[index+1],side=(edge.x-centre.x)*(-t.y)+(edge.y-centre.y)*t.x<0?-1:1,out={x:-t.y*side,y:t.x*side};
  r.down(1,a.x,a.y);r.down(2,b.x,b.y);r.move(1,a.x+out.x*100,a.y+out.y*100);r.move(2,b.x+out.x*100,b.y+out.y*100);r.up(1,a.x+out.x*100,a.y+out.y*100);r.up(2,b.x+out.x*100,b.y+out.y*100);
  const pull=r.sent.find(/* Isole les déformations de piste pour vérifier le résultat de ce scénario. */ m=>m.type==='BorderPull');assert.ok(pull,'the curved edge is grabbable on either side of its outline');
  assert.ok(Math.abs((pull.dx as number)*t.x+(pull.dy as number)*t.y)<20,'the pull follows the normal to the local tangent');
});

/** Vérifie qu’une prise immobile sur le bord peut encore produire une accélération armée. */
await test('stationary boost contacts still work on the ribbon edges despite the wider drag grab margin',async()=>{
  const {generatePreset}=await import('../server/MapGenerator.js');const r=rig('boost'),track=generatePreset();r.view.state!.track=track;
  const i=42,a=track.outerEdge[i],b=track.innerEdge[i];r.down(1,a.x,a.y);r.down(2,b.x,b.y);await sleep(240);
  assert.equal(r.sent.filter(/* Isole les créations de zone d’accélération pour vérifier le résultat de ce scénario. */ m=>m.type==='BoostGate').length,1);r.recognizer.releaseAll();
});

/** Vérifie les prises décalées de l’accélération et le rejet d’un troisième doigt parasite. */
await test('an expected boost accepts delayed taps and ignores a third finger instead of forming a sling',async()=>{
  const r=rig('boost');r.down(1,800,500);r.up(1,800,500);await sleep(400);
  r.down(2,1000,500);r.down(3,812,510);await sleep(240);
  assert.equal(r.sent.filter(/* Isole les créations de zone d’accélération pour vérifier le résultat de ce scénario. */ m=>m.type==='BoostGate').length,1);assert.equal(r.view.sling,null);r.recognizer.releaseAll();
});
/** Vérifie une fourche décalée dans le temps avec perte et retour bref d’un appui. */
await test('a slingshot accepts delayed fork contacts and a brief lost/replaced anchor',async()=>{
  const r=rig();r.down(1,F1.x,F1.y);await sleep(450);r.down(2,F2.x,F2.y);r.down(3,F3.x,F3.y);
  await pullDown(r,3,F3,150);r.up(1,F1.x,F1.y);await sleep(80);assert.equal(r.sent.length,0);
  r.down(4,F1.x+6,F1.y+4);r.up(3,F3.x,F3.y+150);assert.equal(r.sent.filter(/* Isole les tirs de lance-pierre pour vérifier le résultat de ce scénario. */ m=>m.type==='Slingshot').length,1);r.recognizer.releaseAll();
});
/** Vérifie que les deux appuis de fourche peuvent être brièvement tapés avant la poche maintenue. */
await test('a slingshot fork may be tapped before the pulling finger is held',async()=>{
  const r=rig();r.down(1,F1.x,F1.y);r.up(1,F1.x,F1.y);await sleep(350);
  r.down(2,F2.x,F2.y);r.down(3,F3.x,F3.y);await pullDown(r,3,F3,150);r.up(3,F3.x,F3.y+150);
  assert.equal(r.sent.filter(/* Isole les tirs de lance-pierre pour vérifier le résultat de ce scénario. */ m=>m.type==='Slingshot').length,1);r.recognizer.releaseAll();
});

/** Vérifie le double maintien sur le bord intérieur replié d’un virage en coude. */
await test('two held fingers can grab the folded inner bank of a right-angle elbow',async()=>{
  const {generatePreset,rebuildEdges}=await import('../server/MapGenerator.js');const r=rig(null),track=generatePreset();
  const corners=[{x:600,y:400},{x:1200,y:400},{x:1200,y:700},{x:600,y:700}];
  track.centerline=corners.flatMap(/* Échantillonne les côtés du circuit en coude servant à la prise de bord. */ (p,i)=>Array.from({length:20},/* Construit un point intermédiaire du côté pour obtenir des angles droits bien marqués. */ (_,j)=>({x:p.x+(corners[(i+1)%4].x-p.x)*j/20,y:p.y+(corners[(i+1)%4].y-p.y)*j/20})));
  track.baseCenterline=track.centerline.map(/* Conserve la forme initiale du circuit de test avant sa déformation. */ p=>({...p}));track.widths=track.centerline.map(/* Fixe une largeur constante sur les portions du circuit de test. */ ()=>140);rebuildEdges(track);r.view.state!.track=track;
  const a=track.innerEdge[19],b=track.innerEdge[21];r.down(1,a.x,a.y);r.down(2,b.x,b.y);
  r.move(1,a.x-70,a.y+70);r.move(2,b.x-70,b.y+70);r.up(1,a.x-70,a.y+70);r.up(2,b.x-70,b.y+70);
  assert.ok(r.sent.some(/* Isole les déformations de piste pour vérifier le résultat de ce scénario. */ m=>m.type==='BorderPull'),'the concave elbow is a grabbable rendered bank');r.recognizer.releaseAll();
});

for(const delayed of [false,true])/* Vérifie les deux contacts rapprochés de l’accélération en simultané et avec un décalage temporel. */ await test(`boost accepts close ${delayed?'one-second delayed':'simultaneous'} contacts`,async()=>{
  const r=rig('boost');r.down(1,900,500);
  if(delayed){r.up(1,900,500);await sleep(1000);}
  r.down(2,930,500);r.up(2,930,500);await sleep(210);
  assert.equal(r.sent.filter(/* Isole les créations de zone d’accélération pour vérifier le résultat de ce scénario. */ m=>m.type==='BoostGate').length,1,'close touches form a pair');r.recognizer.releaseAll();
});
/** Vérifie qu’un deuxième toucher utilisant le même identifiant peut compléter la paire de l’accélération. */
await test('a repeated tap with the same pointerId is a second boost contact',async()=>{
  const r=rig('boost');r.down(1,900,500);r.up(1,900,500);await sleep(220);
  r.down(1,902,500);r.up(1,902,500);await sleep(210);
  assert.equal(r.sent.filter(/* Isole les créations de zone d’accélération pour vérifier le résultat de ce scénario. */ m=>m.type==='BoostGate').length,1,'a second tap is not an anchor replacement');r.recognizer.releaseAll();
});
/** Vérifie que les doigts arrivés avant la confirmation réseau de POWER ne sont pas oubliés. */
await test('fingers landing before the POWER state echo are retained',async()=>{
  const r=rig('boost');r.view.state!.cars.A.itemArmed=false;
  r.down(1,900,500);r.down(2,930,500);await sleep(50);
  r.view.state!.cars.A.itemArmed=true;r.recognizer.syncState();await sleep(210);
  assert.equal(r.sent.filter(/* Isole les créations de zone d’accélération pour vérifier le résultat de ce scénario. */ m=>m.type==='BoostGate').length,1,'network echo does not reject fresh fingers');r.recognizer.releaseAll();
});
/** Vérifie une seconde entière entre les deux premiers appuis de la fourche. */
await test('slingshot fork accepts a full second between the first two taps',async()=>{
  const r=rig();r.down(1,F1.x,F1.y);r.up(1,F1.x,F1.y);await sleep(1000);
  r.down(2,F2.x,F2.y);r.down(3,F3.x,F3.y);await pullDown(r,3,F3,150);
  r.cancel(2,F2.x,F2.y);await sleep(350);assert.equal(r.sent.length,0,'a dropped anchor never fires');
  r.up(3,F3.x,F3.y+150);assert.equal(r.sent.filter(/* Isole les tirs de lance-pierre pour vérifier le résultat de ce scénario. */ m=>m.type==='Slingshot').length,1,'latched fork survives a missed hold');r.recognizer.releaseAll();
});

/** Vérifie qu’un doigt qui glisse légèrement pendant la stabilisation ne bloque pas l’accélération attendue. */
await test('one finger sliding while settling does not suppress an expected boost',async()=>{
  const {generatePreset}=await import('../server/MapGenerator.js');const r=rig('boost'),track=generatePreset();r.view.state!.track=track;
  const a=track.outerEdge[42],b=track.outerEdge[44],centre=track.centerline[42],d=Math.hypot(a.x-centre.x,a.y-centre.y),out={x:(a.x-centre.x)/d,y:(a.y-centre.y)/d};
  r.down(1,a.x,a.y);r.down(2,b.x,b.y);r.move(1,a.x+out.x*25,a.y+out.y*25);await sleep(220);
  assert.equal(r.sent.filter(/* Isole les créations de zone d’accélération pour vérifier le résultat de ce scénario. */ m=>m.type==='BoostGate').length,1,'a single settling correction is not a two-finger drag');r.recognizer.releaseAll();
});

/** Vérifie la lecture des seuils par URL et le refus des réglages hors limites. */
await test('URL parameters adjust the thresholds; invalid or out-of-range values are ignored', async () => {
  const target = { ...DEFAULT_TUNING };
  assert.deepEqual(applyTuning('?cluster=230&role=9&dominance=1.2&palm=180&settle=250&boostmax=300', target).sort(), ['boostmax', 'cluster', 'dominance', 'palm', 'role', 'settle']);
  assert.deepEqual(target, { settleMs: 250, slingClusterPx: 230, slingRoleMinPx: 9, slingDominance: 1.2, boostMaxPx: 300, palmMaxPx: 180 });
  const untouched = { ...DEFAULT_TUNING };
  assert.deepEqual(applyTuning('?cluster=abc&role=-3&dominance=99&palm=&unknown=5', untouched), []);
  assert.deepEqual(untouched, DEFAULT_TUNING);
});
/** Vérifie que modifier réellement le seuil de regroupement change la reconnaissance du même geste. */
await test('the recognizer reads the live thresholds: a tighter cluster limit refuses the same three fingers', async () => {
  try {
    tuning.slingClusterPx = 40;
    const r = rig(); await land(r); await pullDown(r, 3, F3, 150); r.up(3, F3.x, F3.y + 150);
    assert.equal(r.sent.length, 0, 'fingers 120 px apart are no longer one slingshot');
    assert.ok(r.view.debug.gestures.some(/* Retrouve la raison de refus du groupe de doigts trop large. */ e => e.kind === 'clusterTooWide'), 'the refusal is journaled with its spread');
    r.recognizer.releaseAll();
  } finally { Object.assign(tuning, DEFAULT_TUNING); }
});
/** Vérifie que le journal explique les contacts, la poche et le relâchement d’un tir. */
await test('the gesture journal explains a shot: contact sizes, cluster, pouch and release', async () => {
  const r = rig(); r.setSize(22);
  await land(r); await pullDown(r, 3, F3, 150); r.up(3, F3.x, F3.y + 150);
  const log = r.view.debug.gestures, kinds = log.map(/* Extrait les catégories d’événements enregistrées pendant le tir. */ e => e.kind);
  assert.equal(kinds.filter(/* Compte les contacts d’origine présents dans le journal du geste. */ k => k === 'contact').length, 3);
  assert.deepEqual(log.find(/* Retrouve les dimensions du premier contact enregistrées par la reconnaissance. */ e => e.kind === 'contact')!.detail.w, 22, 'the reported width reaches the journal');
  for (const k of ['cluster', 'puller', 'release']) assert.ok(kinds.includes(k), `${k} is journaled`);
  assert.equal(log.find(/* Retrouve la décision qui attribue le rôle de poche à un doigt. */ e => e.kind === 'puller')!.detail.id, 3);
  assert.equal(log.find(/* Retrouve la décision de relâchement du tir. */ e => e.kind === 'release')!.detail.result, 'fired');
  assert.equal(r.sent.length, 1);
  r.recognizer.releaseAll();
});
/** Vérifie le rejet des paumes et la raison enregistrée pour une traction trop courte. */
await test('a palm-sized contact is rejected and journaled with its width; a short pull is journaled as such', async () => {
  const r = rig(); r.setSize(300);
  r.down(9, F3.x, F3.y); r.up(9, F3.x, F3.y);
  const palm = r.view.debug.gestures.find(/* Retrouve l’événement de paume pour vérifier sa largeur enregistrée. */ e => e.kind === 'contact')!;
  assert.equal(palm.detail.palm, true);
  r.setSize(1);
  r.down(1, F1.x, F1.y); await sleep(4);
  r.down(2, F2.x, F2.y); await sleep(4);
  r.down(3, 940, 515); await sleep(4);
  r.move(3, 940, 535); r.up(3, 940, 535);
  assert.deepEqual(r.sent, []);
  const release = r.view.debug.gestures.find(/* Retrouve le refus de traction trop courte dans le journal. */ e => e.kind === 'release')!;
  assert.deepEqual([release.detail.result, release.detail.min], ['shortPull', 40], 'the refusal says why');
  r.recognizer.releaseAll();
});
/** Vérifie la limite du journal et ses exports texte et CSV. */
await test('the journal is bounded and exports as CSV and overlay text', async () => {
  const log: Array<{ t: number; kind: string; detail: Record<string, number | string | boolean> }> = [];
  for (let i = 0; i < GESTURE_LOG_MAX + 25; i++) recordGesture(log, 'contact', { id: i, note: 'a "quoted" word' }, i * 1000);
  assert.equal(log.length, GESTURE_LOG_MAX);
  assert.equal(log[0].detail.id, 25, 'the oldest entries are dropped');
  const csv = gestureLogCsv(log).split(/\r?\n/);
  assert.equal(csv[0], 't,kind,detail');
  assert.equal(csv.length, GESTURE_LOG_MAX + 1);
  assert.equal(log.length, 2000, 'a whole game fits in the journal');
  assert.ok(csv[1].startsWith('25,contact,"{""id"":25'), 'the detail column is one quoted JSON cell');
  assert.equal(formatGestureEntry({ t: 1.5, kind: 'puller', detail: { id: 3, ratio: 2.3456 } }), '1.500 puller id=3 ratio=2.35');
});

let failed = 0;
for (const [name, ok, err] of results) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}`);
  if (!ok) { failed++; console.log(`      ${err}`); }
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
