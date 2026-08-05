import { Navigate, Route, Routes, useParams } from 'react-router-dom';
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
import { OrganizationSandboxesTab } from '@/pages/OrganizationSandboxesTab';
import { SandboxDetailPage } from '@/pages/SandboxDetailPage';
import { OrganizationUsageTab } from '@/pages/OrganizationUsageTab';
import { OrganizationSecretProvidersTab } from '@/pages/OrganizationSecretProvidersTab';
import { OrganizationSecretsTab } from '@/pages/OrganizationSecretsTab';
import { OrganizationThreadDetailPage } from '@/pages/OrganizationThreadDetailPage';
import { OrganizationThreadsTab } from '@/pages/OrganizationThreadsTab';
import { OrganizationVolumesTab } from '@/pages/OrganizationVolumesTab';
import { OrganizationEgressRulesTab } from '@/pages/OrganizationEgressRulesTab';
import { OrganizationEnvironmentsTab } from '@/pages/OrganizationEnvironmentsTab';
import { ImageDetailPage } from '@/pages/ImageDetailPage';
import { OrganizationImagesTab } from '@/pages/OrganizationImagesTab';
import { EnvironmentDetailPage } from '@/pages/EnvironmentDetailPage';
import { OrganizationGroupsPage } from '@/pages/OrganizationGroupsPage';
import { OrganizationGroupDetailPage } from '@/pages/OrganizationGroupDetailPage';
import {
  OrganizationPrivateNetworkDetailPage,
  OrganizationPrivateNetworksPage,
} from '@/pages/OrganizationPrivateNetworksPage';
import { OrganizationPrivateResourcesPage } from '@/pages/OrganizationPrivateResourcesPage';
import { PrivateResourceDetailPage } from '@/pages/PrivateResourceDetailPage';
import { OrganizationInstancesPage } from '@/pages/OrganizationInstancesPage';
import { InstanceDetailPage } from '@/pages/InstanceDetailPage';
import { UsersListPage } from '@/pages/UsersListPage';
import { UserDetailPage } from '@/pages/UserDetailPage';
import { RunnersListPage } from '@/pages/RunnersListPage';
import { RunnerDetailPage } from '@/pages/RunnerDetailPage';
import { WorkloadDetailPage } from '@/pages/WorkloadDetailPage';
import { VolumeDetailPage } from '@/pages/VolumeDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AppsPage } from '@/pages/AppsPage';
import { ApiTokensPage } from '@/pages/ApiTokensPage';
import { AppDetailPage } from '@/pages/AppDetailPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { InstallationDetailPage } from '@/pages/InstallationDetailPage';

/** Redirects a superseded organization-scoped path to its canonical one. */
function OrganizationRedirect({ to }: { to: string }) {
  const { id } = useParams();
  return <Navigate to={`/organizations/${id}${to}`} replace />;
}

function ActivityThreadRedirect() {
  const { id, threadId } = useParams();
  return <Navigate to={`/organizations/${id}/threads/${threadId}`} replace />;
}

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
          <Route path="volumes/:volumeId" element={<VolumeDetailPage />} />
          <Route path="images" element={<OrganizationImagesTab />} />
          <Route path="images/:imageId" element={<ImageDetailPage />} />
          <Route path="environments" element={<OrganizationEnvironmentsTab />} />
          <Route path="environments/:environmentId" element={<EnvironmentDetailPage />} />
          <Route path="egress-rules" element={<OrganizationEgressRulesTab />} />
          <Route path="private-networks" element={<OrganizationPrivateNetworksPage />} />
          <Route path="private-networks/:networkId" element={<OrganizationPrivateNetworkDetailPage />} />
          <Route path="private-resources" element={<OrganizationPrivateResourcesPage />} />
          <Route path="private-resources/:resourceId" element={<PrivateResourceDetailPage />} />
          <Route path="groups" element={<OrganizationGroupsPage />} />
          <Route path="groups/:groupId" element={<OrganizationGroupDetailPage />} />
          <Route path="llm-providers" element={<OrganizationLlmProvidersTab />} />
          <Route path="models" element={<OrganizationModelsTab />} />
          <Route path="secrets" element={<OrganizationSecretsTab />} />
          <Route path="secret-providers" element={<OrganizationSecretProvidersTab />} />
          <Route path="runners" element={<OrganizationRunnersTab />} />
          <Route path="runners/:runnerId" element={<RunnerDetailPage />} />
          <Route path="sandboxes" element={<OrganizationSandboxesTab />} />
          <Route path="sandboxes/:sandboxId" element={<SandboxDetailPage />} />
          <Route path="apps" element={<OrganizationAppsTab />} />
          <Route path="apps/installations/:installationId" element={<InstallationDetailPage />} />
          <Route path="apps/:appId" element={<AppDetailPage />} />
          <Route path="instances" element={<OrganizationInstancesPage />} />
          <Route path="instances/:instanceId" element={<InstanceDetailPage />} />
          {/* Operations sections each resolve at one flat canonical path; the
              group is no longer a path prefix. */}
          <Route path="threads" element={<OrganizationThreadsTab />} />
          <Route path="threads/:threadId" element={<OrganizationThreadDetailPage />} />
          <Route path="workloads" element={<OrganizationActivityWorkloadsTab />} />
          <Route path="workloads/:workloadId" element={<WorkloadDetailPage />} />
          <Route path="storage" element={<OrganizationActivityStorageTab />} />
          <Route path="usage" element={<OrganizationUsageTab />} />
          <Route path="activity" element={<OrganizationRedirect to="/workloads" />} />
          <Route path="activity/workloads" element={<OrganizationRedirect to="/workloads" />} />
          <Route path="activity/storage" element={<OrganizationRedirect to="/storage" />} />
          <Route path="activity/threads" element={<OrganizationRedirect to="/threads" />} />
          <Route path="activity/threads/:threadId" element={<ActivityThreadRedirect />} />
          <Route path="activity/usage" element={<OrganizationRedirect to="/usage" />} />
          <Route path="monitoring" element={<OrganizationRedirect to="/workloads" />} />
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
