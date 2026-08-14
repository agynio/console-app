import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PageTitleProvider } from '@/context/PageTitleContext';
import { OrganizationImagesTab } from '@/pages/OrganizationImagesTab';

const { listImages, createImage, deleteImage, listSecrets, createSecret } = vi.hoisted(() => ({
  listImages: vi.fn(),
  createImage: vi.fn(),
  deleteImage: vi.fn(),
  listSecrets: vi.fn(),
  createSecret: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  imagesClient: { listImages, createImage, deleteImage },
  secretsClient: { listSecrets, createSecret },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PageTitleProvider>
        <MemoryRouter initialEntries={['/org-1/images']}>
          <Routes>
            <Route path="/:id/images" element={<OrganizationImagesTab />} />
          </Routes>
        </MemoryRouter>
      </PageTitleProvider>
    </QueryClientProvider>,
  );
}

describe('OrganizationImagesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listImages.mockResolvedValue({ images: [] });
    listSecrets.mockResolvedValue({ secrets: [{ meta: { id: 'sec-1' }, title: 'ghcr token' }] });
    createImage.mockResolvedValue({ image: { meta: { id: 'img-1' } } });
    deleteImage.mockResolvedValue({});
  });

  afterEach(cleanup);

  // The registry password is held by reference, so the dialog offers a secret
  // rather than a password field.
  it('offers no password field', async () => {
    renderTab();
    await screen.findByTestId('images-empty');

    fireEvent.click(screen.getByTestId('images-register-open'));
    expect(screen.queryByTestId('images-register-password')).toBeNull();
    expect(screen.getByTestId('images-register-secret')).toBeTruthy();
  });

  it('registers an anonymous repository with no reference', async () => {
    renderTab();
    await screen.findByTestId('images-empty');

    fireEvent.click(screen.getByTestId('images-register-open'));
    fireEvent.change(screen.getByTestId('images-register-name'), {
      target: { value: 'devcontainer-go' },
    });
    fireEvent.change(screen.getByTestId('images-register-repository'), {
      target: { value: 'ghcr.io/agynio/devcontainer-go' },
    });
    fireEvent.click(screen.getByTestId('images-register-submit'));

    await waitFor(() => expect(createImage).toHaveBeenCalledTimes(1));
    expect(createImage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        name: 'devcontainer-go',
        repository: 'ghcr.io/agynio/devcontainer-go',
        secretId: '',
      }),
    );
    expect(createSecret).not.toHaveBeenCalled();
    expect(createImage.mock.calls[0][0]).not.toHaveProperty('password');
  });
});
