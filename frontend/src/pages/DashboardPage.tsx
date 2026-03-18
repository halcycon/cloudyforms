import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileText, MessageSquare, Building2, Activity, ArrowRight, Eye } from 'lucide-react';
import { auth as authApi, forms as formsApi, orgs as orgsApi, responses as responsesApi } from '@/lib/api';
import { useStore } from '@/lib/store';
import { formatDateShort } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Form, FormResponse } from '@/lib/types';

interface Stats {
  forms: number;
  responses: number;
  activeForms: number;
  orgs: number;
}

export default function DashboardPage() {
  const { user, setUser, currentOrg } = useStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ forms: 0, responses: 0, activeForms: 0, orgs: 0 });
  const [recentForms, setRecentForms] = useState<Form[]>([]);
  const [recentResponses, setRecentResponses] = useState<FormResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!currentOrg?.id) return;
      try {
        const [userData, formsData, orgsData] = await Promise.all([
          user ? Promise.resolve(user) : authApi.me(),
          formsApi.list(currentOrg.id),
          orgsApi.list(),
        ]);

        if (!user) setUser(userData);

        const recent = formsData.slice(0, 5);
        setRecentForms(recent);
        setStats({
          forms: formsData.length,
          responses: formsData.reduce((sum, f) => sum + (f.responseCount ?? 0), 0),
          activeForms: formsData.filter((f) => f.status === 'published').length,
          orgs: orgsData.length,
        });

        // Load responses for recent forms
        if (recent.length > 0) {
          try {
            const respData = await responsesApi.list(recent[0].id, { limit: 5 });
            setRecentResponses(respData.responses);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [currentOrg?.id, user, setUser]);

  const statCards = [
    { label: 'Total Forms', value: stats.forms, icon: <FileText className="h-5 w-5" />, color: 'text-blue-600 bg-blue-50' },
    { label: 'Responses (All)', value: stats.responses, icon: <MessageSquare className="h-5 w-5" />, color: 'text-green-600 bg-green-50' },
    { label: 'Active Forms', value: stats.activeForms, icon: <Activity className="h-5 w-5" />, color: 'text-purple-600 bg-purple-50' },
    { label: 'Organizations', value: stats.orgs, icon: <Building2 className="h-5 w-5" />, color: 'text-orange-600 bg-orange-50' },
  ];

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-64 bg-gray-200 animate-pulse rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-200 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! 👋
          </h1>
          <p className="text-gray-500 mt-1">
            {currentOrg ? `You're viewing ${currentOrg.name}` : 'Manage your forms and responses'}
          </p>
        </div>
        <Button onClick={() => navigate('/forms/new')}>
          <Plus className="h-4 w-4" />
          New Form
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`rounded-full p-2 ${stat.color}`}>{stat.icon}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Forms */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Forms</CardTitle>
              <Link to="/forms" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentForms.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No forms yet</p>
                <Button size="sm" className="mt-3" onClick={() => navigate('/forms/new')}>
                  Create your first form
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentForms.map((form) => (
                  <div
                    key={form.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{form.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {form.responseCount ?? 0} responses · {formatDateShort(form.updatedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <Badge
                        variant={form.status === 'published' ? 'success' : form.status === 'closed' ? 'destructive' : 'secondary'}
                      >
                        {form.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(`/forms/${form.id}/edit`)}
                        className="h-7 w-7"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Responses */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Responses</CardTitle>
          </CardHeader>
          <CardContent>
            {recentResponses.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No responses yet</p>
                <p className="text-xs text-gray-400 mt-1">Publish a form to start collecting responses</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentResponses.map((resp) => (
                  <div
                    key={resp.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {resp.submitterEmail ?? 'Anonymous'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDateShort(resp.createdAt)}
                      </p>
                    </div>
                    {resp.isSpam && <Badge variant="destructive">Spam</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
