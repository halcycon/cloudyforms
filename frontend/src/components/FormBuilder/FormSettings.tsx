import { useEffect, useState } from 'react';
import type { FormSettings as FormSettingsType, FormField, WorkflowStage, OrgGroup } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, GripVertical, GitBranch } from 'lucide-react';
import { workflow as workflowApi, orgs as orgsApi } from '@/lib/api';

interface FormSettingsProps {
  settings: FormSettingsType;
  fields: FormField[];
  slug?: string;
  formId?: string;
  orgId?: string;
  onChange: (settings: FormSettingsType) => void;
  onSlugChange?: (slug: string) => void;
}

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'creator', label: 'Creator' },
  { value: 'viewer', label: 'Viewer' },
];

export function FormSettings({ settings, fields, slug, formId, orgId, onChange, onSlugChange }: FormSettingsProps) {
  const [newEmail, setNewEmail] = useState('');
  const [workflowStages, setWorkflowStages] = useState<WorkflowStage[]>([]);
  const [orgGroups, setOrgGroups] = useState<OrgGroup[]>([]);
  const [savingWorkflow, setSavingWorkflow] = useState(false);

  function update<K extends keyof FormSettingsType>(key: K, value: FormSettingsType[K]) {
    onChange({ ...settings, [key]: value });
  }

  function addNotificationEmail() {
    if (!newEmail.trim()) return;
    update('notificationEmails', [...settings.notificationEmails, newEmail.trim()]);
    setNewEmail('');
  }

  const emailFields = fields.filter((f) => f.type === 'email');

  /* ─── Load workflow stages & org groups ─── */
  useEffect(() => {
    if (formId && settings.workflowEnabled) {
      workflowApi.listStages(formId).then(setWorkflowStages).catch(() => {/* ignore */});
    }
    if (orgId) {
      orgsApi.listGroups(orgId).then(setOrgGroups).catch(() => {/* ignore */});
    }
  }, [formId, orgId, settings.workflowEnabled]);

  function addWorkflowStage() {
    setWorkflowStages((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        formId: formId ?? '',
        name: '',
        stageOrder: prev.length + 1,
        allowedRoles: [],
        allowedGroups: [],
        allowedUsers: [],
        notifyOnReady: false,
      },
    ]);
  }

  function updateStage(index: number, updates: Partial<WorkflowStage>) {
    setWorkflowStages((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s)),
    );
  }

  function removeStage(index: number) {
    setWorkflowStages((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stageOrder: i + 1 })));
  }

  async function saveWorkflowStages() {
    if (!formId) return;
    setSavingWorkflow(true);
    try {
      const saved = await workflowApi.setStages(
        formId,
        workflowStages.map((s) => ({
          name: s.name,
          stageOrder: s.stageOrder,
          allowedRoles: s.allowedRoles,
          allowedGroups: s.allowedGroups,
          allowedUsers: s.allowedUsers,
          notifyOnReady: s.notifyOnReady,
        })),
      );
      setWorkflowStages(saved);
    } catch {
      /* ignore – toast would be better but keeping minimal */
    } finally {
      setSavingWorkflow(false);
    }
  }

  function toggleStageRole(index: number, role: string) {
    const stage = workflowStages[index];
    const roles = stage.allowedRoles.includes(role)
      ? stage.allowedRoles.filter((r) => r !== role)
      : [...stage.allowedRoles, role];
    updateStage(index, { allowedRoles: roles });
  }

  function toggleStageGroup(index: number, groupId: string) {
    const stage = workflowStages[index];
    const groups = stage.allowedGroups.includes(groupId)
      ? stage.allowedGroups.filter((g) => g !== groupId)
      : [...stage.allowedGroups, groupId];
    updateStage(index, { allowedGroups: groups });
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {/* Slug */}
      {slug !== undefined && (
        <>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">URL Slug</h3>
            <div className="space-y-1.5">
              <Label>Slug</Label>
              <Input
                value={slug}
                onChange={(e) => onSlugChange?.(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-form-slug"
              />
              <p className="text-xs text-gray-400">
                Used in the public URL: /f/{slug || '...'}
              </p>
            </div>
          </div>

          <Separator />
        </>
      )}

      {/* Submission */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Submission</h3>

        <div className="space-y-1.5">
          <Label>Submit Button Text</Label>
          <Input
            value={settings.submitButtonText}
            onChange={(e) => update('submitButtonText', e.target.value)}
            placeholder="Submit"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Success Message</Label>
          <Textarea
            value={settings.successMessage}
            onChange={(e) => update('successMessage', e.target.value)}
            placeholder="Thank you for your submission!"
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Redirect URL (after submit)</Label>
          <Input
            value={settings.redirectUrl ?? ''}
            onChange={(e) => update('redirectUrl', e.target.value || undefined)}
            placeholder="https://example.com/thank-you"
          />
        </div>
      </div>

      <Separator />

      {/* Access */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Access Control</h3>

        <div className="flex items-center justify-between">
          <div>
            <Label>Allow Multiple Submissions</Label>
            <p className="text-xs text-gray-400 mt-0.5">Same user can submit multiple times</p>
          </div>
          <Switch
            checked={settings.allowMultipleSubmissions}
            onCheckedChange={(v) => update('allowMultipleSubmissions', v)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Require Authentication</Label>
            <p className="text-xs text-gray-400 mt-0.5">Users must log in to submit</p>
          </div>
          <Switch
            checked={settings.requireAuth}
            onCheckedChange={(v) => update('requireAuth', v)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Kiosk Only</Label>
            <p className="text-xs text-gray-400 mt-0.5">Only accessible via kiosk</p>
          </div>
          <Switch
            checked={settings.kioskOnly}
            onCheckedChange={(v) => update('kioskOnly', v)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Max Responses</Label>
          <Input
            type="number"
            value={settings.maxResponses ?? ''}
            onChange={(e) => update('maxResponses', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="Unlimited"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Expires At</Label>
          <Input
            type="datetime-local"
            value={settings.expiresAt ?? ''}
            onChange={(e) => update('expiresAt', e.target.value || undefined)}
          />
        </div>
      </div>

      <Separator />

      {/* Email */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Email Notifications</h3>

        <div className="flex items-center justify-between">
          <div>
            <Label>Send Receipt Email</Label>
            <p className="text-xs text-gray-400 mt-0.5">Send confirmation to submitter</p>
          </div>
          <Switch
            checked={settings.sendReceiptEmail}
            onCheckedChange={(v) => update('sendReceiptEmail', v)}
          />
        </div>

        {settings.sendReceiptEmail && emailFields.length > 0 && (
          <div className="space-y-1.5">
            <Label>Receipt Email Field</Label>
            <Select
              value={settings.receiptEmailField ?? ''}
              onValueChange={(v) => update('receiptEmailField', v || undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select email field" />
              </SelectTrigger>
              <SelectContent>
                {emailFields.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Notification Emails</Label>
          {settings.notificationEmails.map((email, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={email} readOnly className="flex-1 text-sm" />
              <button
                type="button"
                onClick={() => update('notificationEmails', settings.notificationEmails.filter((_, j) => j !== i))}
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
              className="flex-1"
            />
            <Button size="sm" variant="outline" onClick={addNotificationEmail}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      {/* Security */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Security</h3>

        <div className="flex items-center justify-between">
          <div>
            <Label>Enable Turnstile</Label>
            <p className="text-xs text-gray-400 mt-0.5">Cloudflare bot protection</p>
          </div>
          <Switch
            checked={settings.enableTurnstile}
            onCheckedChange={(v) => update('enableTurnstile', v)}
          />
        </div>
      </div>

      <Separator />

      {/* Integrations */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Integrations</h3>

        <div className="space-y-1.5">
          <Label>Webhook URL</Label>
          <Input
            value={settings.webhookUrl ?? ''}
            onChange={(e) => update('webhookUrl', e.target.value || undefined)}
            placeholder="https://hooks.example.com/..."
          />
        </div>

        {settings.webhookUrl && (
          <div className="space-y-1.5">
            <Label>Webhook Secret</Label>
            <Input
              value={settings.webhookSecret ?? ''}
              onChange={(e) => update('webhookSecret', e.target.value || undefined)}
              type="password"
              placeholder="Secret key for HMAC verification"
            />
          </div>
        )}
      </div>

      <Separator />

      {/* Workflow */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <GitBranch className="h-4 w-4" /> Workflow
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <Label>Enable Multi-Step Workflow</Label>
            <p className="text-xs text-gray-400 mt-0.5">Require sequential sign-off on submissions</p>
          </div>
          <Switch
            checked={settings.workflowEnabled ?? false}
            onCheckedChange={(v) => update('workflowEnabled', v)}
          />
        </div>

        {settings.workflowEnabled && (
          <div className="space-y-3 rounded-md border border-indigo-100 bg-indigo-50/50 p-3">
            <p className="text-xs text-indigo-700 font-medium">
              Define sequential stages. Each stage must be completed before the next becomes active.
            </p>

            {workflowStages.map((stage, i) => (
              <div key={stage.id} className="rounded bg-white border border-gray-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    Stage {i + 1}
                  </Badge>
                  <Input
                    value={stage.name}
                    onChange={(e) => updateStage(i, { name: e.target.value })}
                    placeholder="e.g. Secretary Review"
                    className="h-7 text-sm flex-1"
                  />
                  <button
                    onClick={() => removeStage(i)}
                    className="text-gray-400 hover:text-red-500 p-0.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Allowed roles */}
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Allowed Roles</Label>
                  <div className="flex flex-wrap gap-1">
                    {ROLE_OPTIONS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => toggleStageRole(i, r.value)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                          stage.allowedRoles.includes(r.value)
                            ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Allowed groups */}
                {orgGroups.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Allowed Groups</Label>
                    <div className="flex flex-wrap gap-1">
                      {orgGroups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleStageGroup(i, g.id)}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                            stage.allowedGroups.includes(g.id)
                              ? 'bg-green-100 border-green-300 text-green-700'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={addWorkflowStage}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Stage
              </Button>
              {workflowStages.length > 0 && (
                <Button size="sm" onClick={saveWorkflowStages} loading={savingWorkflow}>
                  Save Workflow
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
