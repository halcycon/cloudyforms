import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { auth as authApi } from '@/lib/api';
import { useStore } from '@/lib/store';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';

// Pages
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardPage from '@/pages/DashboardPage';
import FormsPage from '@/pages/FormsPage';
import FormBuilderPage from '@/pages/FormBuilderPage';
import ResponsesPage from '@/pages/ResponsesPage';
import OrganizationsPage from '@/pages/OrganizationsPage';
import CreateOrgPage from '@/pages/CreateOrgPage';
import OrgDetailPage from '@/pages/OrgDetailPage';
import OrgMembersPage from '@/pages/OrgMembersPage';
import OrgSettingsPage from '@/pages/OrgSettingsPage';
import OrgDomainsPage from '@/pages/OrgDomainsPage';
import FieldGroupsPage from '@/pages/FieldGroupsPage';
import OptionListsPage from '@/pages/OptionListsPage';
import KioskSetupPage from '@/pages/KioskSetupPage';
import KioskPage from '@/pages/KioskPage';
import PublicFormPage from '@/pages/PublicFormPage';
import EmbedFormPage from '@/pages/EmbedFormPage';
import SettingsPage from '@/pages/SettingsPage';
import AdminPage from '@/pages/AdminPage';
import AdminDomainsPage from '@/pages/AdminDomainsPage';

function AuthLoader({ children }: { children: React.ReactNode }) {
  const { token, user, setUser, logout } = useStore();

  useEffect(() => {
    if (token && !user) {
      authApi.me()
        .then(setUser)
        .catch(() => logout());
    }
  }, [token, user, setUser, logout]);

  return <>{children}</>;
}

function WithLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthLoader>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/f/:slug" element={<PublicFormPage />} />
        {/* Minimal embed page – optimised for iframes, no navigation chrome */}
        <Route path="/embed/:slug" element={<EmbedFormPage />} />
        <Route path="/kiosk/:token" element={<KioskPage />} />

        {/* Protected: Form builder (no layout, fullscreen) */}
        <Route
          path="/forms/new"
          element={
            <ProtectedRoute>
              <FormBuilderPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/forms/:formId/edit"
          element={
            <ProtectedRoute>
              <FormBuilderPage />
            </ProtectedRoute>
          }
        />

        {/* Protected: with layout */}
        <Route path="/dashboard" element={<WithLayout><DashboardPage /></WithLayout>} />
        <Route path="/forms" element={<WithLayout><FormsPage /></WithLayout>} />
        <Route path="/forms/:formId/responses" element={<WithLayout><ResponsesPage /></WithLayout>} />
        <Route path="/orgs" element={<WithLayout><OrganizationsPage /></WithLayout>} />
        <Route path="/orgs/new" element={<WithLayout><CreateOrgPage /></WithLayout>} />
        <Route path="/orgs/:orgId" element={<WithLayout><OrgDetailPage /></WithLayout>} />
        <Route path="/orgs/:orgId/members" element={<WithLayout><OrgMembersPage /></WithLayout>} />
        <Route path="/orgs/:orgId/settings" element={<WithLayout><OrgSettingsPage /></WithLayout>} />
        <Route path="/orgs/:orgId/domains" element={<WithLayout><OrgDomainsPage /></WithLayout>} />
        <Route path="/field-groups" element={<WithLayout><FieldGroupsPage /></WithLayout>} />
        <Route path="/option-lists" element={<WithLayout><OptionListsPage /></WithLayout>} />
        <Route path="/kiosk-setup" element={<WithLayout><KioskSetupPage /></WithLayout>} />
        <Route path="/settings" element={<WithLayout><SettingsPage /></WithLayout>} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireSuperAdmin>
              <Layout><AdminPage /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/domains"
          element={
            <ProtectedRoute requireSuperAdmin>
              <Layout><AdminDomainsPage /></Layout>
            </ProtectedRoute>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthLoader>
  );
}
