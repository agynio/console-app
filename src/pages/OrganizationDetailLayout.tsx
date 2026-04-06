import { useMemo } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { organizationsClient } from '@/api/client';
import { useOrganizationContext } from '@/context/OrganizationContext';

function resolveTab(pathname: string): string {
  if (pathname.includes('/members')) return 'members';
  if (pathname.includes('/agents')) return 'agents';
  if (pathname.includes('/volumes')) return 'volumes';
  if (pathname.includes('/llm-providers')) return 'llm-providers';
  if (pathname.includes('/models')) return 'models';
  if (pathname.includes('/secret-providers')) return 'secret-providers';
  if (pathname.includes('/secrets')) return 'secrets';
  if (pathname.includes('/runners')) return 'runners';
  if (pathname.includes('/apps')) return 'apps';
  if (pathname.includes('/monitoring')) return 'monitoring';
  return 'overview';
}

export function OrganizationDetailLayout() {
  const { id } = useParams();
  const location = useLocation();
  const { organizations, selectedOrganization } = useOrganizationContext();

  const orgQuery = useQuery({
    queryKey: ['organizations', 'detail', id],
    queryFn: () => organizationsClient.getOrganization({ id: id ?? '' }),
    enabled: Boolean(id),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const fallbackOrg = useMemo(
    () => organizations.find((org) => org.id === id) ?? null,
    [id, organizations],
  );
  const organization = orgQuery.data?.organization ?? selectedOrganization ?? fallbackOrg;
  const base = id ? `/organizations/${id}` : '/organizations';
  const activeTab = resolveTab(location.pathname);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground" data-testid="organization-heading">
          {organization?.name ?? 'Organization'}
        </h2>
        <p className="text-sm text-muted-foreground">Manage organization details and resources.</p>
        {organization ? (
          <p className="mt-1 text-xs text-muted-foreground">ID: {organization.id}</p>
        ) : null}
        {orgQuery.isError ? (
          <p className="mt-2 text-sm text-muted-foreground">Failed to load organization details.</p>
        ) : null}
      </div>
      <Tabs value={activeTab}>
        <TabsList data-testid="organization-tabs">
          <TabsTrigger asChild value="overview">
            <NavLink to={base} data-testid="organization-tab-overview">
              Overview
            </NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="members">
            <NavLink to={`${base}/members`} data-testid="organization-tab-members">
              Members
            </NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="agents">
            <NavLink to={`${base}/agents`} data-testid="organization-tab-agents">
              Agents
            </NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="volumes">
            <NavLink to={`${base}/volumes`} data-testid="organization-tab-volumes">
              Volumes
            </NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="llm-providers">
            <NavLink to={`${base}/llm-providers`} data-testid="organization-tab-llm-providers">
              LLM Providers
            </NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="models">
            <NavLink to={`${base}/models`} data-testid="organization-tab-models">
              Models
            </NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="secrets">
            <NavLink to={`${base}/secrets`} data-testid="organization-tab-secrets">
              Secrets
            </NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="secret-providers">
            <NavLink to={`${base}/secret-providers`} data-testid="organization-tab-secret-providers">
              Secret Providers
            </NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="runners">
            <NavLink to={`${base}/runners`} data-testid="organization-tab-runners">
              Runners
            </NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="apps">
            <NavLink to={`${base}/apps`} data-testid="organization-tab-apps">
              Apps
            </NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="monitoring">
            <NavLink to={`${base}/monitoring`} data-testid="organization-tab-monitoring">
              Monitoring
            </NavLink>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
