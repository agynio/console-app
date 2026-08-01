import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageTitleProvider } from '@/context/PageTitleContext';
import {
  AgentDefaultThread,
  AgentFinalMessage,
  AgentSchema,
  EntityMetaSchema,
  EnvironmentSchema,
} from '@/gen/agynio/api/agents/v1/agents_pb';
import { AgentCreatePage } from '@/pages/AgentCreatePage';
import { AgentConfigurationTab } from '@/pages/agent-detail/AgentConfigurationTab';

const { createAgent, updateAgent, listEnvironments, listModels } = vi.hoisted(() => ({
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  listEnvironments: vi.fn(),
  listModels: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  agentsClient: { createAgent, updateAgent, listEnvironments },
  llmClient: { listModels },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function withProviders(children: React.ReactNode, path: string, route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={route} element={children} />
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

describe('agent default thread and final message', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(cleanup);

  beforeEach(() => {
    createAgent.mockReset();
    updateAgent.mockReset();
    listEnvironments.mockReset();
    listModels.mockReset();
    listModels.mockResolvedValue({ models: [], nextPageToken: '' });
    listEnvironments.mockResolvedValue({
      environments: [
        create(EnvironmentSchema, {
          meta: create(EntityMetaSchema, { id: 'env-1' }),
          name: 'sandbox-env',
        }),
      ],
      nextPageToken: '',
    });
    createAgent.mockResolvedValue({ agent: { meta: { id: 'agent-1' }, name: 'builder' } });
    updateAgent.mockResolvedValue({ agent: { meta: { id: 'agent-1' } } });
  });

  // The server defaults these when unset, and the form has to agree with it or
  // creating an agent through the console would silently change its behaviour.
  it('creates with ORIGIN and DISCARD unless told otherwise', async () => {
    withProviders(<AgentCreatePage />, '/organizations/org-1/agents/new', '/organizations/:id/agents/new');

    await waitFor(() => expect(listEnvironments).toHaveBeenCalled());
    const environments = await openSelect('agent-create-environment');
    fireEvent.click(await within(environments).findByText('sandbox-env'));
    fireEvent.change(screen.getByTestId('agent-create-name'), { target: { value: 'builder' } });
    fireEvent.click(screen.getByTestId('agent-create-submit'));

    await waitFor(() => expect(createAgent).toHaveBeenCalled());
    expect(createAgent.mock.calls[0][0]).toMatchObject({
      defaultThread: AgentDefaultThread.ORIGIN,
      finalMessage: AgentFinalMessage.DISCARD,
    });
  });

  it('submits the chosen policies', async () => {
    withProviders(<AgentCreatePage />, '/organizations/org-1/agents/new', '/organizations/:id/agents/new');

    await waitFor(() => expect(listEnvironments).toHaveBeenCalled());
    const environments = await openSelect('agent-create-environment');
    fireEvent.click(await within(environments).findByText('sandbox-env'));

    const threads = await openSelect('agent-create-default-thread');
    fireEvent.click(await within(threads).findByText('None'));
    const messages = await openSelect('agent-create-final-message');
    fireEvent.click(await within(messages).findByText('Post to default thread'));

    fireEvent.change(screen.getByTestId('agent-create-name'), { target: { value: 'builder' } });
    fireEvent.click(screen.getByTestId('agent-create-submit'));

    await waitFor(() => expect(createAgent).toHaveBeenCalled());
    expect(createAgent.mock.calls[0][0]).toMatchObject({
      defaultThread: AgentDefaultThread.NONE,
      finalMessage: AgentFinalMessage.DEFAULT_THREAD,
    });
  });

  it('shows an agent its stored policies and updates them', async () => {
    const agent = create(AgentSchema, {
      meta: create(EntityMetaSchema, { id: 'agent-1' }),
      name: 'builder',
      nickname: 'builder',
      environmentId: 'env-1',
      defaultThread: AgentDefaultThread.NONE,
      finalMessage: AgentFinalMessage.DEFAULT_THREAD,
    });
    withProviders(
      <AgentConfigurationTab agent={agent} organizationId="org-1" />,
      '/organizations/org-1/agents/agent-1',
      '/organizations/:id/agents/:agentId',
    );

    expect(screen.getByTestId('agent-configuration-default-thread-value').textContent).toBe('None');
    expect(screen.getByTestId('agent-configuration-final-message-value').textContent).toBe(
      'Post to default thread',
    );

    fireEvent.click(screen.getByTestId('agent-configuration-edit'));
    await waitFor(() => expect(listEnvironments).toHaveBeenCalled());

    const threads = await openSelect('agent-configuration-default-thread');
    fireEvent.click(await within(threads).findByText('Originating thread'));
    fireEvent.click(screen.getByTestId('agent-configuration-save'));

    await waitFor(() => expect(updateAgent).toHaveBeenCalled());
    expect(updateAgent.mock.calls[0][0]).toMatchObject({
      id: 'agent-1',
      defaultThread: AgentDefaultThread.ORIGIN,
      finalMessage: AgentFinalMessage.DEFAULT_THREAD,
    });
  });

  // An agent created before these fields exist reads back UNSPECIFIED, and the
  // dialog has to open on what the server would apply rather than on nothing.
  it('opens an unset agent on the server defaults', async () => {
    const agent = create(AgentSchema, {
      meta: create(EntityMetaSchema, { id: 'agent-1' }),
      name: 'builder',
      nickname: 'builder',
      environmentId: 'env-1',
    });
    withProviders(
      <AgentConfigurationTab agent={agent} organizationId="org-1" />,
      '/organizations/org-1/agents/agent-1',
      '/organizations/:id/agents/:agentId',
    );

    fireEvent.click(screen.getByTestId('agent-configuration-edit'));
    await waitFor(() => expect(listEnvironments).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('agent-configuration-save'));

    await waitFor(() => expect(updateAgent).toHaveBeenCalled());
    expect(updateAgent.mock.calls[0][0]).toMatchObject({
      defaultThread: AgentDefaultThread.ORIGIN,
      finalMessage: AgentFinalMessage.DISCARD,
    });
  });
});
