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
    return <div className="text-sm text-[var(--agyn-gray)]">Loading profile...</div>;
  }

  if (status === 'error') {
    return <div className="text-sm text-[var(--agyn-gray)]">{error?.message ?? 'Failed to load profile.'}</div>;
  }

  if (!isClusterAdmin) {
    const fallback = selectedOrganization ? `/organizations/${selectedOrganization.id}` : '/organizations';
    return <Navigate to={fallback} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function RequireOrganization({ children }: GuardProps) {
  const { selectedOrganization, status, error, organizations, setSelectedOrganization } = useOrganizationContext();
  const location = useLocation();
  const params = useParams();

  useEffect(() => {
    if (status !== 'ready') return;
    const orgId = params.id;
    if (!orgId) return;
    if (selectedOrganization?.id === orgId) return;
    const match = organizations.find((org) => org.id === orgId);
    if (match) {
      setSelectedOrganization(match);
    }
  }, [organizations, params.id, selectedOrganization, setSelectedOrganization, status]);

  if (status === 'loading') {
    return <div className="text-sm text-[var(--agyn-gray)]">Loading organizations...</div>;
  }

  if (status === 'error') {
    return <div className="text-sm text-[var(--agyn-gray)]">{error?.message ?? 'Failed to load organizations.'}</div>;
  }

  if (!selectedOrganization) {
    return <Navigate to="/organizations" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
