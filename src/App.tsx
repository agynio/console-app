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
import { OrganizationActivityStorageTab } from '@/pages/OrganizationActivityStorageTab';
import { OrganizationActivityWorkloadsTab } from '@/pages/OrganizationActivityWorkloadsTab';
import { OrganizationOverviewTab } from '@/pages/OrganizationOverviewTab';
import { OrganizationRunnersTab } from '@/pages/OrganizationRunnersTab';
import { OrganizationUsageTab } from '@/pages/OrganizationUsageTab';
import { OrganizationImagePullSecretsTab } from '@/pages/OrganizationImagePullSecretsTab';
import { OrganizationSecretProvidersTab } from '@/pages/OrganizationSecretProvidersTab';
import { OrganizationSecretsTab } from '@/pages/OrganizationSecretsTab';
import { OrganizationThreadDetailPage } from '@/pages/OrganizationThreadDetailPage';
import { OrganizationThreadsTab } from '@/pages/OrganizationThreadsTab';
import { OrganizationVolumesTab } from '@/pages/OrganizationVolumesTab';
import { UsersListPage } from '@/pages/UsersListPage';
import { UserDetailPage } from '@/pages/UserDetailPage';
import { RunnersListPage } from '@/pages/RunnersListPage';
import { RunnerDetailPage } from '@/pages/RunnerDetailPage';
import { WorkloadDetailPage } from '@/pages/WorkloadDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AppsPage } from '@/pages/AppsPage';
import { ApiTokensPage } from '@/pages/ApiTokensPage';
import { AppDetailPage } from '@/pages/AppDetailPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { InstallationDetailPage } from '@/pages/InstallationDetailPage';

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
          <Route path="image-pull-secrets" element={<OrganizationImagePullSecretsTab />} />
          <Route path="secret-providers" element={<OrganizationSecretProvidersTab />} />
          <Route path="runners" element={<OrganizationRunnersTab />} />
          <Route path="runners/:runnerId" element={<RunnerDetailPage />} />
          <Route path="apps" element={<OrganizationAppsTab />} />
          <Route path="apps/installations/:installationId" element={<InstallationDetailPage />} />
          <Route path="apps/:appId" element={<AppDetailPage />} />
          <Route path="activity" element={<Navigate to="workloads" replace />} />
          <Route path="activity/workloads" element={<OrganizationActivityWorkloadsTab />} />
          <Route path="activity/storage" element={<OrganizationActivityStorageTab />} />
          <Route path="activity/threads" element={<OrganizationThreadsTab />} />
          <Route path="activity/threads/:threadId" element={<OrganizationThreadDetailPage />} />
          <Route path="activity/usage" element={<OrganizationUsageTab />} />
          <Route path="threads" element={<OrganizationThreadsTab />} />
          <Route path="threads/:threadId" element={<OrganizationThreadDetailPage />} />
          <Route path="workloads/:workloadId" element={<WorkloadDetailPage />} />
          <Route path="monitoring" element={<Navigate to="activity/workloads" replace />} />
          <Route path="usage" element={<OrganizationUsageTab />} />
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
          path="devices"
          element={<DevicesPage />}
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
          path="runners/:runnerId"
          element={
            <RequireClusterAdmin>
              <RunnerDetailPage />
            </RequireClusterAdmin>
          }
        />
        <Route
          path="workloads/:workloadId"
          element={
            <RequireClusterAdmin>
              <WorkloadDetailPage />
            </RequireClusterAdmin>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
