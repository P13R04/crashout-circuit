/**
 * Fournit les annonces textuelles de la carte du copilote.
 * Liens : AccessiblePlacement.ts, PlacementControls.ts.
 */
import type { GameState, PlacementFailure, RemotePlacementTarget } from '../../../server/types.js';
import type { PreparedPlacement } from '../../../server/rules/gameplay/remotePlacementGeometry.js';
import type { TiltAim } from './TiltAim.js';
import { trackPercent, wrapDegrees } from './placementInput.js';

export const REASONS: Record<PlacementFailure, string> = {
  disabled: 'Activez le mode accessibilité de votre place.',
  phase: 'La pose à distance est disponible pendant la course.',
  busy: 'Une pose est déjà en cours sur la table.',
  'wrong-mode': 'La table est en pose manuelle.',
  'not-armed': 'Ce bonus n’est plus armé. Sélectionnez le bonus disponible.',
  'outside-table': 'Le geste dépasse les bords de la table.',
  'blocked-zone': 'La pose empiète sur un poste ou sur la réserve.',
  'outside-track': 'Placez le centre du boost sur la chaussée.',
  'out-of-range': 'Le tir dépasse la portée disponible depuis ce point.',
  invalid: 'La direction ou les dimensions ne sont pas valides.',
};

export const TILT_HINTS: Record<TiltAim['status'], string> = {
  inactive: 'Pour tirer au relâchement, activez l’inclinaison.',
  permission: 'Autorisation du capteur en cours.',
  waiting: 'En attente du capteur. La visée avec les commandes est disponible.',
  ready: 'Capteur actif. Maintenez le doigt au point de départ, inclinez le téléphone, puis relâchez pour tirer.',
  denied: 'Inclinaison refusée. Vous pouvez viser avec les commandes.',
  unavailable: 'Aucune mesure reçue du capteur. Vous pouvez viser avec les commandes.',
};

/** Décrit la géométrie et donne un repère le long du circuit pour la visée sans carte. */
export function describePreview(state: GameState, target: RemotePlacementTarget, preview: PreparedPlacement, held: boolean): string {
  if ('reason' in preview) return `× ${REASONS[preview.reason]}`;
  if (held || !state.track) return '✓ Emplacement valide.';
  if (target.kind === 'slingshot' && preview.kind === 'slingshot') {
    const impact = trackPercent(state.track, preview.shot.target);
    return `✓ Tir valide. Direction ${Math.round(wrapDegrees(target.angle))}°, puissance ${Math.round(target.power * 100)} %, impact près de ${impact} % du tour.`;
  }
  const at = trackPercent(state.track, target.pos);
  const detail = target.kind === 'boost' ? ` Largeur ${Math.round(target.width)} px.`
    : preview.kind === 'tangible' && preview.id === 1 ? ` Angle ${Math.round(preview.pose.angle) % 180}°.` : '';
  return `✓ Emplacement valide près de ${at} % du tour.${detail}`;
}
