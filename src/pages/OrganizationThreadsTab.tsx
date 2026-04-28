import { useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { Code, ConnectError } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import { TimestampSchema, type Timestamp } from '@bufbuild/protobuf/wkt';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { threadsClient } from '@/api/client';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { SortableHeader } from '@/components/SortableHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ListOrganizationThreadsSortField,
  SortDirection as ThreadsSortDirection,
  type Thread,
  ThreadStatus,
} from '@/gen/agynio/api/threads/v1/threads_pb';
import type { NotificationEnvelope } from '@/gen/agynio/api/notifications/v1/notifications_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { type SortDirection } from '@/hooks/useListControls';
import { useUserContext } from '@/context/UserContext';
import { EMPTY_PLACEHOLDER, formatDateOnly, formatThreadStatus, truncate } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

type ThreadSortKey = 'status' | 'messages' | 'created' | 'updated';

const THREAD_STATUS_OPTIONS = [ThreadStatus.ACTIVE, ThreadStatus.ARCHIVED, ThreadStatus.DEGRADED];

type ThreadsPage = Awaited<ReturnType<typeof threadsClient.listOrganizationThreads>>;

const parseDateInput = (value: string, isEnd = false): Date | null => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map((segment) => Number(segment));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (isEnd) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
};

const toTimestamp = (date: Date): Timestamp =>
  create(TimestampSchema, {
    seconds: BigInt(Math.floor(date.getTime() / 1000)),
    nanos: 0,
  });

const formatNickname = (nickname?: string) => {
  const trimmed = nickname?.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
};

const extractThreadId = (payload?: NotificationEnvelope['payload']): string | null => {
  if (!payload) return null;
  const resolveString = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value : null;
  const direct = resolveString(payload.threadId ?? payload.thread_id ?? payload.id);
  if (direct) return direct;
  const thread = payload.thread;
  if (!thread || typeof thread !== 'object' || Array.isArray(thread)) return null;
  const threadRecord = thread as Record<string, unknown>;
  return resolveString(threadRecord.threadId ?? threadRecord.thread_id ?? threadRecord.id);
};

const resetPagination = <TPage,>(
  _data: InfiniteData<TPage, unknown> | undefined,
  firstPage: TPage,
): InfiniteData<TPage, unknown> => ({ pages: [firstPage], pageParams: [''] });

const upsertThread = (
  data: InfiniteData<Awaited<ReturnType<typeof threadsClient.listOrganizationThreads>>, unknown> | undefined,
  thread: Thread,
): InfiniteData<Awaited<ReturnType<typeof threadsClient.listOrganizationThreads>>, unknown> | undefined => {
  if (!data) return data;
  if (!thread.id) return data;

  let found = false;
  const nextPages = data.pages.map((page) => {
    const nextThreads = page.threads.map((item) => {
      if (item.id === thread.id) {
        found = true;
        return thread;
      }
      return item;
    });
    return { ...page, threads: nextThreads };
  });

  if (!found && nextPages.length > 0) {
    const firstPage = nextPages[0];
    const withoutDuplicate = firstPage.threads.filter((item) => item.id !== thread.id);
    const nextThreads = [thread, ...withoutDuplicate].slice(0, DEFAULT_PAGE_SIZE);
    nextPages[0] = { ...firstPage, threads: nextThreads };
  }

  return { ...data, pages: nextPages };
};

export function OrganizationThreadsTab() {
  useDocumentTitle('Threads');

  const { id } = useParams();
  const organizationId = id ?? '';
  const { identityId } = useUserContext();
  const queryClient = useQueryClient();
  const [participantFilter, setParticipantFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [sortKey, setSortKey] = useState<ThreadSortKey>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const notificationRooms = useMemo(
    () => (identityId ? [`thread_participant:${identityId}`] : []),
    [identityId],
  );

  const { rangeError, startDate, endDate } = useMemo(() => {
    const parsedStart = parseDateInput(createdAfter, false);
    const parsedEnd = parseDateInput(createdBefore, true);
    if (parsedStart && parsedEnd && parsedStart > parsedEnd) {
      return { rangeError: 'Start date must be before end date.', startDate: parsedStart, endDate: parsedEnd };
    }
    return { rangeError: '', startDate: parsedStart, endDate: parsedEnd };
  }, [createdAfter, createdBefore]);

  const filterKey = useMemo(
    () => ({ participants: participantFilter, status: statusFilter, createdAfter, createdBefore }),
    [participantFilter, statusFilter, createdAfter, createdBefore],
  );
  const sortSpec = useMemo(() => {
    const fieldMap: Record<ThreadSortKey, ListOrganizationThreadsSortField> = {
      status: ListOrganizationThreadsSortField.STATUS,
      messages: ListOrganizationThreadsSortField.MESSAGE_COUNT,
      created: ListOrganizationThreadsSortField.CREATED,
      updated: ListOrganizationThreadsSortField.UPDATED,
    };
    return {
      field: fieldMap[sortKey],
      direction: sortDirection === 'asc' ? ThreadsSortDirection.ASC : ThreadsSortDirection.DESC,
    };
  }, [sortDirection, sortKey]);
  const statusValues = useMemo(
    () => statusFilter.map((value) => Number(value) as ThreadStatus).filter((value) => value > 0),
    [statusFilter],
  );

  const filterSpec = useMemo(() => {
    const createdAfterValue = rangeError ? undefined : startDate ? toTimestamp(startDate) : undefined;
    const createdBeforeValue = rangeError ? undefined : endDate ? toTimestamp(endDate) : undefined;
    const hasFilters =
      participantFilter.length > 0 ||
      statusValues.length > 0 ||
      createdAfterValue !== undefined ||
      createdBeforeValue !== undefined;
    if (!hasFilters) return undefined;
    return {
      participantIdIn: participantFilter,
      statusIn: statusValues,
      createdAfter: createdAfterValue,
      createdBefore: createdBeforeValue,
    };
  }, [participantFilter, statusValues, startDate, endDate, rangeError]);

  const threadsQueryKey = useMemo(
    () => ['threads', organizationId, 'list', filterKey, sortSpec] as const,
    [filterKey, organizationId, sortSpec],
  );

  const fetchThreadsPage = (pageToken: string): Promise<ThreadsPage> =>
    threadsClient.listOrganizationThreads({
      organizationId,
      pageSize: DEFAULT_PAGE_SIZE,
      pageToken,
      filter: filterSpec,
      sort: sortSpec,
    });

  const threadsQuery = useInfiniteQuery({
    queryKey: threadsQueryKey,
    queryFn: ({ pageParam }) => fetchThreadsPage(pageParam),
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
  const visibleThreads = threads;
  const isLoading = threadsQuery.isPending;
  const isError = threadsQuery.isError;
  const isPermissionDenied =
    threadsQuery.error instanceof ConnectError && threadsQuery.error.code === Code.PermissionDenied;

  const participantOptions = useMemo(() => {
    const participantMap = new Map<string, { value: string; label: string; secondary?: string }>();
    threads.forEach((thread) => {
      thread.participants.forEach((participant) => {
        if (!participant.id) return;
        const nickname = formatNickname(participant.nickname);
        const label = nickname || participant.id;
        participantMap.set(participant.id, {
          value: participant.id,
          label,
          secondary: nickname ? participant.id : undefined,
        });
      });
    });
    return Array.from(participantMap.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [threads]);

  const statusOptions = useMemo(
    () =>
      THREAD_STATUS_OPTIONS.map((status) => ({
        value: String(status),
        label: formatThreadStatus(status),
      })),
    [],
  );

  const hasActiveFilters =
    participantFilter.length > 0 ||
    statusFilter.length > 0 ||
    createdAfter.length > 0 ||
    createdBefore.length > 0;
  const hasActiveControls = hasActiveFilters || sortKey !== 'created' || sortDirection !== 'desc';
  const handleSort = (key: ThreadSortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  useNotifications({
    events: ['message.created'],
    rooms: notificationRooms,
    enabled: Boolean(organizationId) && notificationRooms.length > 0,
    onEvent: (envelope) => {
      if (hasActiveControls) {
        void (async () => {
          try {
            const firstPage = await fetchThreadsPage('');
            queryClient.setQueryData<
              InfiniteData<Awaited<ReturnType<typeof threadsClient.listOrganizationThreads>>, unknown>
            >(threadsQueryKey, (data) => resetPagination(data, firstPage));
          } catch (error) {
            console.error('[useNotifications] thread refetch error:', error);
          }
        })();
        return;
      }

      const threadId = extractThreadId(envelope.payload);
      if (!threadId) return;
      void (async () => {
        try {
          const response = await threadsClient.getThread({ threadId });
          const thread = response.thread;
          if (!thread) return;
          queryClient.setQueryData<InfiniteData<Awaited<ReturnType<typeof threadsClient.listOrganizationThreads>>, unknown>>(
            threadsQueryKey,
            (data) => upsertThread(data, thread),
          );
        } catch (error) {
          console.error('[useNotifications] thread update error:', error);
        }
      })();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[200px]">
          <MultiSelectFilter
            label="Participant"
            options={participantOptions}
            selectedValues={participantFilter}
            onChange={setParticipantFilter}
            testId="organization-threads-participant-filter"
          />
        </div>
        <div className="min-w-[180px]">
          <MultiSelectFilter
            label="Status"
            options={statusOptions}
            selectedValues={statusFilter}
            onChange={setStatusFilter}
            testId="organization-threads-status-filter"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Created after</span>
            <Input
              type="date"
              value={createdAfter}
              onChange={(event) => setCreatedAfter(event.target.value)}
              data-testid="organization-threads-created-after"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Created before</span>
            <Input
              type="date"
              value={createdBefore}
              onChange={(event) => setCreatedBefore(event.target.value)}
              data-testid="organization-threads-created-before"
            />
          </div>
        </div>
      </div>
      {rangeError ? <div className="text-sm text-destructive">{rangeError}</div> : null}
      {isLoading ? <div className="text-sm text-muted-foreground">Loading threads...</div> : null}
      {isError ? (
        <div className="text-sm text-muted-foreground">
          {isPermissionDenied ? 'You do not have permission to view threads.' : 'Failed to load threads.'}
        </div>
      ) : null}
      {visibleThreads.length === 0 && !isLoading && !isError ? (
        <Card className="border-border" data-testid="organization-threads-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {hasActiveFilters ? 'No results found.' : 'No threads yet.'}
          </CardContent>
        </Card>
      ) : null}
      {visibleThreads.length > 0 ? (
        <Card className="border-border" data-testid="organization-threads-table">
          <CardContent className="px-0">
            <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr]">
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
              <SortableHeader
                label="Updated"
                sortKey="updated"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            </div>
            <div className="divide-y divide-border">
              {visibleThreads.map((thread) => {
                const threadId = thread.id;
                const messageCount = thread.messageCount ?? 0;
                const participantHandles = thread.participants
                  .map((participant) => formatNickname(participant.nickname) || participant.id)
                  .filter((handle) => handle);
                const participantsLabel = participantHandles.length > 0
                  ? truncate(participantHandles.join(', '), 60)
                  : EMPTY_PLACEHOLDER;

                return (
                  <NavLink
                    key={threadId}
                    to={`/organizations/${organizationId}/threads/${threadId}`}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <span className="text-xs text-muted-foreground" data-testid="organization-thread-updated">
                      {formatDateOnly(thread.updatedAt)}
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
