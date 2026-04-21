import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UpdateInstallationDialog } from '@/components/UpdateInstallationDialog';
import {
  EntityMetaSchema,
  InstallationAuditLogEntrySchema,
  InstallationAuditLogLevel,
  InstallationSchema,
} from '@/gen/agynio/api/apps/v1/apps_pb';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

const { listInstallationAuditLogEntries, updateInstallation } = vi.hoisted(() => ({
  listInstallationAuditLogEntries: vi.fn(),
  updateInstallation: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  appsClient: {
    listInstallationAuditLogEntries,
    updateInstallation,
  },
}));

function buildInstallation(status?: string) {
  return create(InstallationSchema, {
    meta: create(EntityMetaSchema, { id: 'installation-1' }),
    appId: 'app-1',
    organizationId: 'org-1',
    slug: 'demo-installation',
    status,
  });
}

function renderDialog(status?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UpdateInstallationDialog
        open
        onOpenChange={vi.fn()}
        installation={buildInstallation(status)}
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
    listInstallationAuditLogEntries.mockReset();
    updateInstallation.mockReset();
  });

  it('hides status and audit log when empty', async () => {
    listInstallationAuditLogEntries.mockResolvedValueOnce({ entries: [], nextPageToken: '' });

    renderDialog('   ');

    await waitFor(() => {
      expect(listInstallationAuditLogEntries).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('installation-status')).toBeNull();
      expect(screen.queryByTestId('installation-audit-log')).toBeNull();
    });
  });

  it('renders status and paginates audit log entries', async () => {
    const firstEntry = create(InstallationAuditLogEntrySchema, {
      id: 'entry-1',
      installationId: 'installation-1',
      message: 'First log entry',
      level: InstallationAuditLogLevel.INFO,
    });
    const secondEntry = create(InstallationAuditLogEntrySchema, {
      id: 'entry-2',
      installationId: 'installation-1',
      message: 'Second log entry',
      level: InstallationAuditLogLevel.WARNING,
    });

    listInstallationAuditLogEntries
      .mockResolvedValueOnce({ entries: [firstEntry], nextPageToken: 'next' })
      .mockResolvedValueOnce({ entries: [secondEntry], nextPageToken: '' });

    renderDialog('Status looks good.');

    expect(await screen.findByTestId('installation-status')).toBeTruthy();
    expect(screen.getByText('Status looks good.')).toBeTruthy();
    expect(await screen.findByText('First log entry')).toBeTruthy();
    expect(screen.getByTestId('installation-audit-log')).toBeTruthy();

    const loadMoreButton = await screen.findByTestId('load-more');
    fireEvent.click(loadMoreButton);

    await waitFor(() => {
      expect(listInstallationAuditLogEntries).toHaveBeenCalledTimes(2);
    });

    expect(listInstallationAuditLogEntries).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        installationId: 'installation-1',
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: '',
      }),
    );
    expect(listInstallationAuditLogEntries).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        installationId: 'installation-1',
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: 'next',
      }),
    );

    expect(await screen.findByText('Second log entry')).toBeTruthy();
  });
});
