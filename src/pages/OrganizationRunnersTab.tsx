import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Button } from '@/components/ui/button';
import { EnrollRunnerDialog } from '@/components/EnrollRunnerDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatLabelPairs, formatRunnerStatus } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';

export function OrganizationRunnersTab() {
  useDocumentTitle('Runners');

  const { id } = useParams();
  const organizationId = id ?? '';
  const [enrollOpen, setEnrollOpen] = useState(false);

  const runnersQuery = useInfiniteQuery({
    queryKey: ['runners', organizationId, 'list'],
    queryFn: ({ pageParam }) =>
      runnersClient.listRunners({ organizationId, pageSize: DEFAULT_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const runners = runnersQuery.data?.pages.flatMap((page) => page.runners) ?? [];
  const listControls = useListControls({
    items: runners,
    searchFields: [
      (runner) => runner.name,
      (runner) => runner.meta?.id ?? '',
      (runner) => formatRunnerStatus(runner.status),
      (runner) => formatLabelPairs(runner.labels),
    ],
    sortOptions: {
      name: (runner) => runner.name,
      status: (runner) => formatRunnerStatus(runner.status),
      labels: (runner) => formatLabelPairs(runner.labels),
    },
    defaultSortKey: 'name',
  });

  const visibleRunners = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search runners..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="list-search"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEnrollOpen(true)}
          data-testid="organization-runners-enroll"
        >
          Enroll runner
        </Button>
      </div>
      {runnersQuery.isPending ? <div className="text-sm text-muted-foreground">Loading runners...</div> : null}
      {runnersQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load runners.</div> : null}
      <Card className="border-border" data-testid="organization-runners-table">
        <CardContent className="px-0">
          <div
            className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_2fr]"
            data-testid="organization-runners-header"
          >
            <SortableHeader
              label="Runner"
              sortKey="name"
              activeSortKey={listControls.sortKey}
              sortDirection={listControls.sortDirection}
              onSort={listControls.handleSort}
            />
            <SortableHeader
              label="Status"
              sortKey="status"
              activeSortKey={listControls.sortKey}
              sortDirection={listControls.sortDirection}
              onSort={listControls.handleSort}
            />
            <SortableHeader
              label="Labels"
              sortKey="labels"
              activeSortKey={listControls.sortKey}
              sortDirection={listControls.sortDirection}
              onSort={listControls.handleSort}
            />
          </div>
          <div className="divide-y divide-border">
            {visibleRunners.length === 0 ? (
              <div className="px-6 py-6 text-sm text-muted-foreground">
                {hasSearch ? 'No results found.' : 'No runners registered.'}
              </div>
            ) : (
              visibleRunners.map((runner) => (
                <div
                  key={runner.meta?.id ?? runner.name}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_2fr]"
                  data-testid="organization-runner-row"
                >
                  <div>
                    <div className="font-medium" data-testid="organization-runner-name">
                      {runner.name}
                    </div>
                    <div className="text-xs text-muted-foreground" data-testid="organization-runner-id">
                      {runner.meta?.id}
                    </div>
                  </div>
                  <Badge variant="secondary" data-testid="organization-runner-status">
                    {formatRunnerStatus(runner.status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground" data-testid="organization-runner-labels">
                    {formatLabelPairs(runner.labels)}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
      <LoadMoreButton
        hasMore={Boolean(runnersQuery.hasNextPage)}
        isLoading={runnersQuery.isFetchingNextPage}
        onClick={() => {
          void runnersQuery.fetchNextPage();
        }}
      />
      <EnrollRunnerDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        organizationId={organizationId}
        description="Register a new organization runner and copy its enrollment token."
        namePlaceholder="org-runner-1"
        testIds={{
          dialog: 'organization-runners-enroll-dialog',
          title: 'organization-runners-enroll-title',
          description: 'organization-runners-enroll-description',
          nameInput: 'organization-runners-enroll-name',
          labelsHeading: 'organization-runners-labels',
          labelsPrefix: 'organization-runners-enroll',
          cancel: 'organization-runners-enroll-cancel',
          submit: 'organization-runners-enroll-submit',
          tokenLabel: 'organization-runners-token',
          tokenValue: 'organization-runners-token-value',
          tokenWarning: 'organization-runners-token-warning',
          tokenCopy: 'organization-runners-token-copy',
          tokenDone: 'organization-runners-token-done',
        }}
      />
    </div>
  );
}
