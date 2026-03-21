/** Theme mode: light, dark, or follow the user's operating-system preference. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Identifier for a built-in colour preset. */
export type ThemePreset =
  | 'default'
  | 'ocean'
  | 'sunset'
  | 'forest'
  | 'rose'
  | 'slate';

/** Persisted theme preference (stored per-user, per-org, per-form, or globally). */
export interface ThemeConfig {
  mode: ThemeMode;
  preset: ThemePreset;
}

/** The set of CSS-variable RGB values that a single preset + mode resolves to. */
export interface ThemeTokens {
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  /** Sidebar background (dark chrome) */
  sidebarBg: string;
  sidebarBorder: string;
}

// ---------------------------------------------------------------------------
// Built-in presets – each has a light and a dark variant.
// Values are space-separated R G B triples (no commas) so Tailwind can apply
// opacity modifiers, e.g.  rgb(var(--primary) / 0.5).
// ---------------------------------------------------------------------------

type PresetPair = { light: ThemeTokens; dark: ThemeTokens };

const PRESETS: Record<ThemePreset, PresetPair> = {
  // ── Default (Indigo / Slate) ──────────────────────────────────────────────
  default: {
    light: {
      primary: '79 70 229',
      primaryForeground: '255 255 255',
      secondary: '100 116 139',
      secondaryForeground: '255 255 255',
      background: '255 255 255',
      foreground: '15 23 42',
      card: '255 255 255',
      cardForeground: '15 23 42',
      muted: '241 245 249',
      mutedForeground: '100 116 139',
      accent: '241 245 249',
      accentForeground: '15 23 42',
      destructive: '239 68 68',
      destructiveForeground: '255 255 255',
      border: '226 232 240',
      input: '226 232 240',
      ring: '79 70 229',
      sidebarBg: '17 24 39',
      sidebarBorder: '31 41 55',
    },
    dark: {
      primary: '129 140 248',
      primaryForeground: '15 23 42',
      secondary: '148 163 184',
      secondaryForeground: '15 23 42',
      background: '15 23 42',
      foreground: '226 232 240',
      card: '30 41 59',
      cardForeground: '226 232 240',
      muted: '30 41 59',
      mutedForeground: '148 163 184',
      accent: '30 41 59',
      accentForeground: '226 232 240',
      destructive: '239 68 68',
      destructiveForeground: '255 255 255',
      border: '51 65 85',
      input: '51 65 85',
      ring: '129 140 248',
      sidebarBg: '2 6 23',
      sidebarBorder: '30 41 59',
    },
  },

  // ── Ocean (Blue / Teal) ───────────────────────────────────────────────────
  ocean: {
    light: {
      primary: '14 165 233',
      primaryForeground: '255 255 255',
      secondary: '20 184 166',
      secondaryForeground: '255 255 255',
      background: '255 255 255',
      foreground: '15 23 42',
      card: '255 255 255',
      cardForeground: '15 23 42',
      muted: '240 249 255',
      mutedForeground: '71 85 105',
      accent: '240 249 255',
      accentForeground: '15 23 42',
      destructive: '239 68 68',
      destructiveForeground: '255 255 255',
      border: '186 230 253',
      input: '186 230 253',
      ring: '14 165 233',
      sidebarBg: '12 74 110',
      sidebarBorder: '7 89 133',
    },
    dark: {
      primary: '56 189 248',
      primaryForeground: '7 89 133',
      secondary: '45 212 191',
      secondaryForeground: '15 23 42',
      background: '15 23 42',
      foreground: '224 242 254',
      card: '30 41 59',
      cardForeground: '224 242 254',
      muted: '30 41 59',
      mutedForeground: '148 163 184',
      accent: '30 41 59',
      accentForeground: '224 242 254',
      destructive: '239 68 68',
      destructiveForeground: '255 255 255',
      border: '51 65 85',
      input: '51 65 85',
      ring: '56 189 248',
      sidebarBg: '2 6 23',
      sidebarBorder: '30 41 59',
    },
  },

  // ── Sunset (Amber / Orange) ───────────────────────────────────────────────
  sunset: {
    light: {
      primary: '234 88 12',
      primaryForeground: '255 255 255',
      secondary: '245 158 11',
      secondaryForeground: '255 255 255',
      background: '255 255 255',
      foreground: '28 25 23',
      card: '255 255 255',
      cardForeground: '28 25 23',
      muted: '255 247 237',
      mutedForeground: '87 83 78',
      accent: '255 247 237',
      accentForeground: '28 25 23',
      destructive: '239 68 68',
      destructiveForeground: '255 255 255',
      border: '253 230 138',
      input: '253 230 138',
      ring: '234 88 12',
      sidebarBg: '67 20 7',
      sidebarBorder: '124 45 18',
    },
    dark: {
      primary: '251 146 60',
      primaryForeground: '67 20 7',
      secondary: '252 211 77',
      secondaryForeground: '28 25 23',
      background: '28 25 23',
      foreground: '245 245 244',
      card: '41 37 36',
      cardForeground: '245 245 244',
      muted: '41 37 36',
      mutedForeground: '168 162 158',
      accent: '41 37 36',
      accentForeground: '245 245 244',
      destructive: '239 68 68',
      destructiveForeground: '255 255 255',
      border: '68 64 60',
      input: '68 64 60',
      ring: '251 146 60',
      sidebarBg: '12 10 9',
      sidebarBorder: '41 37 36',
    },
  },

  // ── Forest (Green / Emerald) ──────────────────────────────────────────────
  forest: {
    light: {
      primary: '22 163 74',
      primaryForeground: '255 255 255',
      secondary: '16 185 129',
      secondaryForeground: '255 255 255',
      background: '255 255 255',
      foreground: '20 20 20',
      card: '255 255 255',
      cardForeground: '20 20 20',
      muted: '240 253 244',
      mutedForeground: '75 85 99',
      accent: '240 253 244',
      accentForeground: '20 20 20',
      destructive: '239 68 68',
      destructiveForeground: '255 255 255',
      border: '187 247 208',
      input: '187 247 208',
      ring: '22 163 74',
      sidebarBg: '5 46 22',
      sidebarBorder: '22 101 52',
    },
    dark: {
      primary: '74 222 128',
      primaryForeground: '5 46 22',
      secondary: '52 211 153',
      secondaryForeground: '20 20 20',
      background: '20 20 20',
      foreground: '220 252 231',
      card: '38 38 38',
      cardForeground: '220 252 231',
      muted: '38 38 38',
      mutedForeground: '156 163 175',
      accent: '38 38 38',
      accentForeground: '220 252 231',
      destructive: '239 68 68',
      destructiveForeground: '255 255 255',
      border: '64 64 64',
      input: '64 64 64',
      ring: '74 222 128',
      sidebarBg: '10 10 10',
      sidebarBorder: '38 38 38',
    },
  },

  // ── Rose (Pink / Rose) ────────────────────────────────────────────────────
  rose: {
    light: {
      primary: '225 29 72',
      primaryForeground: '255 255 255',
      secondary: '244 63 94',
      secondaryForeground: '255 255 255',
      background: '255 255 255',
      foreground: '15 23 42',
      card: '255 255 255',
      cardForeground: '15 23 42',
      muted: '255 241 242',
      mutedForeground: '100 116 139',
      accent: '255 241 242',
      accentForeground: '15 23 42',
      destructive: '239 68 68',
      destructiveForeground: '255 255 255',
      border: '253 164 175',
      input: '253 164 175',
      ring: '225 29 72',
      sidebarBg: '76 5 25',
      sidebarBorder: '136 19 55',
    },
    dark: {
      primary: '251 113 133',
      primaryForeground: '76 5 25',
      secondary: '253 164 175',
      secondaryForeground: '15 23 42',
      background: '15 23 42',
      foreground: '255 228 230',
      card: '30 41 59',
      cardForeground: '255 228 230',
      muted: '30 41 59',
      mutedForeground: '148 163 184',
      accent: '30 41 59',
      accentForeground: '255 228 230',
      destructive: '239 68 68',
      destructiveForeground: '255 255 255',
      border: '51 65 85',
      input: '51 65 85',
      ring: '251 113 133',
      sidebarBg: '2 6 23',
      sidebarBorder: '30 41 59',
    },
  },

  // ── Slate (Neutral / Gray) ────────────────────────────────────────────────
  slate: {
    light: {
      primary: '71 85 105',
      primaryForeground: '255 255 255',
      secondary: '100 116 139',
      secondaryForeground: '255 255 255',
      background: '255 255 255',
      foreground: '15 23 42',
      card: '255 255 255',
      cardForeground: '15 23 42',
      muted: '241 245 249',
      mutedForeground: '100 116 139',
      accent: '241 245 249',
      accentForeground: '15 23 42',
      destructive: '239 68 68',
      destructiveForeground: '255 255 255',
      border: '226 232 240',
      input: '226 232 240',
      ring: '71 85 105',
      sidebarBg: '15 23 42',
      sidebarBorder: '30 41 59',
    },
    dark: {
      primary: '148 163 184',
      primaryForeground: '15 23 42',
      secondary: '100 116 139',
      secondaryForeground: '226 232 240',
      background: '15 23 42',
      foreground: '226 232 240',
      card: '30 41 59',
      cardForeground: '226 232 240',
      muted: '30 41 59',
      mutedForeground: '148 163 184',
      accent: '30 41 59',
      accentForeground: '226 232 240',
      destructive: '239 68 68',
      destructiveForeground: '255 255 255',
      border: '51 65 85',
      input: '51 65 85',
      ring: '148 163 184',
      sidebarBg: '2 6 23',
      sidebarBorder: '30 41 59',
    },
  },
};

/** Human-readable labels for each preset (used in UI selectors). */
export const PRESET_LABELS: Record<ThemePreset, string> = {
  default: 'Default (Indigo)',
  ocean: 'Ocean (Blue)',
  sunset: 'Sunset (Orange)',
  forest: 'Forest (Green)',
  rose: 'Rose (Pink)',
  slate: 'Slate (Neutral)',
};

export const ALL_PRESETS: ThemePreset[] = [
  'default',
  'ocean',
  'sunset',
  'forest',
  'rose',
  'slate',
];

export const ALL_MODES: ThemeMode[] = ['light', 'dark', 'system'];

export const MODE_LABELS: Record<ThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export const DEFAULT_THEME: ThemeConfig = { mode: 'system', preset: 'default' };

// ---------------------------------------------------------------------------
// Resolve helpers
// ---------------------------------------------------------------------------

/** Determine the effective light/dark mode, resolving 'system' via matchMedia. */
export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

/** Get the CSS-variable token set for a given preset + resolved mode. */
export function getTokens(preset: ThemePreset, mode: 'light' | 'dark'): ThemeTokens {
  return PRESETS[preset]?.[mode] ?? PRESETS.default[mode];
}

/** Apply a ThemeTokens set to a given HTML element (or document root). */
export function applyTokens(tokens: ThemeTokens, el: HTMLElement = document.documentElement): void {
  el.style.setProperty('--primary', tokens.primary);
  el.style.setProperty('--primary-foreground', tokens.primaryForeground);
  el.style.setProperty('--secondary', tokens.secondary);
  el.style.setProperty('--secondary-foreground', tokens.secondaryForeground);
  el.style.setProperty('--background', tokens.background);
  el.style.setProperty('--foreground', tokens.foreground);
  el.style.setProperty('--card', tokens.card);
  el.style.setProperty('--card-foreground', tokens.cardForeground);
  el.style.setProperty('--muted', tokens.muted);
  el.style.setProperty('--muted-foreground', tokens.mutedForeground);
  el.style.setProperty('--accent', tokens.accent);
  el.style.setProperty('--accent-foreground', tokens.accentForeground);
  el.style.setProperty('--destructive', tokens.destructive);
  el.style.setProperty('--destructive-foreground', tokens.destructiveForeground);
  el.style.setProperty('--border', tokens.border);
  el.style.setProperty('--input', tokens.input);
  el.style.setProperty('--ring', tokens.ring);
  el.style.setProperty('--sidebar-bg', tokens.sidebarBg);
  el.style.setProperty('--sidebar-border', tokens.sidebarBorder);
}

/**
 * Merge theme configs with priority: form > user > org > system.
 * Missing values at any level fall through to the next.
 */
export function mergeThemeConfigs(
  ...configs: (ThemeConfig | null | undefined)[]
): ThemeConfig {
  const result = { ...DEFAULT_THEME };
  for (const cfg of configs) {
    if (!cfg) continue;
    if (cfg.mode !== undefined) result.mode = cfg.mode;
    if (cfg.preset !== undefined) result.preset = cfg.preset;
  }
  return result;
}

/** Shorthand: resolve a ThemeConfig down to a token set. */
export function resolveTheme(config: ThemeConfig): ThemeTokens {
  return getTokens(config.preset, resolveMode(config.mode));
}

/** Get the primary hex colour for a given preset (light mode). Used for previews. */
export function getPresetPrimaryHex(preset: ThemePreset): string {
  const rgb = (PRESETS[preset]?.light ?? PRESETS.default.light).primary;
  const [r, g, b] = rgb.split(' ').map(Number);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
