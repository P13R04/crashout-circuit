/**
 * Ce que la table affiche d'une manette Wii branchée à son ordinateur : état, numéro, batterie et message.
 * Liens : client-table/wiimote/TableWiimotes.ts (producteur), client-table/setup/seatCard.ts (affichage), client-table/view.ts.
 * Module pur : aucune dépendance au navigateur, pour que le dessin et les tests n'aient pas besoin de WebHID.
 */

/** `unsupported` : le navigateur n'a pas WebHID ; `absent` : aucune manette ouverte ; `calibrating` : ouverte, neutre en mesure. */
export type WiimoteStatus = 'unsupported' | 'absent' | 'connecting' | 'calibrating' | 'ready';

export interface WiimoteView {
  status: WiimoteStatus;
  /** Numéro de la manette (1 à 4), donné par l'ordre de connexion ; il s'allume aussi sur ses LED. */
  number: number | null;
  battery: number | null;
  lowBattery: boolean;
  notice: string;
}

/** État d'un pilote sans manette. */
export function noWiimote(): WiimoteView {
  return { status: 'absent', number: null, battery: null, lowBattery: false, notice: '' };
}

/** Indique qu'une manette est ouverte et vérifiée par la table. */
export function wiimoteConnected(view: WiimoteView): boolean {
  return view.number !== null && (view.status === 'calibrating' || view.status === 'ready');
}
