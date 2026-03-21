import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Users, Settings, FileText, ArrowLeft } from 'lucide-react';
import { orgs as orgsApi, forms as formsApi } from '@/lib/api';
import type { Organization, Form } from '@/lib/types';
import { useStore } from '@/lib/store';
import { formatDateShort } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function OrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { setCurrentOrg } = useStore();
  const [org, setOrg] = useState<Organization | null>(null);
  const [orgForms, setOrgForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([orgsApi.get(orgId), formsApi.list(orgId)])
      .then(([orgData, formsData]) => {
        setOrg(orgData);
        setCurrentOrg(orgData);
        setOrgForms(formsData.slice(0, 5));
      })
      .catch(() => navigate('/orgs'))
      .finally(() => setLoading(false));
  }, [orgId, navigate, setCurrentOrg]);

  if (loading) {
    return <div className="p-6"><div className="h-8 w-64 bg-gray-200 animate-pulse rounded" /></div>;
  }
  if (!org) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-gray-500">Organization not found.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/orgs')}>
          <ArrowLeft className="h-4 w-4" /> Back to Organizations
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/orgs')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
            style={{ backgroundColor: org.primaryColor }}
          >
            {org.name[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{org.name}</h1>
            <p className="text-sm text-gray-400">/{org.slug}</p>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/orgs/${orgId}/members`)}>
            <Users className="h-4 w-4" /> Members
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/orgs/${orgId}/settings`)}>
            <Settings className="h-4 w-4" /> Settings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Forms</p>
            <p className="text-2xl font-bold">{orgForms.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Published</p>
            <p className="text-2xl font-bold">{orgForms.filter((f) => f.status === 'published').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Total Responses</p>
            <p className="text-2xl font-bold">{orgForms.reduce((s, f) => s + (f.responseCount ?? 0), 0)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Forms</CardTitle>
            <Link to="/forms" className="text-sm text-primary-600 hover:underline">View all</Link>
          </div>
        </CardHeader>
        <CardContent>
          {orgForms.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="mx-auto h-8 w-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No forms in this organization</p>
              <Button size="sm" className="mt-3" onClick={() => navigate('/forms/new')}>
                Create Form
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {orgForms.map((form) => (
                <div key={form.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{form.title}</p>
                    <p className="text-xs text-gray-400">{formatDateShort(form.updatedAt)}</p>
                  </div>
                  <Badge variant={form.status === 'published' ? 'success' : 'secondary'}>{form.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
