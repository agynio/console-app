import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layout/AppLayout';
import { RequireClusterAdmin, RequireOrganization } from '@/components/RouteGuards';
import { DashboardPage } from '@/pages/DashboardPage';
import { OrganizationsListPage } from '@/pages/OrganizationsListPage';
import { OrganizationDetailLayout } from '@/pages/OrganizationDetailLayout';
import { OrganizationMembersTab } from '@/pages/OrganizationMembersTab';
import { OrganizationAgentsTab } from '@/pages/OrganizationAgentsTab';
import { AgentCreatePage } from '@/pages/AgentCreatePage';
import { AgentDetailPage } from '@/pages/AgentDetailPage';
import { OrganizationAppsTab } from '@/pages/OrganizationAppsTab';
import { OrganizationLlmProvidersTab } from '@/pages/OrganizationLlmProvidersTab';
import { OrganizationModelsTab } from '@/pages/OrganizationModelsTab';
import { OrganizationMonitoringTab } from '@/pages/OrganizationMonitoringTab';
import { OrganizationOverviewTab } from '@/pages/OrganizationOverviewTab';
import { OrganizationRunnersTab } from '@/pages/OrganizationRunnersTab';
import { OrganizationSecretProvidersTab } from '@/pages/OrganizationSecretProvidersTab';
import { OrganizationSecretsTab } from '@/pages/OrganizationSecretsTab';
import { OrganizationVolumesTab } from '@/pages/OrganizationVolumesTab';
import { UsersListPage } from '@/pages/UsersListPage';
import { UserDetailPage } from '@/pages/UserDetailPage';
import { RunnersListPage } from '@/pages/RunnersListPage';
import { RunnerDetailPage } from '@/pages/RunnerDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AppsPage } from '@/pages/AppsPage';
import { ApiTokensPage } from '@/pages/ApiTokensPage';
import { AppDetailPage } from '@/pages/AppDetailPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          index
          element={
            <RequireClusterAdmin>
              <DashboardPage />
            </RequireClusterAdmin>
          }
        />
        <Route path="organizations" element={<OrganizationsListPage />} />
        <Route
          path="organizations/:id"
          element={
            <RequireOrganization>
              <OrganizationDetailLayout />
            </RequireOrganization>
          }
        >
          <Route index element={<OrganizationOverviewTab />} />
          <Route path="members" element={<OrganizationMembersTab />} />
          <Route path="agents/new" element={<AgentCreatePage />} />
          <Route path="agents/:agentId" element={<AgentDetailPage />} />
          <Route path="agents" element={<OrganizationAgentsTab />} />
          <Route path="volumes" element={<OrganizationVolumesTab />} />
          <Route path="llm-providers" element={<OrganizationLlmProvidersTab />} />
          <Route path="models" element={<OrganizationModelsTab />} />
          <Route path="secrets" element={<OrganizationSecretsTab />} />
          <Route path="secret-providers" element={<OrganizationSecretProvidersTab />} />
          <Route path="runners" element={<OrganizationRunnersTab />} />
          <Route path="apps" element={<OrganizationAppsTab />} />
          <Route path="monitoring" element={<OrganizationMonitoringTab />} />
        </Route>
        <Route
          path="users"
          element={
            <RequireClusterAdmin>
              <UsersListPage />
            </RequireClusterAdmin>
          }
        />
        <Route
          path="apps"
          element={
            <RequireClusterAdmin>
              <AppsPage />
            </RequireClusterAdmin>
          }
        />
        <Route
          path="apps/:appId"
          element={
            <RequireClusterAdmin>
              <AppDetailPage />
            </RequireClusterAdmin>
          }
        />
        <Route
          path="api-tokens"
          element={<ApiTokensPage />}
        />
        <Route
          path="users/:id"
          element={
            <RequireClusterAdmin>
              <UserDetailPage />
            </RequireClusterAdmin>
          }
        />
        <Route
          path="runners"
          element={
            <RequireClusterAdmin>
              <RunnersListPage />
            </RequireClusterAdmin>
          }
        />
        <Route
          path="runners/:id"
          element={
            <RequireClusterAdmin>
              <RunnerDetailPage />
            </RequireClusterAdmin>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
