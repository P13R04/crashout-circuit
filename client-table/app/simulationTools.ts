/**
 * Outils de développement du tiroir PC : simulation à la souris du lance-pierre et du boost, et interrupteurs de test.
 * Liens : client-table/index.html, client-table/gesture/GestureRecognizer.ts.
 * Appelé par client-table/main.ts dans l'ordre d'origine de l'initialisation de la table.
 */
import type { TableApp } from './tableApp.js';

/** Branche les boutons de simulation et de test ; renvoie ce que le traitement des messages serveur doit piloter. */
export function setupSimulationTools(app: TableApp): { simBar: HTMLDivElement; testBar: HTMLDivElement; syncTestBar: () => void } {
  const { view, urlParams, conn, gestures, pcTools } = app;
  // PC testing: buttons that stand in for the 3- and 2-finger gestures (shown with a mouse or ?sim=1)
  const simBar = document.getElementById('sim') as HTMLDivElement;
  const sim3 = document.getElementById('sim3') as HTMLButtonElement;
  const sim2 = document.getElementById('sim2') as HTMLButtonElement;
  const simHint = document.getElementById('sim-hint') as HTMLSpanElement;
  const showSimulation = urlParams.get('sim') === '1' || window.matchMedia('(pointer: fine)').matches;
  let simKind: 'slingshot' | 'boost' | null = null;
  /** Choisit le geste simulé et synchronise ses boutons lorsque les outils de développement l’autorisent. */
  const setSim = (k: 'slingshot' | 'boost' | null): void => {
    if(k&&!view.state?.developerTools)return;
    simKind = simKind === k ? null : k;
    sim3.classList.toggle('armed', simKind === 'slingshot');
    sim2.classList.toggle('armed', simKind === 'boost');
    sim3.setAttribute('aria-pressed', String(simKind === 'slingshot'));
    sim2.setAttribute('aria-pressed', String(simKind === 'boost'));
    gestures.simulate(simKind);
  };
  /** Sélectionne le lance-pierre simulé pour l’essai à la souris. */
  sim3.addEventListener('click', () => setSim('slingshot'));
  /** Sélectionne l’accélération simulée pour l’essai à la souris. */
  sim2.addEventListener('click', () => setSim('boost'));
  /** Referme les paramètres lors d’un contact effectué hors du panneau. */
  document.addEventListener('pointerdown',event=>{if(pcTools.open&&event.target instanceof Node&&!pcTools.contains(event.target))pcTools.open=false;});
  /** Annule une simulation de geste lorsque son tiroir de paramètres est refermé. */
  pcTools.addEventListener('toggle', () => { if (!pcTools.open && simKind) setSim(null); });
  gestures.onSimChange = /* Actualise la consigne de simulation et relâche son bouton après usage ou refus du geste. */ (hint) => {
    simHint.textContent = hint;
    // The gesture was consumed (or failed): leave simulation mode
    if (!hint || hint.startsWith('Aucune') || hint.startsWith('Écart')) {
      simKind = null; sim3.classList.remove('armed'); sim2.classList.remove('armed');
      sim3.setAttribute('aria-pressed', 'false'); sim2.setAttribute('aria-pressed', 'false');
    }
  };

  // PC test switches: only shown (and honoured by the server) in the PC mode
  const testBar = document.getElementById('testbar') as HTMLDivElement;
  const testInvincible = document.getElementById('test-invincible') as HTMLButtonElement;
  const testItems = document.getElementById('test-items') as HTMLButtonElement;
  /** Demande l’invincibilité uniquement dans le lancement de développement. */
  testInvincible.addEventListener('click', () =>
    view.state?.developerTools&&conn.send({ type: 'TestToggle', flag: 'invincible', on: !view.state?.testMode.invincible }));
  /** Demande les stocks libres uniquement dans le lancement de développement. */
  testItems.addEventListener('click', () =>
    view.state?.developerTools&&conn.send({ type: 'TestToggle', flag: 'allItems', on: !view.state?.testMode.allItems }));
  /** Affiche les aides de test uniquement dans les modes qui les acceptent. */
  function syncTestBar(): void {
    const st = view.state;
    const racing = st?.phase === 'RACE' || st?.phase === 'PAUSED';
    // The tutorial needs the real item rules: no free items, no invincibility switch
    testBar.classList.toggle('on', !!st?.developerTools && st?.mapMode === 'pc' && racing && !st.tutorial);
    simBar.classList.toggle('on', !!st?.developerTools && showSimulation && racing);
    if (!racing && simKind) setSim(null);
    testInvincible.classList.toggle('active', !!st?.testMode.invincible);
    testItems.classList.toggle('active', !!st?.testMode.allItems);
    testInvincible.setAttribute('aria-pressed', String(!!st?.testMode.invincible));
    testItems.setAttribute('aria-pressed', String(!!st?.testMode.allItems));
  }
  return { simBar, testBar, syncTestBar };
}
