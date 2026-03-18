import { useEffect, useState } from 'react';
import { admin } from '@/lib/api';
import { useStore } from '@/lib/store';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Building2, FileText, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

  useEffect(() => {
    if (!user?.isSuperAdmin) {
      navigate('/dashboard');
      return;
    }
    admin.stats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, navigate]);

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            You have super admin access. Additional management tools will be available here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
