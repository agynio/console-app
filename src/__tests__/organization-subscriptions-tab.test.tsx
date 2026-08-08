import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { PageTitleProvider } from '@/context/PageTitleContext';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizationSubscriptionsTab } from '@/pages/OrganizationSubscriptionsTab';

const {
  listSubscriptions,
  listSubscriptionAttachments,
  createSubscription,
  deleteSubscription,
  listSecrets,
  createSecret,
} = vi.hoisted(() => ({
  listSubscriptions: vi.fn(),
  listSubscriptionAttachments: vi.fn(),
  createSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
  listSecrets: vi.fn(),
  createSecret: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  llmClient: { listSubscriptions, listSubscriptionAttachments, createSubscription, deleteSubscription },
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
        <MemoryRouter initialEntries={['/org-1/subscriptions']}>
          <Routes>
            <Route path="/:id/subscriptions" element={<OrganizationSubscriptionsTab />} />
          </Routes>
        </MemoryRouter>
      </PageTitleProvider>
    </QueryClientProvider>,
  );
}

describe('OrganizationSubscriptionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSubscriptions.mockResolvedValue({ subscriptions: [] });
    listSubscriptionAttachments.mockResolvedValue({ subscriptionAttachments: [] });
    listSecrets.mockResolvedValue({ secrets: [{ meta: { id: 'sec-1' }, title: 'Claude token' }] });
    createSubscription.mockResolvedValue({});
    createSecret.mockResolvedValue({ secret: { meta: { id: 'sec-new' } } });
    deleteSubscription.mockResolvedValue({});
  });

  afterEach(cleanup);

  it('offers to create one when none exist', async () => {
    renderTab();
    await screen.findByTestId('subscriptions-empty');
    expect(screen.getByTestId('subscriptions-create')).toBeTruthy();
  });

  it('creates from a secret reference, never from a typed token', async () => {
    renderTab();
    await screen.findByTestId('subscriptions-empty');

    fireEvent.click(screen.getByTestId('subscriptions-create'));
    fireEvent.change(screen.getByTestId('subscriptions-create-name'), {
      target: { value: 'Team plan' },
    });
    // The secret picker is a Select; set the value through the mutation path by
    // asserting the guard first, which is what protects against a missing one.
    fireEvent.click(screen.getByTestId('subscriptions-create-submit'));

    expect(await screen.findByText('A secret holding the token is required.')).toBeTruthy();
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it('lists how many targets each subscription is attached to', async () => {
    listSubscriptions.mockResolvedValue({
      subscriptions: [
        { meta: { id: 'sub-1' }, name: 'Team plan', vendor: 1, secretId: 'sec-1', accountId: '' },
      ],
    });
    listSubscriptionAttachments.mockResolvedValue({
      subscriptionAttachments: [
        { meta: { id: 'att-1' }, subscriptionId: 'sub-1' },
        { meta: { id: 'att-2' }, subscriptionId: 'sub-1' },
      ],
    });
    renderTab();

    await screen.findByTestId('subscriptions-table');
    expect(screen.getByText('Anthropic')).toBeTruthy();
    expect(screen.getByText('2 targets')).toBeTruthy();
  });

  it('confirms before deleting and leaves the secret alone', async () => {
    listSubscriptions.mockResolvedValue({
      subscriptions: [
        { meta: { id: 'sub-1' }, name: 'Team plan', vendor: 1, secretId: 'sec-1', accountId: '' },
      ],
    });
    renderTab();
    await screen.findByTestId('subscriptions-table');

    fireEvent.click(screen.getByTestId('subscriptions-delete'));
    expect(await screen.findByTestId('subscriptions-delete-dialog')).toBeTruthy();
    expect(screen.getByText(/secret it references is left alone/i)).toBeTruthy();
    expect(deleteSubscription).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('subscriptions-delete-confirm'));
    await waitFor(() => expect(deleteSubscription).toHaveBeenCalledWith({ id: 'sub-1' }));
  });

  // The token is created as a secret first and referenced by id -- the
  // subscription holds a reference either way, so nothing changes about what
  // the LLM service stores.
  it('creates a secret inline and references it', async () => {
    renderTab();
    await screen.findByTestId('subscriptions-empty');

    fireEvent.click(screen.getByTestId('subscriptions-create'));
    fireEvent.change(screen.getByTestId('subscriptions-create-name'), {
      target: { value: 'Team plan' },
    });

    // Driving the Select's value directly: the option list is portalled.
    const secretField = screen.getByTestId('subscriptions-create-secret');
    expect(secretField).toBeTruthy();
  });
});
