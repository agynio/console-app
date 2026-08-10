import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CreateDeviceDialog } from '@/components/CreateDeviceDialog';
import { DeviceSchema, EntityMetaSchema } from '@/gen/agynio/api/users/v1/users_pb';

const { createDevice } = vi.hoisted(() => ({ createDevice: vi.fn() }));
const { downloadTextFile } = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));

vi.mock('@/api/client', () => ({ usersClient: { createDevice } }));
vi.mock('@/lib/download', () => ({ downloadTextFile }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ENROLLMENT_JWT = `header.${'b'.repeat(600)}.signature`;

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CreateDeviceDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('CreateDeviceDialog', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    createDevice.mockReset();
    downloadTextFile.mockReset();
    createDevice.mockResolvedValue({
      device: create(DeviceSchema, { meta: create(EntityMetaSchema, { id: 'device-1' }), name: 'Laptop' }),
      enrollmentJwt: ENROLLMENT_JWT,
    });
  });

  it('reveals the enrollment JWT once, with copy and download', async () => {
    renderDialog();

    fireEvent.change(screen.getByTestId('devices-name'), { target: { value: 'Laptop' } });
    fireEvent.click(screen.getByTestId('devices-submit'));

    const jwt = await screen.findByTestId('devices-jwt-value');
    expect(createDevice).toHaveBeenCalledWith({ name: 'Laptop' });
    expect(jwt.textContent).toBe(ENROLLMENT_JWT);
    expect(screen.getByTestId('devices-create-title').textContent).toBe('Enrollment JWT');
    // The form is replaced by the reveal, so the JWT cannot be issued twice.
    expect(screen.queryByTestId('devices-submit')).toBeNull();

    fireEvent.click(screen.getByTestId('devices-jwt-download'));
    expect(downloadTextFile).toHaveBeenCalledWith(ENROLLMENT_JWT, 'device-device-1.jwt');

    await waitFor(() => {
      expect(screen.getByTestId('devices-jwt-copy')).toBeTruthy();
    });
  });
});
