import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageTitleProvider } from '@/context/PageTitleContext';
import {
  EntityMetaSchema,
  NetworkSchema,
  TunnelConnectivity,
  TunnelCredentialSchema,
  TunnelEnrollmentState,
} from '@/gen/agynio/api/networks/v1/networks_pb';
import { OrganizationPrivateNetworkDetailPage } from '@/pages/OrganizationPrivateNetworksPage';

const { getNetwork, updateNetwork, deleteNetwork, listTunnelCredentials, createTunnelCredential, deleteTunnelCredential } =
  vi.hoisted(() => ({
    getNetwork: vi.fn(),
    updateNetwork: vi.fn(),
    deleteNetwork: vi.fn(),
    listTunnelCredentials: vi.fn(),
    createTunnelCredential: vi.fn(),
    deleteTunnelCredential: vi.fn(),
  }));

const { downloadTextFile } = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));

vi.mock('@/api/client', () => ({
  networksClient: {
    getNetwork,
    updateNetwork,
    deleteNetwork,
    listTunnelCredentials,
    createTunnelCredential,
    deleteTunnelCredential,
  },
}));

vi.mock('@/lib/download', () => ({ downloadTextFile }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const ENROLLMENT_JWT = `header.${'a'.repeat(600)}.signature`;

function renderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/organizations/org-1/private-networks/net-1']}>
          <Routes>
            <Route
              path="/organizations/:id/private-networks/:networkId"
              element={<OrganizationPrivateNetworkDetailPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

describe('OrganizationPrivateNetworkDetailPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    getNetwork.mockReset();
    updateNetwork.mockReset();
    deleteNetwork.mockReset();
    listTunnelCredentials.mockReset();
    createTunnelCredential.mockReset();
    deleteTunnelCredential.mockReset();
    downloadTextFile.mockReset();

    getNetwork.mockResolvedValue({
      network: create(NetworkSchema, {
        meta: create(EntityMetaSchema, {
          id: 'net-1',
          createdAt: timestampFromDate(new Date('2026-01-02T03:04:05Z')),
        }),
        organizationId: 'org-1',
        name: 'production-vpc',
        description: 'Private resources reachable through this network',
      }),
    });
    updateNetwork.mockResolvedValue({});
    listTunnelCredentials.mockResolvedValue({ tunnelCredentials: [], nextPageToken: '' });
    createTunnelCredential.mockResolvedValue({
      tunnelCredential: create(TunnelCredentialSchema, {
        meta: create(EntityMetaSchema, { id: 'tunnel-1' }),
        networkId: 'net-1',
      }),
      enrollmentJwt: ENROLLMENT_JWT,
    });
  });

  it('shows the network read-only and edits it in a dialog', async () => {
    renderDetailPage();

    expect(await screen.findByTestId('network-detail-id')).toBeTruthy();
    expect(screen.getByTestId('network-detail-description').textContent).toBe(
      'Private resources reachable through this network',
    );
    // Nothing is editable until Edit is chosen.
    expect(screen.queryByTestId('network-detail-edit-dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('network-detail-edit'));

    const nameInput = (await screen.findByTestId('network-detail-edit-name')) as HTMLInputElement;
    expect(nameInput.value).toBe('production-vpc');

    fireEvent.change(nameInput, { target: { value: 'staging-vpc' } });
    fireEvent.click(screen.getByTestId('network-detail-edit-submit'));

    await waitFor(() => {
      expect(updateNetwork).toHaveBeenCalledWith({
        id: 'net-1',
        name: 'staging-vpc',
        description: 'Private resources reachable through this network',
      });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('network-detail-edit-dialog')).toBeNull();
    });
  });

  it('shows the enrollment window on pending tunnels only', async () => {
    listTunnelCredentials.mockResolvedValue({
      tunnelCredentials: [
        create(TunnelCredentialSchema, {
          meta: create(EntityMetaSchema, { id: 'tunnel-enrolled' }),
          networkId: 'net-1',
          enrollmentState: TunnelEnrollmentState.ENROLLED,
          connectivity: TunnelConnectivity.ONLINE,
          enrollmentJwtExpiresAt: timestampFromDate(new Date(Date.now() + 3_600_000)),
        }),
        create(TunnelCredentialSchema, {
          meta: create(EntityMetaSchema, { id: 'tunnel-pending' }),
          networkId: 'net-1',
          enrollmentState: TunnelEnrollmentState.PENDING,
          connectivity: TunnelConnectivity.OFFLINE,
          enrollmentJwtExpiresAt: timestampFromDate(new Date(Date.now() + 3_600_000)),
        }),
      ],
      nextPageToken: '',
    });

    renderDetailPage();

    const rows = await screen.findAllByTestId('tunnels-row');
    expect(rows).toHaveLength(2);
    // Enrolled: the window has already been used, so it says nothing.
    expect(within(rows[0]).queryByText(/enrollment expires/)).toBeNull();
    expect(within(rows[1]).getByText(/enrollment expires in/)).toBeTruthy();
  });

  it('issues a tunnel credential straight into a dialog and never reveals the JWT inline', async () => {
    renderDetailPage();

    fireEvent.click(await screen.findByTestId('tunnels-create'));

    const jwt = await screen.findByTestId('tunnel-jwt-value');
    expect(createTunnelCredential).toHaveBeenCalledWith({ networkId: 'net-1' });
    expect(jwt.textContent).toBe(ENROLLMENT_JWT);
    // The reveal lives in the dialog, so it is gone once the dialog is.
    expect(screen.getByTestId('tunnel-credential-dialog').contains(jwt)).toBe(true);

    fireEvent.click(screen.getByTestId('tunnel-jwt-download'));
    expect(downloadTextFile).toHaveBeenCalledWith(ENROLLMENT_JWT, 'tunnel-tunnel-1.jwt');

    fireEvent.click(screen.getByTestId('tunnel-jwt-done'));
    await waitFor(() => {
      expect(screen.queryByTestId('tunnel-jwt-value')).toBeNull();
    });
  });
});
