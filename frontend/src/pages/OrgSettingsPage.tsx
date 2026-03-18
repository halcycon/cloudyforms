import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { ArrowLeft, Save, Globe } from 'lucide-react';
import { orgs as orgsApi } from '@/lib/api';
import type { Organization } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const schema = z.object({
  name: z.string().min(2),
  logoUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  customDomain: z.string().optional().or(z.literal('')),
});
type SettingsForm = z.infer<typeof schema>;

export default function OrgSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [org, setOrg] = useState<Organization | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SettingsForm>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!orgId) return;
    orgsApi.get(orgId)
      .then((data) => {
        setOrg(data);
        reset({
          name: data.name,
          logoUrl: data.logoUrl ?? '',
          primaryColor: data.primaryColor,
          secondaryColor: data.secondaryColor,
          customDomain: data.customDomain ?? '',
        });
      })
      .catch(() => navigate('/orgs'));
  }, [orgId, navigate, reset]);

  async function onSubmit(data: SettingsForm) {
    if (!orgId) return;
    setSaving(true);
    try {
      const updated = await orgsApi.update(orgId, {
        name: data.name,
        logoUrl: data.logoUrl || undefined,
        primaryColor: data.primaryColor,
        secondaryColor: data.secondaryColor,
        customDomain: data.customDomain || undefined,
      });
      setOrg(updated);
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!orgId) return;
    setDeleting(true);
    try {
      await orgsApi.delete(orgId);
      toast.success('Organization deleted');
      navigate('/orgs');
    } catch {
      toast.error('Failed to delete organization');
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  if (!org) {
    return <div className="p-6"><div className="h-8 w-64 bg-gray-200 animate-pulse rounded" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/orgs/${orgId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-gray-900">Organization Settings</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label required>Organization Name</Label>
              <Input {...register('name')} error={errors.name?.message} />
            </div>

            <div className="space-y-1.5">
              <Label>Logo URL</Label>
              <Input {...register('logoUrl')} placeholder="https://..." error={errors.logoUrl?.message} />
            </div>

            <div className="space-y-1.5">
              <Label>Custom Domain</Label>
              <Input {...register('customDomain')} placeholder="forms.yourdomain.com" />
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">Brand Colors</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Primary</Label>
                  <div className="flex gap-2">
                    <input type="color" {...register('primaryColor')} className="h-9 w-12 rounded border border-gray-300 cursor-pointer" />
                    <Input {...register('primaryColor')} className="flex-1 font-mono text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Secondary</Label>
                  <div className="flex gap-2">
                    <input type="color" {...register('secondaryColor')} className="h-9 w-12 rounded border border-gray-300 cursor-pointer" />
                    <Input {...register('secondaryColor')} className="flex-1 font-mono text-sm" />
                  </div>
                </div>
              </div>
            </div>

            <Button type="submit" loading={saving}>
              <Save className="h-4 w-4" /> Save Settings
            </Button>
          </CardContent>
        </Card>
      </form>

      {/* Custom Domains */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Domains</CardTitle>
          <CardDescription>
            Serve your forms from your own domain name
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-3">
            Add custom domains to white-label CloudyForms for your organisation.
            Forms and the management interface can be served from{' '}
            <code className="font-mono text-xs bg-gray-100 px-1 rounded">forms.yourdomain.com</code>.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate(`/orgs/${orgId}/domains`)}>
            <Globe className="h-4 w-4" />
            Manage Custom Domains
          </Button>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-base text-red-600">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Delete Organization</p>
              <p className="text-xs text-gray-500">Permanently delete this org and all its data</p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}>
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete organization?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{org.name}</strong> and all its forms and responses.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete Organization'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
