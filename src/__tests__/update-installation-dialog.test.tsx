import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UpdateInstallationDialog } from '@/components/UpdateInstallationDialog';
import { EntityMetaSchema, InstallationSchema } from '@/gen/agynio/api/apps/v1/apps_pb';

const { updateInstallation } = vi.hoisted(() => ({
  updateInstallation: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  appsClient: {
    updateInstallation,
  },
}));

function buildInstallation() {
  return create(InstallationSchema, {
    meta: create(EntityMetaSchema, { id: 'installation-1' }),
    appId: 'app-1',
    organizationId: 'org-1',
    slug: 'demo-installation',
  });
}

function renderDialog({ onOpenChange }: { onOpenChange?: (open: boolean) => void } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UpdateInstallationDialog
        open
        onOpenChange={onOpenChange ?? vi.fn()}
        installation={buildInstallation()}
        organizationId="org-1"
      />
    </QueryClientProvider>,
  );
}

describe('UpdateInstallationDialog', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    updateInstallation.mockReset();
  });

  it('submits updated slug and configuration', async () => {
    updateInstallation.mockResolvedValueOnce({});
    const onOpenChange = vi.fn();

    renderDialog({ onOpenChange });

    fireEvent.change(screen.getByTestId('update-installation-slug'), {
      target: { value: 'updated-slug' },
    });
    fireEvent.change(screen.getByTestId('update-installation-configuration'), {
      target: { value: '{"region":"us-east"}' },
    });
    fireEvent.click(screen.getByTestId('update-installation-save'));

    await waitFor(() => {
      expect(updateInstallation).toHaveBeenCalledWith({
        id: 'installation-1',
        slug: 'updated-slug',
        configuration: { region: 'us-east' },
      });
    });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('validates slug and configuration', () => {
    renderDialog();

    fireEvent.change(screen.getByTestId('update-installation-slug'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('update-installation-save'));

    expect(screen.getByText('Slug is required.')).toBeTruthy();
    expect(updateInstallation).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('update-installation-slug'), {
      target: { value: 'valid-slug' },
    });
    fireEvent.change(screen.getByTestId('update-installation-configuration'), {
      target: { value: '{invalid-json' },
    });
    fireEvent.click(screen.getByTestId('update-installation-save'));

    expect(screen.getByText('Invalid JSON format.')).toBeTruthy();
    expect(updateInstallation).not.toHaveBeenCalled();
  });
});
