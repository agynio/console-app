import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageTitleProvider } from '@/context/PageTitleContext';
import { AuthMethod, Protocol } from '@/gen/agynio/api/llm/v1/llm_pb';
import { OrganizationLlmProvidersTab } from '@/pages/OrganizationLlmProvidersTab';

const { listLLMProviders, createLLMProvider } = vi.hoisted(() => ({
  listLLMProviders: vi.fn(),
  createLLMProvider: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  llmClient: {
    listLLMProviders,
    createLLMProvider,
    updateLLMProvider: vi.fn(),
    deleteLLMProvider: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PageTitleProvider>
        <MemoryRouter initialEntries={['/organizations/org-1/llm-providers']}>
          <Routes>
            <Route path="/organizations/:id/llm-providers" element={<OrganizationLlmProvidersTab />} />
          </Routes>
        </MemoryRouter>
      </PageTitleProvider>
    </QueryClientProvider>,
  );
}

async function openCreateDialog() {
  listLLMProviders.mockResolvedValue({ providers: [], nextPageToken: '' });
  renderTab();
  fireEvent.click(await screen.findByTestId('organization-llm-providers-create'));
  await screen.findByTestId('organization-llm-providers-create-dialog');
}

describe('add provider dialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens on the default vendor', async () => {
    await openCreateDialog();
    expect(
      screen.getByTestId('organization-llm-providers-create-preset-openai').getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByTestId('organization-llm-providers-create-preset-custom').getAttribute('aria-checked'),
    ).toBe('false');
  });

  // The endpoint, auth method and protocol are the vendor's, not a choice, so
  // for a known vendor there is nothing to ask beyond the key.
  it('asks only for the key when a vendor is chosen', async () => {
    await openCreateDialog();

    expect(screen.queryByTestId('organization-llm-providers-create-endpoint')).toBeNull();
    expect(screen.queryByTestId('organization-llm-providers-create-auth')).toBeNull();
    expect(screen.queryByTestId('organization-llm-providers-create-protocol')).toBeNull();
    expect(screen.getByTestId('organization-llm-providers-create-token')).not.toBeNull();
  });

  it('reveals the fields only for a custom endpoint', async () => {
    await openCreateDialog();

    fireEvent.click(screen.getByTestId('organization-llm-providers-create-preset-custom'));
    await waitFor(() => {
      expect(screen.queryByTestId('organization-llm-providers-create-endpoint')).not.toBeNull();
    });
    expect(screen.getByTestId('organization-llm-providers-create-auth')).not.toBeNull();
    expect(screen.getByTestId('organization-llm-providers-create-protocol')).not.toBeNull();
    // Custom starts blank rather than inheriting the vendor's URL.
    expect((screen.getByTestId('organization-llm-providers-create-endpoint') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByTestId('organization-llm-providers-create-preset-anthropic'));
    await waitFor(() => {
      expect(screen.queryByTestId('organization-llm-providers-create-endpoint')).toBeNull();
    });
  });

  // The whole point of the preset: a vendor the user never configured still
  // gets the endpoint, header and protocol that vendor actually needs.
  it('sends the vendor endpoint, auth method and protocol it never showed', async () => {
    createLLMProvider.mockResolvedValue({});
    await openCreateDialog();

    fireEvent.click(screen.getByTestId('organization-llm-providers-create-preset-anthropic'));
    fireEvent.change(screen.getByTestId('organization-llm-providers-create-token'), {
      target: { value: 'sk-ant-secret' },
    });
    fireEvent.click(screen.getByTestId('organization-llm-providers-create-submit'));

    await waitFor(() => {
      expect(createLLMProvider).toHaveBeenCalledWith({
        endpoint: 'https://api.anthropic.com/v1/messages',
        authMethod: AuthMethod.X_API_KEY,
        protocol: Protocol.ANTHROPIC_MESSAGES,
        token: 'sk-ant-secret',
        organizationId: 'org-1',
      });
    });
  });

  it('defaults a straight submit to the vendor it opened on', async () => {
    createLLMProvider.mockResolvedValue({});
    await openCreateDialog();

    fireEvent.change(screen.getByTestId('organization-llm-providers-create-token'), {
      target: { value: 'sk-secret' },
    });
    fireEvent.click(screen.getByTestId('organization-llm-providers-create-submit'));

    await waitFor(() => {
      expect(createLLMProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://api.openai.com/v1/responses',
          authMethod: AuthMethod.BEARER,
          protocol: Protocol.RESPONSES,
        }),
      );
    });
  });
});
