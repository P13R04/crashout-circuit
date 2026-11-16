/**
 * Préférences d’affichage locales : thèmes de la table, ambiance par défaut et réduction des animations.
 * Liens : client-table/themes/themes.ts, client-table/index.html.
 * Appelé par client-table/main.ts dans l'ordre d'origine de l'initialisation de la table.
 */
import { THEMES, themeLook, saveTheme, type ThemeId } from '../themes/themes.js';
import type { TableApp } from './tableApp.js';

/** Construit les aperçus de thème, applique l'ambiance Ferraille et suit la préférence de mouvement du navigateur. */
export function setupDisplayPreferences(app: TableApp): { selectTheme: (id: ThemeId, persist?: boolean) => void } {
  const { canvas, view, urlParams, conn } = app;
  // Le changement d’ambiance est partagé et laisse la course en cours.
  const themeOptions = document.getElementById('theme-options')!;
  // Construit les aperçus de thèmes conservés dans les paramètres de développement.
  for (const theme of THEMES) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'theme-option'; button.dataset.theme = theme.id;
    button.setAttribute('aria-label', theme.name);
    const swatch = document.createElement('span'); swatch.className = 'theme-swatch'; swatch.setAttribute('aria-hidden', 'true');
    for (const color of theme.colors) { const chip = document.createElement('i'); chip.style.background = color; swatch.append(chip); }
    const name = document.createElement('strong'); name.textContent = theme.name;
    const detail = document.createElement('small'); detail.textContent = theme.detail;
    button.append(swatch, name, detail); /* Applique le thème choisi dans les outils de développement. */ button.addEventListener('click', () => selectTheme(theme.id)); themeOptions.append(button);
  }
  /** Applique la palette aux couches Canvas et aux paramètres HTML sans redémarrer la partie. */
  function selectTheme(id: ThemeId, persist=true): void {
    view.theme = id;
    if (persist) conn.send({ type: 'SetTheme', theme: id });
    try { if(persist)saveTheme(window.localStorage, id); } catch { /* Display preference still applies. */ }
    document.body.dataset.theme = id; canvas.dataset.theme = id;
    const look=themeLook(id);
    for(const [key,value] of Object.entries(look))document.body.style.setProperty(`--look-${key}`,typeof value==='number'?`${value}px`:value);
    for (const button of themeOptions.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.theme === id));
  }
  // Access to localStorage itself can be denied in embedded/private contexts.
  selectTheme('scrap',false);
  view.debug.on = false;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  view.reducedMotion = motionPreference.matches || urlParams.get('motion') === '0';
  /** Suit la préférence du navigateur pour réduire les animations sans modifier la course. */
  motionPreference.addEventListener('change', e => { view.reducedMotion = e.matches || urlParams.get('motion') === '0'; });
  return { selectTheme };
}
