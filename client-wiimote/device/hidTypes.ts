/**
 * Types minimaux de WebHID, absents de la bibliothèque DOM de TypeScript.
 * Liens : client-wiimote/device/webHidWiimote.ts, client-wiimote/main.ts.
 * Seuls les membres utilisés sont décrits ; un faux périphérique de test peut les implémenter sans navigateur.
 */

export interface HidInputReportEventLike {
  readonly reportId: number;
  readonly data: DataView;
}

export interface HidDeviceLike {
  readonly opened: boolean;
  readonly productName?: string;
  readonly vendorId: number;
  readonly productId: number;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: Uint8Array): Promise<void>;
  addEventListener(type: 'inputreport', listener: (event: HidInputReportEventLike) => void): void;
  removeEventListener(type: 'inputreport', listener: (event: HidInputReportEventLike) => void): void;
}

export interface HidConnectionEventLike { readonly device: HidDeviceLike }

export interface HidApiLike {
  requestDevice(options: { filters: readonly { vendorId: number; productId: number }[] }): Promise<HidDeviceLike[]>;
  getDevices(): Promise<HidDeviceLike[]>;
  addEventListener(type: 'connect' | 'disconnect', listener: (event: HidConnectionEventLike) => void): void;
  removeEventListener(type: 'connect' | 'disconnect', listener: (event: HidConnectionEventLike) => void): void;
}

/** Renvoie navigator.hid lorsque la page est en contexte sécurisé et que le navigateur gère WebHID. */
export function browserHid(): HidApiLike | null {
  const hid = (globalThis.navigator as unknown as { hid?: HidApiLike } | undefined)?.hid;
  return globalThis.isSecureContext && hid ? hid : null;
}
