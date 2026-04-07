/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { organizationsClient } from '@/api/client';
import type { Membership } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import type { MembershipRole } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import type { Organization } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { useUserContext } from './UserContext';

export type OrganizationSummary = {
  id: string;
  name: string;
  createdAt?: Organization['createdAt'];
  membershipRole?: MembershipRole;
  membershipStatus?: MembershipStatus;
};

export type ContextMode =
  | { mode: 'organization'; organization: OrganizationSummary }
  | { mode: 'cluster' };

type OrganizationContextValue = {
  organizations: OrganizationSummary[];
  memberships: Membership[];
  pendingMemberships: Membership[];
  pendingMembershipsCount: number;
  contextMode: ContextMode | null;
  selectedOrganization: OrganizationSummary | null;
  status: 'loading' | 'ready' | 'error';
  error: Error | null;
  hasConsoleAccess: boolean;
  setContextMode: (mode: ContextMode | null) => void;
  setSelectedOrganization: (org: OrganizationSummary | null) => void;
};

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

const STORAGE_KEY = 'console.contextMode';
const LEGACY_STORAGE_KEY = 'console.selectedOrganization';

type StoredContextMode =
  | { mode: 'organization'; organizationId: string }
  | { mode: 'cluster' };

function parseStoredContextMode(raw: string | null): StoredContextMode | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredContextMode;
    if (parsed.mode === 'cluster') {
      return { mode: 'cluster' };
    }
    if (parsed.mode === 'organization' && typeof parsed.organizationId === 'string') {
      return { mode: 'organization', organizationId: parsed.organizationId };
    }
  } catch {
    return null;
  }
  return null;
}

function readStoredContextMode(): StoredContextMode | null {
  if (typeof window === 'undefined') return null;
  const stored = parseStoredContextMode(window.localStorage.getItem(STORAGE_KEY));
  if (stored) return stored;

  const legacyOrgId = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyOrgId) return null;
  const migrated: StoredContextMode = { mode: 'organization', organizationId: legacyOrgId };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  return migrated;
}

function persistContextMode(mode: StoredContextMode | null) {
  if (typeof window === 'undefined') return;
  if (!mode) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mode));
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
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
  const storedContextRef = useRef<StoredContextMode | null>(readStoredContextMode());
  const [contextMode, setContextModeState] = useState<ContextMode | null>(null);

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
    return mappedOrganizations.filter((org) => org.membershipStatus === MembershipStatus.ACTIVE);
  }, [isClusterAdmin, mappedOrganizations]);

  const sortedOrganizations = useMemo(
    () => [...visibleOrganizations].sort((a, b) => a.name.localeCompare(b.name)),
    [visibleOrganizations],
  );

  const selectedOrganization = useMemo(
    () => (contextMode?.mode === 'organization' ? contextMode.organization : null),
    [contextMode],
  );

  const setContextMode = useCallback((mode: ContextMode | null) => {
    const storedMode: StoredContextMode | null = mode
      ? mode.mode === 'cluster'
        ? { mode: 'cluster' }
        : { mode: 'organization', organizationId: mode.organization.id }
      : null;
    storedContextRef.current = storedMode;
    persistContextMode(storedMode);
    setContextModeState(mode);
  }, []);

  const setSelectedOrganization = useCallback(
    (org: OrganizationSummary | null) => {
      setContextMode(org ? { mode: 'organization', organization: org } : null);
    },
    [setContextMode],
  );

  const resolveContextMode = useCallback(
    (current: ContextMode | null): ContextMode | null => {
      if (current?.mode === 'organization') {
        const match = sortedOrganizations.find((org) => org.id === current.organization.id);
        if (match) return { mode: 'organization', organization: match };
      }
      if (current?.mode === 'cluster' && isClusterAdmin) {
        return { mode: 'cluster' };
      }

      const storedContext = storedContextRef.current;
      if (storedContext?.mode === 'cluster' && isClusterAdmin) {
        return { mode: 'cluster' };
      }
      if (storedContext?.mode === 'organization') {
        const storedOrg = sortedOrganizations.find((org) => org.id === storedContext.organizationId);
        if (storedOrg) return { mode: 'organization', organization: storedOrg };
      }

      if (sortedOrganizations.length > 0) {
        return { mode: 'organization', organization: sortedOrganizations[0] };
      }
      if (isClusterAdmin) {
        return { mode: 'cluster' };
      }
      return null;
    },
    [isClusterAdmin, sortedOrganizations],
  );

  const isContextModeEqual = useCallback((a: ContextMode | null, b: ContextMode | null) => {
    if (a?.mode !== b?.mode) return false;
    if (!a && !b) return true;
    if (a?.mode === 'cluster' && b?.mode === 'cluster') return true;
    if (a?.mode === 'organization' && b?.mode === 'organization') {
      return a.organization.id === b.organization.id && a.organization.name === b.organization.name;
    }
    return false;
  }, []);

  useEffect(() => {
    if (userStatus !== 'ready') return;
    if (membershipsQuery.isPending || pendingMembershipsQuery.isPending || organizationsQuery.isPending) return;
    const nextMode = resolveContextMode(contextMode);
    if (!isContextModeEqual(contextMode, nextMode)) {
      setContextModeState(nextMode);
      const storedMode: StoredContextMode | null = nextMode
        ? nextMode.mode === 'cluster'
          ? { mode: 'cluster' }
          : { mode: 'organization', organizationId: nextMode.organization.id }
        : null;
      storedContextRef.current = storedMode;
      persistContextMode(storedMode);
    }
  }, [
    contextMode,
    membershipsQuery.isPending,
    organizationsQuery.isPending,
    pendingMembershipsQuery.isPending,
    resolveContextMode,
    isContextModeEqual,
    userStatus,
  ]);

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
    contextMode,
    selectedOrganization,
    status,
    error,
    hasConsoleAccess,
    setContextMode,
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
