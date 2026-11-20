/** Catalogue des ambiances partagées par la table et les vues de course. */
export const THEMES = [
  { id: 'neon', name: 'Néon', detail: 'Vide matriciel', colors: ['#131f35', '#9079ff', '#00e5ff'] },
  { id: 'scrap', name: 'Ferraille', detail: 'Acier · vapeur · énergie', colors: ['#424e54', '#91aaa9', '#70e6ed'] },
  { id: 'toy', name: 'Circuit miniature', detail: 'Miniatures · atelier · plastique', colors: ['#17686d', '#ffb82e', '#f86445'] },
  { id: 'classic', name: 'Grand Prix', detail: 'Asphalte · vibreurs · paddock', colors: ['#355a48', '#e9544d', '#e9e9df'] },
  { id: 'mayhem', name: 'Castagne', detail: 'Festival · boue · castagne', colors: ['#3c3029', '#a45f3b', '#ffc16b'] },
] as const;
/** Nomme les cinq thèmes visuels proposés par le code. */
export type ThemeId = typeof THEMES[number]['id'];

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some(theme => theme.id === value);
}
