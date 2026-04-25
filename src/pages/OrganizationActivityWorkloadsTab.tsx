import { useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { WorkloadsTable } from '@/components/WorkloadsTable';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationActivityWorkloadsTab() {
  useDocumentTitle('Workloads');

  const { id } = useParams();
  const organizationId = id ?? '';

  useNotifications({
    rooms: organizationId ? [`organization:${organizationId}`] : [],
    events: ['workload.updated'],
    invalidateKeys: [['workloads', organizationId, 'list']],
    enabled: Boolean(organizationId),
  });

  const workloadsQuery = useInfiniteQuery({
    queryKey: ['workloads', organizationId, 'list'],
    queryFn: ({ pageParam }) =>
      runnersClient.listWorkloads({
        organizationId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        statuses: [],
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const workloads = workloadsQuery.data?.pages.flatMap((page) => page.workloads) ?? [];

  return (
    <div className="space-y-6" data-testid="organization-activity-workloads">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">Workloads</h3>
        <p className="text-sm text-muted-foreground">
          Real-time view of running agent workloads in the organization.
        </p>
      </div>
      <WorkloadsTable
        workloads={workloads}
        query={workloadsQuery}
        showRunnerColumn
        testIdPrefix="organization-workloads"
      />
    </div>
  );
}
