/**
 * Protocole réseau : messages de la table et de la console Oz vers le serveur, et diffusions du serveur.
 * Liens : server/protocol/gameState.ts, server/net/GameServer.ts, client-shared/net.ts.
 * Réexporté par server/types.ts, qui reste le point d'import unique des types partagés.
 */
import type { TangibleId } from '../tangibles/tangibles.js';
import type { Vec2, Team, Phase, ItemKind, Difficulty, TangiblePlacementMode, Tangible, GameState, SeatId } from './gameState.js';

/** Associe un type de commande à son horodatage réseau. */
export interface BaseMsg {
  type: string;
  t: number; // timestamp ms
}

// Table → Server
/** Décrit le réglage de course dans le protocole partagé. */
export interface RaceSettingsMsg extends BaseMsg {
  type: 'RaceSettings'; difficulty?: Difficulty; lapsToWin?: number; sessionMaxSeconds?: number;
}
/** Décrit le tracé d’un demi-circuit dans le protocole partagé. */
export interface StrokeDrawMsg extends BaseMsg {
  type: 'StrokeDraw';
  creator: Team;
  pts: Vec2[];
}

/** Décrit la validation des deux tracés dans le protocole partagé. */
export interface GenerateTrackMsg extends BaseMsg {
  type: 'GenerateTrack';
}

/** Décrit la demande de départ dans le protocole partagé. */
export interface BeginRaceMsg extends BaseMsg {
  type: 'BeginRace';
}

/** Décrit la pose des points de raccord dans le protocole partagé. */
export interface MapDividerMsg extends BaseMsg {
  type: 'MapDivider';
  a: Vec2;
  b: Vec2;
}

/** Décrit le maintien d’un pad de réparation dans le protocole partagé. */
export interface PadHoldMsg extends BaseMsg {
  type: 'PadHold';
  team: Team;
  role: 'pilot' | 'copilot';
  on: boolean;
}

/** Décrit la traction et le relâchement du lance-pierre dans le protocole partagé. */
export interface SlingshotMsg extends BaseMsg {
  type: 'Slingshot';
  anchor: Vec2;
  pouch: Vec2;
  team?: Team; // resolved by the table's gesture recognizer (R-03); server falls back to proximity
}

/** Décrit les contacts d’une zone d’accélération dans le protocole partagé. */
export interface BoostGateMsg extends BaseMsg {
  type: 'BoostGate';
  a: Vec2;
  b: Vec2;
  team?: Team;
}

/** Décrit une ancienne capacité conservée pour compatibilité dans le protocole partagé. */
export interface AbilityMsg extends BaseMsg {
  type: 'Ability';
  team: Team;
  kind: 'ghost' | 'destroy';
  targetId?: string;
}

/** Décrit la traction d’un bord de piste dans le protocole partagé. */
export interface BorderPullMsg extends BaseMsg {
  type: 'BorderPull';
  index?: number;
  gestureId?: string;
  end?: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
  team?: Team;
}

// Conduite et bouton POWER du copilote → serveur
/** Décrit la commande du pilote dans le protocole partagé. */
export interface PilotInputMsg extends BaseMsg {
  type: 'PilotInput';
  team: Team;
  /** 0..1 in pedal mode; ignored in auto mode. */
  throttle: number;
  steer: number;    // [-1, 1]
}

/** Décrit l’armement du stock copilote dans le protocole partagé. */
export interface PowerMsg extends BaseMsg {
  type: 'Power';
  team: Team;
  role: 'copilot';
}

/** Décrit l’entrée en création dans le protocole partagé. */
export interface StartGameMsg extends BaseMsg {
  type: 'StartGame';
  mode?: 'table' | 'pc';
}

/** Décrit l’essai autonome des tangibles dans le protocole partagé. */
export interface StartTangibleTestMsg extends BaseMsg { type: 'StartTangibleTest' }

/** Décrit le démarrage du tutoriel dans le protocole partagé. */
export interface StartTutorialMsg extends BaseMsg {
  type: 'StartTutorial';
  mode?: 'table' | 'pc';
}

/** Décrit le passage d’une étape de tutoriel dans le protocole partagé. */
export interface TutorialSkipMsg extends BaseMsg {
  type: 'TutorialSkip';
  team: Team;
}

/** Décrit le passage du tutoriel à une course normale dans le protocole partagé. */
export interface TutorialRaceMsg extends BaseMsg { type: 'TutorialRace' }

/** Décrit la pause ou la reprise dans le protocole partagé. */
export interface PauseMsg extends BaseMsg {
  type: 'Pause';
}

/** Décrit le choix de conduite d’une équipe dans le protocole partagé. */
export interface ToggleDriveModeMsg extends BaseMsg {
  type: 'ToggleDriveMode';
  team?: Team;
}

// Console Oz → Server
/** Décrit la pose manuelle d’un tangible dans le protocole partagé. */
export interface TangibleMovedMsg extends BaseMsg {
  type: 'TangibleMoved';
  id: TangibleId;
  x: number; // normalized 0–1
  y: number;
  angle: number; // degrees
  active?: boolean; // atomic placement + activation; omitted preserves activation
}

/** Décrit le retrait physique d’un tangible dans le protocole partagé. */
export interface TangibleRemovedMsg extends BaseMsg {
  type: 'TangibleRemoved';
  id: TangibleId;
}

/** Décrit le choix de la méthode de pose dans le protocole partagé. */
export interface TangiblePlacementModeMsg extends BaseMsg { type: 'TangiblePlacementMode'; mode: TangiblePlacementMode }
/** Décrit l’annonce d’une prochaine pose dans le protocole partagé. */
export interface TangiblePrepareMsg extends BaseMsg { type: 'TangiblePrepare'; id: TangibleId }
/** Décrit l’annulation de l’annonce de pose dans le protocole partagé. */
export interface TangiblePlacementCancelMsg extends BaseMsg { type: 'TangiblePlacementCancel' }
/** Décrit la confirmation du tangible par deux contacts dans le protocole partagé. */
export interface TangibleTouchPlacedMsg extends BaseMsg {
  type: 'TangibleTouchPlaced'; id: TangibleId; token: number; a: Vec2; b: Vec2;
}

/** Décrit le changement d’activation du tangible dans le protocole partagé. */
export interface TangibleControlMsg extends BaseMsg {
  type: 'TangibleControl';
  id: TangibleId;
  /** Only Oz: activation; legacy dock returns the object to the neutral depot. */
  action: 'configure' | 'dock' | 'activate' | 'deactivate';
  team?: Team;
  kind?: Tangible['kind'];
}

/** Décrit le retour de compatibilité vers l’accueil dans le protocole partagé. */
export interface NewGameMsg extends BaseMsg {
  type: 'NewGame';
}

/** Décrit la remise à zéro de la session dans le protocole partagé. */
export interface ResetMsg extends BaseMsg {
  type: 'Reset';
}
/** Décrit une aide réservée au développement dans le protocole partagé. */
export interface TestToggleMsg extends BaseMsg {
  type: 'TestToggle';
  flag: 'invincible' | 'allItems';
  on: boolean;
}

/** Décrit la demande de mesure aller-retour dans le protocole partagé. */
export interface PingMsg extends BaseMsg {
  type: 'Ping';
}

// Séance des joueurs sur téléphone
/** Demande une place ou reprend une réservation existante. */
export interface JoinMsg extends BaseMsg {
  type: 'Join';
  seat?: SeatId;
  token?: string;
  name?: string;
}

/** Confirme une place et transmet son jeton à la seule connexion concernée. */
export interface JoinedMsg extends BaseMsg {
  type: 'Joined';
  seat: SeatId;
  token: string;
}

/** Explique pourquoi une demande de place a été refusée. */
export interface JoinRejectedMsg extends BaseMsg {
  type: 'JoinRejected';
  reason: 'seat-taken' | 'bad-token';
}

// Server → All (broadcast)
/** Décrit l’état de partie transmis aux interfaces dans le protocole partagé. */
export interface StateMsg extends BaseMsg {
  type: 'State';
  state: GameState;
}

/** Décrit un retour d’action destiné aux effets et au tutoriel dans le protocole partagé. */
export interface FeedbackMsg extends BaseMsg {
  type: 'Feedback';
  kind: string;
  x: number;
  y: number;
  team: Team;
  itemKind?: ItemKind;
}

/** Décrit le retour de mesure du temps réseau dans le protocole partagé. */
export interface PongMsg extends BaseMsg {
  type: 'Pong';
  clientT: number; // echoed Ping.t
}

/** Décrit le changement de phase annoncé aux clients dans le protocole partagé. */
export interface PhaseChangeMsg extends BaseMsg {
  type: 'PhaseChange';
  phase: Phase;
  data?: unknown;
}

/** Réunit les commandes que le serveur peut recevoir des deux interfaces. */
export type ClientMessage =
  | JoinMsg
  | RaceSettingsMsg
  | StrokeDrawMsg
  | GenerateTrackMsg
  | BeginRaceMsg
  | MapDividerMsg
  | PadHoldMsg
  | SlingshotMsg
  | BoostGateMsg
  | AbilityMsg
  | BorderPullMsg
  | PilotInputMsg
  | PowerMsg
  | StartGameMsg
  | StartTangibleTestMsg
  | StartTutorialMsg
  | TutorialSkipMsg
  | TutorialRaceMsg
  | PauseMsg
  | ToggleDriveModeMsg
  | TangibleMovedMsg
  | TangibleRemovedMsg
  | TangibleControlMsg
  | TangiblePlacementModeMsg
  | TangiblePrepareMsg
  | TangiblePlacementCancelMsg
  | TangibleTouchPlacedMsg
  | PingMsg
  | NewGameMsg
  | ResetMsg
  | TestToggleMsg;

/** Réunit les états, phases et retours que les interfaces peuvent recevoir du serveur. */
export type ServerMessage = StateMsg | FeedbackMsg | PhaseChangeMsg | PongMsg | JoinedMsg | JoinRejectedMsg;
