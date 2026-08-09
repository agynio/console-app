import { create } from '@bufbuild/protobuf';
import { TimestampSchema } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError } from '@connectrpc/connect';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageTitleProvider } from '@/context/PageTitleContext';
import { Granularity, Unit } from '@/gen/agynio/api/metering/v1/metering_pb';
import { RuntimeOwnerKind, WorkloadStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { OrganizationOverviewTab } from '@/pages/OrganizationOverviewTab';

const mocks = vi.hoisted(() => ({
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

vi.mock('@/api/client', () => ({
  organizationsClient: { listMembers: mocks.listMembers },
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
  useOrganizationContext: () => ({ organizations: [{ id: 'org-1', name: 'Acme' }] }),
}));

vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => {} }));

const HOUR_MS = 3_600_000;

/** Metering reports every value in micros. */
function micros(value: number): bigint {
  return BigInt(value) * 1_000_000n;
}

function agoTimestamp(millisAgo: number) {
  return create(TimestampSchema, {
    seconds: BigInt(Math.floor((Date.now() - millisAgo) / 1000)),
    nanos: 0,
  });
}

/** Local midnight, `daysAgo` days back, which is how metering buckets a day. */
function dayTimestamp(daysAgo: number) {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return agoTimestamp(Date.now() - day.getTime() + daysAgo * 24 * HOUR_MS);
}

function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PageTitleProvider>
        <MemoryRouter initialEntries={['/organizations/org-1']}>
          <Routes>
            <Route path="/organizations/:id" element={<OrganizationOverviewTab />} />
            <Route path="/organizations/:id/setup" element={<div>setup wizard</div>} />
          </Routes>
        </MemoryRouter>
      </PageTitleProvider>
    </QueryClientProvider>,
  );
}

describe('OrganizationOverviewTab dashboard', () => {
  afterEach(cleanup);

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    window.localStorage.clear();

    mocks.listMembers.mockResolvedValue({ memberships: [{ id: 'm-1' }] });
    mocks.listSecretProviders.mockResolvedValue({ secretProviders: [] });
    mocks.listSecrets.mockResolvedValue({ secrets: [] });
    mocks.listRunners.mockResolvedValue({ runners: [{ id: 'runner-1' }] });
    mocks.listWorkloads.mockResolvedValue({ workloads: [] });
    // An organization with an agent is past setup, which is what puts the
    // dashboard on screen rather than a redirect to the wizard.
    mocks.listAgents.mockResolvedValue({ agents: [{ meta: { id: 'agent-1' }, name: 'Assistant' }] });
    mocks.listSandboxes.mockResolvedValue({ sandboxes: [] });
    mocks.listInstallations.mockResolvedValue({ installations: [] });
    mocks.listOrganizationThreads.mockResolvedValue({ threads: [] });
    mocks.getMessages.mockResolvedValue({ messages: [] });
    mocks.queryUsage.mockResolvedValue({ buckets: [] });
  });

  it('reads tokens, compute and threads over the last week', async () => {
    mocks.queryUsage.mockImplementation(async (request: { unit: Unit; labelFilters?: Record<string, string> }) => {
      if (request.unit === Unit.TOKENS) return { buckets: [{ value: micros(128_000) }] };
      if (request.unit === Unit.FLAVOR_SECONDS) return { buckets: [{ value: micros(9_000) }] };
      if (request.labelFilters?.kind === 'thread') return { buckets: [{ value: micros(6) }] };
      if (request.labelFilters?.kind === 'message') return { buckets: [{ value: micros(42) }] };
      return { buckets: [] };
    });

    renderOverview();

    const tokens = await screen.findByTestId('organization-overview-tokens');
    await waitFor(() => expect(tokens.textContent).toContain('128K'));
    expect(screen.getByTestId('organization-overview-compute').textContent).toContain('2.5h');
    expect(screen.getByTestId('organization-overview-compute').textContent).toContain('across 1 runner');
    const threads = screen.getByTestId('organization-overview-threads');
    expect(threads.textContent).toContain('6');
    expect(threads.textContent).toContain('42 messages');
  });

  it('compares the week against the one before it', async () => {
    // Both windows end where the other begins, so the earlier request is the
    // one whose start is further back.
    mocks.queryUsage.mockImplementation(async (request: { unit: Unit; start?: { seconds: bigint } }) => {
      if (request.unit !== Unit.TOKENS) return { buckets: [] };
      const startedAt = Number(request.start?.seconds ?? 0n) * 1000;
      const isPreviousWeek = Date.now() - startedAt > 8 * 24 * HOUR_MS;
      return { buckets: [{ value: micros(isPreviousWeek ? 41_000 : 128_000) }] };
    });

    renderOverview();

    const trend = await screen.findByTestId('organization-overview-token-trend');
    expect(trend.textContent).toContain('vs 41K the week before');
  });

  it('charts only the days a new organization could have used', async () => {
    // Two days of usage in a seven-day window: the five empty days before them
    // are days this organization did not exist for, not days it was idle.
    mocks.queryUsage.mockImplementation(async (request: { granularity: Granularity; unit: Unit }) => {
      if (request.unit !== Unit.TOKENS || request.granularity !== Granularity.DAY) {
        return { buckets: [] };
      }
      return {
        buckets: [
          { value: micros(246_326), timestamp: dayTimestamp(1) },
          { value: micros(217_874), timestamp: dayTimestamp(0) },
        ],
      };
    });

    renderOverview();

    const chart = await screen.findByTestId('organization-overview-token-chart');
    await waitFor(() => expect(chart.textContent).toContain('Last 3 days'));
    expect(chart.textContent).not.toContain('Last 7 days');
  });

  it('charts the whole week once there is a whole week of it', async () => {
    mocks.queryUsage.mockImplementation(async (request: { granularity: Granularity; unit: Unit }) => {
      if (request.unit !== Unit.TOKENS || request.granularity !== Granularity.DAY) {
        return { buckets: [] };
      }
      return {
        buckets: Array.from({ length: 7 }, (_, index) => ({
          value: micros(1_000),
          timestamp: dayTimestamp(index),
        })),
      };
    });

    renderOverview();

    const chart = await screen.findByTestId('organization-overview-token-chart');
    await waitFor(() => expect(chart.textContent).toContain('Last 7 days'));
  });

  it('says so when there is nothing to chart', async () => {
    renderOverview();

    await screen.findByTestId('organization-overview-token-chart');
    await waitFor(() =>
      expect(screen.getByTestId('organization-overview-token-chart').textContent).toContain(
        'No model calls in the last 7 days',
      ),
    );
  });

  it('treats a deployment without metering as no usage', async () => {
    mocks.queryUsage.mockRejectedValue(new ConnectError('no metering', Code.Unimplemented));

    renderOverview();

    await screen.findByTestId('organization-overview-token-chart');
    await waitFor(() =>
      expect(screen.getByTestId('organization-overview-token-chart').textContent).toContain(
        'No model calls',
      ),
    );
    expect(screen.getByTestId('organization-overview-tokens').textContent).toContain('0');
  });

  it('lists what is running with how long it has been up', async () => {
    mocks.listWorkloads.mockResolvedValue({
      workloads: [
        {
          meta: { id: 'wl-1', createdAt: agoTimestamp(3 * HOUR_MS) },
          status: WorkloadStatus.RUNNING,
          ownerKind: RuntimeOwnerKind.AGENT_INSTANCE,
          ownerName: 'Assistant',
        },
      ],
    });

    renderOverview();

    const row = await screen.findByTestId('organization-overview-running-row');
    expect(row.textContent).toContain('Assistant');
    expect(row.textContent).toContain('3h');
  });

  it('opens each recent thread with its first message and its age', async () => {
    mocks.listOrganizationThreads.mockResolvedValue({
      threads: [{ id: 'thread-1', updatedAt: agoTimestamp(26 * HOUR_MS) }],
    });
    mocks.getMessages.mockResolvedValue({
      messages: [
        {
          id: 'msg-1',
          body: `Review the retry logic in the ingest worker\n${'and say what breaks under load '.repeat(4)}`,
        },
      ],
    });

    renderOverview();

    const row = await screen.findByTestId('organization-overview-thread-row');
    await waitFor(() => expect(row.textContent).toContain('Review the retry logic in the ingest worker'));
    // Truncated to one line, and dated in a single unit.
    expect(row.textContent).toContain('...');
    expect(row.textContent).not.toContain('\n');
    expect(row.textContent).toContain('1d');
  });

  it('asks for the oldest message first, since that is the one that opens the thread', async () => {
    mocks.listOrganizationThreads.mockResolvedValue({
      threads: [{ id: 'thread-1', updatedAt: agoTimestamp(HOUR_MS) }],
    });

    renderOverview();

    await waitFor(() => expect(mocks.getMessages).toHaveBeenCalled());
    expect(mocks.getMessages.mock.calls[0][0]).toMatchObject({ threadId: 'thread-1', pageSize: 1 });
  });

  it('hides the threads panel from a member who may not list them', async () => {
    mocks.listOrganizationThreads.mockRejectedValue(new ConnectError('nope', Code.PermissionDenied));

    renderOverview();

    await screen.findByTestId('organization-overview-running');
    await waitFor(() => expect(screen.queryByTestId('organization-overview-threads-panel')).toBeNull());
  });

  it('keeps the counters as links', async () => {
    renderOverview();

    const summary = await screen.findByTestId('organization-overview-summary');
    const links = screen.getAllByTestId('organization-overview-card-link');
    expect(summary).toBeTruthy();
    expect(links).toHaveLength(7);
    expect(links[1].getAttribute('href')).toBe('/organizations/org-1/agents');
  });
});
