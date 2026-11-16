/**
 * Scénarios de la console Oz rapide : commandes en rafale, anciens états réseau et annulation.
 * Liens : client-oz/OzController.ts, client-oz/OzMap.ts.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import { OzMap } from '../../client-oz/OzMap.js';
import { OzController, ozShortcut } from '../../client-oz/OzController.js';
import { viewTransform, viewToWorld, worldToView } from '../../client-oz/ozView.js';
import { wallEndpoints } from '../../client-shared/tangibleGeometry.js';
import type { Vec2 } from '../../server/types.js';
import { config } from '../../server/config.js';
import { test, section, rig, raceRig } from './harness.js';
import { place } from './scenarioActions.js';

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
