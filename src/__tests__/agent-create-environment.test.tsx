import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageTitleProvider } from '@/context/PageTitleContext';
import { EntityMetaSchema, EnvironmentSchema } from '@/gen/agynio/api/agents/v1/agents_pb';
import { AgentCreatePage } from '@/pages/AgentCreatePage';

const { createAgent, listEnvironments } = vi.hoisted(() => ({
  createAgent: vi.fn(),
  listEnvironments: vi.fn(),
}));

const { listModels } = vi.hoisted(() => ({ listModels: vi.fn() }));

vi.mock('@/api/client', () => ({
  agentsClient: { createAgent, listEnvironments },
  llmClient: { listModels },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderCreatePage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/organizations/org-1/agents/new']}>
          <Routes>
            <Route path="/organizations/:id/agents/new" element={<AgentCreatePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

async function openSelect(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
  return screen.findByRole('listbox');
}

describe('AgentCreatePage environment', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    createAgent.mockReset();
    listEnvironments.mockReset();
    listModels.mockReset();

    listModels.mockResolvedValue({ models: [], nextPageToken: '' });
    listEnvironments.mockResolvedValue({
      environments: [
        create(EnvironmentSchema, {
          meta: create(EntityMetaSchema, { id: 'env-1' }),
          name: 'sandbox-env',
          image: 'ghcr.io/agynio/sandbox:latest',
        }),
      ],
      nextPageToken: '',
    });
    createAgent.mockResolvedValue({ agent: { meta: { id: 'agent-1' }, name: 'builder' } });
  });

  it("offers the organization's environments and submits the chosen one", async () => {
    renderCreatePage();

    // The options only exist once listEnvironments resolves.
    await waitFor(() => expect(listEnvironments).toHaveBeenCalled());
    const listbox = await openSelect('agent-create-environment');
    fireEvent.click(await within(listbox).findByText('sandbox-env'));

    fireEvent.change(screen.getByTestId('agent-create-name'), { target: { value: 'builder' } });
    fireEvent.click(screen.getByTestId('agent-create-submit'));

    await waitFor(() => {
      expect(createAgent).toHaveBeenCalled();
    });
    expect(createAgent.mock.calls[0][0]).toMatchObject({
      organizationId: 'org-1',
      environmentId: 'env-1',
    });
  });

  // Image and compute come from the environment, so the request must not carry
  // the deprecated inline copies.
  it('sends no inline image or resources', async () => {
    renderCreatePage();

    await waitFor(() => expect(listEnvironments).toHaveBeenCalled());
    const listbox = await openSelect('agent-create-environment');
    fireEvent.click(await within(listbox).findByText('sandbox-env'));

    fireEvent.change(screen.getByTestId('agent-create-name'), { target: { value: 'builder' } });
    fireEvent.click(screen.getByTestId('agent-create-submit'));

    await waitFor(() => expect(createAgent).toHaveBeenCalled());
    expect(createAgent.mock.calls[0][0]).not.toHaveProperty('image');
    expect(createAgent.mock.calls[0][0]).not.toHaveProperty('resources');
  });

  // Every image an agent runs is a catalog entry named by its environment, so
  // the form offers no image field of its own.
  it('has no image or compute resources inputs', async () => {
    renderCreatePage();

    await waitFor(() => expect(listEnvironments).toHaveBeenCalled());
    expect(screen.queryByTestId('agent-create-image')).toBeNull();
    expect(screen.queryByTestId('agent-create-resources')).toBeNull();
    expect(screen.queryByTestId('agent-create-init-image')).toBeNull();
  });

  // An agent with no environment resolves to no flavor and no runner, so the
  // form refuses rather than letting the server accept the deprecated shape.
  it('blocks submit when no environment is chosen', async () => {
    renderCreatePage();

    await waitFor(() => expect(listEnvironments).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId('agent-create-name'), { target: { value: 'builder' } });
    fireEvent.click(screen.getByTestId('agent-create-submit'));

    expect(await screen.findByTestId('agent-create-environment-error')).toBeTruthy();
    expect(createAgent).not.toHaveBeenCalled();
  });

  it('points at environment creation when the organization has none', async () => {
    listEnvironments.mockResolvedValue({ environments: [], nextPageToken: '' });
    renderCreatePage();

    const empty = await screen.findByTestId('agent-create-environment-empty');
    expect(empty.textContent).toContain('No environments in this organization.');
  });
});
