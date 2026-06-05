import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Code, ConnectError } from '@connectrpc/connect';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AgentAvailability, AgentRole, AgentRoleAssignmentSchema } from '@/gen/agynio/api/agents/v1/agents_pb';
import {
  MembershipRole,
  MembershipSchema,
  MembershipStatus,
} from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { EntityMetaSchema, UserSchema } from '@/gen/agynio/api/users/v1/users_pb';
import { AgentRolesSection } from '@/pages/agent-detail/AgentRolesSection';

const { listAgentRoles, setAgentRole, removeAgentRole } = vi.hoisted(() => ({
  listAgentRoles: vi.fn(),
  setAgentRole: vi.fn(),
  removeAgentRole: vi.fn(),
}));

const { listMembers } = vi.hoisted(() => ({
  listMembers: vi.fn(),
}));

const { batchGetUsers } = vi.hoisted(() => ({
  batchGetUsers: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  agentsClient: {
    listAgentRoles,
    setAgentRole,
    removeAgentRole,
  },
  organizationsClient: {
    listMembers,
  },
  usersClient: {
    batchGetUsers,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderSection(availability = AgentAvailability.PRIVATE) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentRolesSection agentId="agent-1" organizationId="org-1" availability={availability} />
    </QueryClientProvider>,
  );
}

function buildAssignment(identityId: string, role: AgentRole) {
  return create(AgentRoleAssignmentSchema, {
    agentId: 'agent-1',
    identityId,
    role,
  });
}

function buildMembership(identityId: string) {
  return create(MembershipSchema, {
    id: `membership-${identityId}`,
    organizationId: 'org-1',
    identityId,
    role: MembershipRole.MEMBER,
    status: MembershipStatus.ACTIVE,
  });
}

function buildUser(identityId: string, username: string, name: string, email: string) {
  return create(UserSchema, {
    meta: create(EntityMetaSchema, { id: identityId }),
    username,
    name,
    email,
  });
}

function mockMembersPages(pages: Array<{ memberships: ReturnType<typeof buildMembership>[]; nextPageToken?: string }>) {
  listMembers.mockImplementation(({ pageToken }: { pageToken: string }) => {
    const pageIndex = pageToken ? Number(pageToken) : 0;
    const page = pages[pageIndex];
    return Promise.resolve({
      memberships: page.memberships,
      nextPageToken: page.nextPageToken ?? '',
    });
  });
}

async function openSelect(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
  return screen.findByRole('listbox');
}

describe('AgentRolesSection', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listAgentRoles.mockReset();
    setAgentRole.mockReset();
    removeAgentRole.mockReset();
    listMembers.mockReset();
    batchGetUsers.mockReset();

    listAgentRoles.mockResolvedValue({
      assignments: [
        buildAssignment('identity-owner', AgentRole.OWNER),
        buildAssignment('identity-maintainer', AgentRole.MAINTAINER),
      ],
    });
    mockMembersPages([
      { memberships: [buildMembership('identity-owner'), buildMembership('identity-maintainer'), buildMembership('identity-new')] },
    ]);
    batchGetUsers.mockResolvedValue({
      users: [
        buildUser('identity-owner', 'owner-user', 'Owner User', 'owner@example.com'),
        buildUser('identity-maintainer', 'maintainer-user', 'Maintainer User', 'maintainer@example.com'),
        buildUser('identity-new', 'new-user', 'New User', 'new@example.com'),
      ],
    });
    setAgentRole.mockResolvedValue({ assignment: buildAssignment('identity-new', AgentRole.PARTICIPANT) });
    removeAgentRole.mockResolvedValue({});
  });

  it('makes specific-user private sharing discoverable', async () => {
    renderSection(AgentAvailability.PRIVATE);

    expect(screen.getByTestId('agent-roles-heading').textContent).toContain('Roles');
    expect(screen.getByText('Private sharing active')).toBeTruthy();
    expect(screen.getByText(/Private agents are shared by assigning owner, maintainer, or participant roles/i)).toBeTruthy();

    expect(await screen.findByText('@owner-user')).toBeTruthy();
    expect(screen.getByText('identity-owner')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByText('@maintainer-user')).toBeTruthy();
  });

  it('explains the availability interaction before the agent is private', async () => {
    renderSection(AgentAvailability.INTERNAL);

    expect(screen.getByTestId('agent-roles-heading').textContent).toContain('Roles');
    expect(screen.getByText('Available when Private')).toBeTruthy();
    expect(screen.getByTestId('agent-roles-private-hint').textContent).toContain('set Availability to Private');
    expect(await screen.findByText('@owner-user')).toBeTruthy();
  });

  it('keeps the heading outside the roles table card', async () => {
    renderSection();

    const heading = screen.getByTestId('agent-roles-heading');
    expect(heading).toBeTruthy();
    expect(screen.getByTestId('agent-roles-add')).toBeTruthy();
    expect(await screen.findByTestId('agent-roles-table')).toBeTruthy();
    expect(heading.closest('[data-testid="agent-roles-table"]')).toBeNull();
    expect(heading.closest('[data-testid="agent-roles-empty"]')).toBeNull();
  });

  it('keeps the heading outside the roles empty-state card', async () => {
    listAgentRoles.mockResolvedValueOnce({ assignments: [] });
    renderSection();

    const heading = screen.getByTestId('agent-roles-heading');
    expect(heading).toBeTruthy();
    expect(await screen.findByTestId('agent-roles-empty')).toBeTruthy();
    expect(heading.closest('[data-testid="agent-roles-table"]')).toBeNull();
    expect(heading.closest('[data-testid="agent-roles-empty"]')).toBeNull();
  });

  it('filters role assignments by shared user details', async () => {
    renderSection();

    expect(await screen.findByText('@owner-user')).toBeTruthy();
    expect(screen.getByText('@maintainer-user')).toBeTruthy();

    fireEvent.change(screen.getByTestId('agent-roles-search'), { target: { value: 'maintainer' } });

    expect(screen.queryByText('@owner-user')).toBeNull();
    expect(screen.getByText('@maintainer-user')).toBeTruthy();

    fireEvent.change(screen.getByTestId('agent-roles-search'), { target: { value: 'participant' } });

    expect((await screen.findByTestId('agent-roles-no-results')).textContent).toBe('No results found.');
  });

  it('adds a role assignment for an organization member', async () => {
    renderSection();

    fireEvent.click(screen.getByTestId('agent-roles-add'));
    expect(await screen.findByTestId('agent-roles-dialog')).toBeTruthy();

    const memberListbox = await openSelect('agent-roles-member');
    fireEvent.click(within(memberListbox).getByText('identity-new'));

    const roleListbox = await openSelect('agent-roles-role');
    fireEvent.click(within(roleListbox).getByText('Participant'));

    fireEvent.click(screen.getByTestId('agent-roles-save'));

    await waitFor(() => {
      expect(setAgentRole).toHaveBeenCalledWith({
        agentId: 'agent-1',
        identityId: 'identity-new',
        role: AgentRole.PARTICIPANT,
      });
    });
  });

  it('loads every page of organization members for the picker', async () => {
    mockMembersPages([
      { memberships: [buildMembership('identity-owner')], nextPageToken: '1' },
      { memberships: [buildMembership('identity-later')] },
    ]);
    batchGetUsers.mockResolvedValue({
      users: [
        buildUser('identity-owner', 'owner-user', 'Owner User', 'owner@example.com'),
        buildUser('identity-later', 'later-user', 'Later User', 'later@example.com'),
      ],
    });
    setAgentRole.mockResolvedValue({ assignment: buildAssignment('identity-later', AgentRole.PARTICIPANT) });

    renderSection();

    fireEvent.click(screen.getByTestId('agent-roles-add'));
    expect(await screen.findByTestId('agent-roles-dialog')).toBeTruthy();

    await waitFor(() => {
      expect(listMembers).toHaveBeenCalledTimes(2);
    });
    expect(listMembers).toHaveBeenNthCalledWith(1, {
      organizationId: 'org-1',
      status: MembershipStatus.ACTIVE,
      pageSize: 200,
      pageToken: '',
    });
    expect(listMembers).toHaveBeenNthCalledWith(2, {
      organizationId: 'org-1',
      status: MembershipStatus.ACTIVE,
      pageSize: 200,
      pageToken: '1',
    });

    const memberListbox = await openSelect('agent-roles-member');
    fireEvent.click(within(memberListbox).getByText('@later-user'));
    fireEvent.click(screen.getByTestId('agent-roles-save'));

    await waitFor(() => {
      expect(setAgentRole).toHaveBeenCalledWith({
        agentId: 'agent-1',
        identityId: 'identity-later',
        role: AgentRole.PARTICIPANT,
      });
    });
  });

  it('changes an existing role assignment', async () => {
    renderSection();

    fireEvent.click((await screen.findAllByTestId('agent-roles-change'))[0]);
    expect(await screen.findByTestId('agent-roles-dialog')).toBeTruthy();

    const roleListbox = await openSelect('agent-roles-role');
    fireEvent.click(within(roleListbox).getByText('Maintainer'));
    fireEvent.click(screen.getByTestId('agent-roles-save'));

    await waitFor(() => {
      expect(setAgentRole).toHaveBeenCalledWith({
        agentId: 'agent-1',
        identityId: 'identity-owner',
        role: AgentRole.MAINTAINER,
      });
    });
  });

  it('removes a role assignment', async () => {
    renderSection();

    fireEvent.click((await screen.findAllByTestId('agent-roles-remove'))[0]);

    await waitFor(() => {
      expect(removeAgentRole).toHaveBeenCalledWith({ agentId: 'agent-1', identityId: 'identity-owner' });
    });
  });

  it('shows backend wiring guidance when the gateway role route is missing', async () => {
    listAgentRoles.mockRejectedValueOnce(new ConnectError('HTTP 404', Code.Unimplemented));
    renderSection();

    expect((await screen.findByTestId('agent-roles-load-error')).textContent).toContain(
      '/api/agynio.api.gateway.v1.AgentsGateway/*',
    );
    expect(screen.getByTestId('agent-roles-load-error').textContent).toContain('ListAgentRoles');
  });

  it('preserves legitimate service not-found errors', async () => {
    listAgentRoles.mockRejectedValueOnce(new ConnectError('agent not found', Code.NotFound));
    renderSection();

    expect((await screen.findByTestId('agent-roles-load-error')).textContent).toBe('[not_found] agent not found');
  });

  it('does not treat Connect not-found codes as missing gateway routes', async () => {
    listAgentRoles.mockRejectedValueOnce(new ConnectError('HTTP 404', Code.NotFound));
    renderSection();

    expect((await screen.findByTestId('agent-roles-load-error')).textContent).toBe('[not_found] HTTP 404');
  });

  it('shows a permission error when role management is denied', async () => {
    setAgentRole.mockRejectedValueOnce(new ConnectError('permission denied', Code.PermissionDenied));
    renderSection();

    fireEvent.click(screen.getByTestId('agent-roles-add'));
    expect(await screen.findByTestId('agent-roles-dialog')).toBeTruthy();

    const memberListbox = await openSelect('agent-roles-member');
    fireEvent.click(within(memberListbox).getByText('identity-new'));
    fireEvent.click(screen.getByTestId('agent-roles-save'));

    expect((await screen.findByTestId('agent-roles-error')).textContent).toBe('You do not have permission to manage agent sharing roles.');
  });
});
