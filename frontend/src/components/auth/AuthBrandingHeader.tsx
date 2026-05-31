import { CloudLightning } from 'lucide-react';

export interface SiteBranding {
  scope: 'platform' | 'organization';
  orgName?: string;
  orgLogoUrl?: string;
  orgPrimaryColor?: string;
}

interface AuthBrandingHeaderProps {
  branding: SiteBranding | null;
}

export function AuthBrandingHeader({ branding }: AuthBrandingHeaderProps) {
  if (!branding || branding.scope === 'platform') {
    return (
      <div className="flex items-center justify-center gap-2 mb-8">
        <CloudLightning className="h-8 w-8 text-primary-600" />
        <span className="text-2xl font-bold text-gray-900">CloudyForms</span>
      </div>
    );
  }

  return (
    <div className="mb-8 space-y-4">
      <div className="flex flex-col items-center gap-3 text-center">
        {branding.orgLogoUrl ? (
          <img
            src={branding.orgLogoUrl}
            alt={branding.orgName ?? 'Organization logo'}
            className="h-14 max-w-[220px] object-contain"
          />
        ) : (
          <div
            className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-bold text-white"
            style={{ backgroundColor: branding.orgPrimaryColor ?? '#6366f1' }}
          >
            {branding.orgName?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        {branding.orgName && (
          <span className="text-2xl font-bold text-gray-900">{branding.orgName}</span>
        )}
      </div>
      <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
        <span>Powered by</span>
        <CloudLightning className="h-4 w-4 text-primary-500" />
        <span className="font-medium text-gray-500">CloudyForms</span>
      </div>
    </div>
  );
}
