import type { ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { organizationsClient } from '@/api/client';
import { useOrganizationContext, type OrganizationSummary } from '@/context/OrganizationContext';
import { useUserContext } from '@/context/UserContext';

type GuardProps = {
  children: ReactNode;
};

export function RequireClusterAdmin({ children }: GuardProps) {
  const { isClusterAdmin, status, error } = useUserContext();
  const { selectedOrganization } = useOrganizationContext();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="text-sm text-muted-foreground">Loading profile...</div>;
  }

  if (status === 'error') {
    return <div className="text-sm text-muted-foreground">{error?.message ?? 'Failed to load profile.'}</div>;
  }

  if (!isClusterAdmin) {
    const fallback = selectedOrganization ? `/organizations/${selectedOrganization.id}` : '/organizations';
    return <Navigate to={fallback} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function RequireOrganization({ children }: GuardProps) {
  const { selectedOrganization, status, error, organizations, setContextMode } = useOrganizationContext();
  const { isClusterAdmin } = useUserContext();
  const location = useLocation();
  const params = useParams();
  const orgId = params.id;
  const memberOrganization = orgId ? organizations.find((org) => org.id === orgId) : null;
  const fallback = selectedOrganization ? `/organizations/${selectedOrganization.id}` : '/organizations';

  // Cluster admins may open organizations they are not a member of; the org
  // is fetched directly since the context only lists memberships.
  const adminOrganizationQuery = useQuery({
    queryKey: ['organizations', 'admin-view', orgId],
    queryFn: () => organizationsClient.getOrganization({ id: orgId ?? '' }),
    enabled: isClusterAdmin && status === 'ready' && Boolean(orgId) && !memberOrganization,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const adminOrganization: OrganizationSummary | null =
    isClusterAdmin && !memberOrganization && adminOrganizationQuery.data?.organization
      ? {
          id: adminOrganizationQuery.data.organization.id,
          name: adminOrganizationQuery.data.organization.name,
          createdAt: adminOrganizationQuery.data.organization.createdAt,
        }
      : null;

  const matchingOrganization = memberOrganization ?? adminOrganization;

  useEffect(() => {
    if (status !== 'ready') return;
    if (!orgId) return;
    if (selectedOrganization?.id === orgId) return;
    if (matchingOrganization) {
      setContextMode({ mode: 'organization', organization: matchingOrganization });
    }
  }, [matchingOrganization, orgId, selectedOrganization, setContextMode, status]);

  if (status === 'loading') {
    return <div className="text-sm text-muted-foreground">Loading organizations...</div>;
  }

  if (status === 'error') {
    return <div className="text-sm text-muted-foreground">{error?.message ?? 'Failed to load organizations.'}</div>;
  }

  if (!orgId) {
    return <Navigate to={fallback} state={{ from: location }} replace />;
  }

  if (!matchingOrganization) {
    if (isClusterAdmin && (adminOrganizationQuery.isPending || adminOrganizationQuery.isFetching)) {
      return <div className="text-sm text-muted-foreground">Loading organization...</div>;
    }
    return <Navigate to={fallback} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
