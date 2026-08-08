import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnvironmentVolumesTab } from '@/pages/detail-tabs/EnvironmentVolumesTab';

const { listVolumes, createVolume, deleteVolume } = vi.hoisted(() => ({
  listVolumes: vi.fn(),
  createVolume: vi.fn(),
  deleteVolume: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  agentsClient: { listVolumes, createVolume, deleteVolume },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EnvironmentVolumesTab environmentId="env-1" />
    </QueryClientProvider>,
  );
}

describe('EnvironmentVolumesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listVolumes.mockResolvedValue({ volumes: [] });
    createVolume.mockResolvedValue({});
    deleteVolume.mockResolvedValue({});
  });

  afterEach(cleanup);

  it('offers to add a volume even when the environment declares none', async () => {
    renderTab();
    await screen.findByTestId('environment-volumes-empty');
    expect(screen.getByTestId('environment-volumes-add')).toBeTruthy();
  });

  // Size is what makes a volume persistent -- the resource makes the two
  // biconditional, so the form must not be able to send one without the other.
  it('sends persistent with a size and ephemeral without one', async () => {
    renderTab();
    await screen.findByTestId('environment-volumes-empty');

    fireEvent.click(screen.getByTestId('environment-volumes-add'));
    fireEvent.change(screen.getByTestId('create-volume-name'), { target: { value: 'workspace' } });
    fireEvent.change(screen.getByTestId('create-volume-mount-path'), {
      target: { value: '/workspace' },
    });
    fireEvent.change(screen.getByTestId('create-volume-size'), { target: { value: '10Gi' } });
    fireEvent.click(screen.getByTestId('create-volume-submit'));

    await waitFor(() => expect(createVolume).toHaveBeenCalledTimes(1));
    expect(createVolume).toHaveBeenCalledWith(
      expect.objectContaining({ size: '10Gi', persistent: true, mountPath: '/workspace' }),
    );

    createVolume.mockClear();
    fireEvent.click(screen.getByTestId('environment-volumes-add'));
    fireEvent.change(screen.getByTestId('create-volume-name'), { target: { value: 'scratch' } });
    fireEvent.change(screen.getByTestId('create-volume-mount-path'), {
      target: { value: '/scratch' },
    });
    fireEvent.click(screen.getByTestId('create-volume-submit'));

    await waitFor(() => expect(createVolume).toHaveBeenCalledTimes(1));
    expect(createVolume).toHaveBeenCalledWith(
      expect.objectContaining({ size: '', persistent: false }),
    );
  });

  // A container path that is not absolute is not a mount, and the server would
  // refuse it -- saying so here costs one round trip less.
  it('refuses a relative mount path without calling the API', async () => {
    renderTab();
    await screen.findByTestId('environment-volumes-empty');

    fireEvent.click(screen.getByTestId('environment-volumes-add'));
    fireEvent.change(screen.getByTestId('create-volume-name'), { target: { value: 'workspace' } });
    fireEvent.change(screen.getByTestId('create-volume-mount-path'), {
      target: { value: 'workspace' },
    });
    fireEvent.click(screen.getByTestId('create-volume-submit'));

    expect(await screen.findByText('Mount path must be absolute.')).toBeTruthy();
    expect(createVolume).not.toHaveBeenCalled();
  });

  it('confirms before removing, and says what a persistent volume takes with it', async () => {
    listVolumes.mockResolvedValue({
      volumes: [
        {
          meta: { id: 'vol-1' },
          name: 'workspace',
          mountPath: '/workspace',
          persistent: true,
          size: '10Gi',
          storageClass: '',
          ttl: '',
        },
      ],
    });
    renderTab();
    await screen.findByTestId('environment-volumes-table');

    fireEvent.click(screen.getByTestId('environment-volumes-remove'));
    expect(await screen.findByTestId('environment-volumes-remove-dialog')).toBeTruthy();
    expect(screen.getByText(/not recoverable/i)).toBeTruthy();
    expect(deleteVolume).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('environment-volumes-remove-confirm'));
    await waitFor(() => expect(deleteVolume).toHaveBeenCalledWith({ id: 'vol-1' }));
  });
});
