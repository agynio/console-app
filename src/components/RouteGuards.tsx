import type { ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useOrganizationContext } from '@/context/OrganizationContext';
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
  const { selectedOrganization, status, error, organizations, setContextMode, contextMode } = useOrganizationContext();
  const location = useLocation();
  const params = useParams();
  const orgId = params.id;
  const matchingOrganization = orgId ? organizations.find((org) => org.id === orgId) : null;
  const fallback = selectedOrganization ? `/organizations/${selectedOrganization.id}` : '/organizations';

  useEffect(() => {
    if (status !== 'ready') return;
    if (!orgId) return;
    if (contextMode?.mode === 'cluster') return;
    if (selectedOrganization?.id === orgId) return;
    if (matchingOrganization) {
      setContextMode({ mode: 'organization', organization: matchingOrganization });
    }
  }, [contextMode, matchingOrganization, orgId, selectedOrganization, setContextMode, status]);

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
    return <Navigate to={fallback} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
