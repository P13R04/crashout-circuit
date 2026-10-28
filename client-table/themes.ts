/** Local presentation preference. Themes never enter the authoritative game state. */
export const THEMES = [
  { id: 'neon', name: 'Néon', detail: 'Vide matriciel', colors: ['#131f35', '#9079ff', '#00e5ff'] },
  { id: 'scrap', name: 'Ferraille', detail: 'Acier · vapeur · énergie', colors: ['#424e54', '#91aaa9', '#70e6ed'] },
  { id: 'toy', name: 'Toy Circuit', detail: 'Plastique · couleurs · ressorts', colors: ['#17686d', '#ffb82e', '#f86445'] },
  { id: 'classic', name: 'F1 Classic', detail: 'Asphalte · vibreurs · paddock', colors: ['#355a48', '#e9544d', '#e9e9df'] },
  { id: 'mayhem', name: 'Mayhem', detail: 'Boue · carcasses · étincelles', colors: ['#3c3029', '#a45f3b', '#ffc16b'] },
] as const;
export type ThemeId = typeof THEMES[number]['id'];
export type CircuitTheme = Exclude<ThemeId, 'neon' | 'scrap'>;
export const THEME_STORAGE_KEY = 'crashout.visual-theme';
export function themeId(value: unknown): ThemeId { return THEMES.find(t => t.id === value)?.id ?? 'neon'; }
export function loadTheme(storage: Pick<Storage, 'getItem'>): ThemeId {
  try { return themeId(storage.getItem(THEME_STORAGE_KEY)); } catch { return 'neon'; }
}
export function saveTheme(storage: Pick<Storage, 'setItem'>, id: ThemeId): void {
  try { storage.setItem(THEME_STORAGE_KEY, id); } catch { /* Still usable when storage is unavailable. */ }
}
/** Cyan/pink identify players in every world; these colours identify materials and feedback. */
const LOOKS = {
  neon:    { top: '#132039', panel: '#0b1528', bottom: '#080e1c', line: '#344760', button: '#081323', ink: '#dceef4', accent: '#ffce66', electric: '#ffce66', material: '#26364c', radius: 18 },
  scrap:   { top: '#35444b', panel: '#1b282f', bottom: '#101b21', line: '#758c91', button: '#10222c', ink: '#e1eeee', accent: '#eac77d', electric: '#79e3ef', material: '#45565b', radius: 14 },
  toy:     { top: '#285260', panel: '#163c4c', bottom: '#102c3c', line: '#8bced1', button: '#0c2c40', ink: '#fff8e4', accent: '#ffcf48', electric: '#b9a0ff', material: '#ed9641', radius: 25 },
  classic: { top: '#303c40', panel: '#202a2e', bottom: '#161f23', line: '#91a6a5', button: '#101d24', ink: '#f4f2e8', accent: '#f1ce59', electric: '#9abfff', material: '#d3d5cf', radius: 8 },
  mayhem:  { top: '#4b3f34', panel: '#2d2924', bottom: '#1d1f1c', line: '#8d765b', button: '#1c211f', ink: '#f4e5cb', accent: '#ffbc68', electric: '#a7ddeb', material: '#785740', radius: 5 },
} as const;
export function themeLook(id: ThemeId) { return LOOKS[id]; }
