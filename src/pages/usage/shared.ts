import { useMemo } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { QueryUsageResponse } from '@/gen/agynio/api/metering/v1/metering_pb';
import type { UsageGroupColumn, UsageGroupInfo, UsageGroupRef } from '@/hooks/useUsageGroups';
import { identifiedGroupTotals } from '@/lib/usageConsumers';
import type { ConsumerRow } from './cards';
import type { UsageQueryMap } from './useUsageQueries';

type Query = UseQueryResult<QueryUsageResponse, Error> | undefined;

/** A ranking query alongside the column its group values came from. */
export type ConsumerSource = { query: Query; column: UsageGroupColumn };

export type ConsumerTotal = { value: number; column: UsageGroupColumn };

export function sumBuckets(query: Query): bigint {
  return (query?.data?.buckets ?? []).reduce((total, bucket) => total + bucket.value, 0n);
}

export function sectionSources(
  byKey: UsageQueryMap,
  sources: Array<{ key: string; column: UsageGroupColumn }>,
): ConsumerSource[] {
  return sources.map((source) => ({ query: byKey[source.key], column: source.column }));
}

/**
 * Sums one ranking across every column its level queries, keeping the column an
 * id came from. An id only ever appears under one column — an instance id is
 * never a sandbox id — so the column is a fact about the id, not a guess.
 */
export function consumerTotals(
  sources: ConsumerSource[],
  transform: (value: bigint) => number,
): Map<string, ConsumerTotal> {
  const merged = new Map<string, { value: bigint; column: UsageGroupColumn }>();
  sources.forEach((source) => {
    identifiedGroupTotals(source.query?.data?.buckets ?? []).forEach((value, id) => {
      const current = merged.get(id);
      merged.set(id, { value: (current?.value ?? 0n) + value, column: current?.column ?? source.column });
    });
  });

  const mapped = new Map<string, ConsumerTotal>();
  merged.forEach((entry, id) => mapped.set(id, { value: transform(entry.value), column: entry.column }));
  return mapped;
}

const TOP_N = 5;

function ranked(totals: Map<string, ConsumerTotal>): Array<[string, ConsumerTotal]> {
  return Array.from(totals.entries())
    .sort((left, right) => right[1].value - left[1].value)
    .slice(0, TOP_N);
}

export function buildConsumerRows(
  totals: Map<string, ConsumerTotal>,
  resolveGroup: (id: string) => UsageGroupInfo,
): ConsumerRow[] {
  return ranked(totals).map(([id, entry]) => {
    const info = resolveGroup(id);
    return { id, label: info.label, detail: info.kindLabel, kind: info.kind, value: entry.value };
  });
}

/**
 * The ids the resolver should look up, stable across renders. The totals behind
 * them are rebuilt every render, so depending on the array itself would hand the
 * resolver a new list — and a new set of lookups — each time.
 */
export function useConsumerRefs(totals: Map<string, ConsumerTotal>): UsageGroupRef[] {
  const key = ranked(totals)
    .map(([id, entry]) => `${entry.column}:${id}`)
    .sort()
    .join(',');
  return useMemo(
    () =>
      key
        ? key.split(',').map((entry) => {
            const [column, id] = entry.split(':');
            return { id, column: column as UsageGroupColumn };
          })
        : [],
    [key],
  );
}
