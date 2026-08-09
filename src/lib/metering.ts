import { create } from '@bufbuild/protobuf';
import { TimestampSchema, type Timestamp } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError } from '@connectrpc/connect';
import { meteringClient } from '@/api/client';
import {
  QueryUsageResponseSchema,
  type Granularity,
  type QueryUsageResponse,
  type Unit,
  type UsageBucket,
} from '@/gen/agynio/api/metering/v1/metering_pb';

export function toTimestamp(date: Date): Timestamp {
  return create(TimestampSchema, {
    seconds: BigInt(Math.floor(date.getTime() / 1000)),
    nanos: 0,
  });
}

/** Metering is optional in a deployment, which reads as no data rather than a failure. */
export function isUsageUnavailable(error: unknown): boolean {
  return error instanceof ConnectError && (error.code === Code.Unimplemented || error.code === Code.NotFound);
}

export type UsageQuery = {
  organizationId: string;
  start: Date;
  end: Date;
  unit: Unit;
  granularity: Granularity;
  labelFilters?: Record<string, string>;
  groupBy?: string;
  timeZone?: string;
};

/** Reads usage, reporting an absent metering service as an empty series. */
export async function queryUsage(query: UsageQuery): Promise<QueryUsageResponse> {
  try {
    return await meteringClient.queryUsage({
      orgId: query.organizationId,
      start: toTimestamp(query.start),
      end: toTimestamp(query.end),
      unit: query.unit,
      labelFilters: query.labelFilters ?? {},
      groupBy: query.groupBy ?? '',
      granularity: query.granularity,
      timeZone: query.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch (error) {
    if (isUsageUnavailable(error)) {
      return create(QueryUsageResponseSchema, { buckets: [] });
    }
    throw error;
  }
}

export function sumUsageBuckets(buckets: UsageBucket[]): bigint {
  return buckets.reduce((total, bucket) => total + bucket.value, 0n);
}
