/**
 * Surfaces touchables des écrans et commandes communes, partagées avec la reconnaissance des gestes.
 * Liens : client-table/gesture/GestureRecognizer.ts, server/layout.ts.
 * Réexporté par client-table/renderer/Renderer.ts, qui reste la façade du moteur de rendu de la table.
 */
import { LOGICAL_W, LOGICAL_H, SETTINGS_BUTTON } from '../../server/layout.js';

// Définit les surfaces touchables des écrans et commandes communes utilisées aussi par GestureRecognizer.ts.
export const START_TABLE_BUTTON = { x: LOGICAL_W / 2 - 260, y: 548, w: 520, h: 88 };
export const START_PC_BUTTON = { x: LOGICAL_W / 2 - 260, y: 660, w: 250, h: 58 };
export const START_TUTORIAL_BUTTON = { x: LOGICAL_W / 2 - 260, y: 408, w: 520, h: 88 };
export const START_TANGIBLE_TEST_BUTTON = { x: LOGICAL_W / 2 + 10, y: 660, w: 250, h: 58 };
export const RESULT_BUTTON = { x: LOGICAL_W / 2 - 200, y: LOGICAL_H / 2 - 45, w: 400, h: 90 };
export const PAUSE_BUTTON = { x: LOGICAL_W / 2 - 58, y: 35, w: 116, h: 76 };
export const DRIVE_MODE_BUTTONS = { A: SETTINGS_BUTTON, B: SETTINGS_BUTTON };
export const DRIVE_MODE_BUTTON = DRIVE_MODE_BUTTONS.A;
export const MAP_GENERATE_BUTTON = { x: LOGICAL_W / 2 - 180, y: LOGICAL_H / 2 - 44, w: 360, h: 88 };
export const RACE_START_BUTTON = { x: LOGICAL_W / 2 - 180, y: LOGICAL_H / 2 - 44, w: 360, h: 88 };
