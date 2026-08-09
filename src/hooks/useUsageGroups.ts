import { useMemo } from 'react';
import { Code, ConnectError } from '@connectrpc/connect';
import { useQueries } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';

/** The levels usage can be ranked at, coarsest last. */
export type UsageGroupBy = 'workload' | 'agent' | 'environment';

export type UsageGroupKind = 'instance' | 'sandbox' | 'agent' | 'environment';

export type UsageGroupInfo = {
  label: string;
  kind: UsageGroupKind;
  kindLabel: string;
};

/** The metering column an id was grouped by, which is also what it is. */
export type UsageGroupColumn = 'agent_instance_id' | 'sandbox_id' | 'agent_id' | 'environment_id';

export type UsageGroupRef = { id: string; column: UsageGroupColumn };

// A workload is an agent instance or a sandbox, and metering keeps them in
// separate columns rather than one column plus a discriminator, so each level
// names the columns it sums.
export const USAGE_GROUP_COLUMNS: Record<UsageGroupBy, UsageGroupColumn[]> = {
  workload: ['agent_instance_id', 'sandbox_id'],
  agent: ['agent_id'],
  environment: ['environment_id'],
};

export const USAGE_GROUP_OPTIONS: Array<{ value: UsageGroupBy; label: string }> = [
  { value: 'workload', label: 'Agent instance / sandbox' },
  { value: 'agent', label: 'Agent' },
  { value: 'environment', label: 'Environment' },
];

const columnKinds: Record<UsageGroupColumn, UsageGroupKind> = {
  agent_instance_id: 'instance',
  sandbox_id: 'sandbox',
  agent_id: 'agent',
  environment_id: 'environment',
};

const kindLabels: Record<UsageGroupKind, string> = {
  instance: 'Agent instance',
  sandbox: 'Sandbox',
  agent: 'Agent',
  environment: 'Environment',
};

function isNotFound(error: unknown): boolean {
  return error instanceof ConnectError && error.code === Code.NotFound;
}

/**
 * A record deleted since the usage was recorded still spent what it spent, so a
 * miss keeps the row under its id rather than dropping it. This is the only
 * request that is allowed to come back empty — nothing here guesses what an id
 * might be, so a 404 means the record is genuinely gone.
 */
async function loadName(ref: UsageGroupRef): Promise<string | null> {
  try {
    switch (ref.column) {
      case 'agent_instance_id': {
        const instance = (await agentsClient.getInstance({ id: ref.id })).instance;
        return instance?.handle || (instance?.nickname ? `@${instance.nickname}#${instance.suffix}` : null);
      }
      case 'sandbox_id':
        return (await agentsClient.getSandbox({ ref: { case: 'id', value: ref.id } })).sandbox?.name ?? null;
      case 'agent_id': {
        const agent = (await agentsClient.getAgent({ id: ref.id })).agent;
        return agent?.nickname ? `@${agent.nickname}` : (agent?.name ?? null);
      }
      case 'environment_id':
        return (await agentsClient.getEnvironment({ id: ref.id })).environment?.name ?? null;
    }
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * Resolves the ids a usage chart ranks into names. Each id is looked up against
 * the one service that can own it, decided by the column it was grouped by —
 * asking Instances about a sandbox id would answer 404 for every sandbox on the
 * page, and reading a name out of a listing would miss anything past page one.
 */
export function useUsageGroups(refs: UsageGroupRef[]) {
  const unique = useMemo(() => {
    const seen = new Map<string, UsageGroupRef>();
    refs.forEach((ref) => {
      if (ref.id && !seen.has(ref.id)) seen.set(ref.id, ref);
    });
    return Array.from(seen.values());
  }, [refs]);

  const queries = useQueries({
    queries: unique.map((ref) => ({
      queryKey: ['usage-group', ref.column, ref.id],
      queryFn: () => loadName(ref),
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const names = useMemo(
    () => new Map(unique.flatMap((ref, index) => (queries[index]?.data ? [[ref.id, queries[index].data as string]] : []))),
    [unique, queries],
  );

  const kinds = useMemo(() => new Map(unique.map((ref) => [ref.id, columnKinds[ref.column]])), [unique]);

  const resolveGroup = useMemo(
    () =>
      (id: string): UsageGroupInfo => {
        const kind = kinds.get(id) ?? 'instance';
        return { label: names.get(id) ?? id, kind, kindLabel: kindLabels[kind] };
      },
    [names, kinds],
  );

  return { resolveGroup };
}
