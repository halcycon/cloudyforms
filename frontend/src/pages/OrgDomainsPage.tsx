/**
 * OrgDomainsPage – per-organisation custom domain management.
 *
 * Accessible at /orgs/:orgId/domains (linked from OrgSettingsPage).
 * Requires admin or owner role in the org.
 *
 * Allows org admins to:
 *  - View their custom domains and verification status
 *  - Add a new domain (generates a DNS TXT verification token)
 *  - Trigger DNS verification check
 *  - Set a domain as primary
 *  - Remove a domain
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Star,
  Copy,
  Check,
} from 'lucide-react';
import { domains as domainsApi } from '@/lib/api';
import type { CustomDomain } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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

const addDomainSchema = z.object({
  domain: z
    .string()
    .min(3, 'Domain is required')
    .regex(
      /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/i,
      'Enter a valid domain (e.g. forms.example.com)'
    ),
});
type AddDomainForm = z.infer<typeof addDomainSchema>;

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function OrgDomainsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDnsDialog, setShowDnsDialog] = useState<CustomDomain | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomDomain | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<AddDomainForm>({ resolver: zodResolver(addDomainSchema) });

  useEffect(() => {
    if (!orgId) return;
    loadDomains();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDomains() {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await domainsApi.list(orgId);
      setDomains(data);
    } catch {
      toast.error('Failed to load domains');
    } finally {
      setLoading(false);
    }
  }

  async function onAddDomain(data: AddDomainForm) {
    if (!orgId) return;
    try {
      const newDomain = await domainsApi.add(orgId, data.domain);
      setDomains((prev) => [newDomain, ...prev]);
      reset();
      setShowAddDialog(false);
      setShowDnsDialog(newDomain);
      toast.success('Domain added – verify it with a DNS record');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to add domain';
      toast.error(msg);
    }
  }

  async function handleVerify(domain: CustomDomain) {
    if (!orgId) return;
    setActionLoading(domain.id);
    try {
      const result = await domainsApi.verify(orgId, domain.id);
      if (result.verified) {
        toast.success('Domain verified!');
        await loadDomains();
      } else {
        toast.error(result.message ?? 'DNS record not found yet');
      }
    } catch {
      toast.error('Verification check failed');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSetPrimary(domain: CustomDomain) {
    if (!orgId) return;
    setActionLoading(domain.id);
    try {
      await domainsApi.setPrimary(orgId, domain.id);
      toast.success(`${domain.domain} set as primary domain`);
      await loadDomains();
    } catch {
      toast.error('Failed to set primary domain');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    if (!orgId || !deleteTarget) return;
    setActionLoading(deleteTarget.id);
    try {
      await domainsApi.remove(orgId, deleteTarget.id);
      toast.success('Domain removed');
      setDomains((prev) => prev.filter((d) => d.id !== deleteTarget.id));
    } catch {
      toast.error('Failed to remove domain');
    } finally {
      setActionLoading(null);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/orgs/${orgId}/settings`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Globe className="h-5 w-5 text-primary-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Custom Domains</h1>
          <p className="text-sm text-gray-500">Serve CloudyForms from your own domain</p>
        </div>
        <Button size="sm" className="ml-auto" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4" />
          Add Domain
        </Button>
      </div>

      {/* How it works */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4 pb-3 space-y-2">
          <p className="text-sm font-medium text-blue-900">How custom domains work</p>
          <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
            <li>Add your domain below (e.g. <code className="font-mono bg-blue-100 px-0.5 rounded">forms.example.com</code>)</li>
            <li>Add the DNS TXT record shown to your domain's DNS settings to verify ownership</li>
            <li>Add a CNAME record pointing your domain to the CloudyForms instance</li>
            <li>
              Set up a Cloudflare Custom Hostname or Page Rule – see{' '}
              <a href="/docs/cloudflare-integration.md" className="underline" target="_blank">
                the integration guide
              </a>
            </li>
            <li>Once verified, mark it as Primary to use it in all form share links</li>
          </ol>
        </CardContent>
      </Card>

      {/* Domain list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registered Domains</CardTitle>
          <CardDescription>
            {domains.length === 0
              ? 'No domains yet'
              : `${domains.filter((d) => d.verified).length} of ${domains.length} verified`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
              ))}
            </div>
          ) : domains.length === 0 ? (
            <div className="py-10 text-center">
              <Globe className="mx-auto h-8 w-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No custom domains yet.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4" />
                Add your first domain
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {domains.map((domain) => (
                <div key={domain.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-gray-900 truncate">
                        {domain.domain}
                      </span>
                      {domain.isPrimary && (
                        <Badge variant="secondary" className="text-[10px]">Primary</Badge>
                      )}
                    </div>
                    {!domain.verified && domain.dnsInstructions && (
                      <p className="text-xs text-amber-600 mt-0.5">
                        Awaiting DNS verification
                      </p>
                    )}
                  </div>

                  {domain.verified ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                  )}

                  <div className="flex gap-1.5 flex-shrink-0">
                    {!domain.verified && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDnsDialog(domain)}
                        >
                          DNS Setup
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleVerify(domain)}
                          loading={actionLoading === domain.id}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Check
                        </Button>
                      </>
                    )}
                    {domain.verified && !domain.isPrimary && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetPrimary(domain)}
                        loading={actionLoading === domain.id}
                        title="Set as primary"
                      >
                        <Star className="h-3.5 w-3.5" />
                        Set Primary
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(domain)}
                      disabled={!!actionLoading}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add domain dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Domain</DialogTitle>
            <DialogDescription>
              Enter the domain you want to use (e.g. <code className="font-mono">forms.example.com</code>).
              You'll need to verify it with a DNS record.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onAddDomain)} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label required>Domain Name</Label>
              <Input
                {...register('domain')}
                placeholder="forms.example.com"
                error={errors.domain?.message}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>Add Domain</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* DNS instructions dialog */}
      {showDnsDialog && (
        <Dialog open={!!showDnsDialog} onOpenChange={() => setShowDnsDialog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>DNS Verification – {showDnsDialog.domain}</DialogTitle>
              <DialogDescription>
                Add the following records to your domain's DNS settings, then click "Check DNS" to verify.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3 space-y-4 text-sm">
              {/* Step 1: TXT verification record */}
              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <p className="font-medium text-gray-800">Step 1 – Verify ownership</p>
                <p className="text-xs text-gray-500">Add this DNS TXT record:</p>
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-gray-400 text-left">
                      <th className="pb-1">Type</th>
                      <th className="pb-1">Name</th>
                      <th className="pb-1">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="pr-3 text-gray-600">TXT</td>
                      <td className="pr-3">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-800 truncate max-w-[120px]">
                            {showDnsDialog.dnsInstructions?.name}
                          </span>
                          {showDnsDialog.dnsInstructions?.name && (
                            <CopyButton value={showDnsDialog.dnsInstructions.name} />
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-800 truncate max-w-[140px]">
                            {showDnsDialog.dnsInstructions?.value}
                          </span>
                          {showDnsDialog.dnsInstructions?.value && (
                            <CopyButton value={showDnsDialog.dnsInstructions.value} />
                          )}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Step 2: CNAME / A record */}
              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <p className="font-medium text-gray-800">Step 2 – Point to CloudyForms</p>
                <p className="text-xs text-gray-500">
                  Add a CNAME record pointing to your CloudyForms workers.dev URL:
                </p>
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-gray-400 text-left">
                      <th className="pb-1">Type</th>
                      <th className="pb-1">Name</th>
                      <th className="pb-1">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="pr-3 text-gray-600">CNAME</td>
                      <td className="pr-3 text-gray-800">{showDnsDialog.domain.split('.')[0]}</td>
                      <td className="text-gray-500 italic">your-worker.workers.dev</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-xs text-gray-400">
                  See the{' '}
                  <a
                    href="/docs/cloudflare-integration.md"
                    target="_blank"
                    className="underline text-primary-600"
                  >
                    Cloudflare integration guide
                  </a>{' '}
                  for full instructions including Cloudflare Tunnels and Custom Hostnames.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowDnsDialog(null)}>Close</Button>
                <Button
                  onClick={() => {
                    setShowDnsDialog(null);
                    handleVerify(showDnsDialog);
                  }}
                  loading={actionLoading === showDnsDialog.id}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Check DNS Now
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove domain?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deleteTarget?.domain}</strong>. Any Cloudflare rules
              you have configured for this domain will continue to exist until you remove them
              manually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={!!actionLoading}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
