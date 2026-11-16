/**
 * Décode les rapports d'entrée de la Wiimote en boutons, accélération brute et état de la manette.
 * Liens : client-wiimote/hid/wiimoteProtocol.ts, client-wiimote/control/wiimoteCommandSource.ts.
 * Module pur : aucun accès au navigateur, testable à partir d'octets fixes.
 */
import { ACCEL_REPORTS, BATTERY_FULL, BUTTON_REPORTS, INPUT_REPORT } from './wiimoteProtocol.js';

export type WiimoteButton = 'left' | 'right' | 'down' | 'up' | 'plus' | 'two' | 'one' | 'b' | 'a' | 'minus' | 'home';
export type Buttons = Readonly<Record<WiimoteButton, boolean>>;

/** Accélération brute sur 8 bits par axe, repos autour de 128. */
export interface RawAccel { x: number; y: number; z: number }

export interface WiimoteStatus {
  /** Charge en pourcentage, entre 0 et 100. */
  battery: number;
  lowBattery: boolean;
  extension: boolean;
  /** LED allumées, bit 0 = LED 1. */
  leds: number;
}

export type DecodedReport =
  | { kind: 'buttons'; buttons: Buttons }
  | { kind: 'motion'; buttons: Buttons; accel: RawAccel }
  | { kind: 'status'; buttons: Buttons; status: WiimoteStatus }
  | { kind: 'ignored' };

/** Octet (0 ou 1) et masque de chaque bouton ; les autres bits portent des bits de poids faible de l'accéléromètre. */
const BUTTON_BITS: readonly (readonly [WiimoteButton, 0 | 1, number])[] = [
  ['left', 0, 0x01], ['right', 0, 0x02], ['down', 0, 0x04], ['up', 0, 0x08], ['plus', 0, 0x10],
  ['two', 1, 0x01], ['one', 1, 0x02], ['b', 1, 0x04], ['a', 1, 0x08], ['minus', 1, 0x10], ['home', 1, 0x80],
];

export const NO_BUTTONS: Buttons = decodeButtons(0, 0);

/** Lit les onze boutons en masquant les bits d'accéléromètre des deux octets. */
export function decodeButtons(byte0: number, byte1: number): Buttons {
  const pressed = {} as Record<WiimoteButton, boolean>;
  for (const [name, index, mask] of BUTTON_BITS) pressed[name] = ((index === 0 ? byte0 : byte1) & mask) !== 0;
  return pressed;
}

/** Décode un rapport d'entrée ; un rapport inconnu ou trop court est ignoré. */
export function decodeInputReport(reportId: number, data: Uint8Array): DecodedReport {
  if (reportId === INPUT_REPORT.status) return data.length >= 6 ? statusReport(data) : { kind: 'ignored' };
  if (!BUTTON_REPORTS.has(reportId) || data.length < 2) return { kind: 'ignored' };
  const buttons = decodeButtons(data[0], data[1]);
  if (!ACCEL_REPORTS.has(reportId)) return { kind: 'buttons', buttons };
  if (data.length < 5) return { kind: 'ignored' };
  return { kind: 'motion', buttons, accel: { x: data[2], y: data[3], z: data[4] } };
}

/** Lit la batterie (octet 5 sur 0xC8), la batterie faible (bit 0), l'extension (bit 1) et les LED (bits 4 à 7). */
function statusReport(data: Uint8Array): DecodedReport {
  const flags = data[2];
  return {
    kind: 'status',
    buttons: decodeButtons(data[0], data[1]),
    status: {
      battery: Math.min(100, Math.round(data[5] / BATTERY_FULL * 100)),
      lowBattery: (flags & 0x01) !== 0,
      extension: (flags & 0x02) !== 0,
      leds: flags >> 4,
    },
  };
}
