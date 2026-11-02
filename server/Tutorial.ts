/**
 * Suit les leçons des deux équipes et valide leur progression à partir des actions réellement effectuées.
 * Liens : server/geometry.ts, server/types.ts, server/config.ts.
 * Référencé par server/GameRules.ts, scripts/visuals.ts.
 */
import type { GameState, Team, ItemKind, Vec2, TutorialStepId, TutorialState } from './types.js';
import { config } from './config.js';
import { nearestOnTrack } from './geometry.js';

/** Ids of the obstacles the tutorial places itself; the pylon rebuild must keep them. */
export const TUTORIAL_OBSTACLE_PREFIX = 'tut-';
/** Compatibility: armed items do not expire, including during lessons. */
export const TUTORIAL_ARM_WINDOW_S = 0;
/** Taking a pickup must not leave the other team without one for 15 s. */
export const TUTORIAL_PICKUP_RESPAWN_S = 3;

const TEAMS: Team[] = ['A', 'B'];
const OBSTACLE_AHEAD_PX = 700;
const OBSTACLE_LIFE_MS = 10 * 60_000;
const STEER_THRESHOLD = 0.5;
const THROTTLE_THRESHOLD = 0.5;

/** Fixe l’ordre de référence des leçons avant leur adaptation au mode de contact. */
const STEPS: TutorialStepId[] = [
  'identify', 'steer', 'pedal',
  'pickup', 'power', 'sling',
  'boostPickup', 'boostPower', 'boost', 'boostCross',
  'borderPull', 'repair', 'wall', 'pylon', 'arc', 'depot',
];

/** Choisit les leçons adaptées aux contacts de la table ou à l’alternative clavier. */
export function tutorialSteps(mode: 'table' | 'pc'): TutorialStepId[] {
  return STEPS.filter(/* Retire les leçons incompatibles avec le périphérique utilisé pour l’entraînement. */ s => mode === 'pc' ? s !== 'borderPull' && s !== 'identify' && s !== 'depot' : s !== 'pedal');
}

/** Associe les leçons de bonus au stock que la voiture doit pouvoir ramasser. */
const ITEM_OF: Partial<Record<TutorialStepId, ItemKind>> = {
  pickup: 'slingshot', power: 'slingshot', sling: 'slingshot',
  boostPickup: 'boost', boostPower: 'boost', boost: 'boost',
};

/** Associe chaque leçon au retour de jeu réel qui prouve sa réussite. */
const DONE_BY: Partial<Record<TutorialStepId, string>> = {
  pickup: 'pickup', boostPickup: 'pickup',
  power: 'itemArmed', boostPower: 'itemArmed',
  sling: 'stoneWarning',
  boost: 'boostGate',
  boostCross: 'boostHit',
  borderPull: 'trackDeformed',
  repair: 'repairDone',
};

/** Expose au tutoriel l’horloge et les actions de règles nécessaires à ses exercices. */
export interface TutorialContext {
  now(): number;
  arm(team:Team):void;
  /** Scripted breakdown: the car is out of order until repaired by both players. */
  breakDown(team: Team): void;
  /** Put a car back on the road without the repair event (a skipped repair lesson). */
  restore(team: Team): void;
  feedback(kind: string, x: number, y: number, team: Team): void;
}

/** Suit les leçons des deux équipes et valide leur progression à partir des actions réellement effectuées. */
export class Tutorial {
  /** Installe les étapes des deux équipes puis prépare leur première leçon. */
  constructor(private state: GameState, private ctx: TutorialContext, mode: 'table' | 'pc') {
    state.tutorial = {
      steps: tutorialSteps(mode),
      teams: { A: { step: 0, sub: 0 }, B: { step: 0, sub: 0 } },
      finished: false,
    };
    for (const team of TEAMS) this.enter(team);
  }

  /** Renvoie la progression de tutoriel installée dans l’état de jeu. */
  private get data(): TutorialState {
    return this.state.tutorial!;
  }

  /** Renvoie l’étape de tutoriel actuellement demandée à l’équipe. */
  current(team: Team): TutorialStepId | null {
    return this.data.steps[this.data.teams[team].step] ?? null;
  }

  /** Renvoie le bonus que l’équipe doit ramasser pour sa leçon actuelle. */
  forcedItem(team: Team): ItemKind | null {
    const id = this.current(team);
    return (id && ITEM_OF[id]) || null;
  }

  /** Termine l’étape actuelle de l’équipe sans attendre son événement de validation. */
  skip(team: Team): void {
    this.complete(team);
  }

  /** Enregistre l’identification du poste pendant l’accueil des quatre joueurs dans le tutoriel. */
  onStation(team: Team, role: 'pilot' | 'copilot'): void {
    if (this.current(team) !== 'identify') return;
    const lesson = this.data.teams[team];
    lesson.sub |= role === 'pilot' ? 1 : 2;
    if (lesson.sub === 3) this.complete(team);
  }

  // --- Événements qui valident les leçons ---

  /** Valide une leçon lorsque le retour de jeu attendu est réellement émis. */
  onFeedback(kind: string, team: Team): void {
    const id = this.current(team);
    if (id && DONE_BY[id] === kind) this.complete(team);
  }

  /** Valide les essais de direction ou de pédale demandés à l’équipe par sa leçon. */
  onPilotInput(team: Team, steer: number, throttle: number): void {
    if (TEAMS.some(/* Bloque la validation de conduite tant que les quatre postes ne sont pas présentés. */ t => this.current(t) === 'identify')) return;
    const id = this.current(team);
    const lesson = this.data.teams[team];
    if (id === 'steer') {
      if (steer <= -STEER_THRESHOLD) lesson.sub |= 1;
      if (steer >= STEER_THRESHOLD) lesson.sub |= 2;
      if (lesson.sub === 3) this.complete(team);
    } else if (id === 'pedal' && lesson.sub === 1 && this.state.driveMode[team] === 'pedal' && throttle >= THROTTLE_THRESHOLD) {
      lesson.sub = 2;
    }
  }

  /** Actualise la leçon de pédale après un changement du mode de conduite. */
  onDriveMode(): void {
    for (const team of TEAMS) this.syncPedal(team);
  }

  /** Valide le contact avec le mur ou l’arc demandé par la leçon. */
  onObstacleHit(team: Team, kind: 'wall' | 'arc'): void {
    if (this.current(team) === kind && (kind !== 'wall' || this.data.teams[team].sub === 1)) this.complete(team);
  }

  /** Enregistre une nouvelle pose réelle du mur ou des piliers pour l’étape concernée. */
  onTangiblePlaced(id: number): void {
    const tangible = this.state.tangibles[id];
    if (!tangible?.active || tangible.status !== 'placed') return;
    for (const team of TEAMS) {
      const lesson = this.data.teams[team];
      if (this.current(team) === 'wall' && id === 1) lesson.sub = 1;
      if (this.current(team) === 'pylon' && (id === 2 || id === 3)) lesson.sub |= id === 2 ? 1 : 2;
    }
    this.onTangibles();
  }

  /** Actualise les étapes liées à la présence des objets et à leur rangement commun. */
  onTangibles(): void {
    for(const team of TEAMS)if(this.current(team)==='wall'&&this.state.mapMode==='table'&&(!this.state.tangibles[1]?.active||this.state.tangibles[1]?.status!=='placed'))this.data.teams[team].sub=0;
    if (TEAMS.every(/* Vérifie que les deux équipes ont atteint le rangement ou terminé leurs exercices. */ t => this.current(t) === 'depot' || this.current(t) === null) && [1,2,3].every(/* Vérifie que les trois objets réels sont revenus dans la réserve. */ id => this.state.tangibles[id]?.status === 'parked')) {
      for (const team of TEAMS) this.complete(team);
      return;
    }
    if (!this.state.arcs.some(/* Recherche un arc réel encore actif pour valider l’exercice des piliers. */ a => !a.id.startsWith(TUTORIAL_OBSTACLE_PREFIX) && a.disabledUntil <= this.ctx.now())) return;
    for (const team of TEAMS) {
      if (this.current(team) === 'pylon' && this.data.teams[team].sub === 3) this.complete(team);
    }
  }

  /** Vérifie que chaque leçon conserve ses préconditions et laisse les voitures attendre lorsqu’une équipe a terminé. */
  tick(): void {
    for (const team of TEAMS) {
      const id = this.current(team);
      const car = this.state.cars[team];
      if ((id === 'sling' || id === 'boost') && !car.itemArmed) {
        this.relapse(team, id === 'sling' ? 'power' : 'boostPower');
      } else if (id==='arc' && this.state.mapMode==='table' && !this.state.arcs.some(/* Vérifie que l’arc réel existe toujours pendant l’exercice de traversée. */ a=>!a.id.startsWith(TUTORIAL_OBSTACLE_PREFIX)&&a.disabledUntil<=this.ctx.now())) {
        this.relapse(team,'pylon');
      } else if (id === 'boostCross' && !this.state.boostGates.some(/* Vérifie qu’une zone d’accélération de l’équipe reste disponible pour son essai. */ g => g.team === team)) {
        this.relapse(team, 'boostPower'); // the portal expired before the car went through it
      }
    }
  }

  // --- Préparation et passage d’une leçon à l’autre ---

  /** Nettoie la leçon terminée puis prépare la suivante pour l’équipe. */
  private complete(team: Team): void {
    const id = this.current(team);
    if (!id) return;
    this.leave(team, id);
    const lesson = this.data.teams[team];
    lesson.step++;
    lesson.sub = 0;
    const car = this.state.cars[team];
    this.ctx.feedback('tutorialStep', car.pos.x, car.pos.y, team);
    if (TEAMS.every(/* Vérifie que les deux équipes ont fini toutes leurs leçons. */ t => this.current(t) === null)) this.data.finished = true;
    else this.enter(team);
  }

  /** Ramène l’équipe à une étape à recommencer lorsque les conditions du geste ont changé. */
  private relapse(team: Team, to: TutorialStepId): void {
    const lesson = this.data.teams[team];
    lesson.step = this.data.steps.indexOf(to);
    lesson.sub = 0;
    this.enter(team);
  }

  /** Prépare les stocks, positions ou obstacles nécessaires à la nouvelle leçon. */
  private enter(team: Team): void {
    const id = this.current(team);
    if (!id) return;
    const car = this.state.cars[team];
    const item = ITEM_OF[id];
    switch (id) {
      // Replace la voiture pour apprendre la conduite.
      case 'pedal':
        this.syncPedal(team);
        break;
      // Vide le stock et rend les ramassables disponibles pour apprendre à les récupérer.
      case 'pickup': case 'boostPickup':
        // Empty hands and a pickup of the right kind ready on the road
        car.heldItem = null; car.itemArmed = false; car.itemArmExpiry = 0;
        for (const p of this.state.pickups) p.respawnAt = 0;
        break;
      // Donne le bonus non armé pour apprendre le bouton du copilote.
      case 'power': case 'boostPower':
        car.heldItem = item!; car.itemArmed = false; car.itemArmExpiry = 0;
        break;
      // Prépare le bonus nécessaire à la démonstration du geste.
      case 'sling': case 'boost':
        car.heldItem = item!;
        if (!car.itemArmed)this.ctx.arm(team);
        break;
      // Passe la traversée si la zone de démonstration n’existe plus.
      case 'boostCross':
        if (!this.state.boostGates.some(/* Évite d’ajouter une zone de démonstration lorsque l’équipe en possède déjà une. */ g => g.team === team)) this.complete(team); // skipped portal: nothing to cross
        break;
      // Met la voiture en panne pour apprendre la réparation.
      case 'repair':
        this.ctx.breakDown(team);
        break;
      // Crée l’obstacle de démonstration uniquement dans le tutoriel à la souris.
      case 'wall':
        if (this.state.mapMode === 'pc') { this.placeObstacle(team, id); this.data.teams[team].sub = 1; }
        break;
      // Crée l’arc de démonstration uniquement dans le tutoriel à la souris.
      case 'arc':
        if (this.state.mapMode === 'pc') this.placeObstacle(team, id);
        break;
      // Vérifie l’état des tangibles pour guider leur retour au dépôt.
      case 'depot':
        this.onTangibles();
        break;

    }
  }

  /** Retire les aides temporaires propres à la leçon quittée. */
  private leave(team: Team, id: TutorialStepId): void {
    const car = this.state.cars[team];
    const obstacle = `${TUTORIAL_OBSTACLE_PREFIX}${id}-${team}`;
    if (id === 'wall') this.state.walls = this.state.walls.filter(/* Retire seulement le mur temporaire de la leçon quittée. */ w => w.id !== obstacle);
    if (id === 'arc') this.state.arcs = this.state.arcs.filter(/* Retire seulement l’arc temporaire de la leçon quittée. */ a => a.id !== obstacle);
    if (id === 'repair') {
      if (car.disabled) this.ctx.restore(team);
      car.hp = config.hpMax;
    }
  }

  /** Fait progresser la leçon de pédale selon le mode de conduite courant. */
  private syncPedal(team: Team): void {
    if (this.current(team) !== 'pedal') return;
    const lesson = this.data.teams[team];
    const pedal = this.state.driveMode[team] === 'pedal';
    if (lesson.sub === 0 && pedal) lesson.sub = 1;
    else if (lesson.sub === 1 && !pedal) lesson.sub = 0;
    else if (lesson.sub === 2 && !pedal) this.complete(team);
  }

  // --- Obstacles de démonstration du tutoriel clavier ---

  /** Installe l’obstacle de démonstration devant la voiture pour l’alternative clavier. */
  private placeObstacle(team: Team, kind: 'wall' | 'arc'): void {
    const ahead = this.roadAhead(team);
    if (!ahead) return;
    const id = `${TUTORIAL_OBSTACLE_PREFIX}${kind}-${team}`;
    if (kind === 'wall') {
      this.state.walls.push({
        id, team: null, pos: ahead.at,
        angle: (Math.atan2(ahead.tangent.y, ahead.tangent.x) * 180) / Math.PI + 90,
        lengthPx: config.wallLengthPx, widthPx: config.wallWidthPx, tolerancePx: config.tangibleTolerancePx, disabledUntil: 0, expiresAt: this.ctx.now() + OBSTACLE_LIFE_MS,
      });
    } else {
      const reach = Math.max(10, ahead.halfWidth - 6);
      const normal = { x: -ahead.tangent.y, y: ahead.tangent.x };
      this.state.arcs.push({
        id, team: null, disabledUntil: 0,
        pylon1: { x: ahead.at.x + normal.x * reach, y: ahead.at.y + normal.y * reach },
        pylon2: { x: ahead.at.x - normal.x * reach, y: ahead.at.y - normal.y * reach },
      });
    }
  }

  /** Repère un emplacement de démonstration plus loin sur la trajectoire de la voiture. */
  private roadAhead(team: Team): { at: Vec2; tangent: Vec2; halfWidth: number } | null {
    const track = this.state.track;
    if (!track) return null;
    const c = track.centerline;
    const n = c.length;
    let i = nearestOnTrack(this.state.cars[team].pos, track).index;
    for (let travelled = 0, guard = 0; travelled < OBSTACLE_AHEAD_PX && guard < n; guard++) {
      const j = (i + 1) % n;
      travelled += Math.hypot(c[j].x - c[i].x, c[j].y - c[i].y);
      i = j;
    }
    const a = c[(i - 1 + n) % n], b = c[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { at: { x: c[i].x, y: c[i].y }, tangent: { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, halfWidth: track.widths[i] / 2 };
  }
}
