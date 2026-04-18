import { useState, type ChangeEvent, type ReactNode } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Button } from '@/components/ui/button';
import { EnrollRunnerDialog } from '@/components/EnrollRunnerDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUserContext } from '@/context/UserContext';
import { formatLabelPairs, formatRunnerStatus } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls, type SortDirection } from '@/hooks/useListControls';

type Runner = Awaited<ReturnType<typeof runnersClient.listRunners>>['runners'][number];

type RunnerSortKey = 'name' | 'status' | 'labels';

type RunnerListControls = {
  sortKey: RunnerSortKey;
  sortDirection: SortDirection;
  handleSort: (key: RunnerSortKey) => void;
  filteredItems: Runner[];
};

type RunnerTableTestIds = {
  table: string;
  header: string;
  row: string;
  name: string;
  id: string;
  status: string;
  labels: string;
  scope: string;
};

type RunnerTableSectionProps = {
  title: string;
  description: string;
  listControls: RunnerListControls;
  hasSearch: boolean;
  emptyMessage: string;
  scopeLabel: string;
  headerAction?: ReactNode;
  renderAction: (runner: Runner) => ReactNode;
  testIds: RunnerTableTestIds;
};

function RunnerTableSection({
  title,
  description,
  listControls,
  hasSearch,
  emptyMessage,
  scopeLabel,
  headerAction,
  renderAction,
  testIds,
}: RunnerTableSectionProps) {
  const visibleRunners = listControls.filteredItems;
  const emptyState = hasSearch ? 'No results found.' : emptyMessage;
  const headerContent = (
    <div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {headerAction ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {headerContent}
          {headerAction}
        </div>
      ) : (
        headerContent
      )}
      <Card className="border-border" data-testid={testIds.table}>
        <CardContent className="px-0">
          <div
            className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_2fr_120px]"
            data-testid={testIds.header}
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
              <div className="px-6 py-6 text-sm text-muted-foreground">{emptyState}</div>
            ) : (
              visibleRunners.map((runner) => (
                <div
                  key={runner.meta?.id ?? runner.name}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_2fr_120px]"
                  data-testid={testIds.row}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium" data-testid={testIds.name}>
                        {runner.name}
                      </div>
                      <Badge variant="outline" data-testid={testIds.scope}>
                        {scopeLabel}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground" data-testid={testIds.id}>
                      {runner.meta?.id}
                    </div>
                  </div>
                  <Badge variant="secondary" data-testid={testIds.status}>
                    {formatRunnerStatus(runner.status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground" data-testid={testIds.labels}>
                    {formatLabelPairs(runner.labels)}
                  </span>
                  <div className="text-right">{renderAction(runner)}</div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function OrganizationRunnersTab() {
  useDocumentTitle('Runners');

  const { id } = useParams();
  const organizationId = id ?? '';
  const [enrollOpen, setEnrollOpen] = useState(false);
  const { isClusterAdmin } = useUserContext();

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
  const getScopeLabel = (runner: Runner) => (runner.organizationId ? 'Organization' : 'Cluster');
  const organizationRunners = runners.filter((runner) => runner.organizationId === organizationId);
  const clusterRunners = runners.filter((runner) => !runner.organizationId);
  const searchFields = [
    (runner: Runner) => runner.name,
    (runner: Runner) => runner.meta?.id ?? '',
    (runner: Runner) => formatRunnerStatus(runner.status),
    (runner: Runner) => getScopeLabel(runner),
    (runner: Runner) => formatLabelPairs(runner.labels),
  ];
  const runnerSortOptions = {
    name: (runner: Runner) => runner.name,
    status: (runner: Runner) => formatRunnerStatus(runner.status),
    labels: (runner: Runner) => formatLabelPairs(runner.labels),
  };

  const organizationListControls = useListControls({
    items: organizationRunners,
    searchFields,
    sortOptions: runnerSortOptions,
    defaultSortKey: 'name',
  });
  const clusterListControls = useListControls({
    items: clusterRunners,
    searchFields,
    sortOptions: runnerSortOptions,
    defaultSortKey: 'name',
  });

  const hasSearch = organizationListControls.searchTerm.trim().length > 0;

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    organizationListControls.setSearchTerm(value);
    clusterListControls.setSearchTerm(value);
  };

  const renderOrgRunnerView = (runner: Runner) => {
    const runnerId = runner.meta?.id;
    if (!runnerId || !organizationId) {
      return (
        <Button variant="outline" size="sm" disabled data-testid="organization-runner-view">
          View
        </Button>
      );
    }

    return (
      <Button variant="outline" size="sm" asChild>
        <NavLink to={`/organizations/${organizationId}/runners/${runnerId}`} data-testid="organization-runner-view">
          View
        </NavLink>
      </Button>
    );
  };

  const renderClusterRunnerView = (runner: Runner) => {
    const runnerId = runner.meta?.id;
    if (!runnerId) {
      return (
        <Button variant="outline" size="sm" disabled data-testid="organization-cluster-runner-view">
          View
        </Button>
      );
    }

    if (isClusterAdmin) {
      return (
        <Button variant="outline" size="sm" asChild>
          <NavLink to={`/runners/${runnerId}`} data-testid="organization-cluster-runner-view">
            View
          </NavLink>
        </Button>
      );
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">
            <Button variant="outline" size="sm" disabled data-testid="organization-cluster-runner-view">
              View
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          Cluster runners are only available to cluster admins.
        </TooltipContent>
      </Tooltip>
    );
  };

  const organizationTestIds: RunnerTableTestIds = {
    table: 'organization-runners-table',
    header: 'organization-runners-header',
    row: 'organization-runner-row',
    name: 'organization-runner-name',
    id: 'organization-runner-id',
    status: 'organization-runner-status',
    labels: 'organization-runner-labels',
    scope: 'organization-runner-scope',
  };

  const clusterTestIds: RunnerTableTestIds = {
    table: 'organization-cluster-runners-table',
    header: 'organization-cluster-runners-header',
    row: 'organization-cluster-runner-row',
    name: 'organization-cluster-runner-name',
    id: 'organization-cluster-runner-id',
    status: 'organization-cluster-runner-status',
    labels: 'organization-cluster-runner-labels',
    scope: 'organization-cluster-runner-scope',
  };

  const enrollAction = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setEnrollOpen(true)}
      data-testid="organization-runners-enroll"
    >
      Enroll runner
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="max-w-sm">
        <Input
          placeholder="Search runners..."
          value={organizationListControls.searchTerm}
          onChange={handleSearchChange}
          data-testid="list-search"
        />
      </div>
      {runnersQuery.isPending ? <div className="text-sm text-muted-foreground">Loading runners...</div> : null}
      {runnersQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load runners.</div> : null}
      <div className="space-y-6">
        <RunnerTableSection
          title="Organization Runners"
          description="Runners scoped to this organization."
          listControls={organizationListControls}
          hasSearch={hasSearch}
          emptyMessage="No organization runners registered."
          scopeLabel="Organization"
          headerAction={enrollAction}
          renderAction={renderOrgRunnerView}
          testIds={organizationTestIds}
        />
        <RunnerTableSection
          title="Cluster Runners"
          description="Shared runners available to this organization."
          listControls={clusterListControls}
          hasSearch={hasSearch}
          emptyMessage="No cluster runners available."
          scopeLabel="Cluster"
          renderAction={renderClusterRunnerView}
          testIds={clusterTestIds}
        />
      </div>
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
