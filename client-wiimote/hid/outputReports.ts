/**
 * Construit les rapports de sortie de la Wiimote : mode de données, LED, vibration et demande d'état.
 * Liens : client-wiimote/hid/wiimoteProtocol.ts, client-wiimote/device/webHidWiimote.ts.
 * Le bit 0 de tout rapport de sortie commande aussi la vibration : chaque constructeur le reçoit pour ne pas l'écraser.
 */
import { OUTPUT_REPORT } from './wiimoteProtocol.js';

export interface OutputReport { id: number; data: Uint8Array }

/** Mode de données : boutons + accéléromètre (0x31), en continu ou seulement à chaque changement. */
export function dataModeReport(rumble = false, continuous = false): OutputReport {
  return { id: OUTPUT_REPORT.dataMode, data: Uint8Array.of((continuous ? 0x04 : 0x00) | rumbleBit(rumble), 0x31) };
}

/** Allume la LED du joueur (1 à 4) ; null les éteint toutes. */
export function ledReport(player: number | null, rumble = false): OutputReport {
  const led = player !== null && player >= 1 && player <= 4 ? 0x10 << (player - 1) : 0;
  return { id: OUTPUT_REPORT.leds, data: Uint8Array.of(led | rumbleBit(rumble)) };
}

/** Démarre ou arrête la vibration. */
export function rumbleReport(on: boolean): OutputReport {
  return { id: OUTPUT_REPORT.rumble, data: Uint8Array.of(rumbleBit(on)) };
}

/** Demande un rapport d'état (batterie, extension, LED). */
export function statusRequestReport(rumble = false): OutputReport {
  return { id: OUTPUT_REPORT.statusRequest, data: Uint8Array.of(rumbleBit(rumble)) };
}

/** Valeur du bit de vibration. */
function rumbleBit(on: boolean): number {
  return on ? 0x01 : 0x00;
}
