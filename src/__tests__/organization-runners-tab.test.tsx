import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageTitleProvider } from '@/context/PageTitleContext';
import type { useUserContext } from '@/context/UserContext';
import {
  EntityMetaSchema,
  RunnerSchema,
  RunnerStatus,
} from '@/gen/agynio/api/runners/v1/runners_pb';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { OrganizationRunnersTab } from '@/pages/OrganizationRunnersTab';

type UserContextValue = ReturnType<typeof useUserContext>;

const { listRunners } = vi.hoisted(() => ({
  listRunners: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  runnersClient: {
    listRunners,
  },
}));

let userContext: UserContextValue;

vi.mock('@/context/UserContext', () => ({
  useUserContext: () => userContext,
}));

function renderRunnersTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/organizations/org-1/runners']}>
            <Routes>
              <Route path="/organizations/:id/runners" element={<OrganizationRunnersTab />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

describe('OrganizationRunnersTab', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    userContext = {
      currentUser: null,
      clusterRole: null,
      identityId: 'identity-1',
      isClusterAdmin: false,
      status: 'ready',
      error: null,
      signOut: vi.fn(),
    };

    listRunners.mockReset();
  });

  it('renders cluster runners for non-admins with disabled view action', async () => {
    listRunners.mockResolvedValue({
      runners: [
        create(RunnerSchema, {
          meta: create(EntityMetaSchema, { id: 'cluster-runner-1' }),
          name: 'cluster-runner',
          status: RunnerStatus.ENROLLED,
          labels: { scope: 'cluster' },
        }),
      ],
      nextPageToken: '',
    });

    expect(() => renderRunnersTab()).not.toThrow();

    expect(await screen.findByText('cluster-runner')).toBeTruthy();
    const viewButton = screen.getByTestId('organization-cluster-runner-view');

    expect(viewButton).toBeInstanceOf(HTMLButtonElement);
    expect((viewButton as HTMLButtonElement).disabled).toBe(true);

    await waitFor(() => {
      expect(listRunners).toHaveBeenCalledWith({
        organizationId: 'org-1',
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: '',
      });
    });
  });
});
