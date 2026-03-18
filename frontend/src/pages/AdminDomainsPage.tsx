/**
 * AdminDomainsPage – super-admin view of all custom domains across all orgs.
 *
 * Accessible at /admin/domains (linked from AdminPage).
 * Allows the global admin to:
 *  - See all registered custom domains and their verification status
 *  - Force-verify any domain (bypass DNS check)
 *  - Delete any domain
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Globe,
  ShieldCheck,
  Trash2,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { admin as adminApi } from '@/lib/api';
import type { CustomDomain } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export default function AdminDomainsPage() {
  const { user } = useStore();
  const navigate = useNavigate();
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomDomain | null>(null);

  useEffect(() => {
    if (!user?.isSuperAdmin) {
      navigate('/dashboard');
      return;
    }
    loadDomains();
  }, [user, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDomains() {
    setLoading(true);
    try {
      const data = await adminApi.listDomains();
      setDomains(data);
    } catch {
      toast.error('Failed to load domains');
    } finally {
      setLoading(false);
    }
  }

  async function handleForceVerify(domain: CustomDomain) {
    setActionLoading(domain.id);
    try {
      await adminApi.verifyDomain(domain.id);
      toast.success(`${domain.domain} force-verified`);
      await loadDomains();
    } catch {
      toast.error('Failed to verify domain');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setActionLoading(deleteTarget.id);
    try {
      await adminApi.deleteDomain(deleteTarget.id);
      toast.success(`${deleteTarget.domain} removed`);
      setDomains((prev) => prev.filter((d) => d.id !== deleteTarget.id));
    } catch {
      toast.error('Failed to delete domain');
    } finally {
      setActionLoading(null);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Globe className="h-5 w-5 text-primary-600" />
        <h1 className="text-xl font-bold text-gray-900">Custom Domains</h1>
        <Button variant="outline" size="sm" onClick={loadDomains} className="ml-auto">
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Info card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4 pb-3">
          <p className="text-sm text-blue-700">
            Custom domains let each organisation present CloudyForms on their own hostname
            (e.g. <code className="font-mono bg-blue-100 px-1 rounded">forms.example.com</code>).
            After an org admin adds a domain, you can force-verify it here or they can verify it
            by adding a DNS TXT record.
          </p>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            All Registered Domains
            {!loading && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({domains.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 w-full bg-gray-100 animate-pulse rounded" />
              ))}
            </div>
          ) : domains.length === 0 ? (
            <div className="py-12 text-center">
              <Globe className="mx-auto h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">No custom domains registered yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Organisation admins can add domains from their org settings.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                    <th className="px-4 py-3">Domain</th>
                    <th className="px-4 py-3">Organisation</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Primary</th>
                    <th className="px-4 py-3">Added</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {domains.map((domain) => (
                    <tr key={domain.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
                        {domain.domain}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <span
                          className="cursor-pointer hover:underline text-primary-600"
                          onClick={() => navigate(`/orgs/${domain.orgId}/settings`)}
                        >
                          {domain.orgName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {domain.verified ? (
                          <Badge
                            variant="outline"
                            className="text-green-700 border-green-300 bg-green-50 gap-1"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-amber-700 border-amber-300 bg-amber-50 gap-1"
                          >
                            <XCircle className="h-3 w-3" />
                            Unverified
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {domain.isPrimary ? (
                          <Badge variant="secondary" className="text-xs">Primary</Badge>
                        ) : (
                          <span className="text-gray-300">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(domain.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1.5">
                          {!domain.verified && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleForceVerify(domain)}
                              loading={actionLoading === domain.id}
                              title="Force verify"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Verify
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setDeleteTarget(domain)}
                            disabled={actionLoading === domain.id}
                            title="Delete domain"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove domain?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.domain}</strong> from{' '}
              <strong>{deleteTarget?.orgName}</strong>. Any existing Cloudflare rules pointing
              to this domain will continue to work until you update them separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={!!actionLoading}
            >
              Remove Domain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
