/**
 * Dessin du circuit au toucher : pose des points P1 et P2 et équipe d'un début de tracé.
 * Liens : server/track/mapCreation.ts, server/layout.ts.
 * Fonctions appelées par les méthodes de GestureRecognizer (server/GestureRecognizer.ts), qui garde l'état et délègue ici.
 */
import type { GameState, Team, Vec2 } from '../../../server/types.js';
import { playAreaFor } from '../../../server/tableStations.js';
import { checkDivider, inPlayArea } from '../../../server/layout.js';
import { showDividerRefusal, showMapError, showMapNotice } from '../../view.js';
import { activeMapTeam, inMapAnchor } from '../../../server/track/mapCreation.js';
import type { GestureRecognizer } from '../GestureRecognizer.js';

/** Enregistre les points P1 et P2 puis demande leur validation au serveur. */
export function placeDividerPoint(recognizer: GestureRecognizer, p: Vec2): void {
  const view = recognizer.view;
  if (view.dividerSubmitting || !recognizer.state) return;
  const area = playAreaFor(recognizer.state);
  if (!inPlayArea(p, area)) { showDividerRefusal(view, 'outOfZone'); return; }
  const first = view.pendingDivider[0];
  if (!first) {
    view.pendingDivider = [{ ...p }];
    view.mapNotice = null;
    return;
  }
  const verdict = checkDivider(first, p, area);
  if (verdict !== 'ok') { showDividerRefusal(view, verdict); return; }
  view.dividerSubmitting = true;
  view.mapNotice = null;
  recognizer.send({ type: 'MapDivider', a: first, b: { ...p } });
}

/** Retrouve l’équipe autorisée à commencer le tracé sur le point touché. */
export function mapStrokeStartTeam(recognizer: GestureRecognizer, state: GameState, p: Vec2): Team | null {
  if (!state.mapTargets) return null;
  const team = activeMapTeam(state);
  if (!team) return null;
  // A second finger must not erase the current stroke or submit a second copy.
  if ([...recognizer.view.strokes.values()].some(/* Refuse un second dessin de la même équipe tant que son premier tracé reste actif ou en confirmation. */ s => s.team === team && (!s.done || s.submitting))) {
    showMapNotice(recognizer.view, 'Terminez le tracé en cours.', '#ffd400');
    return null;
  }
  const [start, end] = state.mapTargets[team];
  if (!inMapAnchor(p, start) && !inMapAnchor(p, end)) {
    showMapError(recognizer.view, 'mapWrongStart', team);
    return null;
  }
  recognizer.view.mapNotice = null;
  return team;
}
