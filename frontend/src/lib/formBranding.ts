import type { CSSProperties } from 'react';
import type { BrandingConfig, Organization } from './types';
import { DEFAULT_THEME, applyTokens, getTokens, resolveMode } from './themes';

/** Resolved colours for a public / embedded form surface. */
export interface FormSurfaceStyle {
  isDark: boolean;
  pageBackground: string;
  cardBackground: string;
  textColor: string;
  borderColor: string;
  mutedTextColor: string;
  inputBackground: string;
  inputBorderColor: string;
}

/**
 * Derive page + card colours from branding.theme and custom hex overrides.
 * Dark appearance must darken the form card — not just the page — so inherited
 * label text remains readable.
 */
export function getFormSurfaceStyle(branding: BrandingConfig): FormSurfaceStyle {
  const isDark = branding.theme
    ? resolveMode(branding.theme.mode) === 'dark'
    : false;

  const pageBackground =
    branding.backgroundColor ?? (isDark ? '#0f1115' : '#f9fafb');

  const cardBackground = isDark
    ? branding.backgroundColor ?? '#151821'
    : '#ffffff';

  const textColor =
    branding.textColor ?? (isDark ? '#eef3ff' : '#0f172a');

  return {
    isDark,
    pageBackground,
    cardBackground,
    textColor,
    borderColor: isDark ? '#2c3756' : '#e5e7eb',
    mutedTextColor: isDark ? '#a9b4cf' : '#6b7280',
    inputBackground: isDark ? '#1b1f2a' : '#ffffff',
    inputBorderColor: isDark ? '#2c3756' : '#d1d5db',
  };
}

/** Primary button colour — branding override or preset default. */
export function getFormPrimaryColor(branding: BrandingConfig): string {
  return branding.primaryColor ?? '#4f46e5';
}

/** Accent colour (card top band, focus highlight) — falls back to primary. */
export function getFormSecondaryColor(branding: BrandingConfig): string {
  return branding.secondaryColor ?? getFormPrimaryColor(branding);
}

/** Inline style for a `.cf-form-surface` element: exposes the accent as --form-accent. */
export function formAccentStyle(branding: BrandingConfig): CSSProperties {
  const accent = hexToRgbChannels(getFormSecondaryColor(branding));
  return accent ? ({ '--form-accent': accent } as CSSProperties) : {};
}

/**
 * Fill branding the form hasn't set from its organisation (mirrors the
 * worker's withOrgBranding, for builder previews).
 */
export function withOrgBranding(
  branding: BrandingConfig,
  org?: Pick<Organization, 'primaryColor' | 'secondaryColor' | 'theme'> | null,
): BrandingConfig {
  return {
    ...branding,
    primaryColor: branding.primaryColor ?? org?.primaryColor ?? undefined,
    secondaryColor: branding.secondaryColor ?? org?.secondaryColor ?? undefined,
    theme: branding.theme ?? org?.theme,
  };
}

/**
 * Apply a public form's own theme to the document (tokens, dark class,
 * --primary), independent of the signed-in user's app theme.
 */
export function applyFormDocumentTheme(
  branding: BrandingConfig,
  options: { themeParam?: string | null; transparent?: boolean } = {},
): void {
  const appearance = resolveFormAppearance(branding, options.themeParam);
  const preset = branding.theme?.preset ?? DEFAULT_THEME.preset;
  const root = document.documentElement;

  applyTokens(getTokens(preset, appearance.isDark ? 'dark' : 'light'));
  root.classList.toggle('dark', appearance.isDark);

  const primary = hexToRgbChannels(getFormPrimaryColor(branding));
  if (primary) root.style.setProperty('--primary', primary);
  const foreground = hexToRgbChannels(appearance.textColor);
  if (foreground) root.style.setProperty('--foreground', foreground);

  document.body.style.backgroundColor = options.transparent ? 'transparent' : appearance.pageBackground;
}

/** "#a01f30" → "160 31 48" (the format the CSS colour variables use). */
function hexToRgbChannels(color: string): string | null {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
}

/** Effective light/dark for embed pages: query param overrides stored branding. */
export function resolveFormAppearance(
  branding: BrandingConfig,
  themeParam?: string | null,
): FormSurfaceStyle {
  if (themeParam === 'dark' || themeParam === 'light') {
    const mode = themeParam as 'dark' | 'light';
    return getFormSurfaceStyle({
      ...branding,
      theme: { ...(branding.theme ?? DEFAULT_THEME), mode },
    });
  }
  return getFormSurfaceStyle(branding);
}
