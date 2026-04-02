import { useMemo } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { organizationsClient } from '@/api/client';
import { useOrganizationContext } from '@/context/OrganizationContext';

function resolveTab(pathname: string): string {
  if (pathname.includes('/members')) return 'members';
  if (pathname.includes('/secrets')) return 'secrets';
  if (pathname.includes('/runners')) return 'runners';
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
        <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">
          {organization?.name ?? 'Organization'}
        </h2>
        <p className="text-sm text-[var(--agyn-gray)]">Manage organization details and resources.</p>
        {organization ? (
          <p className="mt-1 text-xs text-[var(--agyn-gray)]">ID: {organization.id}</p>
        ) : null}
        {orgQuery.isError ? (
          <p className="mt-2 text-sm text-[var(--agyn-gray)]">Failed to load organization details.</p>
        ) : null}
      </div>
      <Tabs value={activeTab}>
        <TabsList>
          <TabsTrigger asChild value="overview">
            <NavLink to={base}>Overview</NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="members">
            <NavLink to={`${base}/members`}>Members</NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="secrets">
            <NavLink to={`${base}/secrets`}>Secrets</NavLink>
          </TabsTrigger>
          <TabsTrigger asChild value="runners">
            <NavLink to={`${base}/runners`}>Runners</NavLink>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
