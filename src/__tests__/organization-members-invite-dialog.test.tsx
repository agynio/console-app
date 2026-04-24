import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageTitleProvider } from '@/context/PageTitleContext';
import {
  MembershipRole,
  MembershipSchema,
  MembershipStatus,
} from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { UserDirectoryEntrySchema } from '@/gen/agynio/api/users/v1/users_pb';
import { OrganizationMembersTab } from '@/pages/OrganizationMembersTab';

const { listMembers, createMembership, updateMembershipRole, removeMembership } = vi.hoisted(() => ({
  listMembers: vi.fn(),
  createMembership: vi.fn(),
  updateMembershipRole: vi.fn(),
  removeMembership: vi.fn(),
}));

const { batchGetUsers, searchUsers } = vi.hoisted(() => ({
  batchGetUsers: vi.fn(),
  searchUsers: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  organizationsClient: {
    listMembers,
    createMembership,
    updateMembershipRole,
    removeMembership,
  },
  usersClient: {
    batchGetUsers,
    searchUsers,
  },
}));

function buildMembership({
  id,
  identityId,
  status,
}: {
  id: string;
  identityId: string;
  status: MembershipStatus;
}) {
  return create(MembershipSchema, {
    id,
    organizationId: 'org-1',
    identityId,
    role: MembershipRole.MEMBER,
    status,
  });
}

function buildDirectoryEntry({
  identityId,
  username,
  name,
}: {
  identityId: string;
  username: string;
  name: string;
}) {
  return create(UserDirectoryEntrySchema, {
    identityId,
    username,
    name,
    photoUrl: '',
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/organizations/org-1/members']}>
          <Routes>
            <Route path="/organizations/:id/members" element={<OrganizationMembersTab />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

describe('OrganizationMembersTab invite dialog', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listMembers.mockReset();
    createMembership.mockReset();
    updateMembershipRole.mockReset();
    removeMembership.mockReset();
    batchGetUsers.mockReset();
    searchUsers.mockReset();

    const activeMembership = buildMembership({
      id: 'membership-active',
      identityId: 'identity-active',
      status: MembershipStatus.ACTIVE,
    });
    const pendingMembership = buildMembership({
      id: 'membership-pending',
      identityId: 'identity-pending',
      status: MembershipStatus.PENDING,
    });

    listMembers.mockImplementation((request: { status?: MembershipStatus }) => {
      if (request?.status === MembershipStatus.PENDING) {
        return Promise.resolve({ memberships: [pendingMembership], nextPageToken: '' });
      }
      return Promise.resolve({ memberships: [activeMembership], nextPageToken: '' });
    });

    batchGetUsers.mockResolvedValue({ users: [] });
  });

  it('renders autocomplete results and disables existing members', async () => {
    searchUsers.mockResolvedValueOnce({
      users: [
        buildDirectoryEntry({
          identityId: 'identity-active',
          username: 'active-user',
          name: 'Active User',
        }),
        buildDirectoryEntry({
          identityId: 'identity-pending',
          username: 'pending-user',
          name: 'Pending User',
        }),
        buildDirectoryEntry({
          identityId: 'identity-new',
          username: 'new-user',
          name: 'New User',
        }),
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(listMembers).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByTestId('organization-members-invite'));

    const inviteButton = screen.getByTestId('organization-members-invite-submit') as HTMLButtonElement;
    expect(inviteButton.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('organization-members-invite-search'), {
      target: { value: 'new' },
    });

    await waitFor(() => {
      expect(searchUsers).toHaveBeenCalledWith({ prefix: 'new', limit: 10 });
    });

    const activeLabel = await screen.findByText('@active-user');
    const activeButton = activeLabel.closest('button') as HTMLButtonElement | null;
    expect(activeButton?.disabled).toBe(true);
    expect(screen.getByText('Already a member')).toBeTruthy();

    const pendingLabel = screen.getByText('@pending-user');
    const pendingButton = pendingLabel.closest('button') as HTMLButtonElement | null;
    expect(pendingButton?.disabled).toBe(true);
    expect(screen.getByText('Already invited')).toBeTruthy();

    const newLabel = screen.getByText('@new-user');
    const newButton = newLabel.closest('button') as HTMLButtonElement | null;
    expect(newButton?.disabled).toBe(false);

    if (newButton) {
      fireEvent.click(newButton);
    }

    await waitFor(() => {
      expect(inviteButton.disabled).toBe(false);
    });
  });
});
