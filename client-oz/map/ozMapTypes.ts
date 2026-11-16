/**
 * Types de la carte Oz : outil manuel, rappels vers le contrôleur et glissement en cours d'un tangible.
 * Liens : client-oz/OzController.ts, client-shared/tangibleGeometry.ts, server/tangibles.ts.
 * Réexporté par client-oz/OzMap.ts, qui reste la façade de la carte de la console.
 */
import type { Tangible, Vec2, Team } from '../../server/types.js';
import { type TangiblePose } from '../../client-shared/tangibleGeometry.js';
import { type TangibleId } from '../../server/tangibles.js';

/** Limite les outils manuels de la console à la paire de piliers, au mur ou à aucun outil. */
export type OzTool = 'arc' | 'wall' | null;

/** Décrit les commandes et les lectures que la carte délègue au contrôleur de console. */
export interface OzMapHandlers {
  onRemove?(id: TangibleId): void;
  onMove(id: TangibleId, x: number, y: number, angle: number): boolean;
  onDock(team: Team): void;
  onPlace(pose: TangiblePose): boolean;
  onSelect(id: TangibleId): void;
  selectedId(): number;
  selectedKind(): Tangible['kind'];
  preparing(): boolean;
  draftAngle(): number;
  enabled(): boolean;
  onDragStart(): void;
  onDragEnd(): void;
  onPlaceArc?(p1: Vec2, p2: Vec2): void;
  onPlaceWall?(center: Vec2, angle: number): void;
  onToolStep?(tool: OzTool, step: number, p1: Vec2 | null): void;
  onRelocateTangible?(id: TangibleId, pos: Vec2, angle?: number): void;
  onMovingTangibleChange?(id: TangibleId | null, step?: number): void;
}

/** Conserve le doigt, le pivot et l’aperçu de l’objet pendant son glissement. */
export interface Drag {
  pointer: number;
  moved?: boolean;
  id: TangibleId;
  mode: 'move' | 'rotate' | 'place';
  anchor: Vec2;
  offset: Vec2;
  pose: TangiblePose;
}
