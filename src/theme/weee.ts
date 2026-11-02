import { useTheme } from '../hooks/useTheme';

const light = {
  paper: '#f4f1ea', ink: '#14181b', moss: '#008069', mint: '#cfebdd', coral: '#ff7a4d',
  sun: '#ffc94d', sky: '#6c95ff', lilac: '#c4b5ff', rose: '#ffb3c7',
  card: '#ffffff', deep: '#14181b', onDeep: '#f4f1ea',
};
const dark = {
  paper: '#0f1518', ink: '#e9edef', moss: '#00a884', mint: '#12332b', coral: '#e0643a',
  sun: '#d9a92e', sky: '#3f66d1', lilac: '#8d7bdb', rose: '#d9708f',
  card: '#18232a', deep: '#1c2a31', onDeep: '#e9edef',
};

export type Weee = typeof light;
export const BLOCK_INK = '#14181b';
export const GLASS = 'rgba(255,255,255,0.52)';

export function useWeee() {
  const { isDark } = useTheme();
  return { w: isDark ? dark : light, isDark };
}

// Text color that stays readable on a colored card.
export function onBlock(name: keyof Weee, isDark: boolean) {
  if (name === 'moss') return '#ffffff';
  if (name === 'deep') return isDark ? dark.onDeep : light.onDeep;
  if (name === 'sky' && isDark) return '#ffffff';
  if (name === 'mint' && isDark) return '#e9edef';
  return BLOCK_INK;
}

// Lighten (0 to 1) or darken (0 to minus 1) a six digit hex color. Used for the two gradient stops of every card.
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const target = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const mix = (v: number) => Math.round((target - v) * p + v);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, '0')).join('');
}

const MOODS_LIGHT = { calm: '#a8dcc8', happy: '#ffd45c', tired: '#b4c2dc', stressed: '#ff9d86', loving: '#ffb3cb', hug: '#d9b08c' };
const MOODS_DARK = { calm: '#7fc2aa', happy: '#e8b93a', tired: '#8d9fc0', stressed: '#e87f68', loving: '#e68aa8', hug: '#bf9468' };
export function moodFill(mood: keyof typeof MOODS_LIGHT, isDark: boolean) {
  return (isDark ? MOODS_DARK : MOODS_LIGHT)[mood];
}

// Flat colors for the spot illustrations.
export const ART = { skinA: '#e8b08f', skinB: '#b57c5b', hair: '#2a1d17', shoe: '#ffffff', ground: 'rgba(0,0,0,0.16)' };

// Both phones must agree on who is sky and who is coral, so the choice comes from the two ids.
export function personColors(meId: string, partnerId: string | undefined, w: Weee) {
  const meFirst = !partnerId || meId < partnerId;
  return { me: meFirst ? w.sky : w.coral, partner: meFirst ? w.coral : w.sky };
}
