/**
 * Vérifie les touchers de l'écran de préparation : choix d'appareil sur les quatre fiches (dont les deux tournées vers le haut), départ conditionné, retour.
 * Liens : client-table/setup/setupLayout.ts, client-table/gesture/contactDown.ts.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import { GestureRecognizer } from '../../client-table/gesture/GestureRecognizer.js';
import { createView } from '../../client-table/view.js';
import { createInitialState } from '../../server/rules/GameRules.js';
import { SEAT_CARDS, SETUP_BACK, SETUP_START, WIIMOTE_BUTTON, devicesFor, tileRect } from '../../client-table/setup/setupLayout.js';
import { PANELS, steerArea } from '../../server/layout.js';
import type { SeatId } from '../../server/types.js';

const seats = Object.keys(SEAT_CARDS) as SeatId[];

/** Prépare une table en phase de préparation et renvoie un doigt qui touche puis lève à un point donné. */
function setup() {
  const handlers: Record<string, (e: unknown) => void> = {};
  const canvas = {
    addEventListener: (name: string, handler: (e: unknown) => void) => { handlers[name] = handler; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
    setPointerCapture: () => {},
  };
  const view = createView(() => Date.now());
  const state = createInitialState();
  state.phase = 'SETUP';
  view.state = state;
  const sent: Array<Record<string, unknown>> = [];
  const recognizer = new GestureRecognizer(canvas as never, view, message => sent.push(message));
  const connected: string[] = [];
  recognizer.connectWiimote = team => { connected.push(team); };
  let id = 0;
  const tap = (x: number, y: number) => {
    id++;
    const event = (type: string) => ({ type, pointerId: id, clientX: x, clientY: y, pointerType: 'touch', width: 1, height: 1, timeStamp: Date.now(), preventDefault() {} });
    handlers.pointerdown(event('pointerdown'));
    handlers.pointerup(event('pointerup'));
  };
  return { state, sent, tap, connected, view };
}

/** Renvoie le centre d'un rectangle de la table. */
const middle = (b: { x: number; y: number; w: number; h: number }) => [b.x + b.w / 2, b.y + b.h / 2] as const;

for (const seat of seats) for (const device of devicesFor(seat)) {
  const { sent, tap, connected } = setup(), { cx, cy, rot } = SEAT_CARDS[seat], t = tileRect(seat, device);
  const lx = t.x + t.w / 2, ly = t.y + t.h / 2;
  tap(cx + lx * Math.cos(rot) - ly * Math.sin(rot), cy + lx * Math.sin(rot) + ly * Math.cos(rot));
  assert.deepEqual(sent, [{ type: 'SetSeatDevice', seat, device }], `${seat} ${device}`);
  assert.deepEqual(connected, device === 'wiimote' ? [seat[0]] : [], 'choisir la manette Wii ouvre sa connexion au relâchement');
}
console.log('  ✓ chaque choix d’appareil est atteignable sur sa fiche, y compris celles tournées vers le haut');

const { state, sent, tap } = setup();
tap(...middle(SETUP_START));
assert.deepEqual(sent, [{ type: 'ConfirmSetup' }], 'quatre postes sur la table : le départ est immédiat');
state.seatDevices['A-pilot'] = 'phone';
sent.length = 0; tap(...middle(SETUP_START));
assert.equal(sent.length, 0, 'un pilote sur téléphone absent bloque le départ');
state.seats['A-pilot'].connected = true;
tap(...middle(SETUP_START));
assert.deepEqual(sent, [{ type: 'ConfirmSetup' }], 'connecté, il débloque le départ');
console.log('  ✓ le départ attend les joueurs annoncés hors de la table');

// Le bouton Connecter de la manette Wii n'existe que tant que la manette manque.
for (const seat of ['A-pilot', 'B-pilot'] as const) {
  const { state: wii, tap: touch, connected, view } = setup(), { cx, cy, rot } = SEAT_CARDS[seat];
  wii.seatDevices[seat] = 'wiimote';
  const lx = WIIMOTE_BUTTON.x + WIIMOTE_BUTTON.w / 2, ly = WIIMOTE_BUTTON.y + WIIMOTE_BUTTON.h / 2;
  const at = [cx + lx * Math.cos(rot) - ly * Math.sin(rot), cy + lx * Math.sin(rot) + ly * Math.cos(rot)] as const;
  touch(...at);
  assert.deepEqual(connected, [seat[0]], `${seat} : le bouton Connecter ouvre la manette`);
  view.wiimotes[seat[0] as 'A' | 'B'] = { status: 'ready', number: 1, battery: null, lowBattery: false, notice: '' };
  touch(...at);
  assert.equal(connected.length, 1, `${seat} : manette connectée, plus de bouton`);
}
console.log('  ✓ le bouton Connecter de la manette Wii n’existe que tant qu’elle manque');

// Un pilote qui conduit au téléphone ou à la manette n'a ni direction ni pédale sur la table.
{
  const panel = PANELS.find(p => p.team === 'A' && p.role === 'pilot')!, area = steerArea('auto');
  const at = [panel.cx + area.x, panel.cy + area.y] as const;
  const alone = setup();
  alone.state.phase = 'RACE';
  alone.tap(...at);
  assert.ok(alone.sent.some(m => m.type === 'PilotInput'), 'sans appareil distant, la direction de la table fonctionne');
  const phone = setup();
  phone.state.phase = 'RACE';
  phone.state.seats['A-pilot'] = { taken: true, connected: true };
  phone.tap(...at);
  assert.equal(phone.sent.length, 0, 'un pilote sur téléphone n’a plus de direction sur la table');
  const wii = setup();
  wii.state.phase = 'RACE';
  wii.state.seatDevices['A-pilot'] = 'wiimote';
  wii.state.wiimotes.A = 1;
  wii.tap(...at);
  assert.equal(wii.sent.length, 0, 'un pilote à la manette Wii non plus');
  wii.state.wiimotes.A = null;
  wii.tap(...at);
  assert.ok(wii.sent.some(m => m.type === 'PilotInput'), 'manette perdue : la table reprend ses commandes');
}
console.log('  ✓ le poste d’un pilote distant est inerte sur la table, et se rouvre si l’appareil disparaît');

sent.length = 0; tap(...middle(SETUP_BACK));
assert.deepEqual(sent, [{ type: 'Reset' }]);
sent.length = 0; tap(960, 700);
assert.equal(sent.length, 0, 'un toucher à côté des commandes ne fait rien');
console.log('  ✓ retour à l’accueil, et aucun toucher parasite');
process.exit(0);
