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

const { listMyMemberships, listAccessibleOrganizations } = vi.hoisted(() => ({
  listMyMemberships: vi.fn(),
  listAccessibleOrganizations: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  organizationsClient: {
    listMyMemberships,
    listAccessibleOrganizations,
  },
}));

let userContext: UserContextValue;

vi.mock('@/context/UserContext', () => ({
  useUserContext: () => userContext,
}));

function ContextProbe() {
  const { selectedOrganization, organizations } = useOrganizationContext();
  return (
    <div>
      <div data-testid="selected">{selectedOrganization?.id ?? 'none'}</div>
      <div data-testid="count">{organizations.length}</div>
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
    listAccessibleOrganizations.mockReset();
  });

  it('persists and restores the selected organization', async () => {
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

    listAccessibleOrganizations.mockResolvedValue({
      organizations: [
        create(OrganizationSchema, { id: 'org-1', name: 'Org One' }),
        create(OrganizationSchema, { id: 'org-2', name: 'Org Two' }),
      ],
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('selected').textContent).toBe('org-2');
    });
  });

  it('auto-selects the first visible organization when none is stored', async () => {
    mockMemberships([
      create(MembershipSchema, {
        id: 'membership-1',
        organizationId: 'org-1',
        identityId: 'identity-1',
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      }),
    ]);

    listAccessibleOrganizations.mockResolvedValue({
      organizations: [
        create(OrganizationSchema, { id: 'org-1', name: 'Org One' }),
        create(OrganizationSchema, { id: 'org-2', name: 'Org Two' }),
      ],
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('selected').textContent).toBe('org-1');
    });
  });

  it('filters visible organizations for non-admin users', async () => {
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

    listAccessibleOrganizations.mockResolvedValue({
      organizations: [
        create(OrganizationSchema, { id: 'org-1', name: 'Org One' }),
        create(OrganizationSchema, { id: 'org-2', name: 'Org Two' }),
      ],
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('1');
    });
  });

  it('exposes all accessible organizations for cluster admins', async () => {
    userContext.isClusterAdmin = true;

    mockMemberships([]);
    listAccessibleOrganizations.mockResolvedValue({
      organizations: [
        create(OrganizationSchema, { id: 'org-1', name: 'Org One' }),
        create(OrganizationSchema, { id: 'org-2', name: 'Org Two' }),
      ],
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('2');
    });
  });
});
