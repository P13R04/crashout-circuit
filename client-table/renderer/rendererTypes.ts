/**
 * Type partagé du moteur de rendu : le contexte Canvas 2D reçu par chaque fonction de dessin.
 * Liens : client-table/renderer/Renderer.ts.
 * Réexporté par client-table/renderer/Renderer.ts, qui reste la façade du moteur de rendu de la table.
 */


/** Désigne le contexte Canvas 2D partagé par les fonctions de dessin du module. */
export type Ctx = CanvasRenderingContext2D;
