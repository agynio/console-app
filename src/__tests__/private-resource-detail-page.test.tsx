import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageTitleProvider } from '@/context/PageTitleContext';
import {
  EntityMetaSchema,
  NetworkSchema,
  PrivateResourceProtocol,
  PrivateResourceSchema,
} from '@/gen/agynio/api/networks/v1/networks_pb';
import { PrivateResourceDetailPage } from '@/pages/PrivateResourceDetailPage';

const { getPrivateResource, updatePrivateResource, deletePrivateResource, getNetwork, listPrivateResourceAccess } =
  vi.hoisted(() => ({
    getPrivateResource: vi.fn(),
    updatePrivateResource: vi.fn(),
    deletePrivateResource: vi.fn(),
    getNetwork: vi.fn(),
    listPrivateResourceAccess: vi.fn(),
  }));

vi.mock('@/api/client', () => ({
  networksClient: {
    getPrivateResource,
    updatePrivateResource,
    deletePrivateResource,
    getNetwork,
    listPrivateResourceAccess,
    createPrivateResourceAccess: vi.fn(),
    deletePrivateResourceAccess: vi.fn(),
  },
}));

vi.mock('@/hooks/usePrincipalOptions', () => ({
  usePrincipalOptions: () => ({ options: [], isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/organizations/org-1/private-resources/res-1']}>
          <Routes>
            <Route path="/organizations/:id/private-resources/:resourceId" element={<PrivateResourceDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

describe('PrivateResourceDetailPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    getPrivateResource.mockReset();
    updatePrivateResource.mockReset();
    deletePrivateResource.mockReset();
    getNetwork.mockReset();
    listPrivateResourceAccess.mockReset();

    getPrivateResource.mockResolvedValue({
      privateResource: create(PrivateResourceSchema, {
        meta: create(EntityMetaSchema, {
          id: 'res-1',
          createdAt: timestampFromDate(new Date('2026-08-10T04:22:00Z')),
        }),
        networkId: 'net-1',
        name: 'vitalii-nginx',
        protocol: PrivateResourceProtocol.HTTP,
        targetHost: 'localhost',
        targetPorts: [3000],
        interceptHost: 'nginx.vitalii',
        interceptPorts: [3000],
      }),
    });
    updatePrivateResource.mockResolvedValue({});
    getNetwork.mockResolvedValue({
      network: create(NetworkSchema, {
        meta: create(EntityMetaSchema, { id: 'net-1' }),
        organizationId: 'org-1',
        name: 'local',
      }),
    });
    listPrivateResourceAccess.mockResolvedValue({ privateResourceAccess: [], nextPageToken: '' });
  });

  it('states the resource read-only, pairing intercept with target', async () => {
    renderDetailPage();

    expect((await screen.findByTestId('resource-detail-mapping')).textContent).toContain(
      'nginx.vitalii:3000',
    );
    expect(screen.getByTestId('resource-detail-mapping').textContent).toContain('localhost:3000');
    expect(screen.getByTestId('resource-connection-string').textContent).toBe('http://nginx.vitalii:3000');
    expect(screen.getByTestId('resource-detail-id').textContent).toBe('res-1');
    // The facts are stated, not offered as inputs.
    expect(screen.queryByTestId('resource-detail-target-host')).toBeNull();
    expect(screen.queryByTestId('resource-detail-edit-dialog')).toBeNull();
  });

  it('edits in a dialog that cannot move the resource to another network', async () => {
    renderDetailPage();

    fireEvent.click(await screen.findByTestId('private-resource-edit'));

    const targetPorts = (await screen.findByTestId('resource-detail-edit-target-ports')) as HTMLInputElement;
    expect(targetPorts.value).toBe('3000');
    // The network is stated, not a select: updatePrivateResource cannot move it.
    expect(screen.getByTestId('resource-detail-edit-network').textContent).toBe('local');

    fireEvent.change(targetPorts, { target: { value: '3000, 8080' } });
    fireEvent.change(screen.getByTestId('resource-detail-edit-intercept-ports'), {
      target: { value: '3000, 8080' },
    });
    fireEvent.click(screen.getByTestId('resource-detail-edit-submit'));

    await waitFor(() => {
      expect(updatePrivateResource).toHaveBeenCalledWith({
        id: 'res-1',
        name: 'vitalii-nginx',
        protocol: PrivateResourceProtocol.HTTP,
        targetHost: 'localhost',
        interceptHost: 'nginx.vitalii',
        targetPortsUpdate: { ports: [3000, 8080] },
        interceptPortsUpdate: { ports: [3000, 8080] },
      });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('resource-detail-edit-dialog')).toBeNull();
    });
  });
});
