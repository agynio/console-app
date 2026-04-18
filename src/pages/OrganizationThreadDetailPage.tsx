import { useMemo } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { create } from '@bufbuild/protobuf';
import { DurationSchema } from '@bufbuild/protobuf/wkt';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { filesClient, threadsClient } from '@/api/client';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageOrder } from '@/gen/agynio/api/threads/v1/threads_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useIdentityHandles } from '@/hooks/useIdentityHandles';
import {
  EMPTY_PLACEHOLDER,
  formatDateOnly,
  formatThreadStatus,
  formatTimestamp,
  truncate,
} from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

const attachmentExpiry = create(DurationSchema, {
  seconds: BigInt(900),
  nanos: 0,
});

type AttachmentLinkProps = {
  fileId: string;
};

function AttachmentLink({ fileId }: AttachmentLinkProps) {
  const downloadQuery = useQuery({
    queryKey: ['files', fileId, 'download'],
    queryFn: async () => {
      const [metadata, download] = await Promise.all([
        filesClient.getFileMetadata({ fileId }),
        filesClient.getDownloadUrl({ fileId, expiry: attachmentExpiry }),
      ]);
      return { file: metadata.file, url: download.url };
    },
    enabled: Boolean(fileId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (downloadQuery.isPending) {
    return <span className="text-xs text-muted-foreground">Loading attachment...</span>;
  }

  if (downloadQuery.isError || !downloadQuery.data?.url) {
    return <span className="text-xs text-muted-foreground">Attachment unavailable.</span>;
  }

  const label = downloadQuery.data.file?.filename || fileId;

  return (
    <a
      href={downloadQuery.data.url}
      className="text-sm text-primary underline underline-offset-4"
      target="_blank"
      rel="noreferrer"
      data-testid="thread-attachment-link"
    >
      Download {label}
    </a>
  );
}

export function OrganizationThreadDetailPage() {
  const { id, threadId } = useParams();
  const organizationId = id ?? '';
  const resolvedThreadId = threadId ?? '';

  const threadQuery = useQuery({
    queryKey: ['threads', resolvedThreadId, 'detail'],
    queryFn: () => threadsClient.getThread({ threadId: resolvedThreadId }),
    enabled: Boolean(resolvedThreadId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const messagesQuery = useInfiniteQuery({
    queryKey: ['threads', resolvedThreadId, 'messages'],
    queryFn: ({ pageParam }) =>
      threadsClient.getMessages({
        threadId: resolvedThreadId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        order: MessageOrder.NEWEST_FIRST,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(resolvedThreadId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const thread = threadQuery.data?.thread;
  const messages = useMemo(
    () => messagesQuery.data?.pages.flatMap((page) => page.messages) ?? [],
    [messagesQuery.data?.pages],
  );
  const participants = useMemo(() => thread?.participants ?? [], [thread?.participants]);

  const identityIds = useMemo(() => {
    const ids = new Set<string>();
    participants.forEach((participant) => {
      if (participant.id) ids.add(participant.id);
    });
    messages.forEach((message) => {
      if (message.senderId) ids.add(message.senderId);
    });
    return Array.from(ids);
  }, [messages, participants]);
  const { formatHandle } = useIdentityHandles(identityIds);

  const threadTitle = thread?.id ? `Thread ${truncate(thread.id, 12)}` : 'Thread';
  useDocumentTitle(threadTitle);

  const messageCount = thread?.messageCount ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button variant="link" asChild data-testid="thread-detail-back">
          <NavLink to={`/organizations/${organizationId}/threads`}>← Back to Threads</NavLink>
        </Button>
      </div>
      {threadQuery.isPending ? <div className="text-sm text-muted-foreground">Loading thread...</div> : null}
      {threadQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load thread.</div> : null}
      {thread ? (
        <Card className="border-border" data-testid="thread-detail-card">
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Thread details</h3>
              <p className="text-sm text-muted-foreground">Status, counts, and timestamps.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Thread ID</div>
                <div className="text-sm text-foreground">{thread.id}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Organization ID</div>
                <div className="text-sm text-foreground">{thread.organizationId || EMPTY_PLACEHOLDER}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
                <Badge variant="secondary">{formatThreadStatus(thread.status)}</Badge>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Messages</div>
                <div className="text-sm text-foreground">{messageCount.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Created</div>
                <div className="text-sm text-foreground">{formatDateOnly(thread.createdAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Updated</div>
                <div className="text-sm text-foreground">{formatDateOnly(thread.updatedAt)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card className="border-border" data-testid="thread-participants-card">
        <CardHeader className="pb-0">
          <CardTitle>Participants</CardTitle>
        </CardHeader>
        <CardContent>
          {participants.length === 0 ? (
            <div className="text-sm text-muted-foreground">No participants found.</div>
          ) : (
            <div className="divide-y divide-border">
              {participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  data-testid="thread-participant-row"
                >
                  <div>
                    <div className="text-sm font-medium text-foreground">{formatHandle(participant.id)}</div>
                    <div className="text-xs text-muted-foreground">{participant.id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {participant.passive ? (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Passive
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      Joined {formatDateOnly(participant.joinedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-border" data-testid="thread-messages-card">
        <CardHeader className="pb-0">
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {messagesQuery.isPending ? (
            <div className="text-sm text-muted-foreground">Loading messages...</div>
          ) : null}
          {messagesQuery.isError ? (
            <div className="text-sm text-muted-foreground">Failed to load messages.</div>
          ) : null}
          {messages.length === 0 && !messagesQuery.isPending ? (
            <div className="text-sm text-muted-foreground">No messages yet.</div>
          ) : null}
          {messages.map((message) => (
            <div
              key={message.id}
              className="rounded-lg border border-border p-4"
              data-testid="thread-message-row"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">{formatHandle(message.senderId)}</div>
                <div className="text-xs text-muted-foreground">{formatTimestamp(message.createdAt)}</div>
              </div>
              <div className="mt-2 text-sm text-foreground whitespace-pre-wrap">
                {message.body || EMPTY_PLACEHOLDER}
              </div>
              {message.fileIds.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Attachments</div>
                  <div className="space-y-1">
                    {message.fileIds.map((fileId) => (
                      <AttachmentLink key={fileId} fileId={fileId} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          <LoadMoreButton
            hasMore={messagesQuery.hasNextPage}
            isLoading={messagesQuery.isFetchingNextPage}
            onClick={() => messagesQuery.fetchNextPage()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
