/**
 * Vérifie l'écran copilote à partir des états reçus et des changements de visibilité.
 * Liens : client-phone/copilot/CopilotScreen.ts, client-shared/playerSession.ts.
 */
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { CopilotScreen } from '../../client-phone/copilot/CopilotScreen.js';
import { requestVibration } from '../../client-phone/copilot/pickupVibration.js';
import { PhoneSession } from '../../client-shared/playerSession.js';
import { createInitialState } from '../../server/rules/session/initialState.js';
import { generatePreset } from '../../server/track/MapGenerator.js';
import type { ItemKind, Team } from '../../server/types.js';

class TestElement extends EventTarget {
  textContent = '';
  disabled = false;
  hidden = false;
  open = false;
  className = '';
  id = '';
  parentElement: TestElement | null = null;
  readonly children: TestElement[] = [];
  readonly attributes = new Map<string, string>();
  private pointer: number | null = null;
  readonly classList = { add: () => {}, remove: () => {} };

  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  getContext(): null { return null; }
  append(...children: (TestElement | string)[]): void {
    for (const child of children) {
      const element = typeof child === 'string' ? Object.assign(new TestElement(), { textContent: child }) : child;
      element.remove();
      element.parentElement = this;
      this.children.push(element);
    }
  }
  before(element: TestElement): void {
    if (!this.parentElement) return;
    element.remove();
    element.parentElement = this.parentElement;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 0, element);
  }
  remove(): void {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  showModal(): void { this.open = true; }
  close(): void { this.open = false; this.dispatchEvent(new Event('close')); }
  focus(): void { document.activeElement = this; }
  setPointerCapture(id: number): void { this.pointer = id; }
  hasPointerCapture(id: number): boolean { return this.pointer === id; }
  releasePointerCapture(): void { this.pointer = null; }
}

class TestSocket extends EventTarget {
  static OPEN = 1;
  readyState = TestSocket.OPEN;
  readonly sent: Record<string, unknown>[] = [];
  constructor() {
    super();
    sockets.push(this);
    queueMicrotask(() => this.dispatchEvent(new Event('open')));
  }
  send(raw: string): void { this.sent.push(JSON.parse(raw)); }
  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
  receive(message: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}

const sockets: TestSocket[] = [];
const document = Object.assign(new EventTarget(), {
  hidden: false, activeElement: null as TestElement | null, createElement: () => new TestElement(),
});
const stored = new Map<string, string>();
const vibrations: number[] = [];
const globals = globalThis as unknown as Record<string, unknown>;
const haptics = { vibrate: (duration: number) => { vibrations.push(duration); return true; } };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: haptics });
Object.assign(globals, {
  document,
  window: new EventTarget(),
  WebSocket: TestSocket,
  location: new URL('http://localhost/play?room=ABCDE&seat=A-copilot'),
  history: { replaceState: () => {} },
  sessionStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  },
  fetch: async () => new Response(JSON.stringify({ room: 'ABCDE' })),
});

const state = createInitialState();
state.phase = 'RACE';
state.tangiblePlacementMode = 'touch';
let socket: TestSocket;
const session = new PhoneSession(
  () => { if (session.state) screen.update(session.state); },
  'A-copilot',
);
const screen = new CopilotScreen(session, 'A-copilot');
const elements = (screen.root as unknown as TestElement).children;
const station = elements.flatMap(element => element.children).find(element => element.className === 'copilot-station')!.children;
const controls = station.find(element => element.className === 'copilot-controls')!;
const power = controls.children.find(element => element.attributes.get('aria-label')?.startsWith('POWER'))!;
const repair = controls.children.find(element => element.attributes.get('aria-label') === 'Maintenir pour réparer')!;
const stock = station.find(element => element.id === 'copilot-stock')!;
const pickupAlert = station.find(element => element.className === 'pickup-alert')!;
const actionStatus = station.find(element => element.className === 'copilot-action')!;

/** Transmet au client le dernier état reçu du serveur et son horodatage. */
function snapshot(t = Date.now()): void { socket.receive({ type: 'State', state, t }); }

/** Publie un nouvel état après un ramassage, comme le serveur en course. */
function pickup(team: Team, kind: ItemKind, delayedAt?: number): void {
  mock.timers.tick(5);
  state.cars[team].heldItem = kind;
  state.cars[team].lastPickup = { kind, at: delayedAt ?? Date.now() };
  snapshot();
}

/** Simule le passage de la page en arrière-plan ou son retour au premier plan. */
function setHidden(hidden: boolean): void {
  document.hidden = hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Vérifie le filtrage des alertes et le retour visuel en l'absence de vibration. */
async function checkPickups(): Promise<void> {
  await session.open('ABCDE');
  socket = sockets.at(-1)!;
  snapshot();
  pickup('A', 'boost');
  assert.equal(pickupAlert.textContent, '', 'la place doit être confirmée');
  socket.receive({ type: 'Joined', seat: 'A-copilot', token: 'seat-token' });
  state.cars.B.itemArmed = true;
  snapshot();
  pickup('B', 'slingshot');
  assert.equal(pickupAlert.textContent, '', 'l’équipe adverse ne déclenche pas de signal');
  pickup('A', 'boost');
  snapshot();
  assert.deepEqual(vibrations, [150], 'un seul signal même quand le serveur répète cet état');
  assert.match(pickupAlert.textContent, /Bonus ramassé.*Boost/);
  assert.match(stock.textContent, /Boost en stock.*adverse/);
  assert.equal(power.disabled, true);
  state.cars.B.itemArmed = false;
  snapshot();
  assert.equal(power.disabled, false);
  assert.deepEqual(vibrations, [150], 'le déblocage de POWER ne rejoue pas le signal');

  setHidden(true);
  pickup('A', 'slingshot');
  setHidden(false);
  pickup('A', 'slingshot', Date.now() - 1_000);
  assert.equal(pickupAlert.textContent, '');
  assert.deepEqual(vibrations, [150], 'aucun signal ne doit être rejoué au retour');

  state.tangiblePlacement = { id: 2, token: 1, expiresAt: Date.now() + 20_000 };
  snapshot();
  pickup('A', 'slingshot');
  assert.deepEqual(vibrations, [150, 150], 'la pose ne suspend que les commandes, pas l’alerte');
  assert.equal(power.disabled, true);
  assert.match(stock.textContent, /Pose en cours/);
  Object.defineProperty(globalThis, 'navigator', { value: {} });
  assert.equal(requestVibration(500), 'unavailable');
  pickup('A', 'slingshot');
  assert.match(pickupAlert.textContent, /Bonus ramassé.*Lance-pierre/);
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: () => false } });
  assert.equal(requestVibration(500), 'refused');
  Object.defineProperty(globalThis, 'navigator', { value: haptics });
  state.tangiblePlacement = null;
  state.cars.A.heldItem = 'boost';
  snapshot();
}

/** Vérifie l'attente d'une confirmation, la réparation et la reprise d'une connexion. */
async function checkCommandsAndResume(): Promise<void> {
  power.dispatchEvent(new Event('click'));
  assert.equal(socket.sent.at(-1)?.type, 'Power');
  assert.match(actionStatus.textContent, /confirmation/);
  assert.equal(power.disabled, true);
  mock.timers.tick(999);
  assert.equal(power.disabled, true);
  mock.timers.tick(1);
  assert.equal(actionStatus.textContent, '');
  assert.equal(power.disabled, false);
  power.dispatchEvent(new Event('click'));
  state.cars.A.itemArmed = true;
  state.cars.A.itemArmVersion++;
  snapshot();
  assert.equal(actionStatus.textContent, '');
  assert.match(stock.textContent, /Boost armé/);

  repair.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 1, button: 0 }));
  assert.equal(socket.sent.at(-1)?.on, true);
  repair.dispatchEvent(Object.assign(new Event('pointercancel'), { pointerId: 1 }));
  assert.equal(socket.sent.at(-1)?.on, false);
  repair.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 1, button: 0 }));
  setHidden(true);
  assert.equal(socket.sent.at(-1)?.on, false);
  setHidden(false);

  socket.close();
  assert.equal(repair.disabled, true);
  mock.timers.tick(2_000);
  await Promise.resolve();
  socket = sockets.at(-1)!;
  assert.equal(socket.sent.at(-1)?.token, 'seat-token');
  snapshot();
  pickup('A', 'boost');
  socket.receive({ type: 'Joined', seat: 'A-copilot', token: 'seat-token' });
  assert.equal(pickupAlert.textContent, '');
  assert.match(stock.textContent, /Boost armé/);
  assert.deepEqual(vibrations, [150, 150], 'un ancien stock ne déclenche pas de vibration à la reprise');
}

/** Vérifie que le téléphone contrôle les objets déjà posés et ne propose aucune annonce. */
function checkTangibleControls(): void {
  const cards = elements.find(element => element.className === 'tangible-cards')!;
  const wall = cards.children.find(element => element.children[0]?.textContent === 'Mur')!;
  const actions = wall.children[2].children;
  assert.deepEqual(actions.map(element => element.textContent), ['Activer', 'Retirer']);
  assert.equal(actions[0].hidden, true);
  state.tangibles[1] = { x: .5, y: .5, angle: 0, status: 'placed', kind: 'wall', active: false, team: null, dockTeam: null };
  snapshot();
  assert.equal(actions[0].hidden, false);
  actions[0].dispatchEvent(new Event('click'));
  assert.equal(socket.sent.at(-1)?.type, 'TangibleControl');
  assert.equal(socket.sent.at(-1)?.id, 1);
}

/** Vérifie l'ouverture de la carte et une pose utilisable au clavier depuis le curseur. */
function checkAccessiblePlacement(): void {
  const section = elements.find(element => element.className === 'accessible-placement')!;
  const [label, open, dialog] = section.children;
  const toggle = label.children[0] as TestElement & { checked: boolean };
  assert.equal(open.hidden, true);
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
  assert.equal(socket.sent.at(-1)?.type, 'SetAccessibility');
  assert.equal(socket.sent.at(-1)?.on, true);
  assert.equal(open.hidden, true, 'le serveur doit confirmer le mode');
  state.seats['A-copilot'].accessible = true;
  state.track = generatePreset();
  state.wideTable = true;
  snapshot();
  assert.equal(open.hidden, false);
  open.dispatchEvent(new Event('click'));
  assert.equal(dialog.open, true);
  assert.ok(dialog.children.some(child => child.className === 'copilot-station'));

  const tools = dialog.children.find(child => child.children.some(button => button.textContent === 'Mur'))!;
  tools.children.find(element => element.textContent === 'Mur')!.dispatchEvent(new Event('click'));
  const precision = dialog.children.find(child => child.children[0]?.textContent === 'Viser avec les commandes')!;
  const position = precision.children[1].children[1] as TestElement & { value: string };
  position.value = '50';
  position.dispatchEvent(new Event('input'));
  const actions = dialog.children.find(child => child.children.some(button => button.textContent === 'Confirmer'))!;
  assert.equal(actions.children[0].disabled, false);
  actions.children[0].focus();
  actions.children[0].dispatchEvent(new Event('click'));
  const sent = socket.sent.at(-1)!;
  assert.equal(sent.type, 'RemotePlacement');
  assert.equal(actions.children[0].disabled, true);
  socket.receive({ type: 'RemotePlacementResult', requestId: sent.requestId, ok: true });
  assert.ok(dialog.children.some(child => child.textContent.includes('Action confirmée')));
  assert.equal(document.activeElement?.textContent, 'Mur');
  state.cars.A.heldItem = 'slingshot';
  state.cars.A.itemArmed = true;
  snapshot();
  tools.children.find(element => element.textContent === 'Lance-pierre')!.dispatchEvent(new Event('click'));
  assert.equal(actions.children[0].hidden, true, 'le geste au lance-pierre ne propose pas de bouton de confirmation');
  precision.open = true;
  precision.dispatchEvent(new Event('toggle'));
  assert.equal(actions.children[0].hidden, false, 'la confirmation reste accessible dans la visée manuelle');
  dialog.close();
  assert.ok(elements.flatMap(element => element.children).some(child => child.className === 'copilot-station'));
}

mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
try {
  await checkPickups();
  await checkCommandsAndResume();
  checkTangibleControls();
  checkAccessiblePlacement();
  assert.equal(requestVibration(500), 'accepted');
  assert.equal(vibrations.at(-1), 500, 'le test manuel permet de sentir une impulsion plus longue');
  console.log('✓ Téléphone copilote : vibration au ramassage, signal visuel, reprise et confirmation des commandes');
} finally {
  screen.close();
  session.suspend();
  mock.timers.reset();
}
