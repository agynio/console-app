import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageTitleProvider } from '@/context/PageTitleContext';
import { EntityMetaSchema, EnvironmentSchema, EnvSchema } from '@/gen/agynio/api/agents/v1/agents_pb';
import {
  EgressRuleMatcherSchema,
  EgressRuleSchema,
  EntityMetaSchema as EgressEntityMetaSchema,
} from '@/gen/agynio/api/egress/v1/egress_pb';
import {
} from '@/gen/agynio/api/secrets/v1/secrets_pb';
import { EntityMetaSchema as RunnerEntityMetaSchema, RunnerSchema } from '@/gen/agynio/api/runners/v1/runners_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { EnvironmentDetailPage } from '@/pages/EnvironmentDetailPage';

const {
  getEnvironment,
  listEnvs,
  createEnv,
} = vi.hoisted(() => ({
  getEnvironment: vi.fn(),
  listEnvs: vi.fn(),
  createEnv: vi.fn(),
}));

const { listEgressRules, listEgressRuleAttachments, createEgressRuleAttachment } = vi.hoisted(() => ({
  listEgressRules: vi.fn(),
  listEgressRuleAttachments: vi.fn(),
  createEgressRuleAttachment: vi.fn(),
}));

const { getRunner, listSecrets } = vi.hoisted(() => ({
  getRunner: vi.fn(),
  listSecrets: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  agentsClient: {
    getEnvironment,
    listEnvs,
    createEnv,
  },
  egressClient: {
    listEgressRules,
    listEgressRuleAttachments,
    createEgressRuleAttachment,
  },
  runnersClient: { getRunner },
  secretsClient: { listSecrets },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/organizations/org-1/environments/env-1']}>
          <Routes>
            <Route path="/organizations/:id/environments/:environmentId" element={<EnvironmentDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

// Radix activates a tab on mousedown, not on a bare click.
function selectTab(testId: string) {
  fireEvent.mouseDown(screen.getByTestId(testId));
}

async function openSelect(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
  return screen.findByRole('listbox');
}

describe('EnvironmentDetailPage', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    getEnvironment.mockReset();
    listEnvs.mockReset();
    createEnv.mockReset();
    listEgressRules.mockReset();
    listEgressRuleAttachments.mockReset();
    createEgressRuleAttachment.mockReset();
    getRunner.mockReset();
    listSecrets.mockReset();

    getEnvironment.mockResolvedValue({
      environment: create(EnvironmentSchema, {
        meta: create(EntityMetaSchema, {
          id: 'env-1',
          createdAt: timestampFromDate(new Date('2026-01-02T03:04:05Z')),
        }),
        organizationId: 'org-1',
        name: 'default',
        image: 'ghcr.io/agynio/sandbox:latest',
        runnerId: 'runner-1',
        flavor: 'small',
      }),
    });

    getRunner.mockResolvedValue({
      runner: create(RunnerSchema, {
        meta: create(RunnerEntityMetaSchema, { id: 'runner-1' }),
        name: 'org-runner',
      }),
    });

    listEnvs.mockResolvedValue({ envs: [], nextPageToken: '' });
    listSecrets.mockResolvedValue({ secrets: [], nextPageToken: '' });
    listEgressRuleAttachments.mockResolvedValue({ egressRuleAttachments: [], nextPageToken: '' });
    listEgressRules.mockResolvedValue({
      egressRules: [
        create(EgressRuleSchema, {
          meta: create(EgressEntityMetaSchema, { id: 'rule-1' }),
          name: 'allow-github',
          matcher: create(EgressRuleMatcherSchema, { domainPattern: '*.github.com' }),
        }),
      ],
      nextPageToken: '',
    });
  });

  it('renders the environment overview with the resolved runner', async () => {
    renderDetailPage();

    expect(await screen.findByTestId('environment-detail-card')).toBeTruthy();
    expect(screen.getByTestId('environment-detail-name').textContent).toBe('default');
    expect(screen.getByTestId('environment-detail-image').textContent).toBe('ghcr.io/agynio/sandbox:latest');
    expect(screen.getByTestId('environment-detail-flavor').textContent).toBe('small');
    expect(screen.getByTestId('environment-detail-id').textContent).toBe('env-1');

    await waitFor(() => {
      expect(screen.getByTestId('environment-detail-runner').textContent).toBe('org-runner');
    });

    expect(getEnvironment).toHaveBeenCalledWith({ id: 'env-1' });
    expect(getRunner).toHaveBeenCalledWith({ id: 'runner-1' });
  });

  it('does not render an environment belonging to another organization', async () => {
    getEnvironment.mockResolvedValue({
      environment: create(EnvironmentSchema, {
        meta: create(EntityMetaSchema, { id: 'env-1' }),
        organizationId: 'org-2',
        name: 'default',
      }),
    });

    renderDetailPage();

    expect(await screen.findByTestId('environment-detail-not-found')).toBeTruthy();
    expect(screen.queryByTestId('environment-detail-card')).toBeNull();
  });

  it('lists ENVs scoped to the environment and creates one targeting it', async () => {
    listEnvs.mockResolvedValue({
      envs: [
        create(EnvSchema, {
          meta: create(EntityMetaSchema, { id: 'env-var-1' }),
          name: 'LOG_LEVEL',
          target: { case: 'environmentId', value: 'env-1' },
          source: { case: 'value', value: 'debug' },
        }),
      ],
      nextPageToken: '',
    });
    createEnv.mockResolvedValue({});

    renderDetailPage();
    expect(await screen.findByTestId('environment-detail-card')).toBeTruthy();

    selectTab('environment-detail-envs-tab');

    expect(await screen.findByTestId('environment-env-row')).toBeTruthy();
    expect(screen.getByTestId('environment-env-name').textContent).toBe('LOG_LEVEL');

    await waitFor(() => {
      expect(listEnvs).toHaveBeenCalledWith({
        organizationId: 'org-1',
        environmentId: 'env-1',
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
      });
    });

    fireEvent.click(screen.getByTestId('environment-envs-create'));
    expect(await screen.findByTestId('environment-envs-create-dialog')).toBeTruthy();

    fireEvent.change(screen.getByTestId('environment-envs-create-name'), { target: { value: 'API_URL' } });
    fireEvent.change(screen.getByTestId('environment-envs-create-value'), {
      target: { value: 'https://api.example.com' },
    });
    fireEvent.click(screen.getByTestId('environment-envs-create-submit'));

    await waitFor(() => {
      expect(createEnv).toHaveBeenCalledWith({
        name: 'API_URL',
        description: '',
        target: { case: 'environmentId', value: 'env-1' },
        source: { case: 'value', value: 'https://api.example.com' },
      });
    });
  });

  it('attaches an egress rule targeting the environment', async () => {
    createEgressRuleAttachment.mockResolvedValue({});

    renderDetailPage();
    expect(await screen.findByTestId('environment-detail-card')).toBeTruthy();

    selectTab('environment-detail-egress-rules-tab');

    expect(await screen.findByTestId('environment-egress-rule-attachments-empty')).toBeTruthy();

    await waitFor(() => {
      expect(listEgressRuleAttachments).toHaveBeenCalledWith({
        organizationId: 'org-1',
        environmentId: 'env-1',
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
      });
    });

    fireEvent.click(screen.getByTestId('environment-egress-rule-attachments-attach'));
    expect(await screen.findByTestId('environment-egress-rule-attachments-attach-dialog')).toBeTruthy();

    const listbox = await openSelect('environment-egress-rule-attachments-attach-select');
    fireEvent.click(within(listbox).getByText('allow-github (*.github.com)'));

    fireEvent.click(screen.getByTestId('environment-egress-rule-attachments-attach-submit'));

    await waitFor(() => {
      expect(createEgressRuleAttachment).toHaveBeenCalledWith({
        ruleId: 'rule-1',
        target: { case: 'environmentId', value: 'env-1' },
      });
    });
    // agent_id is deprecated and must never be sent for an environment.
    expect(createEgressRuleAttachment.mock.calls[0][0]).not.toHaveProperty('agentId');
  });

});
