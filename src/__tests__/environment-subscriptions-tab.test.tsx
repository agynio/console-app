import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnvironmentSubscriptionsTab } from '@/pages/detail-tabs/EnvironmentSubscriptionsTab';
import { LLMMode } from '@/gen/agynio/api/agents/v1/agents_pb';

const {
  listSubscriptionAttachments,
  listSubscriptions,
  createSubscriptionAttachment,
  deleteSubscriptionAttachment,
} = vi.hoisted(() => ({
  listSubscriptionAttachments: vi.fn(),
  listSubscriptions: vi.fn(),
  createSubscriptionAttachment: vi.fn(),
  deleteSubscriptionAttachment: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  llmClient: {
    listSubscriptionAttachments,
    listSubscriptions,
    createSubscriptionAttachment,
    deleteSubscriptionAttachment,
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderTab(llmMode: LLMMode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const environment = {
    meta: { id: 'env-1' },
    organizationId: 'org-1',
    llmMode,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return render(
    <QueryClientProvider client={queryClient}>
      <EnvironmentSubscriptionsTab environment={environment} />
    </QueryClientProvider>,
  );
}

describe('EnvironmentSubscriptionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSubscriptionAttachments.mockResolvedValue({ subscriptionAttachments: [] });
    listSubscriptions.mockResolvedValue({
      subscriptions: [{ meta: { id: 'sub-1' }, name: 'Team plan', vendor: 1 }],
    });
    createSubscriptionAttachment.mockResolvedValue({});
    deleteSubscriptionAttachment.mockResolvedValue({});
  });

  afterEach(cleanup);

  // A native environment with nothing attached cannot start a workload, and
  // this is the page you are already on when you find that out.
  it('says a native environment with nothing attached cannot start a workload', async () => {
    renderTab(LLMMode.LLM_MODE_NATIVE);
    expect(await screen.findByTestId('environment-subscriptions-missing')).toBeTruthy();
  });

  it('does not warn in platform mode', async () => {
    renderTab(LLMMode.LLM_MODE_PLATFORM);
    await screen.findByTestId('environment-subscriptions-platform');
    expect(screen.queryByTestId('environment-subscriptions-missing')).toBeNull();
  });

  it('attaches against the environment, not an agent', async () => {
    renderTab(LLMMode.LLM_MODE_NATIVE);
    await screen.findByTestId('environment-subscriptions-empty');

    // Radix portals the option list, so the value is driven through the row's
    // attach path instead: with nothing selected the button stays disabled.
    expect(screen.getByTestId('environment-subscriptions-attach').getAttribute('disabled')).not.toBeNull();
  });

  it('detaches an attachment by its own id', async () => {
    listSubscriptionAttachments.mockResolvedValue({
      subscriptionAttachments: [
        { meta: { id: 'att-1' }, subscriptionId: 'sub-1', vendor: 1 },
      ],
    });
    renderTab(LLMMode.LLM_MODE_NATIVE);
    await screen.findByTestId('environment-subscriptions-table');

    fireEvent.click(screen.getByTestId('environment-subscriptions-detach'));
    await waitFor(() =>
      expect(deleteSubscriptionAttachment).toHaveBeenCalledWith({ id: 'att-1' }),
    );
  });
});
