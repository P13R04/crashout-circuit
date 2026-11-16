/**
 * Lance-pierre : fourche de trois doigts, traction, relâchement et journal des décisions.
 * Liens : server/geometry.ts, client-table/gesture/GestureLog.ts, client-table/gesture/gestureTuning.ts.
 * Fonctions appelées par les méthodes de GestureRecognizer (server/GestureRecognizer.ts), qui garde l'état et délègue ici.
 */
import type { Vec2 } from '../../../server/types.js';
import { nearestStationTeam } from '../../../server/layout.js';
import { slingshotShot } from '../../../server/geometry.js';
import { tuning } from '../gestureTuning.js';
import { recordGesture } from '../GestureLog.js';
import type { Contact } from '../gestureTypes.js';
import type { GestureRecognizer } from '../GestureRecognizer.js';

/**
 * Identifie les deux appuis fixes et le doigt mobile puis actualise la trajectoire du lance-pierre.
 *
 * Three reserved fingers, with a tolerant fork landing window, form the sling.
 * The landing order says nothing about the roles (fingers land within a few ms of
 * each other): the pouch is the finger that has clearly travelled the most, the
 * other two are the fork. The choice is not final — a finger that merely slid while
 * settling loses it as soon as another one is pulled much farther. Until one finger
 * dominates, no role is shown. The shot is fired on release.
 */
export function updateSling(recognizer: GestureRecognizer): void {
  const state = recognizer.state;
  if (!state || state.phase !== 'RACE' || recognizer.pendingPlacement || recognizer.expectedBonus?.kind!=='slingshot' || recognizer.borderPull || recognizer.bonusCommitted) { cancelSling(recognizer); return; }

  if (!recognizer.slingIds) {
    const candidates = recognizer.bonusRecent.filter(c=>!c.consumed&&c.releasedAt===undefined);
    let free: Contact[] | null = null;
    let tightest = Infinity;
    // Cherche un vrai groupe local au lieu de laisser trois doigts éloignés (deux joueurs)
    // bloquer tout le geste.
    for(let i=0;i<candidates.length&&!free;i++)for(let j=i+1;j<candidates.length&&!free;j++)for(let k=j+1;k<candidates.length;k++){
      const triple=[candidates[i],candidates[j],candidates[k]];
      const cx=triple.reduce((n,c)=>n+c.sx,0)/3,cy=triple.reduce((n,c)=>n+c.sy,0)/3;
      const tripleSpread=Math.max(...triple.map(c=>Math.hypot(c.sx-cx,c.sy-cy)));
      tightest=Math.min(tightest,tripleSpread);
      if(tripleSpread<=tuning.slingClusterPx){free=triple;break;}
    }
    // Trois doigts ou plus sont posés mais aucun groupe n’est assez serré : le journal garde la raison.
    if (!free) { if (candidates.length >= 3) logOnce(recognizer, 'clusterTooWide', { spread: tightest, limit: tuning.slingClusterPx }); return; }
    const cx = (free[0].sx + free[1].sx + free[2].sx) / 3;
    const cy = (free[0].sy + free[1].sy + free[2].sy) / 3;
    const spread = Math.max(...free.map(/* Mesure l’écart initial de chaque doigt au centre du groupe pour contrôler son regroupement. */ c => Math.hypot(c.sx - cx, c.sy - cy)));
    if (spread > tuning.slingClusterPx) { logOnce(recognizer, 'clusterTooWide', { spread, limit: tuning.slingClusterPx }); return; }
    // Les deux premiers doigts déterminent la couleur ; s’ils ne sont pas tous les deux
    // dans la moitié cyan, la fourche est rose. On ne laisse donc jamais un groupe lointain voler le geste.
    const firstTwo={x:(free[0].sx+free[1].sx)/2,y:(free[0].sy+free[1].sy)/2};
    const armedTeam=recognizer.armedTeam('slingshot', firstTwo);
    if (!armedTeam) return;
    // La couleur suit le côté des deux premières poses lorsque ce côté possède l’objet armé;
    // sinon on garde l’équipe autorisée par le serveur plutôt que de créer un tir invalide.
    recognizer.slingTeam=nearestStationTeam(firstTwo)==='A'&&nearestStationTeam({x:free[0].sx,y:free[0].sy})==='A'&&nearestStationTeam({x:free[1].sx,y:free[1].sy})==='A'?'A':armedTeam;
    log(recognizer, 'cluster', { spread, limit: tuning.slingClusterPx });
    recognizer.slingContacts=free;
    recognizer.slingIds = free.map(/* Retient les identifiants des trois contacts du lance-pierre. */ c => c.id);
    recognizer.slingPuller = null;
  }

  const cs = recognizer.slingContacts??[];
  if (cs.length !== 3) { cancelSling(recognizer); return; }
  /** Mesure le déplacement d’un doigt depuis sa position initiale pour reconnaître la poche mobile. */
  const disp = (c: Contact) => Math.hypot(c.x - c.sx, c.y - c.sy);

  const far = [...cs].sort(/* Classe les doigts du plus déplacé au moins déplacé pour identifier la poche. */ (a, b) => disp(b) - disp(a));
  // A finger takes (or takes back) the pouch role only when it left its spot while
  // both others stayed comparatively still; otherwise the previous choice is kept.
  if (disp(far[0]) >= tuning.slingRoleMinPx && disp(far[0]) >= disp(far[1]) * tuning.slingDominance) {
    if (recognizer.slingPuller !== far[0].id) log(recognizer, 'puller', { id: far[0].id, move: disp(far[0]), next: disp(far[1]), ratio: disp(far[1]) ? disp(far[0]) / disp(far[1]) : 99 });
    recognizer.slingPuller = far[0].id;
  }

  const puller = cs.find(/* Retrouve le contact qui possède déjà le rôle de poche mobile. */ c => c.id === recognizer.slingPuller) ?? null;
  const anchors = puller ? cs.filter(/* Conserve les deux autres doigts comme appuis fixes de la fourche. */ c => c !== puller) : cs.slice(0, 2);
  const a: Vec2 = { x: (anchors[0].x + anchors[1].x) / 2, y: (anchors[0].y + anchors[1].y) / 2 };
  const pouch: Vec2 = puller ? { x: puller.x, y: puller.y } : { x: cs[2].x, y: cs[2].y };
  recognizer.view.sling = {
    team: recognizer.slingTeam,
    anchors: [{ x: anchors[0].x, y: anchors[0].y }, { x: anchors[1].x, y: anchors[1].y }],
    pouch,
    idle: !puller,
    shot: slingshotShot(a, pouch, state.params),
  };
}

/**
 * Envoie le tir lorsque le doigt qui tient la poche est relâché avec une traction suffisante.
 * Seul le relâchement de la poche déclenche le tir ; les pertes brèves des appuis sont tolérées et une traction trop courte garde le bonus armé.
 */
export function releaseSling(recognizer: GestureRecognizer, cancelled: boolean): void {
  const state = recognizer.state;
  const sling = recognizer.view.sling;
  for(const c of recognizer.slingContacts??[])c.consumed=true;
  cancelSling(recognizer);
  if (sling && state) {
    const result = cancelled ? 'cancelled' : sling.idle ? 'noPouch' : !sling.shot.valid ? 'shortPull' : 'fired';
    log(recognizer, 'release', { result, pull: sling.shot.pull, min: state.params.slingMinPullPx });
  }
  if (cancelled || !state || !sling || sling.idle || !sling.shot.valid) return;
  const anchor = { x: (sling.anchors[0].x + sling.anchors[1].x) / 2, y: (sling.anchors[0].y + sling.anchors[1].y) / 2 };
  // La couleur de prévisualisation suit les deux premiers doigts, mais seul le stock
  // réellement armé peut être consommé au moment du tir.
  const team = recognizer.armedTeam('slingshot', anchor);
  if (team){recognizer.bonusCommitted=!state.tutorial;recognizer.controls.gesture('slingshot', team, anchor, { ...sling.pouch });}
}

/** Ajoute une décision de reconnaissance au journal local de diagnostic. */
export function log(recognizer: GestureRecognizer, kind: string, detail: Record<string, number | string | boolean>): void {
  recordGesture(recognizer.view.debug.gestures, kind, detail);
  recognizer.lastLog = { kind, at: performance.now() };
}

/** Évite d’enregistrer en boucle la même décision de reconnaissance. */
function logOnce(recognizer: GestureRecognizer, kind: string, detail: Record<string, number | string | boolean>): void {
  if (recognizer.lastLog.kind === kind && performance.now() - recognizer.lastLog.at < 1000) return;
  log(recognizer, kind, detail);
}

/** Abandonne la traction et ses confirmations différées sans consommer de bonus. */
export function cancelSling(recognizer: GestureRecognizer): void {
  if(recognizer.slingReleaseTimer)clearTimeout(recognizer.slingReleaseTimer);recognizer.slingReleaseTimer=null;recognizer.slingContacts=null;
  recognizer.slingIds = null;
  recognizer.slingPuller = null;
  recognizer.slingTeam = null;
  if (!recognizer.simSling) recognizer.view.sling = null;
}
