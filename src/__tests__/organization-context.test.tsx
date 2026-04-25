import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { useUserContext } from '@/context/UserContext';
import { OrganizationProvider, useOrganizationContext } from '@/context/OrganizationContext';
import {
  type Membership,
  MembershipRole,
  MembershipStatus,
  MembershipSchema,
  OrganizationSchema,
} from '@/gen/agynio/api/organizations/v1/organizations_pb';

type UserContextValue = ReturnType<typeof useUserContext>;

const { listMyMemberships, listOrganizations, getOrganization } = vi.hoisted(() => ({
  listMyMemberships: vi.fn(),
  listOrganizations: vi.fn(),
  getOrganization: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  organizationsClient: {
    listMyMemberships,
    listOrganizations,
    getOrganization,
  },
}));

let userContext: UserContextValue;

vi.mock('@/context/UserContext', () => ({
  useUserContext: () => userContext,
}));

function ContextProbe() {
  const {
    contextMode,
    selectedOrganization,
    organizations,
    pendingMemberships,
    pendingMembershipsCount,
    hasConsoleAccess,
  } = useOrganizationContext();
  return (
    <div>
      <div data-testid="context-mode">{contextMode?.mode ?? 'none'}</div>
      <div data-testid="selected">{selectedOrganization?.id ?? 'none'}</div>
      <div data-testid="count">{organizations.length}</div>
      <div data-testid="pending-count">{pendingMembershipsCount}</div>
      <div data-testid="pending-ids">{pendingMemberships.map((membership) => membership.id).join(',')}</div>
      <div data-testid="has-console-access">{hasConsoleAccess ? 'true' : 'false'}</div>
    </div>
  );
}

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationProvider>
        <ContextProbe />
      </OrganizationProvider>
    </QueryClientProvider>,
  );
}

function mockMemberships(active: Membership[], pending: Membership[] = []) {
  listMyMemberships.mockImplementation((request: { status?: MembershipStatus }) => {
    if (request?.status === MembershipStatus.PENDING) {
      return Promise.resolve({ memberships: pending });
    }
    return Promise.resolve({ memberships: active });
  });
}

function mockOrganizationLookup(organizations: Array<{ id: string; name: string }>) {
  const lookup = new Map(organizations.map((org) => [org.id, org]));
  getOrganization.mockImplementation(({ id }: { id: string }) => {
    const org = lookup.get(id);
    return Promise.resolve({ organization: org ? create(OrganizationSchema, org) : undefined });
  });
}

function mockOrganizationList(organizations: Array<{ id: string; name: string }>) {
  listOrganizations.mockResolvedValue({
    organizations: organizations.map((org) => create(OrganizationSchema, org)),
    nextPageToken: '',
  });
}

describe('OrganizationContext', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    userContext = {
      currentUser: null,
      clusterRole: null,
      identityId: 'identity-1',
      isClusterAdmin: false,
      status: 'ready',
      error: null,
      signOut: vi.fn(),
    };

    window.localStorage.clear();
    listMyMemberships.mockReset();
    listOrganizations.mockReset();
    getOrganization.mockReset();
  });

  it('migrates legacy selections into context mode storage', async () => {
    window.localStorage.setItem('console.selectedOrganization', 'org-2');

    mockMemberships([
      create(MembershipSchema, {
        id: 'membership-2',
        organizationId: 'org-2',
        identityId: 'identity-1',
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      }),
    ]);
    mockOrganizationLookup([
      { id: 'org-1', name: 'Org One' },
      { id: 'org-2', name: 'Org Two' },
    ]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('selected').textContent).toBe('org-2');
    });

    const storedMode = window.localStorage.getItem('console.contextMode');
    expect(storedMode).not.toBeNull();
    expect(JSON.parse(storedMode ?? '')).toMatchObject({ mode: 'organization', organizationId: 'org-2' });
    expect(window.localStorage.getItem('console.selectedOrganization')).toBeNull();
  });

  it('auto-selects the first visible organization alphabetically', async () => {
    mockMemberships([
      create(MembershipSchema, {
        id: 'membership-1',
        organizationId: 'org-1',
        identityId: 'identity-1',
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      }),
    ]);
    mockOrganizationLookup([
      { id: 'org-2', name: 'Zeta Org' },
      { id: 'org-1', name: 'Alpha Org' },
    ]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('selected').textContent).toBe('org-1');
    });
  });

  it('prefers persisted cluster mode for admins', async () => {
    window.localStorage.setItem('console.contextMode', JSON.stringify({ mode: 'cluster' }));
    userContext.isClusterAdmin = true;

    mockMemberships([
      create(MembershipSchema, {
        id: 'membership-1',
        organizationId: 'org-1',
        identityId: 'identity-1',
        role: MembershipRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      }),
    ]);
    mockOrganizationList([{ id: 'org-1', name: 'Org One' }]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('context-mode').textContent).toBe('cluster');
    });
  });

  it('falls back to cluster mode for admins without organizations', async () => {
    userContext.isClusterAdmin = true;

    mockMemberships([]);
    mockOrganizationList([]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('context-mode').textContent).toBe('cluster');
    });
  });

  it('exposes active member organizations for non-admin users', async () => {
    mockMemberships([
      create(MembershipSchema, {
        id: 'membership-1',
        organizationId: 'org-1',
        identityId: 'identity-1',
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      }),
      create(MembershipSchema, {
        id: 'membership-2',
        organizationId: 'org-2',
        identityId: 'identity-1',
        role: MembershipRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      }),
    ]);
    mockOrganizationLookup([
      { id: 'org-1', name: 'Org One' },
      { id: 'org-2', name: 'Org Two' },
    ]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('2');
    });
  });

  it('exposes all accessible organizations for cluster admins', async () => {
    userContext.isClusterAdmin = true;

    mockMemberships([]);
    mockOrganizationList([
      { id: 'org-1', name: 'Org One' },
      { id: 'org-2', name: 'Org Two' },
    ]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('2');
    });
  });

  it('tracks pending membership count', async () => {
    mockMemberships([], [
      create(MembershipSchema, {
        id: 'pending-1',
        organizationId: 'org-1',
        identityId: 'identity-1',
        role: MembershipRole.MEMBER,
        status: MembershipStatus.PENDING,
      }),
      create(MembershipSchema, {
        id: 'pending-2',
        organizationId: 'org-2',
        identityId: 'identity-1',
        role: MembershipRole.MEMBER,
        status: MembershipStatus.PENDING,
      }),
    ]);
    mockOrganizationLookup([]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('pending-count').textContent).toBe('2');
    });
  });

  it('reports console access when only pending memberships exist', async () => {
    mockMemberships([], [
      create(MembershipSchema, {
        id: 'pending-1',
        organizationId: 'org-1',
        identityId: 'identity-1',
        role: MembershipRole.MEMBER,
        status: MembershipStatus.PENDING,
      }),
    ]);
    mockOrganizationLookup([]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('has-console-access').textContent).toBe('true');
    });
  });

  it('reports console access for active members', async () => {
    mockMemberships([
      create(MembershipSchema, {
        id: 'membership-1',
        organizationId: 'org-1',
        identityId: 'identity-1',
        role: MembershipRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      }),
    ]);
    mockOrganizationLookup([{ id: 'org-1', name: 'Org One' }]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('has-console-access').textContent).toBe('true');
    });
  });

  it('exposes pending memberships', async () => {
    mockMemberships([], [
      create(MembershipSchema, {
        id: 'pending-1',
        organizationId: 'org-1',
        identityId: 'identity-1',
        role: MembershipRole.OWNER,
        status: MembershipStatus.PENDING,
      }),
      create(MembershipSchema, {
        id: 'pending-2',
        organizationId: 'org-2',
        identityId: 'identity-1',
        role: MembershipRole.MEMBER,
        status: MembershipStatus.PENDING,
      }),
    ]);
    mockOrganizationLookup([]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('pending-ids').textContent).toBe('pending-1,pending-2');
    });
  });
});
