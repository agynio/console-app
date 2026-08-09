import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PageTitleProvider } from '@/context/PageTitleContext';
import { useCreateOrganization } from '@/hooks/useCreateOrganization';
import { OrganizationOverviewTab } from '@/pages/OrganizationOverviewTab';

const mocks = vi.hoisted(() => ({
  createOrganization: vi.fn(),
  listMembers: vi.fn(),
  listSecretProviders: vi.fn(),
  listSecrets: vi.fn(),
  listRunners: vi.fn(),
  listWorkloads: vi.fn(),
  listAgents: vi.fn(),
  listSandboxes: vi.fn(),
  listInstallations: vi.fn(),
  listOrganizationThreads: vi.fn(),
  getMessages: vi.fn(),
  queryUsage: vi.fn(),
}));

const organizations = vi.hoisted(() => ({ current: [] as { id: string; name: string }[] }));

vi.mock('@/api/client', () => ({
  organizationsClient: { createOrganization: mocks.createOrganization, listMembers: mocks.listMembers },
  secretsClient: { listSecretProviders: mocks.listSecretProviders, listSecrets: mocks.listSecrets },
  runnersClient: { listRunners: mocks.listRunners, listWorkloads: mocks.listWorkloads },
  agentsClient: { listAgents: mocks.listAgents, listSandboxes: mocks.listSandboxes },
  appsClient: { listInstallations: mocks.listInstallations },
  threadsClient: {
    listOrganizationThreads: mocks.listOrganizationThreads,
    getMessages: mocks.getMessages,
  },
  meteringClient: { queryUsage: mocks.queryUsage },
}));

vi.mock('@/context/OrganizationContext', () => ({
  useOrganizationContext: () => ({ organizations: organizations.current }),
}));

vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => {} }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/** Drives the hook the organization creation dialog submits through. */
function CreateOrganizationHarness() {
  const { handleSubmit, handleNameChange, organizationName } = useCreateOrganization();
  return (
    <>
      <input
        value={organizationName}
        onChange={(event) => handleNameChange(event.target.value)}
        data-testid="name"
      />
      <button type="button" onClick={handleSubmit} data-testid="create">
        create
      </button>
      <LocationProbe />
    </>
  );
}

function renderCreateOrganization() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <CreateOrganizationHarness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderOverview() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/organizations/org-1']}>
          <Routes>
            <Route path="/organizations/:id" element={<OrganizationOverviewTab />} />
            <Route path="/organizations/:id/setup" element={<div>setup wizard</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

describe('setup wizard entry points', () => {
  afterEach(cleanup);

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    organizations.current = [];
    window.localStorage.clear();

    mocks.createOrganization.mockResolvedValue({ organization: { id: 'org-9' } });
    mocks.listMembers.mockResolvedValue({ memberships: [] });
    mocks.listSecretProviders.mockResolvedValue({ secretProviders: [] });
    mocks.listSecrets.mockResolvedValue({ secrets: [] });
    mocks.listRunners.mockResolvedValue({ runners: [] });
    mocks.listWorkloads.mockResolvedValue({ workloads: [] });
    mocks.listAgents.mockResolvedValue({ agents: [] });
    mocks.listSandboxes.mockResolvedValue({ sandboxes: [] });
    mocks.listInstallations.mockResolvedValue({ installations: [] });
    mocks.listOrganizationThreads.mockResolvedValue({ threads: [] });
    mocks.getMessages.mockResolvedValue({ messages: [] });
    mocks.queryUsage.mockResolvedValue({ buckets: [] });
  });

  it('starts setup on the first organization a user creates', async () => {
    renderCreateOrganization();
    fireEvent.change(screen.getByTestId('name'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByTestId('create'));

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/organizations/org-9/setup'),
    );
  });

  it('does not start setup on the second one', async () => {
    organizations.current = [{ id: 'org-1', name: 'First' }];
    renderCreateOrganization();
    fireEvent.change(screen.getByTestId('name'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByTestId('create'));

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/organizations/org-9'),
    );
  });

  it('opens setup itself on a blank organization', async () => {
    renderOverview();

    await screen.findByText('setup wizard');
    // The counter grid is never shown: it would be a page of zeroes.
    expect(screen.queryByTestId('organization-overview-summary')).toBeNull();
  });

  it('shows the ordinary Overview once setup has been skipped', async () => {
    window.localStorage.setItem('console.setupSkipped', JSON.stringify(['org-1']));
    renderOverview();

    await screen.findByTestId('organization-overview-summary');
    expect(screen.queryByText('setup wizard')).toBeNull();
  });

  it('returns the counters once an agent exists', async () => {
    mocks.listAgents.mockResolvedValue({ agents: [{ meta: { id: 'agent-1' }, name: 'Assistant' }] });
    renderOverview();

    await screen.findByTestId('organization-overview-summary');
    expect(screen.queryByTestId('organization-overview-setup-prompt')).toBeNull();
  });

  it('returns the counters once a sandbox exists', async () => {
    mocks.listSandboxes.mockResolvedValue({ sandboxes: [{ meta: { id: 'sbx-1' }, name: 'sandbox' }] });
    renderOverview();

    await screen.findByTestId('organization-overview-summary');
    expect(screen.queryByTestId('organization-overview-setup-prompt')).toBeNull();
  });
});
