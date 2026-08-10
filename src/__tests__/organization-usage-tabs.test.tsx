import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageTitleProvider } from '@/context/PageTitleContext';
import { QueryUsageResponseSchema, Unit } from '@/gen/agynio/api/metering/v1/metering_pb';
import { OrganizationUsageTab } from '@/pages/OrganizationUsageTab';

const { queryUsage, listModels, getInstance, getSandbox, getAgent, getEnvironment } = vi.hoisted(() => ({
  queryUsage: vi.fn(),
  listModels: vi.fn(),
  getInstance: vi.fn(),
  getSandbox: vi.fn(),
  getAgent: vi.fn(),
  getEnvironment: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  meteringClient: { queryUsage },
  llmClient: { listModels },
  agentsClient: { getInstance, getSandbox, getAgent, getEnvironment },
}));

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

function unitsRequested(): Set<Unit> {
  return new Set(queryUsage.mock.calls.map(([request]) => (request as { unit: Unit }).unit));
}

/** Metering reports every value in micros. */
function micros(value: number): bigint {
  return BigInt(value) * 1_000_000n;
}

describe('usage tabs', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // The whole point of splitting the page is that opening it stops firing every
  // section's queries at once. An inactive tab is unmounted, so it asks for
  // nothing until someone opens it.
  it('queries only the section whose tab is open', async () => {
    listModels.mockResolvedValue({ models: [] });
    queryUsage.mockResolvedValue(create(QueryUsageResponseSchema, { buckets: [] }));

    renderUsageTab();
    await waitFor(() => {
      expect(queryUsage).toHaveBeenCalled();
    });

    expect(unitsRequested().has(Unit.TOKENS)).toBe(true);
    expect(unitsRequested().has(Unit.FLAVOR_SECONDS)).toBe(false);
    expect(unitsRequested().has(Unit.GB_SECONDS)).toBe(false);

    fireEvent.mouseDown(screen.getByTestId('organization-usage-storage-tab'), { button: 0 });
    await waitFor(() => {
      expect(unitsRequested().has(Unit.GB_SECONDS)).toBe(true);
    });
    // Storage still has no reason to ask about flavor-hours.
    expect(unitsRequested().has(Unit.FLAVOR_SECONDS)).toBe(false);
  });

  // A page-wide empty state hid sections that had nothing only because a
  // different section did. Each tab now answers for itself.
  it('reports emptiness per section', async () => {
    listModels.mockResolvedValue({ models: [] });
    queryUsage.mockResolvedValue(create(QueryUsageResponseSchema, { buckets: [] }));

    renderUsageTab();

    await waitFor(() => {
      expect(screen.queryByTestId('organization-usage-llm-empty')).not.toBeNull();
    });
    expect(screen.getByTestId('organization-usage-llm-empty').textContent).toContain('No LLM usage');

    fireEvent.mouseDown(screen.getByTestId('organization-usage-compute-tab'), { button: 0 });
    await waitFor(() => {
      expect(screen.queryByTestId('organization-usage-compute-empty')).not.toBeNull();
    });
    expect(screen.getByTestId('organization-usage-compute-empty').textContent).toContain('No compute usage');
  });

  // Every spend figure here filters to resource=model, so an organization whose
  // work all ran on a subscription read as an empty tab while the Overview
  // counted the same tokens. A flat fee is not spend, but it is usage.
  it('reports subscription tokens the spend figures leave out', async () => {
    listModels.mockResolvedValue({ models: [] });
    queryUsage.mockImplementation(async (request: { labelFilters?: Record<string, string> }) => {
      const filters = request.labelFilters ?? {};
      if (filters.resource !== 'subscription') return create(QueryUsageResponseSchema, { buckets: [] });
      if (filters.kind === 'input') return create(QueryUsageResponseSchema, { buckets: [{ value: micros(85_227) }] });
      if (filters.kind === 'output') return create(QueryUsageResponseSchema, { buckets: [{ value: micros(772) }] });
      return create(QueryUsageResponseSchema, { buckets: [] });
    });

    renderUsageTab();

    const card = await screen.findByTestId('organization-usage-llm-subscription');
    await waitFor(() => expect(card.textContent).toContain('85,999'));
    expect(card.textContent).toContain('not billed');
    expect(screen.queryByTestId('organization-usage-llm-empty')).toBeNull();
    // The billable figures stay filtered: none of this belongs in them.
    expect(screen.getByTestId('organization-usage-llm-input').textContent).toContain('0');
    expect(screen.getByTestId('organization-usage-llm-output').textContent).toContain('0');
  });
});
