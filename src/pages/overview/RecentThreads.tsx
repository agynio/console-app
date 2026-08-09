import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { Code, ConnectError } from '@connectrpc/connect';
import { useQueries, useQuery } from '@tanstack/react-query';
import { threadsClient } from '@/api/client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ListOrganizationThreadsSortField,
  MessageOrder,
  SortDirection,
} from '@/gen/agynio/api/threads/v1/threads_pb';
import { formatAge, truncate } from '@/lib/format';

type RecentThreadsProps = {
  organizationId: string;
};

const MAX_ROWS = 5;
const OPENER_LENGTH = 72;

/** The line a thread opens with, on one line and short enough for a row. */
function opener(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  return collapsed ? truncate(collapsed, OPENER_LENGTH) : '';
}

export function RecentThreads({ organizationId }: RecentThreadsProps) {
  const threadsQuery = useQuery({
    queryKey: ['threads', organizationId, 'overview'],
    queryFn: () =>
      threadsClient.listOrganizationThreads({
        organizationId,
        pageSize: MAX_ROWS,
        pageToken: '',
        sort: { field: ListOrganizationThreadsSortField.UPDATED, direction: SortDirection.DESC },
      }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const threads = useMemo(() => threadsQuery.data?.threads ?? [], [threadsQuery.data?.threads]);

  // One call per row: the list carries no message bodies, and the opening line
  // is what tells the conversations apart.
  const openers = useQueries({
    queries: threads.map((thread) => ({
      queryKey: ['threads', thread.id, 'opener'],
      queryFn: () =>
        threadsClient.getMessages({
          threadId: thread.id,
          pageSize: 1,
          pageToken: '',
          order: MessageOrder.OLDEST_FIRST,
        }),
      enabled: Boolean(thread.id),
      staleTime: 300_000,
      refetchOnWindowFocus: false,
      retry: false,
    })),
  });

  // Listing an organization's threads is a permission a plain member may not
  // hold, and a panel that only ever says "forbidden" is worse than no panel.
  const isForbidden =
    threadsQuery.error instanceof ConnectError && threadsQuery.error.code === Code.PermissionDenied;
  if (isForbidden) return null;

  return (
    <Card className="gap-3 border-border px-4 py-3" data-testid="organization-overview-threads-panel">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">Recent threads</span>
        {threads.length > 0 ? (
          <NavLink
            to={`/organizations/${organizationId}/threads`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            All threads
          </NavLink>
        ) : null}
      </div>
      <div>
        {threadsQuery.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : threadsQuery.isError ? (
          <div className="text-sm text-muted-foreground">Failed to load threads.</div>
        ) : threads.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">
            No conversations yet. One starts when someone messages an agent.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {threads.map((thread, index) => {
              const first = openers[index]?.data?.messages?.[0];
              const label = first ? opener(first.body) : '';
              return (
                <NavLink
                  key={thread.id}
                  to={`/organizations/${organizationId}/threads/${thread.id}`}
                  className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0 hover:text-foreground"
                  data-testid="organization-overview-thread-row"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {label || <span className="text-muted-foreground">No messages yet</span>}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {formatAge(thread.updatedAt ?? thread.createdAt)}
                  </span>
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
