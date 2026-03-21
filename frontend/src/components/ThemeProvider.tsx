import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '@/lib/store';
import type { ThemeConfig } from '@/lib/themes';
import {
  DEFAULT_THEME,
  resolveMode,
  getTokens,
  applyTokens,
  mergeThemeConfigs,
} from '@/lib/themes';

interface ThemeContextValue {
  /** The fully-resolved effective theme config (after merging system → org → user). */
  effectiveTheme: ThemeConfig;
  /** The actual mode being rendered right now ('light' or 'dark'). */
  resolvedMode: 'light' | 'dark';
  /** System-wide default theme (loaded from admin settings). */
  systemTheme: ThemeConfig | null;
  setSystemTheme: (theme: ThemeConfig | null) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  effectiveTheme: DEFAULT_THEME,
  resolvedMode: 'light',
  systemTheme: null,
  setSystemTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Optionally pre-load the system default theme at startup. */
  systemDefault?: ThemeConfig | null;
}

export function ThemeProvider({ children, systemDefault }: ThemeProviderProps) {
  const { user, currentOrg } = useStore();
  const [systemTheme, setSystemTheme] = useState<ThemeConfig | null>(systemDefault ?? null);

  // Listen for OS colour-scheme changes so 'system' mode responds live.
  const [osPrefersDark, setOsPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setOsPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectiveTheme = useMemo(
    () => mergeThemeConfigs(systemTheme, currentOrg?.theme, user?.theme),
    [systemTheme, currentOrg?.theme, user?.theme],
  );

  const resolvedMode = useMemo(
    () => resolveMode(effectiveTheme.mode),
    [effectiveTheme.mode, osPrefersDark],
  );

  // Apply CSS variables + <html> class whenever the resolved theme changes.
  useEffect(() => {
    const tokens = getTokens(effectiveTheme.preset, resolvedMode);
    applyTokens(tokens);

    // Toggle the .dark class on <html> so Tailwind dark: variants can be used
    document.documentElement.classList.toggle('dark', resolvedMode === 'dark');
  }, [effectiveTheme.preset, resolvedMode]);

  const setSystemThemeStable = useCallback((t: ThemeConfig | null) => setSystemTheme(t), []);

  const value = useMemo<ThemeContextValue>(
    () => ({ effectiveTheme, resolvedMode, systemTheme, setSystemTheme: setSystemThemeStable }),
    [effectiveTheme, resolvedMode, systemTheme, setSystemThemeStable],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
