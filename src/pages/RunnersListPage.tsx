import { useState } from 'react';
import { NavLink } from 'react-router-dom';
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
import { useListControls } from '@/hooks/useListControls';

export function RunnersListPage() {
  const [enrollOpen, setEnrollOpen] = useState(false);

  const runnersQuery = useInfiniteQuery({
    queryKey: ['runners', 'list'],
    queryFn: ({ pageParam }) => runnersClient.listRunners({ pageSize: DEFAULT_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const runners = (runnersQuery.data?.pages.flatMap((page) => page.runners) ?? []).filter(
    (runner) => !runner.organizationId,
  );
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground" data-testid="runners-heading">
            Cluster Runners
          </h2>
          <p className="text-sm text-muted-foreground">Runners enrolled at the cluster level.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="runners-enroll-button"
          onClick={() => setEnrollOpen(true)}
        >
          Enroll runner
        </Button>
      </div>
      <div className="max-w-sm">
        <Input
          placeholder="Search runners..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid="list-search"
        />
      </div>
      {runnersQuery.isPending ? (
        <div className="text-sm text-muted-foreground">Loading runners...</div>
      ) : null}
      {runnersQuery.isError ? (
        <div className="text-sm text-muted-foreground">Failed to load runners.</div>
      ) : null}
      <Card className="border-border" data-testid="runners-table">
        <CardContent className="px-0">
          <div
            className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_2fr_120px]"
            data-testid="runners-header"
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
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-border">
            {visibleRunners.length === 0 ? (
              <div className="px-6 py-6 text-sm text-muted-foreground">
                {hasSearch ? 'No results found.' : 'No cluster runners yet.'}
              </div>
            ) : (
              visibleRunners.map((runner) => {
                const runnerId = runner.meta?.id;
                return (
                  <div
                    key={runner.meta?.id ?? runner.name}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_2fr_120px]"
                    data-testid="runners-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="runners-name">
                        {runner.name}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="runners-id">
                        {runner.meta?.id}
                      </div>
                    </div>
                    <Badge variant="secondary" data-testid="runners-status">
                      {formatRunnerStatus(runner.status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground" data-testid="runners-labels">
                      {formatLabelPairs(runner.labels)}
                    </span>
                    <div className="text-right">
                      {runnerId ? (
                        <Button variant="outline" size="sm" asChild>
                          <NavLink to={`/runners/${runnerId}`} data-testid="runners-view">
                            View
                          </NavLink>
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled data-testid="runners-view">
                          View
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
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
        description="Register a new cluster runner and copy its enrollment token."
        namePlaceholder="edge-runner-1"
        testIds={{
          dialog: 'runners-enroll-dialog',
          title: 'runners-enroll-title',
          description: 'runners-enroll-description',
          nameInput: 'runners-enroll-name',
          labelsHeading: 'runners-enroll-labels',
          labelsPrefix: 'runners-enroll',
          cancel: 'runners-enroll-cancel',
          submit: 'runners-enroll-submit',
          tokenLabel: 'runners-token-label',
          tokenValue: 'runners-token-value',
          tokenWarning: 'runners-token-warning',
          tokenCopy: 'runners-token-copy',
          tokenDone: 'runners-token-done',
        }}
      />
    </div>
  );
}
