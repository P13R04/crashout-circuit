/**
 * Dessine la carte de la console et gère la sélection, le déplacement et la rotation des tangibles au doigt
 * ou à la souris.
 * Liens : server/layout.ts, server/geometry.ts, server/types.ts, client-shared/tangibleGeometry.ts,
 * server/tangibles/tangibles.ts et les utilitaires importés ci-dessous.
 * Référencé par client-oz/main.ts, scripts/acceptance.ts.
 * Façade : l'état de la carte, les écouteurs et les réglages d'outil restent ici ; le pointeur et le dessin sont découpés dans client-oz/map/ (chaque méthode délègue à une fonction du même nom).
 */
import type { GameState, Tangible, Vec2 } from '../../server/types.js';
import { type TangibleId } from '../../server/tangibles/tangibles.js';
import type { OzTool, OzMapHandlers, Drag } from './ozMapTypes.js';
import * as ozPointer from './ozPointer.js';
import * as ozDraw from './ozDraw.js';

// Réexports : les noms publics gardent leur chemin d’import.
export type { OzTool, OzMapHandlers } from './ozMapTypes.js';

/** Dessine la carte de la console et gère la sélection, le déplacement et la rotation des tangibles au doigt ou à la souris. */
export class OzMap {
  ctx: CanvasRenderingContext2D;

  state: GameState | null = null;

  drag: Drag | null = null;

  hover: Vec2 | null = null;

  quarter = 0;

  trackVersion = -1;

  hiddenEdges: boolean[][] = [];

  // 2-click interactive tool state (Arc / Wall placement)
  tool: OzTool = null;

  toolStep = 0; // 0 = waiting for click 1, 1 = waiting for click 2

  firstPoint: Vec2 | null = null;

  // Pick & Drop tangible relocation state
  movingTangibleId: TangibleId | null = null;

  movingWallStep = 0; // 0 = waiting for 1st click, 1 = waiting for 2nd click to orient

  movingWallFirstPoint: Vec2 | null = null;

  movingWallDraftAngle: number | null = null;

  downClientPos = { x: 0, y: 0 };

  /** Installe le contexte de dessin et les événements qui manipulent la carte. */
  constructor(readonly canvas: HTMLCanvasElement, readonly h: OzMapHandlers) {
    this.ctx = canvas.getContext('2d')!;
    /** Tourne l’aperçu du mur à la molette lorsqu’un repositionnement est en cours. */
    canvas.addEventListener('wheel', e => {
      if (!this.state || !this.h.enabled()) return;
      if (this.movingTangibleId === 1) {
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * 15;
        const current = this.movingWallDraftAngle ?? this.state.tangibles[1]?.angle ?? 0;
        this.movingWallDraftAngle = ((current + delta) % 360 + 360) % 360;
        this.draw();
      }
    }, { passive: false });
    /** Transmet le début de contact au choix de manipulation de la carte. */
    canvas.addEventListener('pointerdown', e => this.down(e));
    /** Transmet le déplacement du doigt ou de la souris à la manipulation courante. */
    canvas.addEventListener('pointermove', e => this.move(e));
    /** Efface le survol lorsque le pointeur quitte la carte. */
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    /** Confirme la pose ou le glissement sans transformer un toucher de poignée en repositionnement. */
    canvas.addEventListener('pointerup', e => {
      if (this.drag?.pointer !== e.pointerId) return;
      this.move(e);
      if (this.drag.mode === 'place') {
        this.h.onPlace(this.drag.pose);
      } else if(this.drag.mode==='rotate'){
        // Rotation was already sent by pointermove; a tap on its handle is not a relocation.
      } else if (!this.drag.moved) {
        // Pure click on placed tangible: activate pick & drop mode!
        this.movingTangibleId = this.drag.id;
        this.movingWallStep = 0;
        this.movingWallFirstPoint = null;
        this.movingWallDraftAngle = this.state?.tangibles[this.drag.id]?.angle ?? 0;
        this.h.onMovingTangibleChange?.(this.movingTangibleId, 0);
      } else {
        // Dragged to a new spot
        const s = this.state;
        if (s) {
          this.h.onRelocateTangible?.(this.drag.id, {
            x: this.drag.pose.x * s.params.logicalWidth,
            y: this.drag.pose.y * s.params.logicalHeight
          }, this.drag.pose.angle);
        }
      }
      this.drag = null;
      this.h.onDragEnd();
      this.draw();
    });
    /** Empêche le menu contextuel du navigateur de prendre la place de la manipulation tactile. */
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    /** Annule le geste seulement lorsque son contact principal est interrompu. */
    canvas.addEventListener('pointercancel', e => {if(e.isPrimary!==false)this.cancel();});
    /** Abandonne le glissement si le navigateur ne possède plus la capture du pointeur. */
    canvas.addEventListener('lostpointercapture', () => { if (this.drag) this.cancel(); });
  }

  /** Change l’outil de pose et efface les étapes incomplètes de l’outil précédent. */
  setTool(tool: OzTool): void {
    this.movingTangibleId = null;
    this.movingWallStep = 0;
    this.movingWallFirstPoint = null;
    this.movingWallDraftAngle = null;
    this.h.onMovingTangibleChange?.(null, 0);
    this.tool = tool;
    this.toolStep = 0;
    this.firstPoint = null;
    this.h.onToolStep?.(tool, 0, null);
    this.draw();
  }

  /** Indique qu’une pose, un déplacement ou une rotation reste à terminer. */
  get hasOperation():boolean {return !!(this.tool||this.drag||this.movingTangibleId||this.h.preparing());}

  /** Renvoie l’outil de pose actuellement sélectionné sur la carte. */
  getTool(): OzTool {
    return this.tool;
  }

  /** Efface le geste et la prévisualisation locale sans déplacer les objets confirmés. */
  cancel(): void {
    this.drag = null;
    this.hover = null;
    this.tool = null;
    this.toolStep = 0;
    this.firstPoint = null;
    this.movingTangibleId = null;
    this.movingWallStep = 0;
    this.movingWallFirstPoint = null;
    this.movingWallDraftAngle = null;
    this.h.onMovingTangibleChange?.(null, 0);
    this.h.onToolStep?.(null, 0, null);
    this.h.onDragEnd();
    this.draw();
  }

  /** Tourne la vue par quarts de tour en annulant le geste local devenu ambigu. */
  setQuarter(quarter: number): void {
    this.cancel();
    this.quarter = ((quarter % 4) + 4) % 4;
    this.draw();
  }

  /** Installe le nouvel état reçu et abandonne une manipulation devenue incompatible avec les objets confirmés. */
  setState(state: GameState): void {
    if(this.state && this.state.tangiblePlacementMode!==state.tangiblePlacementMode)this.cancel();
    if (this.drag && (!state.tangibles[this.drag.id] || !this.h.enabled() || (this.drag.mode !== 'place' && (state.tangibles[this.drag.id].status !== 'placed' || this.state?.tangibles[this.drag.id]?.active !== state.tangibles[this.drag.id].active)))) this.cancel();
    if (this.movingTangibleId && (!state.tangibles[this.movingTangibleId] || !state.tangibles[this.movingTangibleId].active)) {
      this.cancel();
    }
    this.state = state;
    if (!state.track) this.trackVersion = -1;
    if (!this.h.enabled()) { this.drag = null; this.hover = null; }
    this.draw();
  }

  /** Choisit entre retrait tactile, pose manuelle, déplacement et rotation selon l’objet touché. */
  down(e: PointerEvent): void { ozPointer.down(this, e); }
  /** Actualise l’aperçu et transmet le déplacement ou la rotation du doigt qui possède le geste. */
  move(e: PointerEvent): void { ozPointer.move(this, e); }
  /** Réunit les poses reçues et la pose provisoire du geste en cours pour le dessin. */
  visibleTangibles(): Array<[number, Tangible]> { return ozDraw.visibleTangibles(this); }
  /** Dessine la piste, les voitures, les objets et les aperçus dans l’orientation choisie. */
  draw(): void { ozDraw.draw(this); }
}
