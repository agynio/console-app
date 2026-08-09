import type { ReactNode } from 'react';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { UsageBucketSchema } from '@/gen/agynio/api/metering/v1/metering_pb';
import { useUsageGroups } from '@/hooks/useUsageGroups';
import { consumerQueryConfigs, consumerQuerySources, identifiedGroupTotals } from '@/lib/usageConsumers';

const { getInstance, getSandbox, getAgent, getEnvironment } = vi.hoisted(() => ({
  getInstance: vi.fn(),
  getSandbox: vi.fn(),
  getAgent: vi.fn(),
  getEnvironment: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  agentsClient: { getInstance, getSandbox, getAgent, getEnvironment },
}));

const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';
const SANDBOX_ID = '22222222-2222-2222-2222-222222222222';
const GONE_ID = '33333333-3333-3333-3333-333333333333';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usage consumer levels', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // The three levels are the point of the control; a level that queried a
  // column metering does not have would silently rank nothing.
  it('queries one column per level, and both workload columns', () => {
    const columnsFor = (level: Parameters<typeof consumerQueryConfigs>[1]) =>
      new Set(consumerQueryConfigs('llm', level).map((config) => config.groupBy));

    expect(columnsFor('workload')).toEqual(new Set(['agent_instance_id', 'sandbox_id']));
    expect(columnsFor('agent')).toEqual(new Set(['agent_id']));
    expect(columnsFor('environment')).toEqual(new Set(['environment_id']));

    // Each section queries only its own unit: a shared level would make the
    // control in one card silently refetch the other two.
    expect(consumerQueryConfigs('compute', 'agent').map((config) => config.key)).toEqual([
      'compute-consumers-agent_id',
    ]);
    expect(consumerQueryConfigs('storage', 'agent').map((config) => config.key)).toEqual([
      'storage-consumers-agent_id',
    ]);
  });

  // Every key carries the column it grouped by, which is what lets an id be
  // looked up against one service instead of tried against several.
  it('pairs every ranking query with the column it groups by', () => {
    expect(consumerQuerySources('llm', 'workload')).toEqual([
      { key: 'llm-consumers-input-agent_instance_id', column: 'agent_instance_id' },
      { key: 'llm-consumers-output-agent_instance_id', column: 'agent_instance_id' },
      { key: 'llm-consumers-input-sandbox_id', column: 'sandbox_id' },
      { key: 'llm-consumers-output-sandbox_id', column: 'sandbox_id' },
    ]);
  });

  // identity_id holds an agent instance for LLM records, which resolved to no
  // user, agent class, or app -- so every consumer used to render as "Unknown".
  it('names each id through the one service that can own it', async () => {
    getInstance.mockResolvedValue({ instance: { handle: '@support#57abbfa6' } });
    getSandbox.mockResolvedValue({ sandbox: { name: 'scratch-box' } });

    const { result } = renderHook(
      () =>
        useUsageGroups([
          { id: INSTANCE_ID, column: 'agent_instance_id' },
          { id: SANDBOX_ID, column: 'sandbox_id' },
        ]),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.resolveGroup(INSTANCE_ID).label).toBe('@support#57abbfa6');
    });
    await waitFor(() => {
      expect(result.current.resolveGroup(SANDBOX_ID).label).toBe('scratch-box');
    });
    expect(result.current.resolveGroup(INSTANCE_ID).kind).toBe('instance');
    expect(result.current.resolveGroup(SANDBOX_ID).kind).toBe('sandbox');

    // Nothing is probed. Asking Instances about a sandbox id answers 404, which
    // the browser reports as a failed request whether or not the code catches it.
    expect(getInstance).toHaveBeenCalledTimes(1);
    expect(getInstance).toHaveBeenCalledWith({ id: INSTANCE_ID });
    expect(getSandbox).toHaveBeenCalledTimes(1);
    expect(getAgent).not.toHaveBeenCalled();
    expect(getEnvironment).not.toHaveBeenCalled();
  });

  it('asks Agents and Environments directly at the coarser levels', async () => {
    getAgent.mockResolvedValue({ agent: { nickname: 'support', name: 'Support' } });
    getEnvironment.mockResolvedValue({ environment: { name: 'production' } });

    const agents = renderHook(() => useUsageGroups([{ id: INSTANCE_ID, column: 'agent_id' }]), { wrapper });
    await waitFor(() => {
      expect(agents.result.current.resolveGroup(INSTANCE_ID).label).toBe('@support');
    });

    const environments = renderHook(() => useUsageGroups([{ id: INSTANCE_ID, column: 'environment_id' }]), {
      wrapper,
    });
    await waitFor(() => {
      expect(environments.result.current.resolveGroup(INSTANCE_ID).label).toBe('production');
    });

    expect(getInstance).not.toHaveBeenCalled();
    expect(getSandbox).not.toHaveBeenCalled();
  });

  // A record deleted since the usage was recorded still spent what it spent.
  it('keeps a deleted record under its id rather than dropping the row', async () => {
    getInstance.mockRejectedValue(new ConnectError('gone', Code.NotFound));

    const { result } = renderHook(() => useUsageGroups([{ id: GONE_ID, column: 'agent_instance_id' }]), { wrapper });

    await waitFor(() => {
      expect(result.current.resolveGroup(GONE_ID).label).toBe(GONE_ID);
    });
    expect(result.current.resolveGroup(GONE_ID).kind).toBe('instance');
  });

  // Every column queried returns the same ungrouped rows for records that have
  // no value there, so counting them would add that usage once per column.
  it('drops rows that have no value for the grouped column', () => {
    const totals = identifiedGroupTotals([
      create(UsageBucketSchema, { value: 50_000_000n, groupValue: '' }),
      create(UsageBucketSchema, { value: 90_000_000n, groupValue: INSTANCE_ID }),
    ]);

    expect(Array.from(totals.keys())).toEqual([INSTANCE_ID]);
  });
});
