/**
 * Déclare les structures d’état et les messages échangés entre le serveur, la table et la console Oz.
 * Liens : server/tangibles/tangibles.ts.
 * Référencé notamment par client-oz/OzController.ts, client-oz/map/OzMap.ts, client-oz/main.ts.
 * Découpé dans server/protocol/ : gameState.ts (état de partie) et messages.ts (protocole réseau). Ce fichier réexporte tous les types : les chemins d'import ne changent pas.
 */

// Réexports : les noms publics gardent leur chemin d’import.
export type { Vec2, Team, SeatId, Seat, Phase, ItemKind, Difficulty, DriveMode, TangiblePlacementMode, TangiblePlacementRequest, Tangible, Car, Wall, ArcElectric, BoostGate, Stone, Pickup, RepairPad, Cooldown, TrackGeometry, TrackDeformation, MapTargets, TutorialStepId, TutorialTeam, TutorialState, GameParams, TrackPresentation, GameState } from './protocol/gameState.js';
export type { BaseMsg, JoinMsg, JoinedMsg, JoinRejectedMsg, RaceSettingsMsg, StrokeDrawMsg, GenerateTrackMsg, BeginRaceMsg, MapDividerMsg, PadHoldMsg, SlingshotMsg, BoostGateMsg, AbilityMsg, BorderPullMsg, PilotInputMsg, PowerMsg, StartGameMsg, StartTangibleTestMsg, StartTutorialMsg, TutorialSkipMsg, TutorialRaceMsg, PauseMsg, ToggleDriveModeMsg, TangibleMovedMsg, TangibleRemovedMsg, TangiblePlacementModeMsg, TangiblePrepareMsg, TangiblePlacementCancelMsg, TangibleTouchPlacedMsg, TangibleControlMsg, NewGameMsg, ResetMsg, TestToggleMsg, PingMsg, StateMsg, FeedbackMsg, PongMsg, PhaseChangeMsg, ClientMessage, ServerMessage } from './protocol/messages.js';

