import { Outlet, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { organizationsClient } from '@/api/client';

export function OrganizationDetailLayout() {
  const { id } = useParams();

  const orgQuery = useQuery({
    queryKey: ['organizations', 'detail', id],
    queryFn: () => organizationsClient.getOrganization({ id: id ?? '' }),
    enabled: Boolean(id),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-6">
      {orgQuery.isError ? (
        <p className="text-sm text-muted-foreground">Failed to load organization details.</p>
      ) : null}
      <Outlet />
    </div>
  );
}
