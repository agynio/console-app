/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { organizationsClient } from '@/api/client';
import type { Membership } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { MembershipRole, MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import type { Organization } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { useUserContext } from './UserContext';

export type OrganizationSummary = {
  id: string;
  name: string;
  createdAt?: Organization['createdAt'];
  membershipRole?: MembershipRole;
  membershipStatus?: MembershipStatus;
};

type OrganizationContextValue = {
  organizations: OrganizationSummary[];
  memberships: Membership[];
  pendingMemberships: Membership[];
  pendingMembershipsCount: number;
  selectedOrganization: OrganizationSummary | null;
  status: 'loading' | 'ready' | 'error';
  error: Error | null;
  hasConsoleAccess: boolean;
  setSelectedOrganization: (org: OrganizationSummary | null) => void;
};

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

const STORAGE_KEY = 'console.selectedOrganization';

function readStoredOrgId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function persistOrgId(orgId: string | null) {
  if (typeof window === 'undefined') return;
  if (orgId) {
    window.localStorage.setItem(STORAGE_KEY, orgId);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

function mapOrganizations(
  organizations: Organization[],
  memberships: Membership[],
): OrganizationSummary[] {
  const membershipByOrg = new Map(memberships.map((membership) => [membership.organizationId, membership]));
  return organizations.map((org) => {
    const membership = membershipByOrg.get(org.id);
    return {
      id: org.id,
      name: org.name,
      createdAt: org.createdAt,
      membershipRole: membership?.role,
      membershipStatus: membership?.status,
    };
  });
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { identityId, isClusterAdmin, status: userStatus } = useUserContext();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(readStoredOrgId);

  // Memberships include role/status data used to filter org visibility.
  const membershipsQuery = useQuery({
    queryKey: ['organizations', 'memberships'],
    queryFn: () =>
      organizationsClient.listMyMemberships({
        status: MembershipStatus.ACTIVE,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
      }),
    enabled: userStatus === 'ready' && Boolean(identityId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const pendingMembershipsQuery = useQuery({
    queryKey: ['organizations', 'pendingMemberships'],
    queryFn: () =>
      organizationsClient.listMyMemberships({
        status: MembershipStatus.PENDING,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
      }),
    enabled: userStatus === 'ready' && Boolean(identityId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Accessible orgs provide metadata even when memberships are filtered by status.
  const organizationsQuery = useQuery({
    queryKey: ['organizations', 'accessible', identityId],
    queryFn: () => organizationsClient.listAccessibleOrganizations({ identityId: identityId ?? '' }),
    enabled: userStatus === 'ready' && Boolean(identityId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const memberships = useMemo(
    () => membershipsQuery.data?.memberships ?? [],
    [membershipsQuery.data?.memberships],
  );
  const pendingMemberships = useMemo(
    () => pendingMembershipsQuery.data?.memberships ?? [],
    [pendingMembershipsQuery.data?.memberships],
  );
  const accessibleOrganizations = useMemo(
    () => organizationsQuery.data?.organizations ?? [],
    [organizationsQuery.data?.organizations],
  );

  const mappedOrganizations = useMemo(
    () => mapOrganizations(accessibleOrganizations, memberships),
    [accessibleOrganizations, memberships],
  );

  const visibleOrganizations = useMemo(() => {
    if (isClusterAdmin) return mappedOrganizations;
    return mappedOrganizations.filter((org) => org.membershipRole === MembershipRole.OWNER);
  }, [isClusterAdmin, mappedOrganizations]);

  const selectedOrganization = useMemo(
    () => visibleOrganizations.find((org) => org.id === selectedOrgId) ?? null,
    [visibleOrganizations, selectedOrgId],
  );

  const setSelectedOrganization = useCallback((org: OrganizationSummary | null) => {
    const nextId = org?.id ?? null;
    setSelectedOrgId(nextId);
    persistOrgId(nextId);
  }, []);

  useEffect(() => {
    if (userStatus !== 'ready') return;
    if (selectedOrganization) return;
    if (visibleOrganizations.length > 0) {
      const next = visibleOrganizations[0];
      setSelectedOrgId(next.id);
      persistOrgId(next.id);
    } else if (selectedOrgId) {
      setSelectedOrgId(null);
      persistOrgId(null);
    }
  }, [selectedOrganization, selectedOrgId, userStatus, visibleOrganizations]);

  const pendingMembershipsCount = pendingMemberships.length;

  const error = membershipsQuery.error ?? pendingMembershipsQuery.error ?? organizationsQuery.error ?? null;
  const status: OrganizationContextValue['status'] =
    userStatus === 'loading' ||
    membershipsQuery.isPending ||
    pendingMembershipsQuery.isPending ||
    organizationsQuery.isPending
      ? 'loading'
      : error
        ? 'error'
        : 'ready';

  const hasConsoleAccess =
    isClusterAdmin || visibleOrganizations.length > 0 || pendingMemberships.length > 0;

  const value: OrganizationContextValue = {
    organizations: visibleOrganizations,
    memberships,
    pendingMemberships,
    pendingMembershipsCount,
    selectedOrganization,
    status,
    error,
    hasConsoleAccess,
    setSelectedOrganization,
  };

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganizationContext() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error('useOrganizationContext must be used within OrganizationProvider');
  }
  return ctx;
}
