import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, type Colors } from './tokens';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'weeez:theme';

type Ctx = { c: Colors; isDark: boolean; pref: ThemePref; setPref: (p: ThemePref) => void; toggle: () => void };
const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setPrefState(v);
      })
      .catch(() => {});
  }, []);

  // The first render must match the server (light). After mount, use the real preference.
  const isDark = mounted && (pref === 'dark' || (pref === 'system' && scheme === 'dark'));

  const value = useMemo<Ctx>(() => {
    const setPref = (p: ThemePref) => {
      setPrefState(p);
      AsyncStorage.setItem(KEY, p).catch(() => {});
    };
    return { c: isDark ? colors.dark : colors.light, isDark, pref, setPref, toggle: () => setPref(isDark ? 'light' : 'dark') };
  }, [isDark, pref]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}
