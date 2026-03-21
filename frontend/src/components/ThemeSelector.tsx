import type { ThemeConfig, ThemePreset, ThemeMode } from '@/lib/themes';
import {
  ALL_PRESETS,
  ALL_MODES,
  PRESET_LABELS,
  MODE_LABELS,
  DEFAULT_THEME,
  getPresetPrimaryHex,
} from '@/lib/themes';
import { Label } from '@/components/ui/label';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThemeSelectorProps {
  value: ThemeConfig | null | undefined;
  onChange: (theme: ThemeConfig) => void;
  /** Label shown above the selector. */
  label?: string;
  /** Show a "reset / use inherited" option. */
  showReset?: boolean;
  onReset?: () => void;
}

const MODE_ICONS: Record<ThemeMode, React.ReactNode> = {
  light: <Sun className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
  system: <Monitor className="h-4 w-4" />,
};

export function ThemeSelector({ value, onChange, label, showReset, onReset }: ThemeSelectorProps) {
  const current = value ?? DEFAULT_THEME;

  function setMode(mode: ThemeMode) {
    onChange({ ...current, mode });
  }

  function setPreset(preset: ThemePreset) {
    onChange({ ...current, preset });
  }

  return (
    <div className="space-y-4">
      {label && <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</h3>}

      {/* Mode selector */}
      <div className="space-y-1.5">
        <Label>Appearance</Label>
        <div className="flex gap-2">
          {ALL_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setMode(mode)}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                current.mode === mode
                  ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
              )}
            >
              {MODE_ICONS[mode]}
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {/* Preset selector */}
      <div className="space-y-1.5">
        <Label>Color Preset</Label>
        <div className="grid grid-cols-3 gap-2">
          {ALL_PRESETS.map((preset) => {
            const hex = getPresetPrimaryHex(preset);
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setPreset(preset)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                  current.preset === preset
                    ? 'border-primary-500 ring-1 ring-primary-500 dark:ring-primary-400'
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600',
                )}
              >
                <span
                  className="h-4 w-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: hex }}
                />
                <span className="truncate text-gray-900 dark:text-gray-100">
                  {PRESET_LABELS[preset]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {showReset && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
        >
          Reset to inherited theme
        </button>
      )}
    </div>
  );
}
