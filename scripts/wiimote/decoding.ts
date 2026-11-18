/**
 * Vérifie le décodage des rapports de la Wiimote et la construction des rapports de sortie, à partir d'octets fixes.
 * Liens : client-wiimote/hid/reportDecoder.ts, client-wiimote/hid/outputReports.ts.
 */
import assert from 'node:assert/strict';
import { decodeButtons, decodeInputReport, NO_BUTTONS } from '../../client-wiimote/hid/reportDecoder.js';
import { dataModeReport, ledReport, rumbleReport, statusRequestReport } from '../../client-wiimote/hid/outputReports.js';

const bytes = (...values: number[]) => Uint8Array.from(values);

// Chaque bit de bouton, un par un.
for (const [name, byte, mask] of [
  ['left', 0, 0x01], ['right', 0, 0x02], ['down', 0, 0x04], ['up', 0, 0x08], ['plus', 0, 0x10],
  ['two', 1, 0x01], ['one', 1, 0x02], ['b', 1, 0x04], ['a', 1, 0x08], ['minus', 1, 0x10], ['home', 1, 0x80],
] as const) {
  const pressed = decodeButtons(byte === 0 ? mask : 0, byte === 1 ? mask : 0);
  assert.equal(pressed[name], true, name);
  assert.equal(Object.values(pressed).filter(Boolean).length, 1, `seul ${name} est appuyé`);
}
assert.deepEqual(decodeButtons(0, 0), NO_BUTTONS);

// Les bits d'accéléromètre (0x60 de l'octet 0, 0x60 de l'octet 1) ne doivent jamais passer pour des boutons.
assert.deepEqual(decodeButtons(0x60, 0x60), NO_BUTTONS);
assert.equal(decodeButtons(0x60 | 0x08, 0x60 | 0x04).up, true);
assert.equal(decodeButtons(0x60 | 0x08, 0x60 | 0x04).b, true);
assert.equal(decodeButtons(0x60, 0x60).a, false);

// 0x30 : boutons seuls.
assert.deepEqual(decodeInputReport(0x30, bytes(0x00, 0x08)), { kind: 'buttons', buttons: { ...NO_BUTTONS, a: true } });
assert.equal(decodeInputReport(0x30, bytes(0x00)).kind, 'ignored');

// 0x31 : boutons + accéléromètre X, Y, Z sur 8 bits.
const motion = decodeInputReport(0x31, bytes(0x00, 0x04, 130, 128, 153));
assert.equal(motion.kind, 'motion');
if (motion.kind === 'motion') {
  assert.equal(motion.buttons.b, true);
  assert.deepEqual(motion.accel, { x: 130, y: 128, z: 153 });
}
assert.equal(decodeInputReport(0x31, bytes(0x00, 0x04, 130)).kind, 'ignored');

// 0x20 : état, batterie = octet 5 / 0xC8, bit 0 de l'octet 2 = batterie faible, bit 1 = extension, bits 4 à 7 = LED.
const status = decodeInputReport(0x20, bytes(0x00, 0x00, 0x11, 0x00, 0x00, 0x64));
assert.equal(status.kind, 'status');
if (status.kind === 'status') {
  assert.deepEqual(status.status, { battery: 50, lowBattery: true, extension: false, leds: 1 });
}
const full = decodeInputReport(0x20, bytes(0, 0, 0x22, 0, 0, 0xc8));
if (full.kind === 'status') assert.deepEqual(full.status, { battery: 100, lowBattery: false, extension: true, leds: 2 });
assert.equal(decodeInputReport(0x20, bytes(0, 0, 0)).kind, 'ignored');

// Rapports qui ne portent pas les boutons, ou inconnus.
assert.equal(decodeInputReport(0x21, bytes(0, 0, 0, 0, 0, 0)).kind, 'ignored');
assert.equal(decodeInputReport(0x22, bytes(0, 0, 0, 0)).kind, 'ignored');
assert.equal(decodeInputReport(0x99, bytes(0, 0)).kind, 'ignored');

// Rapports de sortie : le bit 0 reste la vibration.
const out = (r: { id: number; data: Uint8Array }) => [r.id, ...r.data];
assert.deepEqual(out(dataModeReport()), [0x12, 0x00, 0x31]);
assert.deepEqual(out(dataModeReport(false, true)), [0x12, 0x04, 0x31]);
assert.deepEqual(out(dataModeReport(true)), [0x12, 0x01, 0x31]);
assert.deepEqual(out(ledReport(1)), [0x11, 0x10]);
assert.deepEqual(out(ledReport(2)), [0x11, 0x20]);
assert.deepEqual(out(ledReport(4)), [0x11, 0x80]);
assert.deepEqual(out(ledReport(1, true)), [0x11, 0x11]);
assert.deepEqual(out(ledReport(null)), [0x11, 0x00]);
assert.deepEqual(out(ledReport(5)), [0x11, 0x00]);
assert.deepEqual(out(rumbleReport(true)), [0x10, 0x01]);
assert.deepEqual(out(rumbleReport(false)), [0x10, 0x00]);
assert.deepEqual(out(statusRequestReport()), [0x15, 0x00]);
assert.deepEqual(out(statusRequestReport(true)), [0x15, 0x01]);

console.log('✓ Wiimote : décodage des boutons, de l’accéléromètre et de l’état, rapports de sortie');
