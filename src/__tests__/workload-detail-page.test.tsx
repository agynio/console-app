import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageTitleProvider } from '@/context/PageTitleContext';
import {
  ContainerRole,
  ContainerSchema,
  ContainerStatus,
  EntityMetaSchema,
  WorkloadSchema,
  WorkloadStatus,
} from '@/gen/agynio/api/runners/v1/runners_pb';
import { WorkloadDetailPage } from '@/pages/WorkloadDetailPage';

const { getWorkload, listVolumesByThread, streamWorkloadLogs, subscribe } = vi.hoisted(() => ({
  getWorkload: vi.fn(),
  listVolumesByThread: vi.fn(),
  streamWorkloadLogs: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  runnersClient: { getWorkload, listVolumesByThread, streamWorkloadLogs },
  notificationsClient: { subscribe },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const WORKLOAD_ID = 'ebff1f22-e389-4052-9915-5dc3b7415667';
const THREAD_ID = '896a0c8f-f8aa-47dd-b2d1-e1e6c3f37930';

async function* emptyStream() {}

function buildWorkload(overrides: MessageInitShape<typeof WorkloadSchema> = {}) {
  return create(WorkloadSchema, {
    meta: create(EntityMetaSchema, {
      id: WORKLOAD_ID,
      createdAt: timestampFromDate(new Date('2026-08-09T19:51:04Z')),
    }),
    organizationId: 'org-1',
    threadId: THREAD_ID,
    instanceId: WORKLOAD_ID,
    agentId: 'agent-1',
    agentName: 'support',
    runnerId: 'runner-1',
    runnerName: 'k8s-runner',
    zitiIdentityId: 'h52aAajfzF',
    status: WorkloadStatus.STOPPED,
    allocatedCpuMillicores: 250,
    allocatedRamBytes: 536_870_912n,
    lastActivityAt: timestampFromDate(new Date('2026-08-09T19:52:31Z')),
    removedAt: timestampFromDate(new Date('2026-08-09T19:57:12Z')),
    containers: [
      create(ContainerSchema, {
        name: 'agent',
        role: ContainerRole.MAIN,
        status: ContainerStatus.TERMINATED,
        image: 'agyn/runtime-claude:v2.1',
        containerId: 'containerd://9f2c1d',
        restartCount: 1,
        exitCode: 0,
        startedAt: timestampFromDate(new Date('2026-08-09T19:51:22Z')),
        finishedAt: timestampFromDate(new Date('2026-08-09T19:57:12Z')),
      }),
      create(ContainerSchema, {
        name: 'init-workspace',
        role: ContainerRole.INIT,
        status: ContainerStatus.TERMINATED,
        image: 'agyn/workspace-init:v1.4',
        containerId: 'containerd://11ab02',
        restartCount: 0,
        exitCode: 0,
      }),
    ],
    ...overrides,
  });
}

function renderPage(state?: { from: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: `/organizations/org-1/workloads/${WORKLOAD_ID}`, state }]}>
          <Routes>
            <Route path="/organizations/:id/workloads/:workloadId" element={<WorkloadDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

describe('WorkloadDetailPage', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    getWorkload.mockReset();
    listVolumesByThread.mockReset();
    streamWorkloadLogs.mockReset();
    subscribe.mockReset();

    subscribe.mockImplementation(() => emptyStream());
    streamWorkloadLogs.mockImplementation(() => emptyStream());
    listVolumesByThread.mockResolvedValue({ volumes: [], nextPageToken: '' });
    getWorkload.mockResolvedValue({ workload: buildWorkload() });
  });

  it('leads with identity, status, and what the workload ran as', async () => {
    renderPage();

    const header = await screen.findByTestId('workload-detail-header');
    expect(within(header).getByTestId('workload-detail-header-title').textContent).toBe('ebff1f22…415667');
    expect(within(header).getByText('Stopped')).toBeTruthy();
    expect(within(header).getByTestId('workload-detail-header-meta').textContent).toBe(
      'support · k8s-runner · ran 6m 8s',
    );
  });

  it('humanizes allocation instead of printing raw zeroes', async () => {
    renderPage();

    const summary = await screen.findByTestId('workload-detail-card');
    expect(within(summary).getByText('250 m')).toBeTruthy();
    expect(within(summary).getByText('512 MiB')).toBeTruthy();
  });

  it('reads an unallocated workload as blank rather than zero', async () => {
    getWorkload.mockResolvedValue({
      workload: buildWorkload({ allocatedCpuMillicores: 0, allocatedRamBytes: 0n }),
    });
    renderPage();

    const summary = await screen.findByTestId('workload-detail-card');
    expect(within(summary).queryByText('0 m')).toBeNull();
    expect(within(summary).queryByText('0 bytes')).toBeNull();
    expect(within(summary).getByText('CPU').parentElement?.textContent).toBe('CPU—');
    expect(within(summary).getByText('Memory').parentElement?.textContent).toBe('Memory—');
  });

  it('hides the instance id while it just repeats the workload id', async () => {
    renderPage();
    const identity = await screen.findByTestId('workload-identity-card');
    expect(within(identity).queryByText('Instance')).toBeNull();

    cleanup();
    getWorkload.mockResolvedValue({ workload: buildWorkload({ instanceId: 'instance-9' }) });
    renderPage();

    const withInstance = await screen.findByTestId('workload-identity-card');
    expect(within(withInstance).getByText('Instance')).toBeTruthy();
  });

  it('lists containers init first and keeps their detail one click away', async () => {
    renderPage();

    const rows = await screen.findAllByTestId('workload-container-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('init-workspace');
    expect(rows[1].textContent).toContain('agent');

    expect(screen.queryByTestId('workload-container-detail')).toBeNull();
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Show agent details' }));

    const detail = await screen.findByTestId('workload-container-detail');
    expect(detail.textContent).toContain('Container ID');
    expect(detail.textContent).toContain('Started');
    expect(detail.textContent).toContain('Finished');
  });

  it('names the page you arrived from in the breadcrumb', async () => {
    renderPage({ from: '/organizations/org-1/threads/thread-1' });

    const parent = await screen.findByTestId('workload-detail-header-parent');
    expect(parent.textContent).toBe('Thread');
    expect(parent.getAttribute('href')).toBe('/organizations/org-1/threads/thread-1');
  });

  it('falls back to the workloads list when there is no origin', async () => {
    renderPage();

    const parent = await screen.findByTestId('workload-detail-header-parent');
    expect(parent.textContent).toBe('Workloads');
    expect(parent.getAttribute('href')).toBe('/organizations/org-1/workloads');
  });

  it('filters log lines without dropping them from the buffer', async () => {
    async function* logStream() {
      yield {
        event: {
          case: 'chunk' as const,
          value: { data: new TextEncoder().encode('ready on ziti\nthread message received\n') },
        },
      };
    }
    streamWorkloadLogs.mockImplementation(() => logStream());
    renderPage();

    const output = await screen.findByTestId('workload-container-log-output');
    await waitFor(() => expect(output.textContent).toContain('ready on ziti'));
    expect(screen.getByText('2 lines')).toBeTruthy();

    fireEvent.change(screen.getByTestId('workload-log-filter'), { target: { value: 'ziti' } });

    await waitFor(() => expect(screen.getByText('1 of 2 lines')).toBeTruthy());
    expect(screen.getByTestId('workload-container-log-output').textContent).not.toContain('thread message received');
  });
});
