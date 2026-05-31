import { useState } from 'react';
import type { FormSettings, OrgGroup } from '@/lib/types';
import {
  effectiveNotifyByEmail,
  hasEmailNotificationTargets,
  NOTIFY_ROLE_OPTIONS,
} from '@/lib/notification-settings';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2 } from 'lucide-react';

interface ResponseNotificationSettingsProps {
  settings: FormSettings;
  orgGroups: OrgGroup[];
  onChange: (settings: FormSettings) => void;
}

export function ResponseNotificationSettings({
  settings,
  orgGroups,
  onChange,
}: ResponseNotificationSettingsProps) {
  const [newEmail, setNewEmail] = useState('');

  function update<K extends keyof FormSettings>(key: K, value: FormSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  function patchEmailNotify(patch: NonNullable<FormSettings['emailNotify']>) {
    update('emailNotify', { ...settings.emailNotify, ...patch });
  }

  function toggleRole(role: (typeof NOTIFY_ROLE_OPTIONS)[number]['value']) {
    const roles = { ...settings.emailNotify?.roles, [role]: !settings.emailNotify?.roles?.[role] };
    patchEmailNotify({ roles });
  }

  function toggleGroup(groupId: string) {
    const current = settings.emailNotify?.groupIds ?? [];
    const next = current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : [...current, groupId];
    patchEmailNotify({ groupIds: next });
  }

  function patchNtfy(patch: Partial<NonNullable<FormSettings['ntfy']>>) {
    update('ntfy', { ...settings.ntfy, topic: settings.ntfy?.topic ?? '', ...patch });
  }

  function addNotificationEmail() {
    if (!newEmail.trim()) return;
    update('notificationEmails', [...settings.notificationEmails, newEmail.trim()]);
    setNewEmail('');
  }

  const emailEnabled = effectiveNotifyByEmail(settings);
  const emailExpanded = emailEnabled || hasEmailNotificationTargets(settings);

  return (
    <>
      <Separator className="my-2" />
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">New response alerts</p>

      {/* Email */}
      <div className="flex items-center justify-between">
        <div>
          <Label>Email</Label>
          <p className="mt-0.5 text-xs text-gray-400">Notify team members and/or custom addresses</p>
        </div>
        <Switch
          checked={emailEnabled}
          onCheckedChange={(v) => update('notifyByEmail', v)}
        />
      </div>

      {emailExpanded && (
        <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50/80 p-3">
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Organisation members</p>
            <div className="space-y-1.5">
              <label className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 border border-gray-100">
                <span className="text-sm text-gray-700">Form creator</span>
                <Switch
                  checked={settings.emailNotify?.formCreator ?? false}
                  onCheckedChange={(v) => patchEmailNotify({ formCreator: v })}
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 border border-gray-100">
                <span className="text-sm text-gray-700">All members</span>
                <Switch
                  checked={settings.emailNotify?.allMembers ?? false}
                  onCheckedChange={(v) => patchEmailNotify({ allMembers: v })}
                />
              </label>
            </div>
            {!settings.emailNotify?.allMembers && (
              <div className="grid grid-cols-2 gap-1.5">
                {NOTIFY_ROLE_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-center justify-between gap-2 rounded-md bg-white px-2.5 py-1.5 border border-gray-100"
                  >
                    <span className="text-xs text-gray-600">{label}</span>
                    <Switch
                      checked={settings.emailNotify?.roles?.[value] ?? false}
                      onCheckedChange={() => toggleRole(value)}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          {orgGroups.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Groups</p>
              <div className="space-y-1.5">
                {orgGroups.map((group) => (
                  <label
                    key={group.id}
                    className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 border border-gray-100"
                  >
                    <span className="text-sm text-gray-700 truncate">{group.name}</span>
                    <Switch
                      checked={settings.emailNotify?.groupIds?.includes(group.id) ?? false}
                      onCheckedChange={() => toggleGroup(group.id)}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Additional addresses</p>
            {settings.notificationEmails.map((email, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={email} readOnly className="flex-1 text-sm bg-white" />
                <button
                  type="button"
                  onClick={() =>
                    update(
                      'notificationEmails',
                      settings.notificationEmails.filter((_, j) => j !== i),
                    )
                  }
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNotificationEmail()}
                placeholder="admin@example.com"
                type="email"
                className="flex-1 bg-white"
              />
              <Button size="sm" variant="outline" onClick={addNotificationEmail}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {emailEnabled && !hasEmailNotificationTargets(settings) && (
            <p className="text-xs text-amber-600">Select at least one recipient above.</p>
          )}
        </div>
      )}

      {/* ntfy */}
      <div className="flex items-center justify-between">
        <div>
          <Label>ntfy</Label>
          <p className="mt-0.5 text-xs text-gray-400">Push notification via ntfy.sh or your own server</p>
        </div>
        <Switch
          checked={settings.notifyByNtfy ?? false}
          onCheckedChange={(v) => update('notifyByNtfy', v)}
        />
      </div>

      {(settings.notifyByNtfy ?? false) && (
        <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50/80 p-3">
          <div className="space-y-1.5">
            <Label>Server URL (optional)</Label>
            <Input
              value={settings.ntfy?.serverUrl ?? ''}
              onChange={(e) => patchNtfy({ serverUrl: e.target.value || undefined })}
              placeholder="https://ntfy.sh"
              className="bg-white"
            />
            <p className="text-xs text-gray-400">
              Leave blank for the public ntfy.sh service, or enter your self-hosted instance URL.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label required>Topic</Label>
            <Input
              value={settings.ntfy?.topic ?? ''}
              onChange={(e) => patchNtfy({ topic: e.target.value })}
              placeholder="my-secret-topic"
              className="bg-white"
            />
          </div>
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 border border-gray-100">
            <div>
              <Label className="text-sm">Authentication</Label>
              <p className="text-xs text-gray-400">Bearer token for protected topics</p>
            </div>
            <Switch
              checked={settings.ntfy?.authEnabled ?? false}
              onCheckedChange={(v) => patchNtfy({ authEnabled: v })}
            />
          </div>
          {(settings.ntfy?.authEnabled ?? false) && (
            <div className="space-y-1.5">
              <Label>Access token</Label>
              <Input
                type="password"
                value={settings.ntfy?.authToken ?? ''}
                onChange={(e) => patchNtfy({ authToken: e.target.value || undefined })}
                placeholder="tk_..."
                autoComplete="off"
                className="bg-white"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
