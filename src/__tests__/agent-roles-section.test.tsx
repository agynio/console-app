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
      assignments: [buildAssignment('identity-owner', AgentRole.OWNER)],
    });
    listMembers.mockResolvedValue({
      memberships: [buildMembership('identity-owner'), buildMembership('identity-new')],
    });
    batchGetUsers.mockResolvedValue({
      users: [
        buildUser('identity-owner', 'owner-user', 'Owner User', 'owner@example.com'),
        buildUser('identity-new', 'new-user', 'New User', 'new@example.com'),
      ],
    });
    setAgentRole.mockResolvedValue({ assignment: buildAssignment('identity-new', AgentRole.PARTICIPANT) });
    removeAgentRole.mockResolvedValue({});
  });

  it('makes specific-user private sharing discoverable', async () => {
    renderSection(AgentAvailability.PRIVATE);

    expect(screen.getByText('Share with specific users')).toBeTruthy();
    expect(screen.getByText('Private sharing active')).toBeTruthy();
    expect(screen.getByText(/Private agents are shared by assigning owner, maintainer, or participant roles/i)).toBeTruthy();

    expect(await screen.findByText('@owner-user')).toBeTruthy();
    expect(screen.getByText('identity-owner')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
  });

  it('explains the availability interaction before the agent is private', async () => {
    renderSection(AgentAvailability.INTERNAL);

    expect(screen.getByText('Share with specific users')).toBeTruthy();
    expect(screen.getByText('Available when Private')).toBeTruthy();
    expect(screen.getByTestId('agent-roles-private-hint').textContent).toContain('set Availability to Private');
    expect(await screen.findByText('@owner-user')).toBeTruthy();
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

  it('changes an existing role assignment', async () => {
    renderSection();

    fireEvent.click(await screen.findByTestId('agent-roles-change'));
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

    fireEvent.click(await screen.findByTestId('agent-roles-remove'));

    await waitFor(() => {
      expect(removeAgentRole).toHaveBeenCalledWith({ agentId: 'agent-1', identityId: 'identity-owner' });
    });
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
