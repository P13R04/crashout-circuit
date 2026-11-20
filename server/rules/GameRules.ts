/**
 * Valide et applique les fonctionnalités du jeu, des tracés et bonus jusqu’aux tangibles, réparations et
 * résultats.
 * Liens : server/modes/Tutorial.ts, server/track/MapGenerator.ts, server/layout.ts, server/geometry.ts, server/types.ts
 * et les utilitaires importés ci-dessous.
 * Référencé notamment par server/net/GameServer.ts, server/PhysicsLoop.ts, scripts/acceptance.ts.
 * Façade : l'état de la partie et les points d'entrée restent ici ; la logique est découpée par responsabilité dans server/rules/ (chaque méthode délègue à une fonction du même nom).
 */
import { startSoloRace } from './session/soloRace.js';
import type { GameState, Team, Vec2, ItemKind, Car, Wall, TrackGeometry, Tangible, StrokeDrawMsg, MapDividerMsg, PadHoldMsg, SlingshotMsg, BoostGate, BoostGateMsg, AbilityMsg, BorderPullMsg, PilotInputMsg, PowerMsg, TangibleControlMsg, TangibleMovedMsg, TangibleRemovedMsg, TestToggleMsg, TangiblePlacementMode, TangibleTouchPlacedMsg, RaceSettingsMsg, TrackPresentation, SetSeatDeviceMsg, SetWiimoteMsg } from '../types.js';
import { AutomaticPilot } from '../modes/AutomaticPilot.js';
import { Tutorial } from '../modes/Tutorial.js';
import type { RulesHost, TangibleLogEntry } from './session/rulesTypes.js';
import type { PlacementFailure, RemotePlacementTarget, SeatId } from '../types.js';
import { placeRemotely } from './gameplay/remotePlacement.js';
import * as trackCreation from './session/trackCreation.js';
import * as raceStart from './session/raceStart.js';
import * as tutorialFlow from './session/tutorialFlow.js';
import * as sessionControl from './session/sessionControl.js';
import * as seatSetup from './session/seatSetup.js';
import * as driving from './gameplay/driving.js';
import * as armedItems from './gameplay/armedItems.js';
import * as legacyAbilities from './gameplay/legacyAbilities.js';
import * as repairDamage from './gameplay/repairDamage.js';
import * as tangiblesRules from './gameplay/tangiblesRules.js';
import * as trackDeformation from './gameplay/trackDeformation.js';
import * as effectsExpiry from './gameplay/effectsExpiry.js';
import * as raceResult from './session/raceResult.js';

// Réexports : les noms publics gardent leur chemin d’import.
export { CAR_RADIUS, WALL_HALF_THICKNESS, other } from './session/rulesBasics.js';
export type { RulesHost, TangibleLogEntry } from './session/rulesTypes.js';
export { makeCar, createInitialState } from './session/initialState.js';

/** Valide et applique les fonctionnalités du jeu, des tracés et bonus jusqu’aux tangibles, réparations et résultats. */
export class GameRules {
  placementToken = 0;
  readonly inputs: Record<Team, { throttle: number; steer: number }> = {
    A: { throttle: 1, steer: 0 },
    B: { throttle: 1, steer: 0 },
  };
  /** Last received control heartbeat per team; stale steering is neutralised. */
  lastPilotInputAt: Record<Team, number> = { A: 0, B: 0 };
  /** Full operator/TUIO log of pylon events (T-11, task 15). */
  readonly tangibleLog: TangibleLogEntry[] = [];

  strokes: Record<Team, Vec2[] | null> = { A: null, B: null };
  /** A and B must draw on opposite sides of the divider. */
  mapSide: Record<Team, number> = { A: 1, B: -1 };
  idCounter = 0;
  generating = false;
  pausedAt = 0;
  deformCounter = 0;
  rng: () => number;
  tutorial: Tutorial | null = null;
  automaticPilot = new AutomaticPilot();
  /** Mode solo imposé au démarrage du serveur : resetToLobby y revient, sinon le solo lancé depuis l'accueil se termine. */
  soloByDefault = false;

  /** Conserve l’état et l’horloge puis relie les retours de jeu à la progression du tutoriel. */
  constructor(
    readonly state: GameState,
    readonly host: RulesHost,
    readonly clock: () => number = Date.now,
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
  get now(): number {
    return this.clock();
  }

  /** Produit un identifiant d’objet unique à partir d’un préfixe et du compteur de session. */
  nextId(prefix: string): string {
    return `${prefix}${++this.idCounter}`;
  }

  /** Ouvre l'écran de préparation où chaque poste choisit son appareil. */
  enterSetup(): void { seatSetup.enterSetup(this); }
  /** Enregistre l'appareil choisi pour un poste pendant la préparation. */
  setSeatDevice(msg: SetSeatDeviceMsg): void { seatSetup.setSeatDevice(this, msg); }
  /** Enregistre la manette Wii ouverte par la table pour le pilote d'une équipe. */
  setWiimote(msg: SetWiimoteMsg): void { seatSetup.setWiimote(this, msg); }
  /** Quitte la préparation pour la création du circuit lorsque tous les joueurs annoncés sont connectés. */
  confirmSetup(): void { seatSetup.confirmSetup(this); }
  /** Prépare la création à deux équipes et réinitialise les points, les tracés et les objets de session. */
  enterMap(mode?: 'table' | 'pc'): void { trackCreation.enterMap(this, mode); }
  /** Valide les deux points de raccord et attribue les demi-tracés aux équipes. */
  onMapDivider(msg: MapDividerMsg): void { trackCreation.onMapDivider(this, msg); }
  /** Vérifie le tracé de l’équipe active avant de le conserver pour la génération. */
  onStrokeDraw(msg: StrokeDrawMsg): void { trackCreation.onStrokeDraw(this, msg); }
  /** Accepte la validation seulement lorsque les deux tracés sont disponibles. */
  onGenerateTrack(): void { trackCreation.onGenerateTrack(this); }
  /** Conserve une création au rythme des joueurs sans terminer automatiquement un dessin incomplet. */
  tickMap(now: number): void { trackCreation.tickMap(this, now); }
  /** Installe le circuit, les voitures et les objets de la nouvelle course. */
  startRace(track?: TrackGeometry, waitForPlayers?: boolean, presentation?: TrackPresentation | null): void { raceStart.startRace(this, track, waitForPlayers, presentation); }
  /** Lance les feux de départ lorsque la piste est prête et sa présentation terminée. */
  beginRace(): void { raceStart.beginRace(this); }
  /** Lance ou relance le circuit prédéfini de l'essai solo. */
  startSolo(): void { startSoloRace(this); }

  /** Prépare le circuit et les voitures autonomes du mode d’essai réservé au développement. */
  startTangibleTest(): void { raceStart.startTangibleTest(this); }
  /** Remplace les entrées pilotes par les commandes de suivi du centre dans le mode d’essai. */
  updateAutomaticPilots(now: number): void { raceStart.updateAutomaticPilots(this, now); }
  /** Crée la progression guidée des deux équipes et installe le circuit prédéfini. */
  startTutorial(mode?: 'table' | 'pc'): void { tutorialFlow.startTutorial(this, mode); }
  /** Fait avancer l’équipe demandée lorsqu’une étape du tutoriel doit être débloquée. */
  tutorialSkip(team: Team): void { tutorialFlow.tutorialSkip(this, team); }
  /** Indique si une équipe attend encore l’identification de ses postes avant le départ. */
  tutorialIdentifying(): boolean { return tutorialFlow.tutorialIdentifying(this); }
  /** Lance le compte à rebours une fois les quatre postes identifiés. */
  launchTutorialIfReady(wasIdentifying: boolean): void { tutorialFlow.launchTutorialIfReady(this, wasIdentifying); }
  /** Quitte l’entraînement terminé et ouvre la création d’une course normale. */
  tutorialRace(): void { tutorialFlow.tutorialRace(this); }
  /** Applique les aides de test uniquement dans le mode clavier hors tutoriel. */
  onTestToggle(msg: TestToggleMsg): void { sessionControl.onTestToggle(this, msg); }
  /** Fige les commandes et les échéances puis les décale ensemble lors de la reprise. */
  togglePause(): void { sessionControl.togglePause(this); }
  /** Tire le prochain type de bonus à partir du générateur aléatoire de la session. */
  randomItem(): ItemKind { return sessionControl.randomItem(this); }
  /** Efface les objets, commandes et progressions de session avant de revenir à l’accueil. */
  resetToLobby(): void { sessionControl.resetToLobby(this); }
  /** Valide et mémorise la commande du pilote puis informe le tutoriel des actions effectuées. */
  onPilotInput(team: Team, msg: PilotInputMsg): void { driving.onPilotInput(this, team, msg); }
  /** Applique les réglages de difficulté, de tours et de durée en dehors du tutoriel. */
  updateRaceSettings(msg: RaceSettingsMsg): void { driving.updateRaceSettings(this, msg); }
  /** Bascule la conduite d’une équipe entre avance automatique et pédale tout en relâchant son entrée précédente. */
  toggleDriveMode(team?: Team): void { driving.toggleDriveMode(this, team); }
  /** Relâche une commande de conduite qui n’a plus reçu de nouvelles du client. */
  expirePilotInputs(now: number): void { driving.expirePilotInputs(this, now); }
  /** Arme le stock du copilote si aucun autre bonus ne réserve déjà le geste partagé. */
  onPower(team: Team, _msg?: PowerMsg): void { armedItems.onPower(this, team, _msg); }
  /** Valide le geste reçu puis consomme le stock armé pour créer une vraie pierre. */
  onSlingshot(msg: SlingshotMsg): boolean { return armedItems.onSlingshot(this, msg); }
  /** Fait progresser les pierres et applique leurs dégâts aux voitures atteintes. */
  updateStones(now: number): void { armedItems.updateStones(this, now); }
  /** Valide les deux contacts puis consomme le bonus armé pour créer une zone d’accélération. */
  onBoostGate(msg: BoostGateMsg): boolean { return armedItems.onBoostGate(this, msg); }
  /** Vérifie si le déplacement de la voiture traverse la surface active de la zone. */
  carHitsBoostGate(prev: Vec2, pos: Vec2, g: BoostGate): boolean { return armedItems.carHitsBoostGate(this, prev, pos, g); }
  /** Déduit l’intensité d’accélération de l’espacement des deux contacts. */
  boostFactor(a: Vec2, b: Vec2): number { return armedItems.boostFactor(this, a, b); }
  /** Conserve le traitement historique des capacités fantôme et destruction, absentes de l’interface actuelle. */
  onAbility(msg: AbilityMsg): void { legacyAbilities.onAbility(this, msg); }
  /** Met à jour l’appui de réparation du poste et le transmet au tutoriel si nécessaire. */
  onPadHold(msg: PadHoldMsg): void { repairDamage.onPadHold(this, msg); }
  /** Relâche les appuis de réparation lorsque la session ou la connexion est interrompue. */
  releaseAllPads(): void { repairDamage.releaseAllPads(this); }
  /** Fait progresser la réparation seulement lorsque les deux partenaires maintiennent leurs appuis. */
  updateRepair(dt: number, now: number): void { repairDamage.updateRepair(this, dt, now); }
  /** Replace la voiture au dernier point de passage validé avec la direction de la piste. */
  respawnAtCheckpoint(car: Car): void { repairDamage.respawnAtCheckpoint(this, car); }
  /** Applique les dégâts autorisés et immobilise la voiture lorsque sa santé atteint zéro. */
  damage(car: Car, amount: number, now: number, feedback?: string): void { repairDamage.damage(this, car, amount, now, feedback); }
  /** Traite une sortie de piste ou remet la voiture sur la route pendant l’entraînement. */
  fallOffTrack(team: Team, now: number): void { repairDamage.fallOffTrack(this, team, now); }
  /** Change la méthode de pose des tangibles et annule une éventuelle annonce en cours. */
  setTangiblePlacementMode(mode: TangiblePlacementMode): void { tangiblesRules.setTangiblePlacementMode(this, mode); }
  /** Construit la pose inactive de l’objet à sa place dans la réserve neutre. */
  parkedTangible(id:number): Tangible { return tangiblesRules.parkedTangible(this, id); }
  /** Retire l’ancien effet de l’objet et crée une autorisation unique pour ses prochains contacts. */
  prepareTangiblePlacement(id: number): void { tangiblesRules.prepareTangiblePlacement(this, id); }
  /** Supprime l’annonce de pose sans modifier les objets déjà présents. */
  cancelTangiblePlacement(): void { tangiblesRules.cancelTangiblePlacement(this); }
  /** Annule une annonce périmée ou devenue incompatible avec la phase de jeu. */
  tickTangiblePlacement(now: number): void { tangiblesRules.tickTangiblePlacement(this, now); }
  /** Valide le jeton et les contacts puis installe le tangible à la pose recalculée par le serveur. */
  onTangibleTouchPlaced(msg: TangibleTouchPlacedMsg): void { tangiblesRules.onTangibleTouchPlaced(this, msg); }
  /** Applique la confirmation d'une pose ou d'un bonus d'un copilote en mode accessibilité. */
  placeRemotely(seat: SeatId, target: RemotePlacementTarget): PlacementFailure | null { return placeRemotely(this, seat, target); }
  /** Active, désactive ou range le tangible demandé par la console. */
  onTangibleControl(msg: TangibleControlMsg): void { tangiblesRules.onTangibleControl(this, msg); }
  /** Valide et applique une pose manuelle reçue de la console lorsque ce mode est actif. */
  onTangibleMoved(msg: TangibleMovedMsg): void { tangiblesRules.onTangibleMoved(this, msg); }
  /** Retire l’effet de l’objet et le remet inactif dans la réserve. */
  onTangibleRemoved(msg: TangibleRemovedMsg): void { tangiblesRules.onTangibleRemoved(this, msg); }
  /** Reconstruit les murs et l’arc actifs à partir des poses des trois objets neutres. */
  rebuildTangibles(): void { tangiblesRules.rebuildTangibles(this); }
  /** Calcule les extrémités du mur à partir de son centre, de son angle et de sa longueur. */
  static wallEnds(w: Pick<Wall, 'pos' | 'angle' | 'lengthPx'>): [Vec2, Vec2] { return tangiblesRules.wallEnds(w); }
  /** Valide la traction du bord puis la transmet au calcul de déformation temporaire. */
  onBorderPull(msg: BorderPullMsg): void { trackDeformation.onBorderPull(this, msg); }
  /** Recompose la piste depuis sa forme de base avec les déplacements temporaires encore actifs. */
  updateTrackDeformations(now: number, force?: boolean): void { trackDeformation.updateTrackDeformations(this, now, force); }
  /** Indique qu’un bord revient à sa place et qu’une petite marge de sécurité doit être conservée. */
  isTrackReforming(): boolean { return trackDeformation.isTrackReforming(this); }
  /** Retire les effets terminés, fait réapparaître les bonus et actualise les besoins du tutoriel. */
  expire(now: number): void { effectsExpiry.expire(this, now); }
  /** Traite le ramassage, les accélérations, les collisions électriques et les checkpoints après le déplacement d’une voiture. */
  afterMove(team: Team, prev: Vec2, now: number): void { effectsExpiry.afterMove(this, team, prev, now); }
  /** Éloigne la voiture du segment touché et réfléchit sa vitesse pour produire le rebond. */
  bounceOffSegment(car: Car, a: Vec2, b: Vec2): void { effectsExpiry.bounceOffSegment(this, car, a, b); }
  /** Projette la direction de la voiture sur la normale du contact pour calculer sa direction de rebond. */
  reflect(car: Car, nx: number, ny: number): void { effectsExpiry.reflect(this, car, nx, ny); }
  /** Détermine le résultat lorsque le nombre de tours ou la durée de course est atteint. */
  checkEnd(now: number): void { raceResult.checkEnd(this, now); }
}
