/**
 * Constantes de la reconnaissance tactile : nombre de contacts, seuils de traction du lance-pierre et de la prise de bord.
 * Liens : client-table/gestureTuning.ts (seuils réglables par l'URL).
 * Réexporté par client-table/GestureRecognizer.ts, qui reste la façade du lecteur de gestes.
 */


export const MAX_CONTACTS = 10;
// Settle delay, sling cluster / pouch thresholds, boost span and palm width are in
// gestureTuning.ts (adjustable from the URL); the rest are fixed here.
export const SIM_FORK_HALF_PX = 38;    // mouse stand-in: virtual anchors either side of the pull axis
export const BOOST_MIN_PX = 0;
export const PULL_MIN_PX = 20;
export const PULL_MAX_PX = 220;
export const PULL_PAIR_MAX_PX = 260;
export const PULL_EDGE_INDEX_GAP = 32;
