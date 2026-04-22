import { create } from '@bufbuild/protobuf';
import { TimestampSchema } from '@bufbuild/protobuf/wkt';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Code, ConnectError } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageTitleProvider } from '@/context/PageTitleContext';
import {
  EntityMetaSchema,
  InstallationAuditLogEntrySchema,
  InstallationAuditLogLevel,
  InstallationSchema,
} from '@/gen/agynio/api/apps/v1/apps_pb';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { InstallationDetailPage } from '@/pages/InstallationDetailPage';

const { getInstallation, listInstallationAuditLogEntries, uninstallApp, updateInstallation } = vi.hoisted(() => ({
  getInstallation: vi.fn(),
  listInstallationAuditLogEntries: vi.fn(),
  uninstallApp: vi.fn(),
  updateInstallation: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  appsClient: {
    getInstallation,
    listInstallationAuditLogEntries,
    uninstallApp,
    updateInstallation,
  },
}));

function toTimestamp(iso: string) {
  const date = new Date(iso);
  return create(TimestampSchema, {
    seconds: BigInt(Math.floor(date.getTime() / 1000)),
    nanos: 0,
  });
}

function buildInstallation({ status = 'Installation ready.', organizationId = 'org-1' } = {}) {
  return create(InstallationSchema, {
    meta: create(EntityMetaSchema, { id: 'installation-1', createdAt: toTimestamp('2024-05-01T00:00:00Z') }),
    appId: 'app-1',
    organizationId,
    slug: 'demo-installation',
    status,
    configuration: { region: 'us-east' },
  });
}

function buildAuditEntry({
  id,
  message,
  level,
  createdAt,
}: {
  id: string;
  message: string;
  level: InstallationAuditLogLevel;
  createdAt: string;
}) {
  return create(InstallationAuditLogEntrySchema, {
    id,
    installationId: 'installation-1',
    message,
    level,
    createdAt: toTimestamp(createdAt),
  });
}

function renderPage(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/organizations/:id/apps/installations/:installationId"
              element={<InstallationDetailPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

describe('InstallationDetailPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    getInstallation.mockReset();
    listInstallationAuditLogEntries.mockReset();
    uninstallApp.mockReset();
    updateInstallation.mockReset();
  });

  it('renders status and paginates audit log entries in newest-first order', async () => {
    getInstallation.mockResolvedValueOnce({ installation: buildInstallation({ status: 'All systems go.' }) });
    const olderEntry = buildAuditEntry({
      id: 'entry-1',
      message: 'Older log entry',
      level: InstallationAuditLogLevel.INFO,
      createdAt: '2024-05-01T10:00:00Z',
    });
    const newerEntry = buildAuditEntry({
      id: 'entry-2',
      message: 'Newer log entry',
      level: InstallationAuditLogLevel.WARNING,
      createdAt: '2024-05-01T12:00:00Z',
    });

    listInstallationAuditLogEntries
      .mockResolvedValueOnce({ entries: [olderEntry], nextPageToken: 'next' })
      .mockResolvedValueOnce({ entries: [newerEntry], nextPageToken: '' });

    renderPage('/organizations/org-1/apps/installations/installation-1');

    expect(await screen.findByTestId('installation-status')).toBeTruthy();
    expect(screen.getByText('All systems go.')).toBeTruthy();

    await waitFor(() => {
      expect(listInstallationAuditLogEntries).toHaveBeenCalledWith({
        installationId: 'installation-1',
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: '',
      });
    });

    const loadMoreButton = await screen.findByTestId('load-more');
    fireEvent.click(loadMoreButton);

    await waitFor(() => {
      expect(listInstallationAuditLogEntries).toHaveBeenCalledTimes(2);
    });
    expect(listInstallationAuditLogEntries).toHaveBeenNthCalledWith(2, {
      installationId: 'installation-1',
      pageSize: DEFAULT_PAGE_SIZE,
      pageToken: 'next',
    });

    await screen.findByText('Newer log entry');
    const logMessages = screen.getAllByText(/log entry/).map((node) => node.textContent);
    expect(logMessages).toEqual(['Newer log entry', 'Older log entry']);
  });

  it('hides status and audit log when empty', async () => {
    getInstallation.mockResolvedValueOnce({ installation: buildInstallation({ status: '   ' }) });
    listInstallationAuditLogEntries.mockResolvedValueOnce({ entries: [], nextPageToken: '' });

    renderPage('/organizations/org-1/apps/installations/installation-1');

    await waitFor(() => {
      expect(listInstallationAuditLogEntries).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('installation-status')).toBeNull();
      expect(screen.queryByTestId('installation-audit-log')).toBeNull();
    });
  });

  it('shows not found when installation is missing', async () => {
    getInstallation.mockRejectedValueOnce(new ConnectError('not found', Code.NotFound));

    renderPage('/organizations/org-1/apps/installations/installation-1');

    expect(await screen.findByText('Installation not found.')).toBeTruthy();
    expect(screen.queryByText('Failed to load installation.')).toBeNull();
    expect(listInstallationAuditLogEntries).not.toHaveBeenCalled();
  });

  it('shows not found when installation does not belong to org', async () => {
    getInstallation.mockResolvedValueOnce({ installation: buildInstallation({ organizationId: 'org-2' }) });

    renderPage('/organizations/org-1/apps/installations/installation-1');

    expect(await screen.findByText('Installation not found.')).toBeTruthy();
    expect(listInstallationAuditLogEntries).not.toHaveBeenCalled();
  });
});
