/**
 * Scénarios de la console Oz : relecture des poses, manipulation du mur et carte simulée.
 * Liens : client-oz/OzMap.ts, client-oz/OzController.ts, client-oz/ozView.ts.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import { OzMap } from '../../client-oz/OzMap.js';
import { rotateWall, wallEndpoints } from '../../client-shared/tangibleGeometry.js';
import { GameRules } from '../../server/GameRules.js';
import { config } from '../../server/config.js';
import { test, section, raceRig, msg, aim } from './harness.js';
import { pilot, charge, place } from './scenarioActions.js';

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
