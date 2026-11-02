/**
 * Valide et applique les fonctionnalités du jeu, des tracés et bonus jusqu’aux tangibles, réparations et
 * résultats.
 * Liens : server/Tutorial.ts, server/MapGenerator.ts, server/layout.ts, server/geometry.ts, server/types.ts
 * et les utilitaires importés ci-dessous.
 * Référencé notamment par server/GameServer.ts, server/PhysicsLoop.ts, scripts/acceptance.ts.
 */
import type {
  GameState, Team, Vec2, Phase, ItemKind, Car, Wall, MapTargets, TrackGeometry, Tangible,
  StrokeDrawMsg, MapDividerMsg, PadHoldMsg, SlingshotMsg, BoostGate, BoostGateMsg, AbilityMsg, BorderPullMsg,
  PilotInputMsg, PowerMsg, TangibleControlMsg, TangibleMovedMsg, TangibleRemovedMsg, TestToggleMsg,
  TangiblePlacementMode, TangibleTouchPlacedMsg, RaceSettingsMsg, TrackPresentation,
} from './types.js';
import { presentingTrack } from './trackPresentation.js';
import { orientBoostGate, hitsBoostGate } from './boostGeometry.js';
import { armedPickup, RESPAWN_COUNTDOWN_MS } from './armedPickup.js';
import { AutomaticPilot } from './AutomaticPilot.js';
import { config } from './config.js';
import { dist, distToSegment, nearestOnTrack, trackTangent, segmentsIntersect, slingshotShot, wrapAngle, clampToTrackRibbon } from './geometry.js';
import { generate, generatePreset, randomizeRaceStart, validateStroke, rebuildEdges } from './MapGenerator.js';
import { nearestStationTeam, LOGICAL_W, checkDivider, insidePanel, inTangibleDepot, depotPose, TANGIBLE_DEPOT, rectContains } from './layout.js';
import { activeMapTeam, mapEndpointError, mapStrokeEndpoints } from './mapCreation.js';
import { Tutorial, TUTORIAL_ARM_WINDOW_S, TUTORIAL_PICKUP_RESPAWN_S, TUTORIAL_OBSTACLE_PREFIX } from './Tutorial.js';
import { wallContact } from './tangibleGeometry.js';
import { tangibleArc, tangibleDefinition, validTangiblePose } from './tangibles.js';
import { tangibleTouchPose, TANGIBLE_WAIT_MS } from './tangibleTouch.js';

export const CAR_RADIUS = 10;
export const WALL_HALF_THICKNESS = 4;
const MAP_DURATION_MS = 30_000;
const COUNTDOWN_MS = 3_000;
const MAX_STROKE_POINTS = 4_000;
const PICKUP_RADIUS = 30;
const TEAMS: Team[] = ['A', 'B'];

/** Déclare les notifications de réseau et de phase que les règles demandent à leur hôte. */
export interface RulesHost {
  feedback(kind: string, x: number, y: number, team: Team, itemKind?: ItemKind): void;
  transition(phase: Phase, data?: unknown): void;
  /** Broadcast the full state (including the heavy track / QR fields). */
  broadcastFull(): void;
}

/** Décrit une pose ou une modification de tangible enregistrée dans le journal serveur. */
export interface TangibleLogEntry {
  t: number;
  type: 'TangibleMoved' | 'TangibleRemoved' | 'TangibleControl';
  action?: TangibleControlMsg['action'];
  team?: Team;
  kind?: 'wall' | 'pylon';
  id: number;
  x?: number;
  y?: number;
  angle?: number;
  active?: boolean;
}

/** Renvoie l’équipe adverse à partir de l’équipe reçue. */
export const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');
/** Borne la valeur dans l’intervalle autorisé. */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Crée une voiture avec ses valeurs initiales de santé, de mouvement et de stock. */
export function makeCar(team: Team): Car {
  return {
    team,
    pos: { x: LOGICAL_W / 2, y: 540 },
    angle: 0,
    velocity: { x: 0, y: 0 },
    hp: config.hpMax,
    disabled: false,
    respawnUntil: 0,
    invulnUntil: 0,
    stunUntil: 0,
    ghostUntil: 0,
    lap: 0,
    checkpointIndex: 1,
    heldItem: null,
    itemArmed: false,
    itemArmVersion: 0,
    itemArmExpiry: 0,
    speed: 0,
    slowUntil: 0,
    boostUntil: 0,
    boostK: 0,
  };
}

/** Prépare une session vide avec les réglages par défaut et les deux voitures. */
export function createInitialState(): GameState {
  return {
    phase: 'LOBBY',
    sessionMode: 'race',
    developerTools: false,
    driveMode: { A: 'auto', B: 'auto' },
    tick: 0,
    cars: { A: makeCar('A'), B: makeCar('B') },
    walls: [],
    arcs: [],
    boostGates: [],
    stones: [],
    pickups: [],
    repairPads: {
      'A-pilot':   { team: 'A', role: 'pilot',   held: false, startedAt: 0 },
      'A-copilot': { team: 'A', role: 'copilot', held: false, startedAt: 0 },
      'B-pilot':   { team: 'B', role: 'pilot',   held: false, startedAt: 0 },
      'B-copilot': { team: 'B', role: 'copilot', held: false, startedAt: 0 },
    },
    cooldowns: {
      A: { ghost: 0, destroy: 0, borderPull: 0 },
      B: { ghost: 0, destroy: 0, borderPull: 0 },
    },
    track: null,
    deformations: [],
    winner: null,
    sessionStartAt: Date.now(),
    raceDeadline: 0,
    pausedAt: 0,
    mapTargets: null,
    mapDivider: null,
    mapStrokes: { A: false, B: false },
    mapDeadline: 0,
    mapMode: null,
    repairProgress: { A: 0, B: 0 },
    trackVersion: 0,
    trackPresentation: null,
    tangibles: {},
    tangiblePlacementMode: 'manual',
    tangiblePlacement: null,
    testMode: { invincible: false, allItems: false },
    tutorial: null,
    params: {
      difficulty: 'easy',
      hpMax: config.hpMax,
      lapsToWin: config.lapsToWin,
      sessionMaxSeconds: config.sessionMaxSeconds,
      armWindowS: config.armWindowS,
      ghostS: config.ghostS,
      ghostCooldownS: config.ghostCooldownS,
      destroyCooldownS: config.destroyCooldownS,
      destroyDisableS: config.destroyDisableS,
      borderPullCooldownS: 0,
      trackDeformMaxShiftPx: config.trackDeformMaxShiftPx,
      trackDeformHoldS: config.trackDeformHoldS,
      trackDeformRelaxS: config.trackDeformRelaxS,
      stoneTelegraphS: config.stoneTelegraphS,
      stoneRadiusPx: config.stoneRadiusPx,
      slingMinPullPx: config.slingMinPullPx,
      slingMaxPullPx: config.slingMaxPullPx,
      slingMinRangePx: config.slingMinRangePx,
      slingMaxRangePx: config.slingMaxRangePx,
      boostLenMinPx: config.boostLenMinPx,
      boostLenMaxPx: config.boostLenMaxPx,
      repairHoldS: config.repairHoldS,
      wallLengthPx: config.wallLengthPx,
      wallWidthPx: config.wallWidthPx,
      pylonBasePx: config.pylonBasePx,
      pylonFieldRadiusPx: config.pylonFieldRadiusPx,
      tangibleTolerancePx: config.tangibleTolerancePx,
      tangibleCorrectionPx: config.tangibleCorrectionPx,
      tangibleCorrectionDegrees: config.tangibleCorrectionDegrees,
      tableDiagonalInches: config.tableDiagonalInches,
      arcMaxDistPx: config.arcMaxDistPx,
      logicalWidth: config.logicalWidth,
      logicalHeight: config.logicalHeight,
    },
  };
}

/** Valide et applique les fonctionnalités du jeu, des tracés et bonus jusqu’aux tangibles, réparations et résultats. */
export class GameRules {
  private placementToken = 0;
  readonly inputs: Record<Team, { throttle: number; steer: number }> = {
    A: { throttle: 1, steer: 0 },
    B: { throttle: 1, steer: 0 },
  };
  /** Last received control heartbeat per team; stale steering is neutralised. */
  private lastPilotInputAt: Record<Team, number> = { A: 0, B: 0 };
  /** Full operator/TUIO log of pylon events (T-11, task 15). */
  readonly tangibleLog: TangibleLogEntry[] = [];

  private strokes: Record<Team, Vec2[] | null> = { A: null, B: null };
  /** A and B must draw on opposite sides of the divider. */
  private mapSide: Record<Team, number> = { A: 1, B: -1 };
  private idCounter = 0;
  private generating = false;
  private pausedAt = 0;
  private deformCounter = 0;
  private rng: () => number;
  private tutorial: Tutorial | null = null;
  private automaticPilot = new AutomaticPilot();

  /** Conserve l’état et l’horloge puis relie les retours de jeu à la progression du tutoriel. */
  constructor(
    private state: GameState,
    private host: RulesHost,
    private clock: () => number = Date.now,
    rng: () => number = Math.random,
  ) {
    this.rng = rng;
    // A tutorial lesson is done by the very event the clients are told about.
    const base = host;
    this.host = {
      ...base,
      /** Transmet le retour de jeu au serveur et à la validation du tutoriel. */
      feedback: (kind, x, y, team, itemKind) => {
        base.feedback(kind, x, y, team, itemKind);
        this.tutorial?.onFeedback(kind, team);
      },
    };
  }

  /** Fournit l’heure de simulation utilisée par les règles et les tests rejouables. */
  private get now(): number {
    return this.clock();
  }

  /** Produit un identifiant d’objet unique à partir d’un préfixe et du compteur de session. */
  private nextId(prefix: string): string {
    return `${prefix}${++this.idCounter}`;
  }

  // --- Création du circuit avec les deux tracés ---

  /** Prépare la création à deux équipes et réinitialise les points, les tracés et les objets de session. */
  enterMap(mode: 'table' | 'pc' = 'table'): void {
    const s = this.state;
    s.mapTargets = null;
    s.mapDivider = null;
    s.mapStrokes = { A: false, B: false };
    // Creation never advances by itself: players validate it explicitly.
    s.mapDeadline = 0;
    s.mapMode = mode;
    s.track = null;
    s.trackPresentation = null;
    s.deformations = [];
    s.trackVersion++;
    this.strokes = { A: null, B: null };
    this.generating = false;
    s.walls = []; s.arcs = []; s.boostGates = []; s.stones = []; s.pickups = [];
    s.tangibles = {};
    s.winner = null;
    this.host.transition('MAP', { deadline: s.mapDeadline, mode });
    this.host.broadcastFull();
  }

  /**
   * Valide les deux points de raccord et attribue les demi-tracés aux équipes.
   * L’équipe A dessine de a vers b et l’équipe B de b vers a : la séparation reste le repère commun jusqu’au circuit final.
   */
  onMapDivider(msg: MapDividerMsg): void {
    const s = this.state;
    if (s.phase !== 'MAP' || s.mapDivider || this.generating) return;
    const a = msg.a, b = msg.b;
    if (![a?.x, a?.y, b?.x, b?.y].every(Number.isFinite)) return;
    // Same rule as the table's immediate check (layout.checkDivider): too short, or
    // outside the free area of the table. The refusal is shown, never silent.
    const verdict = checkDivider(a, b);
    if (verdict !== 'ok') {
      this.host.feedback(verdict === 'tooShort' ? 'dividerTooShort' : 'dividerOutOfZone', a.x, a.y, 'A');
      return;
    }
    s.mapDivider = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    s.mapTargets = { A: [s.mapDivider[0], s.mapDivider[1]], B: [s.mapDivider[1], s.mapDivider[0]] };
    this.host.broadcastFull();
  }

  /** Vérifie le tracé de l’équipe active avant de le conserver pour la génération. */
  onStrokeDraw(msg: StrokeDrawMsg): void {
    const s = this.state;
    if (s.phase !== 'MAP' || !s.mapTargets || !s.mapDivider || this.generating) return;
    const team = msg.creator;
    if (team !== 'A' && team !== 'B') return;
    const [p1, p2] = s.mapTargets[team];
    if (s.mapStrokes[team] || activeMapTeam(s) !== team) {
      this.host.feedback(s.mapStrokes[team] ? 'mapLocked' : 'mapWaitCyan', p1.x, p1.y, team);
      return;
    }
    let pts = (msg.pts ?? [])
      .filter(/* Écarte les points de tracé manquants ou dont les coordonnées ne sont pas finies. */ p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .slice(0, MAX_STROKE_POINTS)
      .map(/* Copie uniquement les coordonnées utiles des points acceptés. */ p => ({ x: p.x, y: p.y }));
    const error = mapEndpointError(pts, p1, p2)
      ?? (!validateStroke(pts, p1, p2) ? 'mapError' : null)
      ?? (!this.staysInHalf(team, pts, s.mapDivider) ? 'mapWrongSide' : null);
    if (error) {
      const last = pts[pts.length - 1] ?? p1;
      this.host.feedback(error, last.x, last.y, team);
      return;
    }
    const [drawStart, drawEnd] = mapStrokeEndpoints(pts[0], p1, p2);
    if (drawStart === p2) pts = pts.reverse();
    // Once accepted, lock the endpoints exactly to the common anchors. This
    // makes a near miss inside the target ring a clean, continuous circuit.
    pts[0] = { ...p1 };
    pts[pts.length - 1] = { ...p2 };
    this.strokes[team] = pts;
    s.mapStrokes[team] = true;
    this.host.broadcastFull();
    this.host.feedback('mapAccepted', drawEnd.x, drawEnd.y, team);
  }

  /** Accepte la validation seulement lorsque les deux tracés sont disponibles. */
  onGenerateTrack(): void {
    if (this.state.phase !== 'MAP' || !this.strokes.A || !this.strokes.B || this.generating) return;
    void this.buildTrack();
  }

  /**
   * Contrôle que les points d’un tracé restent du côté de la ligne attribué à son équipe.
   * Un circuit en huit est accepté ; le tracé est refusé seulement si sa majorité appartient à la moitié adverse.
   */
  private staysInHalf(team: Team, pts: Vec2[], divider: [Vec2, Vec2]): boolean {
    const [a, b] = divider;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const own = pts.filter(/* Retient les points situés dans la moitié du dessin attribuée à l’équipe. */ p => (this.mapSide[team] * (dx * (p.y - a.y) - dy * (p.x - a.x))) / len >= 0).length;
    return own >= 0.4 * pts.length;
  }

  /** Conserve une création au rythme des joueurs sans terminer automatiquement un dessin incomplet. */
  tickMap(now: number): void {
    const s = this.state;
    // MAP is intentionally player-paced: time never erases a drawing attempt.
    void now;
  }

  /** Construit le circuit des joueurs puis prépare sa présentation avant le départ. */
  private async buildTrack(): Promise<void> {
    if (this.generating) return;
    this.generating = true;
    await Promise.resolve();
    if(this.state.phase!=='MAP'||!this.state.mapTargets){this.generating=false;return;}
    const t = this.state.mapTargets;
    const a = this.strokes.A ?? [];
    const b = this.strokes.B ?? [];
    const started = Date.now();
    const track = generate(a, b, t.A[0], t.A[1], t.B[0], t.B[1]);
    console.log(`[GameRules] Track generated in ${Date.now() - started} ms`);
    const originIndex=nearestOnTrack(t.A[0],track).index;
    this.startRace(randomizeRaceStart(track,this.rng), true, {startedAt:this.now+120,originIndex});
  }

  // --- Préparation du départ et lancement de la course ---

  /** Installe le circuit, les voitures et les objets de la nouvelle course. */
  startRace(track = generatePreset(), waitForPlayers = false, presentation: TrackPresentation | null = null): void {
    this.state.tangiblePlacement = null;
    const s = this.state;
    this.generating = true;
    this.automaticPilot.reset();
    s.track = track;
    s.trackPresentation = presentation;
    s.pausedAt = 0;
    this.pausedAt = 0;
    s.deformations = [];
    s.trackVersion++;
    for (const team of TEAMS) {
      const car = makeCar(team);
      const sp = track.startPositions[team === 'A' ? 0 : 1];
      const tan = { x: track.startLine.normal.y, y: -track.startLine.normal.x };
      car.pos = { x: sp.x, y: sp.y };
      car.angle = Math.atan2(tan.y, tan.x);
      s.cars[team] = car;
      this.inputs[team] = { throttle: this.state.driveMode[team] === 'pedal' ? 0 : 1, steer: 0 };
      this.lastPilotInputAt[team] = this.now;
      s.repairProgress[team] = 0;
      s.cooldowns[team] = { ghost: 0, destroy: 0, borderPull: 0 };
    }
    for (const pad of Object.values(s.repairPads)) { pad.held = false; pad.startedAt = 0; }
    s.walls = []; s.arcs = []; s.boostGates = []; s.stones = [];
    s.pickups = track.pickupPositions.map(/* Construit chaque ramassable avec une pose sûre et un type adapté au tutoriel ou à la course. */ (pos, i) => ({
      id: i, pos: clampToTrackRibbon(pos, track, 25), kind: s.tutorial ? (i%2===0?'slingshot':'boost') : this.randomItem(), respawnAt: 0,
    }));
    s.winner = null;
    s.sessionStartAt = waitForPlayers ? 0 : this.now + COUNTDOWN_MS;
    s.raceDeadline=!waitForPlayers&&s.params.sessionMaxSeconds>0?s.sessionStartAt+s.params.sessionMaxSeconds*1000:0;
    for(const id of [1,2,3])this.state.tangibles[id]=this.parkedTangible(id);
    this.rebuildTangibles();
    this.host.transition(waitForPlayers ? 'READY' : 'RACE', { startsAt: s.sessionStartAt });
    this.host.broadcastFull();
  }

  /** Lance les feux de départ lorsque la piste est prête et sa présentation terminée. */
  beginRace(): void {
    if (this.state.phase !== 'READY' || presentingTrack(this.state,this.now)) return;
    this.state.trackPresentation=null;
    this.state.sessionStartAt = this.now + COUNTDOWN_MS;
    this.state.raceDeadline=this.state.params.sessionMaxSeconds>0?this.state.sessionStartAt+this.state.params.sessionMaxSeconds*1000:0;
    this.host.transition('RACE', { startsAt: this.state.sessionStartAt });
    this.host.broadcastFull();
  }

  /** Prépare le circuit et les voitures autonomes du mode d’essai réservé au développement. */
  // Essai autonome des tangibles ; entrée masquée et filtrée dans GameServer.ts.
  startTangibleTest(): void {
    const s = this.state;
    if (s.phase !== 'LOBBY') return;
    s.sessionMode = 'tangibles-test';
    s.mapMode = 'table';
    s.testMode = { invincible: false, allItems: false };
    this.startRace(generatePreset(), true);
  }

  /** Remplace les entrées pilotes par les commandes de suivi du centre dans le mode d’essai. */
  updateAutomaticPilots(now: number): void {
    const s = this.state;
    if (s.sessionMode !== 'tangibles-test' || !s.track || s.phase !== 'RACE') return;
    for (const team of TEAMS) {
      this.inputs[team] = now < s.sessionStartAt + (team === 'B' ? 2000 : 0)
        ? { throttle: 0, steer: 0 } : this.automaticPilot.command(s.cars[team], s.track, s.trackVersion);
    }
  }

  /**
   * Crée la progression guidée des deux équipes et installe le circuit prédéfini.
   * Tutorial.ts fait progresser chaque équipe séparément, sans victoire ni perte de vie ; mode distingue les doigts de la souris.
   */
  // Tutoriel : démarrage, identification des postes et passage à une course normale.
  startTutorial(mode: 'table' | 'pc' = 'table'): void {
    const s = this.state;
    if (s.phase !== 'LOBBY') return;
    s.mapMode = mode;
    s.params.armWindowS = TUTORIAL_ARM_WINDOW_S;
    this.tutorial = new Tutorial(s, {
      /** Réutilise la commande POWER pour préparer le bonus demandé par la leçon. */
      arm:team=>this.onPower(team),
      /** Fournit l’heure de simulation utilisée par les règles et les tests rejouables. */
      now: () => this.now,
      /** Immobilise la voiture pour l’exercice de réparation sans simuler un choc. */
      breakDown: (team) => {
        const car = s.cars[team];
        car.hp = 0;
        car.disabled = true;
        car.speed = 0;
        car.velocity = { x: 0, y: 0 };
        this.host.feedback('carDisabled', car.pos.x, car.pos.y, team);
      },
      /** Remet la voiture sur le circuit lorsqu’une leçon de réparation est passée. */
      restore: (team) => {
        const car = s.cars[team];
        car.disabled = false;
        car.respawnUntil = 0;
        car.stunUntil = 0;
        car.invulnUntil = this.now + config.invulnAfterHitS * 1000;
        this.respawnAtCheckpoint(car);
        s.repairProgress[team] = 0;
      },
      /** Transmet le retour de jeu au serveur et à la validation du tutoriel. */
      feedback: (kind, x, y, team) => this.host.feedback(kind, x, y, team),
    }, mode);
    this.startRace(generatePreset());
  }

  /** Fait avancer l’équipe demandée lorsqu’une étape du tutoriel doit être débloquée. */
  tutorialSkip(team: Team): void {
    if (this.state.phase !== 'RACE' || (team !== 'A' && team !== 'B')) return;
    const wasIdentifying = this.tutorialIdentifying();
    this.tutorial?.skip(team);
    this.launchTutorialIfReady(wasIdentifying);
  }

  /** Indique si une équipe attend encore l’identification de ses postes avant le départ. */
  private tutorialIdentifying(): boolean {
    const tut=this.state.tutorial;
    return !!tut && TEAMS.some(/* Repère une équipe encore en attente d’identification de ses postes. */ t=>tut.steps[tut.teams[t].step]==='identify');
  }

  /** Lance le compte à rebours une fois les quatre postes identifiés. */
  private launchTutorialIfReady(wasIdentifying: boolean): void {
    if (wasIdentifying && !this.tutorialIdentifying()) {
      this.state.sessionStartAt = this.now + COUNTDOWN_MS;
      for(const team of TEAMS) this.inputs[team].steer=0;
    }
  }

  /** Quitte l’entraînement terminé et ouvre la création d’une course normale. */
  tutorialRace(): void {
    if (this.state.phase !== 'RACE' || !this.state.tutorial?.finished) return;
    const mode = this.state.mapMode ?? 'table';
    this.resetToLobby();
    this.enterMap(mode);
  }

  /** Applique les aides de test uniquement dans le mode clavier hors tutoriel. */
  onTestToggle(msg: TestToggleMsg): void {
    const s = this.state;
    // The lessons need the real item rules: no free items, no invincibility switch
    if (s.mapMode !== 'pc' || s.tutorial) return;
    if (msg.flag !== 'invincible' && msg.flag !== 'allItems') return;
    s.testMode[msg.flag] = !!msg.on;
    if (msg.flag === 'allItems' && !msg.on) {
      // back to the normal rules: nothing stays armed for free
      for (const t of TEAMS) {
        const car = s.cars[t];
        car.itemArmed = false;
        car.itemArmExpiry = 0;
      }
    }
    this.host.broadcastFull();
  }

  /** Fige les commandes et les échéances puis les décale ensemble lors de la reprise. */
  // Pause et reprise ; resetToLobby, plus bas, nettoie toute la session.
  togglePause(): void {
    this.cancelTangiblePlacement();
    const s = this.state;
    if (s.phase === 'RACE') {
      this.pausedAt = this.now;
      s.pausedAt = this.pausedAt;
      this.releaseAllPads();
      this.host.transition('PAUSED');
      this.host.broadcastFull();
    } else if (s.phase === 'PAUSED') {
      const delta = this.now - this.pausedAt;
      /** Décale les échéances encore actives de la durée de pause. */
      const shift = (value: number) => value > this.pausedAt ? value + delta : value;
      s.sessionStartAt += delta;
      if(s.raceDeadline)s.raceDeadline+=delta;
      for (const car of Object.values(s.cars)) {
        for (const key of ['respawnUntil', 'invulnUntil', 'stunUntil', 'ghostUntil', 'slowUntil', 'boostUntil'] as const) car[key] = shift(car[key]);
      }
      for (const cd of Object.values(s.cooldowns)) { cd.ghost = shift(cd.ghost); cd.destroy = shift(cd.destroy); }
      for (const wall of s.walls) { wall.disabledUntil = shift(wall.disabledUntil); if (wall.expiresAt) wall.expiresAt = shift(wall.expiresAt); }
      for (const arc of s.arcs) arc.disabledUntil = shift(arc.disabledUntil);
      for (const pickup of s.pickups) pickup.respawnAt = shift(pickup.respawnAt);
      for (const gate of s.boostGates) { gate.expiresAt = shift(gate.expiresAt); if (gate.createdAt !== undefined) gate.createdAt += delta; }
      for (const stone of s.stones) { stone.launchedAt += delta; stone.impactAt = shift(stone.impactAt); }
      for (const d of s.deformations) { d.createdAt += delta; if(d.holdUntil)d.holdUntil+=delta; if (d.releaseAt !== null) d.releaseAt += delta; }
      this.pausedAt = 0;
      s.pausedAt = 0;
      this.host.transition('RACE');
      this.host.broadcastFull();
    }
  }

  /** Tire le prochain type de bonus à partir du générateur aléatoire de la session. */
  private randomItem(): ItemKind {
    return this.rng() < 0.5 ? 'slingshot' : 'boost';
  }

  /** Efface les objets, commandes et progressions de session avant de revenir à l’accueil. */
  resetToLobby(): void {
    const s = this.state;
    s.winner = null;
    s.track = null;
    s.trackPresentation = null;
    s.trackVersion++;
    s.walls = []; s.arcs = []; s.boostGates = []; s.stones = []; s.pickups = [];
    s.tangibles = {};
    s.tangiblePlacement = null;
    s.mapTargets = null;
    s.mapDivider = null;
    s.mapStrokes = { A: false, B: false };
    s.mapMode = null;
    s.sessionMode = 'race';
    s.raceDeadline=0;
    this.automaticPilot.reset();
    s.testMode = { invincible: false, allItems: false };
    s.tutorial = null;
    this.tutorial = null;
    s.params.armWindowS = config.armWindowS;
    s.mapDeadline = 0;
    this.generating = false;
    this.strokes = { A: null, B: null };
    this.pausedAt = 0;
    s.pausedAt = 0;
    this.releaseAllPads();
    this.inputs.A = { throttle: 1, steer: 0 };
    this.inputs.B = { throttle: 1, steer: 0 };
    s.cars.A = makeCar('A');
    s.cars.B = makeCar('B');
    s.repairProgress = { A: 0, B: 0 };
    s.cooldowns = {
      A: { ghost: 0, destroy: 0, borderPull: 0 },
      B: { ghost: 0, destroy: 0, borderPull: 0 },
    };
    this.host.transition('LOBBY');
    this.host.broadcastFull();
  }

  // --- Conduite et réglages de course ---

  /** Valide et mémorise la commande du pilote puis informe le tutoriel des actions effectuées. */
  onPilotInput(team: Team, msg: PilotInputMsg): void {
    if (this.state.sessionMode === 'tangibles-test') return;
    if (!Number.isFinite(msg.throttle) || !Number.isFinite(msg.steer)) return;
    const steer = clamp(msg.steer, -1, 1);
    this.inputs[team] = {
      throttle: clamp(msg.throttle, 0, 1),
      steer: steer * config.steerGain,
    };
    this.lastPilotInputAt[team] = this.now;
    if (this.now >= this.state.sessionStartAt) this.tutorial?.onPilotInput(team, steer, this.inputs[team].throttle);
  }

  /** Applique les réglages de difficulté, de tours et de durée en dehors du tutoriel. */
  updateRaceSettings(msg: RaceSettingsMsg): void {
    const s=this.state;if(s.tutorial||s.phase==='RESULT')return;
    if(msg.difficulty!==undefined&&!['easy','medium','hard'].includes(msg.difficulty))return;
    if(msg.lapsToWin!==undefined&&(!Number.isInteger(msg.lapsToWin)||msg.lapsToWin<1||msg.lapsToWin>99))return;
    if(msg.sessionMaxSeconds!==undefined&&(!Number.isInteger(msg.sessionMaxSeconds)||msg.sessionMaxSeconds<0||msg.sessionMaxSeconds>7200))return;
    if(msg.difficulty!==undefined)s.params.difficulty=msg.difficulty;
    if(msg.lapsToWin!==undefined)s.params.lapsToWin=msg.lapsToWin;
    if(msg.sessionMaxSeconds!==undefined){
      s.params.sessionMaxSeconds=msg.sessionMaxSeconds;
      const now=s.phase==='PAUSED'?s.pausedAt:this.now;
      s.raceDeadline=msg.sessionMaxSeconds>0&&['RACE','PAUSED'].includes(s.phase)?Math.max(now,s.sessionStartAt)+msg.sessionMaxSeconds*1000:0;
    }
    this.host.broadcastFull();
  }

  /** Bascule la conduite d’une équipe entre avance automatique et pédale tout en relâchant son entrée précédente. */
  toggleDriveMode(team?: Team): void {
    if (this.state.phase === 'RESULT' || this.state.sessionMode === 'tangibles-test') return;
    if (team) {
      this.state.driveMode[team] = this.state.driveMode[team] === 'auto' ? 'pedal' : 'auto';
      this.inputs[team].throttle = 0;
    } else {
      for (const t of TEAMS) {
        this.state.driveMode[t] = this.state.driveMode[t] === 'auto' ? 'pedal' : 'auto';
        this.inputs[t].throttle = 0;
      }
    }

    this.tutorial?.onDriveMode();
    this.host.broadcastFull();
  }

  /** Relâche une commande de conduite qui n’a plus reçu de nouvelles du client. */
  expirePilotInputs(now: number): void {
    if (this.state.sessionMode === 'tangibles-test') return;
    for (const team of TEAMS) {
      if (now - this.lastPilotInputAt[team] > config.pilotInputTimeoutMs) this.inputs[team].steer = 0;
    }
  }

  /** Arme le stock du copilote si aucun autre bonus ne réserve déjà le geste partagé. */
  // POWER arme le stock du copilote ; la réservation commune est dans armedPickup.ts.
  onPower(team: Team, _msg?: PowerMsg): void {
    if (this.state.phase !== 'RACE' || this.state.tangiblePlacement || armedPickup(this.state)) return;
    const car = this.state.cars[team];
    if (car.heldItem !== null && !car.itemArmed) {
      car.itemArmed = true;
      car.itemArmVersion++;
      car.itemArmExpiry = 0; // Armed until a valid gesture consumes the stock.
      this.host.feedback('itemArmed', car.pos.x, car.pos.y, team);
    }
  }

  // --- Stock armé et lance-pierre ---

  /** Retrouve le propriétaire du stock armé qui correspond au geste reçu. */
  private resolveArmedTeam(kind: ItemKind, at: Vec2): Team | null {
    const armed=armedPickup(this.state);
    void at;
    return armed && (armed.kind===kind || this.state.testMode.allItems) ? armed.team : null;
  }

  /** Utilise l’équipe annoncée ou, à défaut, le poste copilote le plus proche du geste. */
  private gestureTeam(at: Vec2, reported?: Team): Team {
    return reported === 'A' || reported === 'B' ? reported : nearestStationTeam(at);
  }

  /** Vide le stock utilisé et envoie le retour visuel de consommation à son propriétaire. */
  private consumeItem(team: Team): void {
    const car = this.state.cars[team],kind=car.heldItem;
    car.heldItem = null;
    car.itemArmed = false;
    car.itemArmExpiry = 0;
    if(kind)this.host.feedback('itemUsed',car.pos.x,car.pos.y,team,kind);
  }

  /**
   * Valide le geste reçu puis consomme le stock armé pour créer une vraie pierre.
   * La pierre part de la poche vers la fourche ; une traction trop courte conserve le bonus armé pour réessayer.
   */
  onSlingshot(msg: SlingshotMsg): void {
    this.tickTangiblePlacement(this.now);
    if (this.state.tangiblePlacement) return;
    if (this.state.phase !== 'RACE' || !msg.anchor || !msg.pouch) return;
    const anchor = { x: msg.anchor.x, y: msg.anchor.y };
    const pouch = { x: msg.pouch.x, y: msg.pouch.y };
    if (![anchor.x, anchor.y, pouch.x, pouch.y].every(Number.isFinite)) return;
    const shot = slingshotShot(anchor, pouch, config);
    if (!shot.valid) return;
    const owner = this.resolveArmedTeam('slingshot', anchor);
    if (!owner) return;
    const team = this.gestureTeam(anchor, msg.team);
    this.consumeItem(owner);
    const now = this.now;
    this.state.stones.push({
      id: this.nextId('stone'),
      from: pouch,
      target: shot.target,
      launchedAt: now,
      impactAt: now + config.stoneTelegraphS * 1000,
      team,
    });
    this.host.feedback('stoneWarning', shot.target.x, shot.target.y, team);
  }

  /** Fait progresser les pierres et applique leurs dégâts aux voitures atteintes. */
  updateStones(now: number): void {
    const s = this.state;
    if (s.stones.length === 0) return;
    const remaining = [];
    for (const stone of s.stones) {
      if (stone.impactAt > now) { remaining.push(stone); continue; }
      this.host.feedback('stoneImpact', stone.target.x, stone.target.y, stone.team);
      for(const victim of Object.values(s.cars)){
        if(victim.disabled||s.testMode.invincible||victim.respawnUntil>now||dist(victim.pos,stone.target)>config.stoneRadiusPx+CAR_RADIUS)continue;
        this.damage(victim,config.dmgStone,now);
        victim.stunUntil=now+config.stunStoneS*1000;victim.speed=0;victim.velocity={x:0,y:0};
        this.host.feedback('stoneHit',victim.pos.x,victim.pos.y,victim.team);
      }
    }
    s.stones = remaining;
  }

  // --- Zones d’accélération ---

  /** Valide les deux contacts puis consomme le bonus armé pour créer une zone d’accélération. */
  onBoostGate(msg: BoostGateMsg): void {
    this.tickTangiblePlacement(this.now);
    if (this.state.tangiblePlacement) return;
    if (this.state.phase !== 'RACE' || !msg.a || !msg.b) return;
    const a = { x: msg.a.x, y: msg.a.y };
    const b = { x: msg.b.x, y: msg.b.y };
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return;
    const len = dist(a, b);
    if (len < config.boostLenMinPx - 1e-6 || len > config.boostLenMaxPx + 1e-6) return;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const owner = this.resolveArmedTeam('boost', mid);
    if (!owner) return;
    const team = this.gestureTeam(mid, msg.team);
    this.consumeItem(owner);
    this.addBoostGate(team, a, b);
  }

  /** Oriente et installe la zone d’accélération dans le sens local du circuit. */
  private addBoostGate(team: Team, a: Vec2, b: Vec2): void {
    const mid = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
    const pose = orientBoostGate(a,b,this.state.track);
    this.state.boostGates.push({
      id: this.nextId('gate'),
      team,
      ...pose,
      expiresAt: this.now + config.boostGateLifeS * 1000,
      createdAt: this.now,
    });
    this.host.feedback('boostGate', mid.x, mid.y, team);
  }

  /** Vérifie si le déplacement de la voiture traverse la surface active de la zone. */
  carHitsBoostGate(prev: Vec2, pos: Vec2, g: BoostGate): boolean {
    return hitsBoostGate(prev,pos,g);
  }

  /** Déduit l’intensité d’accélération de l’espacement des deux contacts. */
  boostFactor(a: Vec2, b: Vec2): number {
    return clamp(dist(a, b) / config.boostLenMaxPx, 0.3, 1);
  }

  // --- Anciennes capacités fantôme et destruction, hors interface actuelle ---

  /** Conserve le traitement historique des capacités fantôme et destruction, absentes de l’interface actuelle. */
  onAbility(msg: AbilityMsg): void {
    const s = this.state;
    if (s.phase !== 'RACE') return;
    const team = msg.team;
    if (team !== 'A' && team !== 'B') return;
    const now = this.now;
    const cd = s.cooldowns[team];
    const car = s.cars[team];

    if (msg.kind === 'ghost') {
      if (!s.testMode.allItems && now < cd.ghost) return;
      car.ghostUntil = now + config.ghostS * 1000;
      // Recharge starts when the ghost effect ends (T-08: 3 s, then 20 s)
      if (!s.testMode.allItems) cd.ghost = car.ghostUntil + config.ghostCooldownS * 1000;
      this.host.feedback('ghost', car.pos.x, car.pos.y, team);
    } else if (msg.kind === 'destroy') {
      if ((!s.testMode.allItems && now < cd.destroy) || !msg.targetId) return;
      const target = s.walls.find(/* Retrouve le mur ciblé par l’ancienne capacité de destruction. */ w => w.id === msg.targetId) ?? s.arcs.find(/* Retrouve l’arc ciblé par l’ancienne capacité de destruction. */ a => a.id === msg.targetId);
      if (!target || target.team === team) return;
      target.disabledUntil = now + config.destroyDisableS * 1000;
      if (!s.testMode.allItems) cd.destroy = now + config.destroyCooldownS * 1000;
      const at = 'pos' in target ? target.pos : { x: (target.pylon1.x + target.pylon2.x) / 2, y: (target.pylon1.y + target.pylon2.y) / 2 };
      this.host.feedback('wallDestroyed', at.x, at.y, team);
    }
  }

  // --- Réparation coopérative et réapparition ---

  /** Met à jour l’appui de réparation du poste et le transmet au tutoriel si nécessaire. */
  onPadHold(msg: PadHoldMsg): void {
    if (this.state.sessionMode === 'tangibles-test' && msg.role === 'pilot') return;
    const pad = this.state.repairPads[`${msg.team}-${msg.role}`];
    if (!pad) return;
    pad.held = !!msg.on;
    pad.startedAt = pad.held ? this.now : 0;
    if (pad.held && this.state.phase === 'RACE' && this.state.tutorial) {
      const wasIdentifying = this.tutorialIdentifying();
      this.tutorial?.onStation(msg.team, msg.role);
      this.launchTutorialIfReady(wasIdentifying);
    }
  }

  /** Relâche les appuis de réparation lorsque la session ou la connexion est interrompue. */
  releaseAllPads(): void {
    for (const pad of Object.values(this.state.repairPads)) { pad.held = false; pad.startedAt = 0; }
  }

  /** Fait progresser la réparation seulement lorsque les deux partenaires maintiennent leurs appuis. */
  updateRepair(dt: number, now: number): void {
    const s = this.state;
    for (const team of TEAMS) {
      const car = s.cars[team];
      const needsRepair = car.disabled || car.hp < config.repairHpRestore;
      if (s.sessionMode === 'tangibles-test') {
        const pilot = s.repairPads[`${team}-pilot`];
        if (pilot.held !== needsRepair) { pilot.held = needsRepair; pilot.startedAt = needsRepair ? now : 0; }
      }
      const both = s.repairPads[`${team}-pilot`].held && s.repairPads[`${team}-copilot`].held;
      if (!both || !needsRepair) { s.repairProgress[team] = 0; continue; }
      s.repairProgress[team] = Math.min(1, s.repairProgress[team] + dt / config.repairHoldS);
      if (s.repairProgress[team] >= 1) this.completeRepair(team, now);
    }
  }

  /** Restaure la voiture et prépare son retour avec les feux de reprise si elle était en panne. */
  private completeRepair(team: Team, now: number): void {
    const s = this.state;
    const car = s.cars[team];
    const wasDisabled = car.disabled;
    car.hp = Math.max(car.hp, config.repairHpRestore);
    car.disabled = false;
    car.stunUntil = 0;
    car.respawnUntil=now+RESPAWN_COUNTDOWN_MS;
    car.speed=0;car.velocity={x:0,y:0};
    car.invulnUntil = car.respawnUntil + config.invulnAfterHitS * 1000;
    if (wasDisabled && s.track) {
      this.respawnAtCheckpoint(car);
      this.automaticPilot.forget(team);
    }
    s.repairProgress[team] = 0;
    if (s.sessionMode === 'tangibles-test') {
      const pilot = s.repairPads[`${team}-pilot`];
      pilot.held = false; pilot.startedAt = 0;
    }
    this.host.feedback('repairDone', car.pos.x, car.pos.y, team);
  }

  /** Replace la voiture au dernier point de passage validé avec la direction de la piste. */
  respawnAtCheckpoint(car: Car): void {
    const track = this.state.track!;
    const last = (car.checkpointIndex - 1 + track.checkpoints.length) % track.checkpoints.length;
    const cp = track.checkpoints[last];
    car.pos = { x: cp.pos.x, y: cp.pos.y };
    car.angle = Math.atan2(-cp.normal.x, cp.normal.y);
    car.speed = 0;
    car.velocity = { x: 0, y: 0 };
  }

  // --- Dégâts et sortie de piste ---

  /** Applique les dégâts autorisés et immobilise la voiture lorsque sa santé atteint zéro. */
  damage(car: Car, amount: number, now: number,feedback='hit'): void {
    if (car.disabled || this.state.testMode.invincible) return;
    if (this.state.tutorial) amount = 0; // lessons show the hit, never its cost
    car.hp = Math.max(0, car.hp - amount);
    this.host.feedback(feedback, car.pos.x, car.pos.y, car.team);
    if (car.hp === 0) {
      car.disabled = true;
      car.speed = 0;
      car.velocity = { x: 0, y: 0 };
      this.host.feedback('carDisabled', car.pos.x, car.pos.y, car.team);
    }
    void now;
  }

  /** Traite une sortie de piste ou remet la voiture sur la route pendant l’entraînement. */
  fallOffTrack(team: Team, now: number): void {
    const car = this.state.cars[team];
    if (car.disabled) return;
    if (this.state.testMode.invincible || this.state.tutorial) {
      // Invincible: the fall costs nothing, the car is simply put back on the track
      this.respawnAtCheckpoint(car);
      this.host.feedback('fall', car.pos.x, car.pos.y, team);
      return;
    }
    car.hp = 0;
    car.disabled = true;
    car.speed = 0;
    car.velocity = { x: 0, y: 0 };
    this.host.feedback('fall', car.pos.x, car.pos.y, team);
    this.host.feedback('carDisabled', car.pos.x, car.pos.y, team);
    void now;
  }

  // --- Tangibles : annonce, pose, activation, retrait et arc électrique ---

  /** Change la méthode de pose des tangibles et annule une éventuelle annonce en cours. */
  setTangiblePlacementMode(mode: TangiblePlacementMode): void {
    if (mode !== 'manual' && mode !== 'touch') return;
    this.state.tangiblePlacementMode = mode;
    this.cancelTangiblePlacement();
    this.host.broadcastFull();
  }

  /** Construit la pose inactive de l’objet à sa place dans la réserve neutre. */
  private parkedTangible(id:number): Tangible {
    return {...depotPose(id),kind:tangibleDefinition(id)!.kind,team:null,active:false,status:'parked',dockTeam:null};
  }

  /** Retire l’ancien effet de l’objet et crée une autorisation unique pour ses prochains contacts. */
  prepareTangiblePlacement(id: number): void {
    if (this.state.tangiblePlacementMode !== 'touch' || !tangibleDefinition(id)
      || !['READY','RACE'].includes(this.state.phase)) return;
    this.state.tangibles[id]=this.parkedTangible(id);
    this.rebuildTangibles();
    this.state.tangiblePlacement = {id:id as 1|2|3, token:++this.placementToken, expiresAt:this.now+TANGIBLE_WAIT_MS};
    this.host.broadcastFull();
  }

  /** Supprime l’annonce de pose sans modifier les objets déjà présents. */
  cancelTangiblePlacement(): void {
    if (!this.state.tangiblePlacement) return;
    this.state.tangiblePlacement = null;
    this.host.broadcastFull();
  }

  /** Annule une annonce périmée ou devenue incompatible avec la phase de jeu. */
  tickTangiblePlacement(now: number): void {
    const pending=this.state.tangiblePlacement;
    if (pending && (now>=pending.expiresAt || !['READY','RACE'].includes(this.state.phase))) this.cancelTangiblePlacement();
  }

  /** Valide le jeton et les contacts puis installe le tangible à la pose recalculée par le serveur. */
  onTangibleTouchPlaced(msg: TangibleTouchPlacedMsg): void {
    this.tickTangiblePlacement(this.now);
    const s=this.state, pending=s.tangiblePlacement, definition=tangibleDefinition(msg.id);
    if(s.tangiblePlacementMode!=='touch'||!pending||!definition||pending.id!==msg.id||pending.token!==msg.token
)return;
    const pose=tangibleTouchPose(definition.kind,msg.a,msg.b,s.params);
    if(!pose)return;
    // The single-use grant is consumed atomically; delayed/replayed packets cannot move it.
    s.tangiblePlacement=null;
    const parked=inTangibleDepot({x:pose.x*s.params.logicalWidth,y:pose.y*s.params.logicalHeight});
    s.tangibles[msg.id]={...pose,kind:definition.kind,team:null,active:!parked,status:parked?'parked':'placed',dockTeam:null,placementOrigin:{...pose}};
    this.tangibleLog.push({t:this.now,type:'TangibleMoved',id:msg.id,...pose,active:!parked});
    this.rebuildTangibles();
    this.tutorial?.onTangiblePlaced(msg.id);
    this.host.broadcastFull();
  }

  /** Active, désactive ou range le tangible demandé par la console. */
  onTangibleControl(msg: TangibleControlMsg): void {
    const id = Number(msg.id), definition = tangibleDefinition(id);
    if (!definition || !['READY', 'RACE', 'PAUSED'].includes(this.state.phase)) return;
    if (!['dock','activate','deactivate'].includes(msg.action)) return;
    if (this.state.tangiblePlacement?.id === id) this.cancelTangiblePlacement();
    if (msg.action === 'dock') {
      // Compatibility for older consoles: bringing an object back simply removes it.
      this.onTangibleRemoved({type:'TangibleRemoved',t:msg.t,id:msg.id});
      return;
    } else if (msg.action === 'activate' || msg.action === 'deactivate') {
      const t = this.state.tangibles[id];
      if (!t) return;
      t.active = msg.action === 'activate' && t.status === 'placed';
    } else return;
    this.tangibleLog.push({ t: this.now, type: 'TangibleControl', id, action: msg.action });
    this.rebuildTangibles();
  }

  /** Valide et applique une pose manuelle reçue de la console lorsque ce mode est actif. */
  onTangibleMoved(msg: TangibleMovedMsg): void {
    if (this.state.tangiblePlacementMode === 'touch') return;
    const id = Number(msg.id), definition = tangibleDefinition(id);
    if (!definition || !['READY', 'RACE', 'PAUSED'].includes(this.state.phase)
      || ![msg.x, msg.y, msg.angle].every(Number.isFinite) || msg.x<0 || msg.x>1 || msg.y<0 || msg.y>1
      || (msg.active !== undefined && typeof msg.active !== 'boolean')) return;
    if (!validTangiblePose(definition.kind, msg, config)) return;
    const old = this.state.tangibles[id];
    const { x, y } = msg, angle = ((msg.angle % 360) + 360) % 360;
    const parked=inTangibleDepot({x:x*config.logicalWidth,y:y*config.logicalHeight});
    const active = parked ? false : msg.active ?? (old?.status==='placed'?old.active:true);
    const placementOrigin = { x, y, angle };
    this.state.tangibles[id] = { x, y, angle, active, kind: definition.kind, team: null,
      dockTeam: null, status: parked?'parked':'placed', placementOrigin };
    this.tangibleLog.push({ t: this.now, type: 'TangibleMoved', id, x, y, angle, active });
    this.rebuildTangibles();
    this.tutorial?.onTangiblePlaced(id);
  }

  /** Retire l’effet de l’objet et le remet inactif dans la réserve. */
  onTangibleRemoved(msg: TangibleRemovedMsg): void {
    const id = Number(msg.id);
    if (!tangibleDefinition(id) || !['READY', 'RACE', 'PAUSED'].includes(this.state.phase)) return;
    if (this.state.tangiblePlacement?.id === id) this.cancelTangiblePlacement();
    this.tangibleLog.push({ t: this.now, type: 'TangibleRemoved', id });
    this.state.tangibles[id]=this.parkedTangible(id);
    this.rebuildTangibles();
  }

  /** Reconstruit les murs et l’arc actifs à partir des poses des trois objets neutres. */
  private rebuildTangibles(): void {
    const s = this.state;
    const oldDisabled = new Map([...s.walls, ...s.arcs].map(/* Conserve les échéances de désactivation avant de reconstruire les obstacles. */ w => [w.id, w.disabledUntil]));
    s.walls = s.walls.filter(/* Conserve les murs temporaires de démonstration pendant la reconstruction des tangibles. */ w => w.expiresAt);
    s.arcs = s.arcs.filter(/* Conserve les arcs du tutoriel clavier qui ne proviennent pas de la paire réelle. */ a => a.id.startsWith(TUTORIAL_OBSTACLE_PREFIX));
    /** Convertit une pose normalisée de tangible en pixels logiques de la table. */
    const px = (t: { x: number; y: number }): Vec2 => ({ x: t.x * config.logicalWidth, y: t.y * config.logicalHeight });
    const wall = s.tangibles[1];
    if (wall?.active && wall.status === 'placed') s.walls.push({ id: 'wall-1', team: null, pos: px(wall), angle: wall.angle,
      lengthPx: config.wallLengthPx, widthPx: config.wallWidthPx, tolerancePx: config.tangibleTolerancePx, disabledUntil: oldDisabled.get('wall-1') ?? 0 });
    const arc = tangibleArc(s.tangibles, config);
    if (arc) s.arcs.push({ ...arc, disabledUntil: oldDisabled.get(arc.id) ?? 0 });
    this.tutorial?.onTangibles();
  }

  /** Calcule les extrémités du mur à partir de son centre, de son angle et de sa longueur. */
  static wallEnds(w: Pick<Wall, 'pos' | 'angle' | 'lengthPx'>): [Vec2, Vec2] {
    const a = (w.angle * Math.PI) / 180;
    const hx = (Math.cos(a) * w.lengthPx) / 2;
    const hy = (Math.sin(a) * w.lengthPx) / 2;
    return [{ x: w.pos.x - hx, y: w.pos.y - hy }, { x: w.pos.x + hx, y: w.pos.y + hy }];
  }

  // --- Déformation temporaire du circuit ---

  /** Valide la traction du bord puis la transmet au calcul de déformation temporaire. */
  onBorderPull(msg: BorderPullMsg): void {
    this.tickTangiblePlacement(this.now);
    if (this.state.tangiblePlacement) return;
    const s = this.state;
    const track = s.track;
    if (s.phase !== 'RACE' || !track || ![msg.x, msg.y, msg.dx, msg.dy].every(Number.isFinite)) return;
    const pull = Math.hypot(msg.dx, msg.dy);
    if (pull < 20 || pull > config.trackDeformMaxShiftPx * 1.8) return;
    if(msg.gestureId!==undefined && (typeof msg.gestureId!=='string'||!/^[-\w]{1,80}$/.test(msg.gestureId)))return;
    if(msg.end!==undefined&&typeof msg.end!=='boolean')return;
    const team = msg.team ?? nearestStationTeam({ x: msg.x, y: msg.y });
    if(msg.index!==undefined&&(!Number.isInteger(msg.index)||msg.index<0||msg.index>=track.centerline.length))return;
    this.deformTrack({ x: msg.x, y: msg.y }, { x: msg.dx, y: msg.dy }, team,msg.gestureId,msg.end,msg.index);
  }

  /**
   * Crée ou actualise une traction locale en bornant son amplitude et sa durée.
   * Les deux bords suivent le même déplacement latéral pour créer une chicane temporaire, et un nouveau geste peut commencer pendant le retour du précédent.
   */
  private deformTrack(at: Vec2, drag: Vec2, team: Team, gestureId?:string, ended=false, indexHint?:number): void {
    const track = this.state.track;
    if (!track) return;
    const id=gestureId?`deform-${team}-${gestureId}`:`deform-${++this.deformCounter}`;
    const existing=this.state.deformations.find(/* Retrouve la déformation déjà créée par le même geste continu. */ d=>d.id===id);
    if(existing?.gestureEnded || existing?.releaseAt)return;
    const hit=nearestOnTrack(at,track);
    const index=existing?.index??indexHint??hit.index;
    if(!existing&&indexHint!==undefined&&Math.min(dist(at,track.innerEdge[indexHint]),dist(at,track.outerEdge[indexHint]))>80)return;
    if(!existing&&dist(at,indexHint!==undefined?track.centerline[index]:hit.closest)<1e-6)return;
    const tangent=trackTangent(track,index),normal={x:-tangent.y,y:tangent.x};
    const origin=indexHint!==undefined?track.centerline[index]:hit.closest;
    const side=(at.x-origin.x)*normal.x+(at.y-origin.y)*normal.y<0?-1:1;
    const edge=existing?{x:existing.dx,y:existing.dy}:{x:normal.x*side,y:normal.y*side};
    const edgeLen=Math.hypot(edge.x,edge.y);if(edgeLen<1e-6)return;
    const outward={x:edge.x/edgeLen,y:edge.y/edgeLen},projected=drag.x*outward.x+drag.y*outward.y;
    if(projected<20)return;
    let amount=Math.min(config.trackDeformMaxShiftPx,projected);
    // One uniform limit preserves the requested shape and clears the screen/UI.
    /** Vérifie que le déplacement proposé conserve toute la portion déformée hors des commandes et des bords. */
    const safe=(shift:number)=>{
      const n=track.baseCenterline.length,radius=config.trackDeformRadiusPoints;
      for(let offset=-radius;offset<=radius;offset++){
        const i=(index+offset+n)%n,base=track.baseCenterline[i],f=Math.cos(offset/(radius+1)*Math.PI/2);
        const p={x:base.x+outward.x*shift*f,y:base.y+outward.y*shift*f},margin=track.widths[i]/2+12;
        if(p.x<margin||p.x>config.logicalWidth-margin||p.y<margin||p.y>config.logicalHeight-margin||insidePanel(p,margin)
          ||rectContains({x:TANGIBLE_DEPOT.x-margin,y:TANGIBLE_DEPOT.y-margin,w:TANGIBLE_DEPOT.w+2*margin,h:TANGIBLE_DEPOT.h+2*margin},p))return false;
      }
      return true;
    };
    if(!safe(amount)){let low=0,high=amount;for(let i=0;i<10;i++){const mid=(low+high)/2;if(safe(mid))low=mid;else high=mid;}amount=low;}
    if(amount<20)return;
    const now=this.now;
    if(existing){
      const moved=Math.abs(existing.dx-outward.x*amount)+Math.abs(existing.dy-outward.y*amount)>1e-6;
      existing.dx=outward.x*amount;existing.dy=outward.y*amount;existing.holdUntil=now+config.trackDeformHoldS*1000;existing.gestureEnded=ended;
      this.updateTrackDeformations(now,moved);return;
    }

    // There is one active gesture only. Older local shifts remain briefly as
    // they ease home, which makes repeated interventions continuous.
    for (const deformation of this.state.deformations) {
      if (deformation.releaseAt === null) deformation.releaseAt = now;
    }
    this.state.deformations.push({
      id,
      index,
      dx: outward.x * amount,
      dy: outward.y * amount,
      createdAt: now,
      releaseAt: null,
      strength: 0,
      holdUntil:now+(config.trackDeformRampS+config.trackDeformHoldS)*1000,
      gestureEnded:ended,
    });
    this.updateTrackDeformations(now);
    this.host.feedback('trackDeformed', hit.closest.x, hit.closest.y, team);
  }

  /** Recompose la piste depuis sa forme de base avec les déplacements temporaires encore actifs. */
  updateTrackDeformations(now: number, force = false): void {
    const track = this.state.track;
    if (!track || this.state.deformations.length === 0) return;
    const rampMs = config.trackDeformRampS * 1000;
    const holdMs = config.trackDeformHoldS * 1000;
    const relaxMs = config.trackDeformRelaxS * 1000;
    let changed = force;

    for (const d of this.state.deformations) {
      if (d.releaseAt === null && now >= (d.holdUntil ?? d.createdAt + rampMs + holdMs)) d.releaseAt = now;
      const next = d.releaseAt === null
        ? clamp((now - d.createdAt) / rampMs, 0, 1)
        : clamp(1 - (now - d.releaseAt) / relaxMs, 0, 1);
      if (Math.abs(next - d.strength) > 1e-5) changed = true;
      d.strength = next;
    }
    // A just-created pull starts at strength 0, so only discard a deformation
    // once its release animation has actually reached zero.
    const kept = this.state.deformations.filter(/* Conserve les tractions maintenues et celles dont le retour n’est pas terminé. */ d => d.releaseAt === null || d.strength > 0);
    if (kept.length !== this.state.deformations.length) changed = true;
    this.state.deformations = kept;

    if (!changed) return;
    const n = track.baseCenterline.length;
    const radius = config.trackDeformRadiusPoints;
    track.centerline = track.baseCenterline.map(/* Applique les déplacements actifs au point de base sans cumuler les déformations au-delà de la limite. */ (base, i) => {
      let x = base.x, y = base.y, shiftX=0, shiftY=0, weight=0;
      for (const d of this.state.deformations) {
        const delta = Math.abs(i - d.index);
        const circular = Math.min(delta, n - delta);
        if (circular > radius) continue;
        const falloff = Math.cos((circular / (radius + 1)) * Math.PI / 2);
        const w=d.strength*falloff;shiftX+=d.dx*w;shiftY+=d.dy*w;weight+=w;
      }
      return { x:x+shiftX/Math.max(1,weight), y:y+shiftY/Math.max(1,weight) };
    });
    rebuildEdges(track);
    this.alignTrackFeatures(track);
    this.state.trackVersion++;
  }

  /** Repositionne les éléments accrochés à la piste après une déformation de la chaussée. */
  private alignTrackFeatures(track: TrackGeometry): void {
    /** Calcule la direction locale de la piste déformée pour y réaligner les éléments attachés. */
    const tangent = (index: number) => {
      const n = track.centerline.length;
      const a = track.centerline[(index - 1 + n) % n];
      const b = track.centerline[(index + 1) % n];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    };
    /** Replace chaque checkpoint sur son ancrage et sa direction de piste déformée. */
    track.checkpoints.forEach((checkpoint, i) => {
      const index = track.featureIndices.checkpoints[i];
      checkpoint.pos = { ...track.centerline[index] };
      const t = tangent(index);
      checkpoint.normal = { x: -t.y, y: t.x };
    });
    const start = track.featureIndices.start;
    const t = tangent(start);
    track.startLine = { pos: { ...track.centerline[start] }, normal: { x: -t.y, y: t.x } };
    // Baptiste's pickups follow their own anchor when the road is pulled, even while respawning.
    /** Replace chaque bonus sur son ancrage en conservant sa marge de chaussée. */
    track.featureIndices.pickups.forEach((index, i) => {
      const direction = tangent(index), normal = { x: -direction.y, y: direction.x };
      const lateral = (track.widths[index] / 2) * .3 * (i % 2 === 0 ? 1 : -1);
      const at = track.centerline[index];
      const safe = clampToTrackRibbon({ x: at.x + normal.x*lateral, y: at.y + normal.y*lateral }, track, 25);
      track.pickupPositions[i] = safe;
      if (this.state.pickups[i]) this.state.pickups[i].pos = { ...safe };
    });
  }

  /** Indique qu’un bord revient à sa place et qu’une petite marge de sécurité doit être conservée. */
  isTrackReforming(): boolean {
    return this.state.deformations.some(/* Signale qu’au moins une déformation est dans sa phase de retour. */ d => d.releaseAt !== null);
  }

  // --- Expiration des effets et contacts après déplacement ---

  /** Retire les effets terminés, fait réapparaître les bonus et actualise les besoins du tutoriel. */
  expire(now: number): void {
    const s = this.state;
    s.boostGates = s.boostGates.filter(/* Conserve les accélérations dont la durée d’existence n’est pas écoulée. */ g => g.expiresAt > now);
    s.walls = s.walls.filter(/* Conserve les murs permanents et les murs de démonstration encore valables. */ w => !w.expiresAt || w.expiresAt > now);

    for (const p of s.pickups) {
      if (p.respawnAt !== 0 && p.respawnAt <= now) {
        p.respawnAt = 0; p.kind = s.tutorial ? (p.id%2===0?'slingshot':'boost') : this.randomItem();
        if (s.track) p.pos = clampToTrackRibbon(s.track.pickupPositions[p.id] ?? p.pos, s.track, 25);
      }
    }
    for (const team of TEAMS) {
      const car = s.cars[team];
      if (s.testMode.allItems) {
        // Test mode refills stock, but POWER still uses the shared reservation.
        car.heldItem ??= 'slingshot';
        car.itemArmExpiry = 0;
      }
    }
    this.tutorial?.tick();
  }

  /** Traite le ramassage, les accélérations, les collisions électriques et les checkpoints après le déplacement d’une voiture. */
  afterMove(team: Team, prev: Vec2, now: number): void {
    const s = this.state;
    const car = s.cars[team];
    const track = s.track;
    if (!track || car.disabled || car.respawnUntil>now) return;

    // Ramassage des bonus ; la réapparition est réglée dans expire.
    if (car.heldItem === null) {
      for (const p of s.pickups) {
        const expected = this.tutorial?.forcedItem(team);
        if (p.respawnAt === 0 && (!expected || p.kind===expected) && dist(car.pos, p.pos) <= PICKUP_RADIUS) {
          car.heldItem = p.kind;
          p.respawnAt = now + (s.tutorial ? TUTORIAL_PICKUP_RESPAWN_S : config.pickupRespawnS) * 1000;
          this.host.feedback('pickup', p.pos.x, p.pos.y, team, p.kind);
          break;
        }
      }
    }

    // Traversée d’une zone d’accélération de son équipe.
    if (car.boostUntil <= now) {
      for (const g of s.boostGates) {
        if (g.team !== team) continue;
        if (this.carHitsBoostGate(prev, car.pos, g)) {
          const k = this.boostFactor(g.a, g.b);
          car.boostK = k;
          car.boostUntil = now + config.boostDurationS * 1000;
          car.speed = Math.max(car.speed, 0) * (1 + config.boostGain * k);
          this.host.feedback('boostHit', car.pos.x, car.pos.y, team);
          break;
        }
      }
    }

    // Chocs contre les murs, champs des piliers et arcs électriques.
    if (car.ghostUntil <= now && car.invulnUntil <= now && !s.testMode.invincible) {
      for (const w of s.walls) {
        if (w.team === team || w.disabledUntil > now) continue;
        const hit = wallContact(prev, car.pos, w.pos, w.angle, w.lengthPx,
          w.widthPx ?? WALL_HALF_THICKNESS * 2, CAR_RADIUS + (w.tolerancePx ?? 0));
        if (hit) {
          this.damage(car, config.dmgWall, now);
          car.invulnUntil = now + config.invulnAfterHitS * 1000;
          car.pos = hit.point;
          this.reflect(car, hit.normal.x, hit.normal.y);
          this.tutorial?.onObstacleHit(team, 'wall');
          break;
        }
      }
      if (car.invulnUntil <= now) {
        for (const t of Object.values(s.tangibles)) {
          if (!t.active || t.status !== 'placed' || t.kind !== 'pylon') continue;
          const at = { x: t.x * config.logicalWidth, y: t.y * config.logicalHeight };
          if (distToSegment(at, prev, car.pos) > config.pylonFieldRadiusPx + CAR_RADIUS) continue;
          this.damage(car, config.dmgArc, now,'electricHit');
          car.invulnUntil = now + config.invulnAfterHitS * 1000;
          car.slowUntil = now + config.arcSlowS * 1000;
          car.speed *= config.arcSlowFactor;
          this.tutorial?.onObstacleHit(team, 'arc');
          break;
        }
      }
      if (car.invulnUntil <= now) {
        for (const arc of s.arcs) {
          if (arc.team === team || arc.disabledUntil > now) continue;
          if (Math.min(distToSegment(car.pos, arc.pylon1, arc.pylon2), distToSegment(arc.pylon1, prev, car.pos), distToSegment(arc.pylon2, prev, car.pos)) <= CAR_RADIUS + WALL_HALF_THICKNESS || segmentsIntersect(prev, car.pos, arc.pylon1, arc.pylon2)) {
            this.damage(car, config.dmgArc, now,'electricHit');
            car.invulnUntil = now + config.invulnAfterHitS * 1000;
            car.slowUntil = now + config.arcSlowS * 1000;
            car.speed *= config.arcSlowFactor;
            this.tutorial?.onObstacleHit(team, 'arc');
            break;
          }
        }
      }
    }

    // Checkpoints et comptage des tours.
    const cp = track.checkpoints[car.checkpointIndex];
    if (cp) {
      const half = 110;
      const a = { x: cp.pos.x + cp.normal.x * half, y: cp.pos.y + cp.normal.y * half };
      const b = { x: cp.pos.x - cp.normal.x * half, y: cp.pos.y - cp.normal.y * half };
      const tan = { x: cp.normal.y, y: -cp.normal.x };
      const forward = (car.pos.x - prev.x) * tan.x + (car.pos.y - prev.y) * tan.y > 0;
      if (forward && segmentsIntersect(prev, car.pos, a, b)) {
        if (car.checkpointIndex === 0) car.lap++;
        car.checkpointIndex = (car.checkpointIndex + 1) % track.checkpoints.length;
        this.host.feedback('checkpoint', cp.pos.x, cp.pos.y, team);
      }
    }
  }

  /** Éloigne la voiture du segment touché et réfléchit sa vitesse pour produire le rebond. */
  bounceOffSegment(car: Car, a: Vec2, b: Vec2): void {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = clamp(((car.pos.x - a.x) * dx + (car.pos.y - a.y) * dy) / len2, 0, 1);
    const cx = a.x + dx * t, cy = a.y + dy * t;
    let nx = car.pos.x - cx, ny = car.pos.y - cy;
    const d = Math.hypot(nx, ny);
    if (d < 1e-6) { nx = -dy; ny = dx; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; }
    else { nx /= d; ny /= d; }
    const push = CAR_RADIUS + WALL_HALF_THICKNESS + 1;
    car.pos = { x: cx + nx * push, y: cy + ny * push };
    this.reflect(car, nx, ny);
  }

  /** Projette la direction de la voiture sur la normale du contact pour calculer sa direction de rebond. */
  reflect(car: Car, nx: number, ny: number): void {
    const hx = Math.cos(car.angle), hy = Math.sin(car.angle);
    const vx = hx * car.speed, vy = hy * car.speed;
    const vn = vx * nx + vy * ny;
    if (vn >= 0) return; // already moving away
    const rx = (vx - 2 * vn * nx) * 0.6;
    const ry = (vy - 2 * vn * ny) * 0.6;
    const sp = Math.hypot(rx, ry);
    if (sp < 1e-6) { car.speed = 0; return; }
    const forward = car.speed >= 0;
    car.angle = wrapAngle(Math.atan2(forward ? ry : -ry, forward ? rx : -rx));
    car.speed = forward ? sp : -sp;
  }

  // --- Tours, chronomètre et résultat ---

  /** Détermine le résultat lorsque le nombre de tours ou la durée de course est atteint. */
  checkEnd(now: number): void {
    const s = this.state;
    if (s.phase !== 'RACE' || s.tutorial || s.sessionMode === 'tangibles-test' || now < s.sessionStartAt) return;
    /** Classe la progression d’une voiture à partir de ses tours et de son prochain checkpoint. */
    const progress = (c: Car) => c.lap * 8 + c.checkpointIndex;
    let winner: Team | 'draw' | null = null;
    for (const t of TEAMS) if (s.cars[t].lap >= s.params.lapsToWin) { winner = t; break; }
    if (!winner && s.raceDeadline>0 && now >= s.raceDeadline) {
      const a = progress(s.cars.A), b = progress(s.cars.B);
      winner = a === b ? 'draw' : a > b ? 'A' : 'B';
    }
    if (!winner) return;
    s.winner = winner;
    this.releaseAllPads();
    this.inputs.A = { throttle: 0, steer: 0 };
    this.inputs.B = { throttle: 0, steer: 0 };
    this.host.transition('RESULT', { winner });
    this.host.broadcastFull();
  }
}
