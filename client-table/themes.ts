/** Local presentation preference. Themes never enter the authoritative game state. */
export const THEMES = [
  { id: 'neon', name: 'Néon', detail: 'Vide matriciel', colors: ['#131f35', '#9079ff', '#00e5ff'] },
  { id: 'scrap', name: 'Ferraille', detail: 'Acier · vapeur · énergie', colors: ['#424e54', '#91aaa9', '#70e6ed'] },
] as const;
export type ThemeId = typeof THEMES[number]['id'];
export const THEME_STORAGE_KEY = 'crashout.visual-theme';
export function themeId(value: unknown): ThemeId { return value === 'scrap' ? 'scrap' : 'neon'; }
export function loadTheme(storage: Pick<Storage, 'getItem'>): ThemeId {
  try { return themeId(storage.getItem(THEME_STORAGE_KEY)); } catch { return 'neon'; }
}
export function saveTheme(storage: Pick<Storage, 'setItem'>, id: ThemeId): void {
  try { storage.setItem(THEME_STORAGE_KEY, id); } catch { /* Still usable when storage is unavailable. */ }
}
