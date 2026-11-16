/**
 * Constantes du protocole HID de la Wiimote : identifiants USB, rapports et échelle de l'accéléromètre.
 * Liens : client-wiimote/hid/reportDecoder.ts, client-wiimote/hid/outputReports.ts, tools/wiimote-monitor/index.html (référence).
 * Valeurs d'après la documentation publique de la manette ; l'échelle de l'accéléromètre reste à confirmer sur la manette réelle.
 */

/** Filtres de navigator.hid.requestDevice : Wiimote (RVL-CNT-01) et Wii Remote Plus (RVL-CNT-01-TR). */
export const WIIMOTE_FILTERS = [
  { vendorId: 0x057e, productId: 0x0306 },
  { vendorId: 0x057e, productId: 0x0330 },
] as const;

/** Identifiants des rapports d'entrée (l'identifiant n'est pas dans `data`). */
export const INPUT_REPORT = { status: 0x20, buttons: 0x30, buttonsAccel: 0x31 } as const;

/** Identifiants des rapports de sortie. */
export const OUTPUT_REPORT = { rumble: 0x10, leds: 0x11, dataMode: 0x12, statusRequest: 0x15 } as const;

/** Rapports d'entrée qui portent l'accéléromètre en octets 2 à 4. */
export const ACCEL_REPORTS: ReadonlySet<number> = new Set([0x31, 0x33, 0x35, 0x37]);
/** Rapports d'entrée dont les deux premiers octets sont les boutons. */
export const BUTTON_REPORTS: ReadonlySet<number> = new Set([0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37]);

/** Valeur brute au repos d'un axe de l'accéléromètre. */
export const ACCEL_REST = 128;
/** Unités brutes par g, environ (à confirmer sur la manette réelle). */
export const ACCEL_PER_G = 25;
/** Valeur brute de la batterie pleine. */
export const BATTERY_FULL = 0xc8;
