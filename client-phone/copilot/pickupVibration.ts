/**
 * Demande une vibration au navigateur pour le test sur téléphone et les ramassages.
 * Liens : CopilotScreen.ts, client-phone/main.ts.
 */

/** Tente une vibration et indique seulement si le navigateur a accepté la demande. */
export function requestVibration(duration: number): 'accepted' | 'refused' | 'unavailable' {
  if (typeof navigator.vibrate !== 'function') return 'unavailable';
  try {
    return navigator.vibrate(duration) ? 'accepted' : 'refused';
  } catch {
    return 'refused';
  }
}
