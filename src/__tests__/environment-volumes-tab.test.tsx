import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EnvironmentVolumesTab } from '@/pages/detail-tabs/EnvironmentVolumesTab';

const listVolumes = vi.fn();

vi.mock('@/api/client', () => ({
  agentsClient: {
    listVolumes: (...args: unknown[]) => listVolumes(...args),
  },
}));

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EnvironmentVolumesTab environmentId="env-1" />
    </QueryClientProvider>,
  );
}

describe('environment volumes tab', () => {
  it('lists the volumes the environment declares', async () => {
    listVolumes.mockResolvedValue({
      volumes: [
        {
          meta: { id: 'vol-1' },
          name: 'workspace',
          mountPath: '/workspace',
          persistent: true,
          size: '10Gi',
        },
      ],
    });

    renderTab();

    expect(await screen.findByText('workspace')).toBeTruthy();
    expect(screen.getByText('/workspace')).toBeTruthy();
    expect(screen.getByText('Persistent')).toBeTruthy();
    expect(listVolumes).toHaveBeenCalledWith({ environmentId: 'env-1', pageSize: 200 });
  });

  // An empty table would read as "storage exists but is not shown". What an
  // engineer needs to know is that nothing here survives a stop.
  it('says nothing survives a stop when no volume is declared', async () => {
    listVolumes.mockResolvedValue({ volumes: [] });

    renderTab();

    expect(await screen.findByTestId('environment-volumes-empty')).toBeTruthy();
    expect(screen.getByText(/declares no volumes/i)).toBeTruthy();
    expect(screen.getByText(/survives it stopping/i)).toBeTruthy();
  });
});
