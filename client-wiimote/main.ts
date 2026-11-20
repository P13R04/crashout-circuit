/**
 * Page du pilote Wii : relie la manette (WebHID), la séance (WebSocket /ws/player) et l'écran.
 * Liens : client-wiimote/device/webHidWiimote.ts, client-shared/playerSession.ts, client-shared/pilot/pilotLink.ts.
 * La manette est la seule source de commandes : aucun capteur du téléphone, aucune entrée tactile ni clavier pour conduire.
 * Réglages d'essai par l'adresse : ?room=ABCDE&grip=face|flat&flip=1&continuous=1&range=50 (angle de pleine direction).
 */
import { PhoneSession } from '../client-shared/playerSession.js';
import { CADENCE } from '../client-shared/pilot/inputCadence.js';
import { PilotLink } from '../client-shared/pilot/pilotLink.js';
import { playerTeam, SEAT_IDS } from '../client-shared/seatLabels.js';
import type { SeatId } from '../server/types.js';
import { readSession } from '../client-shared/sessionInfo.js';
import { launchSolo, SOLO_LAUNCH_NOTICE } from './launch/soloLaunch.js';
import { WiimoteCommandSource } from './control/wiimoteCommandSource.js';
import { browserHid } from './device/hidTypes.js';
import { WebHidWiimote } from './device/webHidWiimote.js';
import { NO_BUTTONS } from './hid/reportDecoder.js';
import type { TiltGrip, TiltSettings } from './steering/tiltAngle.js';
import { RANGE_LIMITS, WIIMOTE_CURVE } from './steering/wiimoteSteering.js';
import { WiimoteScreen } from './ui/wiimoteScreen.js';
import type { ControllerState, WiimoteView } from './ui/viewHints.js';

const REFRESH_MS = 50;
const RANGE_KEY = 'crashout-wiimote-range';
/** Intervalle minimal entre deux envois : 60 par seconde, au rythme de la physique du serveur, au lieu de 30. */
const SEND_MS = 1000 / 60;
const params = new URLSearchParams(location.search);
const settings: TiltSettings = { grip: params.get('grip') === 'flat' ? 'flat' : 'face', flip: params.get('flip') === '1' };
const source = new WiimoteCommandSource(settings, initialRange());
const session = new PhoneSession(render);
let link: PilotLink | null = null;
let controller: ControllerState = 'idle';
let deviceName = '';
let lastRefresh = 0;
let launching = false;

const hid = new WebHidWiimote(browserHid(), {
  onReport(report, now) {
    source.feed(report, now);
    if (!document.hidden) link?.tick(now);
  },
  onConnected(name) {
    deviceName = name;
    controller = 'connected';
    source.connect(performance.now());
    render();
  },
  onDisconnected() {
    controller = 'lost';
    source.disconnect();
    link?.tick(performance.now());
    hid.setRumble(false);
    render();
  },
  onError(message) {
    session.notice = message;
    render();
  },
}, { continuous: params.get('continuous') === '1' });

const screen = new WiimoteScreen(document.querySelector<HTMLElement>('#screen')!, {
  connectController: () => { hid.connect().catch(error => fail(error)); },
  recalibrate: () => source.steering.calibrate(),
  openRoom: code => { void session.open(code); },
  join: seat => session.join(seat),
  leave: () => session.leave(),
  startSolo: () => { void startSolo(); },
  setGrip: (grip: TiltGrip) => source.steering.configure({ ...source.steering.tilt, grip }),
  setFlip: flip => source.steering.configure({ ...source.steering.tilt, flip }),
  setRange: range => { source.steering.setRange(range); saveRange(source.steering.range); },
}, params.get('room') ?? '', settings.grip, settings.flip, source.steering.range);

if (!hid.supported) controller = 'unsupported';

/** Angle de pleine direction : l'adresse d'abord, puis le dernier réglage du navigateur, sinon la valeur par défaut. */
function initialRange(): number {
  const fromUrl = Number(params.get('range'));
  if (params.has('range') && Number.isFinite(fromUrl)) return fromUrl;
  try {
    const saved = Number(localStorage.getItem(RANGE_KEY));
    if (saved >= RANGE_LIMITS.min && saved <= RANGE_LIMITS.max) return saved;
  } catch {
    // Sans stockage, la valeur par défaut s'applique à chaque ouverture.
  }
  return WIIMOTE_CURVE.maxSteer;
}

/** Mémorise le réglage de sensibilité pour la prochaine ouverture de la page. */
function saveRange(range: number): void {
  try {
    localStorage.setItem(RANGE_KEY, String(range));
  } catch {
    // Réglage conservé pour cette page seulement.
  }
}

/** Vérifie la manette puis lance la partie solo, et affiche la raison si elle ne peut pas démarrer. */
async function startSolo(): Promise<void> {
  if (launching) return;
  launching = true;
  session.notice = '';
  render();
  const result = await launchSolo({
    session,
    controllerConnected: () => controller === 'connected' && hid.connected && source.isConnected,
    readRoom: async () => (await readSession()).room,
  });
  launching = false;
  session.notice = SOLO_LAUNCH_NOTICE[result];
  render();
}

/** Numéro de joueur affiché par la LED de la manette : 1 pour l'équipe cyan, 2 pour la rose. */
function playerNumber(seat: SeatId | null): number | null {
  return seat?.endsWith('-pilot') ? (playerTeam(seat) === 'A' ? 1 : 2) : null;
}

/** Affiche une erreur de connexion de la manette dans la zone de messages. */
function fail(error: unknown): void {
  if (error instanceof DOMException && error.name === 'NotFoundError') return; // fenêtre de choix fermée
  session.notice = `Connexion de la manette impossible : ${error instanceof Error ? error.message : String(error)}`;
  render();
}

/** Crée ou retire le lien réseau selon que cette page tient une place de pilote. */
function syncLink(): void {
  const seat = session.seat;
  const pilot = seat?.endsWith('-pilot') ? seat : null;
  if (pilot && !link) {
    link = new PilotLink(session, playerTeam(pilot), source, { minSendMs: SEND_MS });
    hid.setPlayer(playerNumber(pilot));
  } else if (!pilot && link) {
    link.release();
    link = null;
    hid.setPlayer(null);
  }
}

/** Construit le modèle de vue de l'écran à partir de la manette et de la séance. */
function buildView(): WiimoteView {
  const { state, seat } = session;
  const team = seat ? playerTeam(seat) : null;
  const seatsTaken = Object.fromEntries(SEAT_IDS.map(id => [id, state?.seats[id].taken ?? false])) as Record<SeatId, boolean>;
  return {
    controller,
    deviceName,
    battery: source.battery,
    lowBattery: source.lowBattery,
    steeringStatus: source.steering.status,
    shaking: source.steering.shaking,
    steer: source.steering.steer,
    angle: source.steering.angle,
    accel: source.accel,
    buttons: controller === 'connected' ? source.buttons : NO_BUTTONS,
    room: session.room,
    online: session.online,
    seat,
    seatsTaken,
    pending: session.pending !== null,
    notice: session.notice,
    phase: state?.phase ?? null,
    driveMode: team && state ? state.driveMode[team] : null,
    driving: link?.isDriving ?? false,
    carDisabled: team && state ? state.cars[team].disabled : false,
    solo: state?.soloTest ?? false,
    launching,
  };
}

/** Actualise le lien, la vibration d'alerte et l'écran. */
function render(): void {
  syncLink();
  const view = buildView();
  hid.setRumble(view.phase === 'RACE' && view.carDisabled && controller === 'connected');
  screen.update(view);
}

/** Lit la manette en continu pour renouveler les commandes immobiles et rafraîchir l'écran sans surcharger le DOM. */
function tick(): void {
  const now = performance.now();
  if (document.hidden) link?.release();
  else link?.tick(now);
  if (now - lastRefresh >= REFRESH_MS) {
    lastRefresh = now;
    render();
  }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) link?.release(); else session.resume(); });
window.addEventListener('pagehide', () => { link?.release(); hid.close(); });
setInterval(tick, CADENCE.pollMs);
render();
if (hid.supported) hid.reopenKnown().catch(() => { /* la manette sera choisie au bouton Connecter */ });
const initialRoom = params.get('room');
if (initialRoom) void session.open(initialRoom);
