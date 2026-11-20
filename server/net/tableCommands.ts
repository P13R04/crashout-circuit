/**
 * Oriente les commandes de séance et les gestes reçus depuis la table.
 * Liens : server/net/GameServer.ts, server/rules/GameRules.ts.
 */
import type { ClientMessage, Team } from '../types.js';
import { isThemeId } from '../protocol/theme.js';
import { generatePreset } from '../track/MapGenerator.js';
import { lockTableFormat, playAreaFor, isPhoneStation } from '../tableStations.js';
import type { GameRules } from '../rules/GameRules.js';

/** Applique les commandes de préparation, de départ et de fin de séance. */
export function handleTableSession(rules: GameRules, msg: ClientMessage): void {
  const { phase, developerTools, soloTest } = rules.state;
  if (msg.type === 'SetTheme') {
    if (isThemeId(msg.theme) && rules.state.theme !== msg.theme) {
      rules.state.theme = msg.theme;
      rules.host.broadcastFull();
    }
    return;
  }
  if (soloTest && msg.type !== 'Pause' && msg.type !== 'Reset' && msg.type !== 'NewGame') return;
  switch (msg.type) {
    case 'RaceSettings':
      rules.updateRaceSettings(msg);
      break;
    case 'StartPreset':
      if (phase === 'LOBBY') {
        lockTableFormat(rules.state);
        rules.state.mapMode = 'table';
        rules.startRace(generatePreset(playAreaFor(rules.state)));
      }
      break;
    case 'StartGame':
      // La course à la table passe par la préparation des postes ; le clavier de développement l'ignore.
      if (phase !== 'LOBBY') break;
      if (msg.mode === undefined || msg.mode === 'table') rules.enterSetup();
      else if (msg.mode === 'pc' && developerTools) rules.enterMap('pc');
      break;
    case 'SetSeatDevice':
      rules.setSeatDevice(msg);
      break;
    case 'SetWiimote':
      rules.setWiimote(msg);
      break;
    case 'ConfirmSetup':
      rules.confirmSetup();
      break;
    case 'StartTangibleTest':
      if (developerTools) rules.startTangibleTest();
      break;
    case 'StartTutorial':
      if (phase === 'LOBBY' && (msg.mode === undefined || msg.mode === 'table' || msg.mode === 'pc' && developerTools)) {
        rules.startTutorial(msg.mode === 'pc' ? 'pc' : 'table');
      }
      break;
    case 'TutorialRace':
      rules.tutorialRace();
      break;
    case 'TutorialSkip':
      rules.tutorialSkip(msg.team);
      break;
    case 'TestToggle':
      if (developerTools) rules.onTestToggle(msg);
      break;
    case 'Pause':
      rules.togglePause();
      break;
    case 'StrokeDraw':
      rules.onStrokeDraw(msg);
      break;
    case 'GenerateTrack':
      rules.onGenerateTrack();
      break;
    case 'BeginRace':
      rules.beginRace();
      break;
    case 'MapDivider':
      rules.onMapDivider(msg);
      break;
    case 'Reset':
    case 'NewGame':
      rules.resetToLobby();
      break;
  }
}

/** Applique la conduite, les gestes et les appuis permis depuis la table. */
export function handleTableGameplay(rules: GameRules, msg: ClientMessage): void {
  if (rules.state.soloTest) return;
  switch (msg.type) {
    case 'PilotInput':
      if ((msg.team === 'A' || msg.team === 'B') && !isPhoneStation(rules.state, msg.team, 'pilot')) {
        rules.onPilotInput(msg.team, msg);
      }
      break;
    case 'Power':
      if (msg.role === 'copilot' && (msg.team === 'A' || msg.team === 'B') && !isPhoneStation(rules.state, msg.team, msg.role)) {
        rules.onPower(msg.team, msg);
      }
      break;
    case 'ToggleDriveMode':
      rules.toggleDriveMode(msg.team);
      break;
    case 'PadHold':
      if ((msg.team === 'A' || msg.team === 'B') && (msg.role === 'pilot' || msg.role === 'copilot')
        && !isPhoneStation(rules.state, msg.team, msg.role)) rules.onPadHold(msg);
      break;
    case 'Slingshot':
      rules.onSlingshot(msg);
      break;
    case 'BoostGate':
      rules.onBoostGate(msg);
      break;
    case 'BorderPull':
      rules.onBorderPull(msg);
      break;
    case 'TangibleTouchPlaced':
      rules.onTangibleTouchPlaced(msg);
      break;
  }
}

/** Relâche les commandes de table lors de la fermeture de sa dernière connexion. */
export function releaseTableSteering(rules: GameRules): void {
  for (const team of ['A', 'B'] as const satisfies readonly Team[]) {
    if (!rules.state.seats[`${team}-pilot`].connected) rules.inputs[team] = { throttle: 0, steer: 0 };
  }
}
