import { useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { Code, ConnectError } from '@connectrpc/connect';
import { useInfiniteQuery } from '@tanstack/react-query';
import { threadsClient } from '@/api/client';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { SortableHeader } from '@/components/SortableHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ListOrganizationThreadsSortField,
  SortDirection as ThreadsSortDirection,
  ThreadStatus,
} from '@/gen/agynio/api/threads/v1/threads_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useIdentityHandles } from '@/hooks/useIdentityHandles';
import { useNotifications } from '@/hooks/useNotifications';
import { type SortDirection } from '@/hooks/useListControls';
import { useUserContext } from '@/context/UserContext';
import { EMPTY_PLACEHOLDER, formatDateOnly, formatThreadStatus, truncate } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

type ThreadSortKey = 'status' | 'messages' | 'created';

const THREAD_STATUS_OPTIONS = [ThreadStatus.ACTIVE, ThreadStatus.ARCHIVED, ThreadStatus.DEGRADED];

export function OrganizationThreadsTab() {
  useDocumentTitle('Threads');

  const { id } = useParams();
  const organizationId = id ?? '';
  const { identityId } = useUserContext();
  const [participantFilter, setParticipantFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<ThreadSortKey>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const notificationRooms = useMemo(
    () => (identityId ? [`thread_participant:${identityId}`] : []),
    [identityId],
  );

  useNotifications({
    events: ['message.created'],
    invalidateKeys: [['threads', organizationId, 'list']],
    rooms: notificationRooms,
    enabled: Boolean(organizationId) && notificationRooms.length > 0,
  });

  const normalizedParticipant = participantFilter.trim();
  const filterKey = useMemo(
    () => ({ participant: normalizedParticipant, status: statusFilter }),
    [normalizedParticipant, statusFilter],
  );
  const sortSpec = useMemo(() => {
    const fieldMap: Record<ThreadSortKey, ListOrganizationThreadsSortField> = {
      status: ListOrganizationThreadsSortField.STATUS,
      messages: ListOrganizationThreadsSortField.MESSAGE_COUNT,
      created: ListOrganizationThreadsSortField.CREATED,
    };
    return {
      field: fieldMap[sortKey],
      direction: sortDirection === 'asc' ? ThreadsSortDirection.ASC : ThreadsSortDirection.DESC,
    };
  }, [sortDirection, sortKey]);
  const filterSpec = useMemo(() => {
    const statusValue = statusFilter === 'all' ? null : (Number(statusFilter) as ThreadStatus);
    return {
      participantIdIn: normalizedParticipant ? [normalizedParticipant] : [],
      statusIn: statusValue ? [statusValue] : [],
    };
  }, [normalizedParticipant, statusFilter]);

  const threadsQuery = useInfiniteQuery({
    queryKey: ['threads', organizationId, 'list', filterKey, sortSpec],
    queryFn: ({ pageParam }) =>
      threadsClient.listOrganizationThreads({
        organizationId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        filter: filterSpec,
        sort: sortSpec,
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
  const isPermissionDenied =
    threadsQuery.error instanceof ConnectError && threadsQuery.error.code === Code.PermissionDenied;

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
  const hasActiveFilters = normalizedParticipant.length > 0 || statusFilter !== 'all';
  const handleSort = (key: ThreadSortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] max-w-sm flex-1">
          <Input
            placeholder="Filter by participant ID..."
            value={participantFilter}
            onChange={(event) => setParticipantFilter(event.target.value)}
            data-testid="organization-threads-search"
          />
        </div>
        <div className="min-w-[180px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="organization-threads-status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {THREAD_STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={String(status)}>
                  {formatThreadStatus(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading threads...</div> : null}
      {isError ? (
        <div className="text-sm text-muted-foreground">
          {isPermissionDenied ? 'You do not have permission to view threads.' : 'Failed to load threads.'}
        </div>
      ) : null}
      {threads.length === 0 && !isLoading && !isError ? (
        <Card className="border-border" data-testid="organization-threads-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {hasActiveFilters ? 'No results found.' : 'No threads yet.'}
          </CardContent>
        </Card>
      ) : null}
      {threads.length > 0 ? (
        <Card className="border-border" data-testid="organization-threads-table">
          <CardContent className="px-0">
            <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_2fr_1fr_1fr_1fr]">
              <span>Thread</span>
              <span>Participants</span>
              <SortableHeader
                label="Status"
                sortKey="status"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Messages"
                sortKey="messages"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Created"
                sortKey="created"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
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
        onClick={() => {
          void threadsQuery.fetchNextPage();
        }}
      />
    </div>
  );
}
