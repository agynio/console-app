import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageTitleProvider } from '@/context/PageTitleContext';
import {
  AgentSchema,
  EntityMetaSchema,
  EnvironmentSchema,
  LLMMode,
} from '@/gen/agynio/api/agents/v1/agents_pb';
import { AgentConfigurationTab } from '@/pages/agent-detail/AgentConfigurationTab';

const { updateAgent, listEnvironments, listModels } = vi.hoisted(() => ({
  updateAgent: vi.fn(),
  listEnvironments: vi.fn(),
  listModels: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  agentsClient: { updateAgent, listEnvironments },
  llmClient: { listModels },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderTab(agent: ReturnType<typeof create<typeof AgentSchema>>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/organizations/org-1/agents/agent-1']}>
          <Routes>
            <Route
              path="/organizations/:id/agents/:agentId"
              element={<AgentConfigurationTab agent={agent} organizationId="org-1" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

function agentIn(environmentId: string, fields: { model?: string; modelName?: string } = {}) {
  return create(AgentSchema, {
    meta: create(EntityMetaSchema, { id: 'agent-1' }),
    name: 'builder',
    nickname: 'builder',
    environmentId,
    ...fields,
  });
}

async function openSelect(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
  return screen.findByRole('listbox');
}

// The environment's llm_mode decides which of the two model references is
// legal, and the server rejects the other outright.
describe('AgentConfigurationTab model by LLM mode', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(cleanup);

  beforeEach(() => {
    updateAgent.mockReset();
    listEnvironments.mockReset();
    listModels.mockReset();

    listModels.mockResolvedValue({
      models: [{ meta: { id: 'model-1' }, name: 'gpt-shaped' }],
      nextPageToken: '',
    });
    listEnvironments.mockResolvedValue({
      environments: [
        create(EnvironmentSchema, {
          meta: create(EntityMetaSchema, { id: 'env-1' }),
          name: 'sandbox-env',
          llmMode: LLMMode.LLM_MODE_PLATFORM,
        }),
        create(EnvironmentSchema, {
          meta: create(EntityMetaSchema, { id: 'env-native' }),
          name: 'native-env',
          llmMode: LLMMode.LLM_MODE_NATIVE,
        }),
      ],
      nextPageToken: '',
    });
    updateAgent.mockResolvedValue({ agent: { meta: { id: 'agent-1' } } });
  });

  it('reads back the vendor name a native agent holds', async () => {
    renderTab(agentIn('env-native', { modelName: 'claude-sonnet-4-5' }));

    expect(screen.getByTestId('agent-configuration-model-value').textContent).toBe(
      'claude-sonnet-4-5',
    );
  });

  it('edits a native agent through model_name, never model', async () => {
    renderTab(agentIn('env-native', { modelName: 'claude-sonnet-4-5' }));

    fireEvent.click(screen.getByTestId('agent-configuration-edit'));
    await waitFor(() => expect(listEnvironments).toHaveBeenCalled());

    const input = await screen.findByTestId('agent-configuration-model-name');
    expect((input as HTMLInputElement).value).toBe('claude-sonnet-4-5');
    expect(screen.queryByTestId('agent-configuration-model')).toBeNull();

    fireEvent.change(input, { target: { value: 'claude-opus-4-1' } });
    fireEvent.click(screen.getByTestId('agent-configuration-save'));

    await waitFor(() => expect(updateAgent).toHaveBeenCalled());
    expect(updateAgent.mock.calls[0][0]).toMatchObject({
      id: 'agent-1',
      model: '',
      modelName: 'claude-opus-4-1',
    });
  });

  it('edits a platform agent through the catalog, never model_name', async () => {
    renderTab(agentIn('env-1', { model: 'model-1' }));

    fireEvent.click(screen.getByTestId('agent-configuration-edit'));
    await waitFor(() => expect(listEnvironments).toHaveBeenCalled());

    expect(screen.queryByTestId('agent-configuration-model-name')).toBeNull();
    fireEvent.click(screen.getByTestId('agent-configuration-save'));

    await waitFor(() => expect(updateAgent).toHaveBeenCalled());
    expect(updateAgent.mock.calls[0][0]).toMatchObject({ model: 'model-1', modelName: '' });
  });

  // Repointing at the other mode invalidates a reference the caller never
  // mentioned, so the field starts over rather than carrying it across.
  it('drops the catalog model when repointed at a native environment', async () => {
    renderTab(agentIn('env-1', { model: 'model-1' }));

    fireEvent.click(screen.getByTestId('agent-configuration-edit'));
    await waitFor(() => expect(listEnvironments).toHaveBeenCalled());

    const environments = await openSelect('agent-configuration-environment');
    fireEvent.click(await within(environments).findByText('native-env'));

    const input = await screen.findByTestId('agent-configuration-model-name');
    expect((input as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByTestId('agent-configuration-save'));
    await waitFor(() => expect(updateAgent).toHaveBeenCalled());
    expect(updateAgent.mock.calls[0][0]).toMatchObject({
      environmentId: 'env-native',
      model: '',
      modelName: '',
    });
  });
});
