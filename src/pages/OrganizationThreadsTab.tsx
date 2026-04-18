import { useMemo } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { threadsClient } from '@/api/client';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useIdentityHandles } from '@/hooks/useIdentityHandles';
import { EMPTY_PLACEHOLDER, formatDateOnly, formatThreadStatus, truncate } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationThreadsTab() {
  useDocumentTitle('Threads');

  const { id } = useParams();
  const organizationId = id ?? '';

  const threadsQuery = useInfiniteQuery({
    queryKey: ['threads', organizationId, 'list'],
    queryFn: ({ pageParam }) =>
      threadsClient.listOrganizationThreads({
        organizationId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const threads = useMemo(
    () => threadsQuery.data?.pages.flatMap((page) => page.threads) ?? [],
    [threadsQuery.data?.pages],
  );
  const isLoading = threadsQuery.isPending;
  const isError = threadsQuery.isError;

  const identityIds = useMemo(() => {
    const ids = new Set<string>();
    threads.forEach((thread) => {
      thread.participants.forEach((participant) => {
        if (participant.id) ids.add(participant.id);
      });
    });
    return Array.from(ids);
  }, [threads]);

  const { formatHandle } = useIdentityHandles(identityIds);

  return (
    <div className="space-y-4">
      {isLoading ? <div className="text-sm text-muted-foreground">Loading threads...</div> : null}
      {isError ? <div className="text-sm text-muted-foreground">Failed to load threads.</div> : null}
      {threads.length === 0 && !isLoading ? (
        <Card className="border-border" data-testid="organization-threads-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No threads yet.
          </CardContent>
        </Card>
      ) : null}
      {threads.length > 0 ? (
        <Card className="border-border" data-testid="organization-threads-table">
          <CardContent className="px-0">
            <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_2fr_1fr_1fr_1fr]">
              <span>Thread</span>
              <span>Participants</span>
              <span>Status</span>
              <span>Messages</span>
              <span>Created</span>
            </div>
            <div className="divide-y divide-border">
              {threads.map((thread) => {
                const threadId = thread.id;
                const messageCount = thread.messageCount ?? 0;
                const participantHandles = thread.participants
                  .map((participant) => formatHandle(participant.id))
                  .filter((handle) => handle !== EMPTY_PLACEHOLDER);
                const participantsLabel =
                  participantHandles.length > 0
                    ? truncate(participantHandles.join(', '), 60)
                    : EMPTY_PLACEHOLDER;

                return (
                  <NavLink
                    key={threadId}
                    to={`/organizations/${organizationId}/threads/${threadId}`}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_2fr_1fr_1fr_1fr] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="organization-thread-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="organization-thread-id">
                        {truncate(threadId, 18)}
                      </div>
                      <div className="text-xs text-muted-foreground">{threadId}</div>
                    </div>
                    <div
                      className="text-xs text-muted-foreground"
                      data-testid="organization-thread-participants"
                    >
                      {participantsLabel}
                    </div>
                    <Badge variant="secondary" data-testid="organization-thread-status">
                      {formatThreadStatus(thread.status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground" data-testid="organization-thread-messages">
                      {messageCount.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="organization-thread-created">
                      {formatDateOnly(thread.createdAt)}
                    </span>
                  </NavLink>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <LoadMoreButton
        hasMore={threadsQuery.hasNextPage}
        isLoading={threadsQuery.isFetchingNextPage}
        onClick={() => threadsQuery.fetchNextPage()}
      />
    </div>
  );
}
