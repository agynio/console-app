import { useMemo } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { organizationsClient } from '@/api/client';
import { useOrganizationContext } from '@/context/OrganizationContext';

export function OrganizationDetailLayout() {
  const { id } = useParams();
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
      <Outlet />
    </div>
  );
}
