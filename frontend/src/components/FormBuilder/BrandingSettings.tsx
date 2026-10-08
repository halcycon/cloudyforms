import type { BrandingConfig, Organization } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ThemeSelector } from '@/components/ThemeSelector';
import {
  getFormPrimaryColor,
  getFormSecondaryColor,
  getFormSurfaceStyle,
  withOrgBranding,
} from '@/lib/formBranding';

interface BrandingSettingsProps {
  branding: BrandingConfig;
  /** Organisation the form belongs to; unset branding inherits from it. */
  org?: Pick<Organization, 'primaryColor' | 'secondaryColor' | 'theme'> | null;
  onChange: (branding: BrandingConfig) => void;
}

const FONT_OPTIONS = [
  { label: 'Inter (Default)', value: 'Inter, system-ui, sans-serif' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'Open Sans', value: '"Open Sans", sans-serif' },
  { label: 'Lato', value: 'Lato, sans-serif' },
  { label: 'Poppins', value: 'Poppins, sans-serif' },
  { label: 'Georgia (Serif)', value: 'Georgia, serif' },
  { label: 'Monospace', value: '"Courier New", monospace' },
];

interface ColorFieldProps {
  label: string;
  /** Explicit override saved on the form, if any */
  value?: string | null;
  /** Colour used when there is no override */
  inherited: string;
  inheritedFrom: string;
  onChange: (value: string | null) => void;
}

function ColorField({ label, value, inherited, inheritedFrom, onChange }: ColorFieldProps) {
  const shown = value ?? inherited;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Use {inheritedFrom}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">From {inheritedFrom}</span>
        )}
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={shown}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded border border-gray-300 cursor-pointer"
        />
        <Input
          value={shown}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={inherited}
          className="flex-1 font-mono text-sm"
        />
      </div>
    </div>
  );
}

export function BrandingSettings({ branding, org, onChange }: BrandingSettingsProps) {
  function update<K extends keyof BrandingConfig>(key: K, value: BrandingConfig[K]) {
    onChange({ ...branding, [key]: value });
  }

  const effective = withOrgBranding(branding, org);
  const surface = getFormSurfaceStyle(effective);
  const primaryColor = getFormPrimaryColor(effective);
  const secondaryColor = getFormSecondaryColor(effective);
  const themeDefaults = getFormSurfaceStyle({ ...effective, backgroundColor: null, textColor: null });

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {/* Logo */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Logo</h3>
        <div className="space-y-1.5">
          <Label>Logo URL</Label>
          <Input
            value={branding.logoUrl ?? ''}
            onChange={(e) => update('logoUrl', e.target.value || undefined)}
            placeholder="https://example.com/logo.png"
          />
        </div>
        {branding.logoUrl && (
          <div className="rounded-lg border border-gray-200 p-4 flex items-center justify-center bg-gray-50">
            <img
              src={branding.logoUrl}
              alt="Logo preview"
              className="max-h-16 max-w-full object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
      </div>

      <Separator />

      {/* Colors */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Colors</h3>

        <ColorField
          label="Primary Color"
          value={branding.primaryColor}
          inherited={org?.primaryColor || getFormPrimaryColor({})}
          inheritedFrom={org?.primaryColor ? 'organisation' : 'default'}
          onChange={(v) => update('primaryColor', v)}
        />
        <ColorField
          label="Secondary Color"
          value={branding.secondaryColor}
          inherited={org?.secondaryColor || primaryColor}
          inheritedFrom={org?.secondaryColor ? 'organisation' : 'primary'}
          onChange={(v) => update('secondaryColor', v)}
        />
        <p className="text-xs text-muted-foreground -mt-1">
          Accent for the band across the top of the form and the highlight around the active field.
        </p>
        <ColorField
          label="Background Color"
          value={branding.backgroundColor}
          inherited={themeDefaults.pageBackground}
          inheritedFrom="theme"
          onChange={(v) => update('backgroundColor', v)}
        />
        <ColorField
          label="Text Color"
          value={branding.textColor}
          inherited={themeDefaults.textColor}
          inheritedFrom="theme"
          onChange={(v) => update('textColor', v)}
        />
      </div>

      <Separator />

      {/* Typography */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Typography</h3>
        <div className="space-y-1.5">
          <Label>Font Family</Label>
          <Select
            value={branding.fontFamily ?? 'Inter, system-ui, sans-serif'}
            onValueChange={(v) => update('fontFamily', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Theme */}
      <Separator />
      <ThemeSelector
        label="Form Theme"
        value={branding.theme ?? org?.theme}
        onChange={(theme) => update('theme', theme)}
        showReset={!!branding.theme}
        onReset={() => update('theme', null)}
      />
      {!branding.theme && org?.theme && (
        <p className="text-xs text-muted-foreground -mt-3">Using the organisation theme.</p>
      )}

      {/* Preview */}
      <Separator />
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Preview</h3>
        <div
          className="rounded-lg p-4 space-y-3 border"
          style={{
            backgroundColor: surface.cardBackground,
            color: surface.textColor,
            borderColor: surface.borderColor,
            borderTop: `4px solid ${secondaryColor}`,
            fontFamily: branding.fontFamily,
          }}
        >
          <p className="font-bold text-lg">Form Preview</p>
          <p className="text-sm" style={{ color: surface.mutedTextColor }}>
            Your form will appear with these styles
          </p>
          <div
            className="h-9 rounded-md border px-3 text-sm flex items-center"
            style={{
              backgroundColor: surface.inputBackground,
              borderColor: 'transparent',
              boxShadow: `0 0 0 2px ${secondaryColor}`,
              color: surface.mutedTextColor,
            }}
          >
            Focused field
          </div>
          <button
            className="px-4 py-2 rounded-md text-sm font-medium"
            style={{
              backgroundColor: primaryColor,
              color: surface.isDark ? '#0f1115' : '#ffffff',
            }}
          >
            Submit Button
          </button>
        </div>
      </div>
    </div>
  );
}
