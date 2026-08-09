import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ConnectError, Code } from '@connectrpc/connect';
import { PageTitleProvider } from '@/context/PageTitleContext';
import { SetupOverlayProvider } from '@/context/SetupOverlayContext';
import {
  AgentSchema,
  EntityMetaSchema,
  EnvironmentAvailability,
  EnvironmentSchema,
  LLMMode,
  SandboxSchema,
} from '@/gen/agynio/api/agents/v1/agents_pb';
import {
  EntityMetaSchema as ImageEntityMetaSchema,
  ImageSchema,
  ImageType,
  ImageVersionSchema,
} from '@/gen/agynio/api/images/v1/images_pb';
import {
  EntityMetaSchema as RunnerEntityMetaSchema,
  RunnerSchema,
} from '@/gen/agynio/api/runners/v1/runners_pb';
import { Protocol, Vendor } from '@/gen/agynio/api/llm/v1/llm_pb';
import { SetupWizardPage } from '@/pages/setup/SetupWizardPage';
import { SetupFinish } from '@/pages/setup/SetupFinish';
import { setupDestination } from '@/pages/setup/destination';
import { useSetupOverlay } from '@/context/SetupOverlayContext';
import type * as productsModule from '@/lib/products';

const agents = vi.hoisted(() => ({
  listEnvironments: vi.fn(),
  createEnvironment: vi.fn(),
  updateEnvironment: vi.fn(),
  createVolume: vi.fn(),
  createMcp: vi.fn(),
  listAgents: vi.fn(),
  createAgent: vi.fn(),
  createSandbox: vi.fn(),
  ensureSandboxRunning: vi.fn(),
}));

const llm = vi.hoisted(() => ({
  createLLMProvider: vi.fn(),
  updateLLMProvider: vi.fn(),
  createModel: vi.fn(),
  testModel: vi.fn(),
  createSubscription: vi.fn(),
  createSubscriptionAttachment: vi.fn(),
}));

const other = vi.hoisted(() => ({
  listRunners: vi.fn(),
  listImages: vi.fn(),
  refreshImage: vi.fn(),
  createSecret: vi.fn(),
  createChat: vi.fn(),
}));

// jsdom runs on localhost, which has no sibling host to derive — without this
// the overlay has no destination and renders no pointer.
vi.mock('@/lib/products', async (importOriginal) => {
  const actual = await importOriginal<typeof productsModule>();
  return { ...actual, productUrl: () => 'https://chat.example.test' };
});

vi.mock('@/api/client', () => ({
  agentsClient: agents,
  llmClient: llm,
  runnersClient: { listRunners: other.listRunners },
  imagesClient: { listImages: other.listImages, refreshImage: other.refreshImage },
  secretsClient: { createSecret: other.createSecret },
  chatClient: { createChat: other.createChat },
}));

/** Stands in for the layout, which is what hosts the overlay in the real app. */
function FinishHost() {
  const { finish, setFinish } = useSetupOverlay();
  if (!finish) return null;
  return (
    <SetupFinish
      state={finish.state}
      target={setupDestination(finish.state, finish.organizationId)}
      onDismiss={() => setFinish(null)}
    />
  );
}

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <SetupOverlayProvider>
          <MemoryRouter initialEntries={['/organizations/org-1/setup']}>
            <Routes>
              <Route path="/organizations/:id/setup" element={<SetupWizardPage />} />
              <Route path="/organizations/:id" element={<div>overview</div>} />
            </Routes>
            <FinishHost />
          </MemoryRouter>
        </SetupOverlayProvider>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

/**
 * Steps that resolve a catalog before they can commit anything keep their submit
 * disabled until it lands, so a click has to wait for that rather than for the
 * button merely existing.
 */
async function clickWhenEnabled(testId: string) {
  const button = (await screen.findByTestId(testId)) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
}

/** Runs the path choice and the environment step, which every path shares. */
async function reachLlmStep(path: 'agent' | 'sandbox') {
  fireEvent.click(screen.getByTestId(`setup-path-${path}`));
  await clickWhenEnabled('setup-environment-submit');
  await screen.findByTestId('setup-llm-submit');
}

describe('SetupWizardPage', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(cleanup);

  beforeEach(() => {
    Object.values({ ...agents, ...llm, ...other }).forEach((mock) => mock.mockReset());

    other.listRunners.mockResolvedValue({
      runners: [
        create(RunnerSchema, {
          meta: create(RunnerEntityMetaSchema, { id: 'runner-1' }),
          name: 'shared',
        }),
      ],
      nextPageToken: '',
    });
    other.listImages.mockImplementation(({ type }: { type: ImageType }) => {
      const images = {
        [ImageType.WORKSPACE]: [
          create(ImageSchema, {
            meta: create(ImageEntityMetaSchema, { id: 'image-workspace' }),
            organizationId: 'platform',
            name: 'devcontainer',
            description: 'Default workspace image.',
            type: ImageType.WORKSPACE,
          }),
        ],
        [ImageType.AGENT_RUNTIME]: [
          create(ImageSchema, {
            meta: create(ImageEntityMetaSchema, { id: 'image-claude' }),
            organizationId: 'platform',
            name: 'claude',
            type: ImageType.AGENT_RUNTIME,
          }),
          create(ImageSchema, {
            meta: create(ImageEntityMetaSchema, { id: 'image-codex' }),
            organizationId: 'platform',
            name: 'codex',
            type: ImageType.AGENT_RUNTIME,
          }),
        ],
        [ImageType.MCP]: [
          create(ImageSchema, {
            meta: create(ImageEntityMetaSchema, { id: 'image-files' }),
            organizationId: 'platform',
            name: 'files-mcp',
            type: ImageType.MCP,
          }),
        ],
      }[type as number] ?? [];
      return Promise.resolve({ images, nextPageToken: '' });
    });
    other.refreshImage.mockResolvedValue({
      versions: [create(ImageVersionSchema, { tag: '1.2.0' }), create(ImageVersionSchema, { tag: '1.1.0' })],
    });

    agents.listEnvironments.mockResolvedValue({ environments: [], nextPageToken: '' });
    agents.listAgents.mockResolvedValue({ agents: [], nextPageToken: '' });
    agents.createEnvironment.mockResolvedValue({
      environment: create(EnvironmentSchema, {
        meta: create(EntityMetaSchema, { id: 'env-1' }),
        name: 'default',
      }),
    });
    agents.createVolume.mockResolvedValue({});
    agents.updateEnvironment.mockResolvedValue({});
    agents.createMcp.mockResolvedValue({});
    agents.createAgent.mockResolvedValue({
      agent: create(AgentSchema, { meta: create(EntityMetaSchema, { id: 'agent-1' }), name: 'Assistant' }),
    });
    agents.createSandbox.mockResolvedValue({
      sandbox: create(SandboxSchema, { meta: create(EntityMetaSchema, { id: 'sbx-1' }), name: 'sandbox' }),
    });
    agents.ensureSandboxRunning.mockResolvedValue({});

    llm.createLLMProvider.mockResolvedValue({ provider: { meta: { id: 'provider-1' } } });
    llm.createModel.mockResolvedValue({ model: { meta: { id: 'model-1' } } });
    llm.testModel.mockResolvedValue({ outputText: 'Hello, world' });
    llm.createSubscription.mockResolvedValue({ subscription: { meta: { id: 'sub-1' } } });
    llm.createSubscriptionAttachment.mockResolvedValue({});
    other.createSecret.mockResolvedValue({ secret: { meta: { id: 'secret-1' } } });
    other.createChat.mockResolvedValue({ chat: { id: 'chat-1' } });
  });

  it('creates the environment with a persistent /workspace on the runner it can see', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('setup-path-agent'));
    await clickWhenEnabled('setup-environment-submit');

    await waitFor(() => expect(agents.createEnvironment).toHaveBeenCalled());
    expect(agents.createEnvironment.mock.calls[0][0]).toMatchObject({
      organizationId: 'org-1',
      name: 'default',
      runnerId: 'runner-1',
      workspaceImageId: 'image-workspace',
      workspaceImageTag: '1.2.0',
      agentRuntimeImageId: 'image-claude',
      availability: EnvironmentAvailability.INTERNAL,
    });
    expect(agents.createVolume).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'workspace',
        mountPath: '/workspace',
        persistent: true,
        target: { case: 'environmentId', value: 'env-1' },
      }),
    );
  });

  it('shows the image references it is about to commit, and follows the runtime', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('setup-path-agent'));

    const summary = await screen.findByTestId('setup-environment-summary');
    await waitFor(() => expect(summary.textContent).toContain('devcontainer:1.2.0'));
    expect(summary.textContent).toContain('claude:1.2.0');
    expect(summary.textContent).toContain('shared');
    expect(summary.textContent).toContain('/workspace');

    fireEvent.click(screen.getByTestId('setup-runtime-codex'));
    await waitFor(() => expect(summary.textContent).toContain('codex:1.2.0'));
  });

  it('reuses the environment a failed volume write left behind', async () => {
    agents.createVolume.mockRejectedValueOnce(new ConnectError('storage class', Code.Unavailable));

    renderWizard();
    fireEvent.click(screen.getByTestId('setup-path-agent'));
    await clickWhenEnabled('setup-environment-submit');
    await screen.findByTestId('setup-environment-error');

    await clickWhenEnabled('setup-environment-submit');
    await screen.findByTestId('setup-llm-submit');

    expect(agents.createEnvironment).toHaveBeenCalledTimes(1);
    expect(agents.createVolume).toHaveBeenCalledTimes(2);
  });

  it('shows the Claude plan on the agent path but disables it, and says why', async () => {
    renderWizard();
    await reachLlmStep('agent');

    // Shown rather than hidden: a reader who never sees the second route does
    // not learn the platform has one.
    const subscription = screen.getByTestId('setup-llm-subscription') as HTMLButtonElement;
    expect(subscription.disabled).toBe(true);
    expect(screen.getByTestId('setup-llm-subscription-excluded').textContent).toContain(
      "don't cover autonomous agents",
    );
    expect((screen.getByTestId('setup-llm-api-key') as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers a custom endpoint on the protocol the chosen CLI speaks', async () => {
    renderWizard();
    await reachLlmStep('agent');
    fireEvent.click(screen.getByTestId('setup-llm-vendor-custom'));

    const endpoint = screen.getByTestId('setup-llm-endpoint-custom') as HTMLInputElement;
    expect(endpoint.placeholder).toContain('/v1/messages');

    fireEvent.change(endpoint, { target: { value: 'https://gw.example.com/v1/messages' } });
    fireEvent.change(screen.getByTestId('setup-llm-token'), { target: { value: 'sk-ok' } });
    fireEvent.change(screen.getByTestId('setup-llm-model'), { target: { value: 'claude-opus-5' } });
    fireEvent.click(screen.getByTestId('setup-llm-submit'));

    await waitFor(() => expect(llm.createLLMProvider).toHaveBeenCalled());
    expect(llm.createLLMProvider.mock.calls[0][0]).toMatchObject({
      endpoint: 'https://gw.example.com/v1/messages',
      protocol: Protocol.ANTHROPIC_MESSAGES,
    });
  });

  it('offers Claude a subscription on the sandbox path', async () => {
    renderWizard();
    await reachLlmStep('sandbox');

    expect(screen.getByTestId('setup-llm-subscription')).toBeTruthy();
  });

  it('offers Codex a subscription on the agent path', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('setup-path-agent'));
    fireEvent.click(await screen.findByTestId('setup-runtime-codex'));
    await clickWhenEnabled('setup-environment-submit');
    await screen.findByTestId('setup-llm-submit');

    expect(screen.getByTestId('setup-llm-subscription')).toBeTruthy();
  });

  it('does not advance on a rejected API key, and shows what the provider said', async () => {
    llm.testModel.mockRejectedValue(
      new ConnectError('upstream error (401): invalid x-api-key', Code.Unavailable),
    );

    renderWizard();
    await reachLlmStep('agent');
    fireEvent.change(screen.getByTestId('setup-llm-token'), { target: { value: 'sk-wrong' } });
    fireEvent.click(screen.getByTestId('setup-llm-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('setup-llm-error').textContent).toContain('invalid x-api-key'),
    );
    // Still on the step that took the credential.
    expect(screen.getByTestId('setup-llm-submit')).toBeTruthy();
    expect(agents.createMcp).not.toHaveBeenCalled();
  });

  it('corrects a rejected key in place rather than creating a second provider', async () => {
    llm.testModel.mockRejectedValueOnce(new ConnectError('nope', Code.Unavailable));

    renderWizard();
    await reachLlmStep('agent');
    fireEvent.change(screen.getByTestId('setup-llm-token'), { target: { value: 'sk-wrong' } });
    fireEvent.click(screen.getByTestId('setup-llm-submit'));
    await screen.findByTestId('setup-llm-error');

    fireEvent.change(screen.getByTestId('setup-llm-token'), { target: { value: 'sk-right' } });
    fireEvent.click(screen.getByTestId('setup-llm-submit'));
    await screen.findByTestId('setup-tools-submit');

    expect(llm.createLLMProvider).toHaveBeenCalledTimes(1);
    expect(llm.createModel).toHaveBeenCalledTimes(1);
    expect(llm.updateLLMProvider).toHaveBeenCalledWith({ id: 'provider-1', token: 'sk-right' });
  });

  it('makes a subscription-backed environment private and native', async () => {
    renderWizard();
    await reachLlmStep('sandbox');
    fireEvent.click(screen.getByTestId('setup-llm-subscription'));
    fireEvent.change(screen.getByTestId('setup-subscription-token'), { target: { value: 'tok' } });
    fireEvent.click(screen.getByTestId('setup-llm-submit'));

    await waitFor(() => expect(agents.updateEnvironment).toHaveBeenCalled());
    expect(other.createSecret).toHaveBeenCalledWith(expect.objectContaining({ value: 'tok' }));
    expect(llm.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: Vendor.ANTHROPIC, secretId: 'secret-1' }),
    );
    expect(llm.createSubscriptionAttachment).toHaveBeenCalledWith({
      subscriptionId: 'sub-1',
      target: { case: 'environmentId', value: 'env-1' },
    });
    expect(agents.updateEnvironment).toHaveBeenCalledWith({
      id: 'env-1',
      llmMode: LLMMode.LLM_MODE_NATIVE,
      availability: EnvironmentAvailability.PRIVATE,
    });
  });

  it('ends the agent path on a conversation with the agent it just made', async () => {
    renderWizard();
    await reachLlmStep('agent');
    fireEvent.change(screen.getByTestId('setup-llm-token'), { target: { value: 'sk-ok' } });
    fireEvent.click(screen.getByTestId('setup-llm-submit'));

    await clickWhenEnabled('setup-tools-submit');
    fireEvent.click(await screen.findByTestId('setup-target-submit'));

    await screen.findByTestId('setup-finish');
    expect(agents.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        environmentId: 'env-1',
        model: 'model-1',
        // Without one, adding the class to a thread cannot mint an instance.
        nickname: 'assistant',
      }),
    );
    // The prompt is what the persona actually changes, so it is what gets sent.
    expect(
      JSON.parse(agents.createAgent.mock.calls[0][0].configuration).system_prompt,
    ).toContain('helpful teammate');
    expect(other.createChat).toHaveBeenCalledWith({
      organizationId: 'org-1',
      participantIds: ['agent-1'],
    });
    expect(screen.getByTestId('setup-finish-built').textContent).toBe('Assistant is ready');
    expect(screen.getByTestId('setup-finish-pointer').textContent).toContain(
      'Open Chat to talk to Assistant',
    );
  });

  it('attaches the chosen tool to the environment, not to the agent', async () => {
    renderWizard();
    await reachLlmStep('agent');
    fireEvent.change(screen.getByTestId('setup-llm-token'), { target: { value: 'sk-ok' } });
    fireEvent.click(screen.getByTestId('setup-llm-submit'));
    await clickWhenEnabled('setup-tools-submit');

    await waitFor(() => expect(agents.createMcp).toHaveBeenCalled());
    expect(agents.createMcp).toHaveBeenCalledWith({
      environmentId: 'env-1',
      name: 'files',
      imageId: 'image-files',
      imageTag: '1.2.0',
    });
  });

  it('attaches nothing when the shipped tool is switched off', async () => {
    renderWizard();
    await reachLlmStep('agent');
    fireEvent.change(screen.getByTestId('setup-llm-token'), { target: { value: 'sk-ok' } });
    fireEvent.click(screen.getByTestId('setup-llm-submit'));

    fireEvent.click(await screen.findByTestId('setup-tool-files'));
    await clickWhenEnabled('setup-tools-submit');

    await screen.findByTestId('setup-target-submit');
    expect(agents.createMcp).not.toHaveBeenCalled();
  });

  it('sends an edited prompt rather than the preset it started from', async () => {
    renderWizard();
    await reachLlmStep('agent');
    fireEvent.change(screen.getByTestId('setup-llm-token'), { target: { value: 'sk-ok' } });
    fireEvent.click(screen.getByTestId('setup-llm-submit'));
    await clickWhenEnabled('setup-tools-submit');

    fireEvent.click(await screen.findByTestId('setup-agent-starter-reviewer'));
    const prompt = screen.getByTestId('setup-agent-prompt') as HTMLTextAreaElement;
    expect(prompt.value).toContain('You review code');

    fireEvent.change(prompt, { target: { value: 'Only ever answer in haiku.' } });
    fireEvent.click(screen.getByTestId('setup-target-submit'));

    await screen.findByTestId('setup-finish');
    expect(JSON.parse(agents.createAgent.mock.calls[0][0].configuration).system_prompt).toBe(
      'Only ever answer in haiku.',
    );
  });

  it('ends the sandbox path in a started sandbox, having created no agent', async () => {
    renderWizard();
    await reachLlmStep('sandbox');
    // Subscription is preselected where it is offered, so an API key is a switch.
    fireEvent.click(screen.getByTestId('setup-llm-api-key'));
    fireEvent.change(screen.getByTestId('setup-llm-token'), { target: { value: 'sk-ok' } });
    fireEvent.click(screen.getByTestId('setup-llm-submit'));

    // No files-tool step on this path: there is no thread for it to serve.
    fireEvent.click(await screen.findByTestId('setup-target-submit'));

    await screen.findByTestId('setup-finish');
    expect(agents.createSandbox).toHaveBeenCalled();
    expect(agents.ensureSandboxRunning).toHaveBeenCalledWith({ id: 'sbx-1' });
    expect(agents.createAgent).not.toHaveBeenCalled();
    expect(agents.createMcp).not.toHaveBeenCalled();
    expect(screen.getByTestId('setup-finish-built').textContent).toBe('Sandbox is running');
    expect(screen.getByTestId('setup-finish-pointer').textContent).toContain(
      'Open Sandboxes to get a terminal',
    );
  });

  it('leaves the finish overlay without going to the destination', async () => {
    renderWizard();
    await reachLlmStep('sandbox');
    // Subscription is preselected where it is offered, so an API key is a switch.
    fireEvent.click(screen.getByTestId('setup-llm-api-key'));
    fireEvent.change(screen.getByTestId('setup-llm-token'), { target: { value: 'sk-ok' } });
    fireEvent.click(screen.getByTestId('setup-llm-submit'));
    fireEvent.click(await screen.findByTestId('setup-target-submit'));

    fireEvent.click(await screen.findByTestId('setup-finish-exit'));
    await screen.findByText('overview');
  });
});
