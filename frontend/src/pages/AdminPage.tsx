import { useEffect, useState } from 'react';
import { admin } from '@/lib/api';
import { useStore } from '@/lib/store';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Building2, FileText, MessageSquare, Globe, UserPlus, X, Palette } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ThemeSelector } from '@/components/ThemeSelector';
import { useTheme } from '@/components/ThemeProvider';
import type { ThemeConfig } from '@/lib/themes';
import { DEFAULT_THEME } from '@/lib/themes';
import toast from 'react-hot-toast';

interface AdminStats {
  users: number;
  orgs: number;
  forms: number;
  responses: number;
}

export default function AdminPage() {
  const { user } = useStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [signupsEnabled, setSignupsEnabled] = useState(true);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [systemDefaultTheme, setSystemDefaultTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const { setSystemTheme } = useTheme();

  useEffect(() => {
    if (!user?.isSuperAdmin) {
      navigate('/dashboard');
      return;
    }
    Promise.all([
      admin.stats(),
      admin.getSettings(),
    ])
      .then(([statsData, settings]) => {
        setStats(statsData);
        setSignupsEnabled(settings.signupsEnabled);
        setAllowedDomains(settings.allowedSignupDomains);
        if (settings.defaultTheme) {
          setSystemDefaultTheme(settings.defaultTheme);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, navigate]);

  async function saveSignupSettings(enabled: boolean, domains: string[]) {
    setSavingSettings(true);
    try {
      await admin.updateSettings({
        signupsEnabled: enabled,
        allowedSignupDomains: domains,
      });
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveDefaultTheme(theme: ThemeConfig) {
    setSavingSettings(true);
    try {
      await admin.updateSettings({ defaultTheme: theme });
      setSystemTheme(theme);
      toast.success('Default theme saved');
    } catch {
      toast.error('Failed to save theme');
    } finally {
      setSavingSettings(false);
    }
  }

  function handleToggleSignups(enabled: boolean) {
    setSignupsEnabled(enabled);
    saveSignupSettings(enabled, allowedDomains);
  }

  function handleAddDomain() {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    if (allowedDomains.includes(domain)) {
      toast.error('Domain already added');
      return;
    }
    const updated = [...allowedDomains, domain];
    setAllowedDomains(updated);
    setNewDomain('');
    saveSignupSettings(signupsEnabled, updated);
  }

  function handleRemoveDomain(domain: string) {
    const updated = allowedDomains.filter((d) => d !== domain);
    setAllowedDomains(updated);
    saveSignupSettings(signupsEnabled, updated);
  }

  const statCards = [
    { label: 'Total Users', value: stats?.users, icon: <Users className="h-5 w-5" />, color: 'text-blue-600 bg-blue-50' },
    { label: 'Organizations', value: stats?.orgs, icon: <Building2 className="h-5 w-5" />, color: 'text-green-600 bg-green-50' },
    { label: 'Forms', value: stats?.forms, icon: <FileText className="h-5 w-5" />, color: 'text-purple-600 bg-purple-50' },
    { label: 'Responses', value: stats?.responses, icon: <MessageSquare className="h-5 w-5" />, color: 'text-orange-600 bg-orange-50' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Super Admin</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {loading ? <span className="block h-7 w-12 bg-gray-200 animate-pulse rounded" /> : (stat.value ?? 0)}
                  </p>
                </div>
                <div className={`rounded-full p-2 ${stat.color}`}>{stat.icon}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Signup Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-gray-600" />
            <CardTitle className="text-base">Registration Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Allow New Signups</Label>
              <p className="text-xs text-gray-500 mt-0.5">
                When disabled, no new users can register. Existing users can still sign in.
              </p>
            </div>
            <Switch
              checked={signupsEnabled}
              onCheckedChange={handleToggleSignups}
              disabled={savingSettings}
            />
          </div>

          <div className="border-t pt-4">
            <Label className="text-sm font-medium">Allowed Email Domains</Label>
            <p className="text-xs text-gray-500 mt-0.5 mb-3">
              Leave empty to allow all domains. When set, only emails from these domains can register.
            </p>
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDomain(); } }}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddDomain}
                disabled={!newDomain.trim() || savingSettings}
              >
                Add
              </Button>
            </div>
            {allowedDomains.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {allowedDomains.map((domain) => (
                  <Badge key={domain} variant="secondary" className="gap-1 pr-1">
                    {domain}
                    <button
                      onClick={() => handleRemoveDomain(domain)}
                      className="ml-1 rounded-full p-0.5 hover:bg-gray-300/50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* System Default Theme */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-gray-600" />
            <CardTitle className="text-base">System Default Theme</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-gray-500">
            Set the default appearance for all users. Users and organizations can override this with their own theme preference.
          </p>
          <ThemeSelector
            value={systemDefaultTheme}
            onChange={(t) => setSystemDefaultTheme(t)}
          />
          <Button
            size="sm"
            onClick={() => saveDefaultTheme(systemDefaultTheme)}
            disabled={savingSettings}
          >
            Save Default Theme
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            You have super admin access. Additional management tools will be available here.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/domains')}>
              <Globe className="h-4 w-4" />
              Manage Custom Domains
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
