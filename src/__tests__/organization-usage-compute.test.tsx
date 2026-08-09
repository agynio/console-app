import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageTitleProvider } from '@/context/PageTitleContext';
import {
  type Granularity,
  QueryUsageResponseSchema,
  Unit,
  UsageBucketSchema,
} from '@/gen/agynio/api/metering/v1/metering_pb';
import { OrganizationUsageTab } from '@/pages/OrganizationUsageTab';

const { queryUsage, listModels, batchGetUsers, getInstance, getSandbox, getAgent, getEnvironment } =
  vi.hoisted(() => ({
    queryUsage: vi.fn(),
    listModels: vi.fn(),
    batchGetUsers: vi.fn(),
    getInstance: vi.fn(),
    getSandbox: vi.fn(),
    getAgent: vi.fn(),
    getEnvironment: vi.fn(),
  }));

vi.mock('@/api/client', () => ({
  meteringClient: { queryUsage },
  llmClient: { listModels },
  usersClient: { batchGetUsers },
  agentsClient: { getInstance, getSandbox, getAgent, getEnvironment },
}));

type UsageRequest = {
  unit: Unit;
  groupBy?: string;
  granularity: Granularity;
  labelFilters?: Record<string, string>;
};

function bucket(value: bigint, groupValue = '') {
  return create(UsageBucketSchema, { value, groupValue });
}

// Compute lives behind its own tab now, and an inactive tab is unmounted, so
// nothing it queries is requested until the tab is opened.
async function openTab(section: 'compute' | 'storage') {
  // Radix activates a tab on mousedown, not on click.
  fireEvent.mouseDown(await screen.findByTestId(`organization-usage-${section}-tab`), { button: 0 });
  await waitFor(() => {
    expect(screen.queryByTestId(`organization-usage-${section}-metrics`)).not.toBeNull();
  });
}

function renderUsageTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PageTitleProvider>
        <MemoryRouter initialEntries={['/organizations/org-1/usage']}>
          <Routes>
            <Route path="/organizations/:id/usage" element={<OrganizationUsageTab />} />
          </Routes>
        </MemoryRouter>
      </PageTitleProvider>
    </QueryClientProvider>,
  );
}

function computeRequests(): UsageRequest[] {
  return queryUsage.mock.calls
    .map(([request]) => request as UsageRequest)
    .filter((request) => request.unit === Unit.FLAVOR_SECONDS);
}

describe('OrganizationUsageTab compute section', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('bills compute by flavor rather than by cpu and ram', async () => {
    listModels.mockResolvedValue({ models: [] });
    batchGetUsers.mockResolvedValue({ users: [] });
    queryUsage.mockImplementation(async (request: UsageRequest) => {
      if (request.unit !== Unit.FLAVOR_SECONDS) {
        return create(QueryUsageResponseSchema, { buckets: [] });
      }
      // 7200 seconds in micro-units: two flavor-hours.
      if (request.groupBy === 'flavor') {
        return create(QueryUsageResponseSchema, {
          buckets: [bucket(5_400_000_000n, 'cpu-2x'), bucket(1_800_000_000n, 'cpu-1x')],
        });
      }
      return create(QueryUsageResponseSchema, { buckets: [bucket(7_200_000_000n)] });
    });

    renderUsageTab();
    await openTab('compute');

    // The total is flavor-time, not a CPU or RAM figure: 7200 seconds is 2 hours.
    await waitFor(() => {
      expect(screen.getByTestId('organization-usage-compute-flavor').textContent).toContain('2');
    });
    expect(screen.getByTestId('organization-usage-compute-flavor').textContent).toContain(
      'Flavor-hours',
    );

    // The per-tier chart is rendered, not just queried.
    expect(screen.queryByTestId('organization-usage-compute-flavors-chart')).not.toBeNull();

    // Per-tier breakdown is what the change exists to provide.
    const requests = computeRequests();
    expect(requests.some((request) => request.groupBy === 'flavor')).toBe(true);
    // A workload is an instance or a sandbox, so the consumer ranking is both
    // columns rather than identity_id, which names a different level per producer.
    expect(requests.some((request) => request.groupBy === 'agent_instance_id')).toBe(true);
    expect(requests.some((request) => request.groupBy === 'sandbox_id')).toBe(true);

    // Compute must no longer be queried as core-seconds or as RAM gb-seconds.
    const allRequests = queryUsage.mock.calls.map(([request]) => request as UsageRequest);
    expect(allRequests.some((request) => request.unit === Unit.CORE_SECONDS)).toBe(false);
    expect(
      allRequests.some(
        (request) => request.unit === Unit.GB_SECONDS && request.labelFilters?.kind === 'ram',
      ),
    ).toBe(false);
  });

  it('still meters storage as gb-seconds', async () => {
    listModels.mockResolvedValue({ models: [] });
    batchGetUsers.mockResolvedValue({ users: [] });
    queryUsage.mockResolvedValue(create(QueryUsageResponseSchema, { buckets: [] }));

    renderUsageTab();
    await openTab('storage');

    await waitFor(() => {
      expect(queryUsage).toHaveBeenCalled();
    });
    const allRequests = queryUsage.mock.calls.map(([request]) => request as UsageRequest);
    expect(
      allRequests.some(
        (request) => request.unit === Unit.GB_SECONDS && request.labelFilters?.kind === 'storage',
      ),
    ).toBe(true);
  });
});
