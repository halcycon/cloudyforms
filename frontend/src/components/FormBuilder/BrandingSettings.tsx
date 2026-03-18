import type { BrandingConfig } from '@/lib/types';
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

interface BrandingSettingsProps {
  branding: BrandingConfig;
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

export function BrandingSettings({ branding, onChange }: BrandingSettingsProps) {
  function update<K extends keyof BrandingConfig>(key: K, value: BrandingConfig[K]) {
    onChange({ ...branding, [key]: value });
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {/* Logo */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Logo</h3>
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
        <h3 className="text-sm font-semibold text-gray-900">Colors</h3>

        <div className="space-y-1.5">
          <Label>Primary Color</Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={branding.primaryColor ?? '#4f46e5'}
              onChange={(e) => update('primaryColor', e.target.value)}
              className="h-9 w-12 rounded border border-gray-300 cursor-pointer"
            />
            <Input
              value={branding.primaryColor ?? '#4f46e5'}
              onChange={(e) => update('primaryColor', e.target.value)}
              placeholder="#4f46e5"
              className="flex-1 font-mono text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Background Color</Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={branding.backgroundColor ?? '#f9fafb'}
              onChange={(e) => update('backgroundColor', e.target.value)}
              className="h-9 w-12 rounded border border-gray-300 cursor-pointer"
            />
            <Input
              value={branding.backgroundColor ?? '#f9fafb'}
              onChange={(e) => update('backgroundColor', e.target.value)}
              placeholder="#f9fafb"
              className="flex-1 font-mono text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Text Color</Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={branding.textColor ?? '#0f172a'}
              onChange={(e) => update('textColor', e.target.value)}
              className="h-9 w-12 rounded border border-gray-300 cursor-pointer"
            />
            <Input
              value={branding.textColor ?? '#0f172a'}
              onChange={(e) => update('textColor', e.target.value)}
              placeholder="#0f172a"
              className="flex-1 font-mono text-sm"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Typography */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Typography</h3>
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

      {/* Preview */}
      <Separator />
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">Preview</h3>
        <div
          className="rounded-lg p-4 space-y-3"
          style={{
            backgroundColor: branding.backgroundColor ?? '#f9fafb',
            color: branding.textColor ?? '#0f172a',
            fontFamily: branding.fontFamily,
          }}
        >
          <p className="font-bold text-lg">Form Preview</p>
          <p className="text-sm opacity-70">Your form will appear with these styles</p>
          <button
            className="px-4 py-2 rounded-md text-white text-sm font-medium"
            style={{ backgroundColor: branding.primaryColor ?? '#4f46e5' }}
          >
            Submit Button
          </button>
        </div>
      </div>
    </div>
  );
}
