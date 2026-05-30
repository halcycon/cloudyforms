import type { BrandingConfig } from './types';
import { DEFAULT_THEME, resolveMode } from './themes';

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
