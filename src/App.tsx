import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layout/AppLayout';
import { RequireClusterAdmin, RequireOrganization } from '@/components/RouteGuards';
import { DashboardPage } from '@/pages/DashboardPage';
import { OrganizationsListPage } from '@/pages/OrganizationsListPage';
import { OrganizationDetailLayout } from '@/pages/OrganizationDetailLayout';
import { OrganizationMembersTab } from '@/pages/OrganizationMembersTab';
import { OrganizationOverviewTab } from '@/pages/OrganizationOverviewTab';
import { OrganizationRunnersTab } from '@/pages/OrganizationRunnersTab';
import { OrganizationSecretsTab } from '@/pages/OrganizationSecretsTab';
import { UsersListPage } from '@/pages/UsersListPage';
import { UserDetailPage } from '@/pages/UserDetailPage';
import { RunnersListPage } from '@/pages/RunnersListPage';
import { RunnerDetailPage } from '@/pages/RunnerDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { AppsPage } from '@/pages/AppsPage';
import { LlmPage } from '@/pages/LlmPage';
import { MonitoringPage } from '@/pages/MonitoringPage';
import { VolumesPage } from '@/pages/VolumesPage';
import { ApiTokensPage } from '@/pages/ApiTokensPage';

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
          <Route path="secrets" element={<OrganizationSecretsTab />} />
          <Route path="runners" element={<OrganizationRunnersTab />} />
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
          path="agents"
          element={
            <RequireClusterAdmin>
              <AgentsPage />
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
          path="llm"
          element={
            <RequireClusterAdmin>
              <LlmPage />
            </RequireClusterAdmin>
          }
        />
        <Route
          path="monitoring"
          element={
            <RequireClusterAdmin>
              <MonitoringPage />
            </RequireClusterAdmin>
          }
        />
        <Route
          path="volumes"
          element={
            <RequireClusterAdmin>
              <VolumesPage />
            </RequireClusterAdmin>
          }
        />
        <Route
          path="api-tokens"
          element={
            <RequireClusterAdmin>
              <ApiTokensPage />
            </RequireClusterAdmin>
          }
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
