import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Users, Settings, ArrowRight } from 'lucide-react';
import { orgs as orgsApi } from '@/lib/api';
import { useStore } from '@/lib/store';
import { formatDateShort } from '@/lib/utils';
import type { Organization } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function OrganizationsPage() {
  const navigate = useNavigate();
  const { setCurrentOrg } = useStore();
  const [orgsList, setOrgsList] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orgsApi.list()
      .then(setOrgsList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function selectOrg(org: Organization) {
    setCurrentOrg(org);
    navigate(`/orgs/${org.id}`);
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
        <Button onClick={() => navigate('/orgs/new')}>
          <Plus className="h-4 w-4" /> New Organization
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-gray-200 animate-pulse rounded-lg" />)}
        </div>
      ) : orgsList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-gray-100 p-6 mb-4">
            <Building2 className="h-10 w-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No organizations yet</h3>
          <p className="text-gray-500 mt-2">Create an organization to collaborate with your team.</p>
          <Button className="mt-4" onClick={() => navigate('/orgs/new')}>
            <Plus className="h-4 w-4" /> Create Organization
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgsList.map((org) => (
            <Card
              key={org.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => selectOrg(org)}
            >
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  {org.logoUrl ? (
                    <img src={org.logoUrl} alt={org.name} className="h-10 w-10 rounded-lg object-contain border border-gray-200" />
                  ) : (
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                      style={{ backgroundColor: org.primaryColor }}
                    >
                      {org.name[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{org.name}</p>
                    <p className="text-xs text-gray-400 font-mono">/{org.slug}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                  <span>Created {formatDateShort(org.createdAt)}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/orgs/${org.id}/members`); }}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded"
                      title="Members"
                    >
                      <Users className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/orgs/${org.id}/settings`); }}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded"
                      title="Settings"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
