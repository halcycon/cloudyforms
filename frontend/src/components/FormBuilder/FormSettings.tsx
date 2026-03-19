import { useState } from 'react';
import type { FormSettings as FormSettingsType, FormField } from '@/lib/types';
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
import { Plus, Trash2 } from 'lucide-react';

interface FormSettingsProps {
  settings: FormSettingsType;
  fields: FormField[];
  slug?: string;
  onChange: (settings: FormSettingsType) => void;
  onSlugChange?: (slug: string) => void;
}

export function FormSettings({ settings, fields, slug, onChange, onSlugChange }: FormSettingsProps) {
  const [newEmail, setNewEmail] = useState('');

  function update<K extends keyof FormSettingsType>(key: K, value: FormSettingsType[K]) {
    onChange({ ...settings, [key]: value });
  }

  function addNotificationEmail() {
    if (!newEmail.trim()) return;
    update('notificationEmails', [...settings.notificationEmails, newEmail.trim()]);
    setNewEmail('');
  }

  const emailFields = fields.filter((f) => f.type === 'email');

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
    </div>
  );
}
