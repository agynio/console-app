import { useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { WorkloadsTable } from '@/components/WorkloadsTable';
import { Card, CardContent } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationMonitoringTab() {
  useDocumentTitle('Monitoring');

  const { id } = useParams();
  const organizationId = id ?? '';

  useNotifications({
    events: ['workload.status_changed'],
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

  const stubSections = [
    {
      id: 'storage',
      title: 'Storage',
      description: 'Surface persistent volume usage and health.',
      stub: 'Storage monitoring is pending architectural design for PVC state tracking.',
    },
    {
      id: 'usage-metrics',
      title: 'Usage Metrics',
      description: 'View usage-based metrics for billing and trends.',
      stub: 'Usage metrics require a dedicated metering service (pending design).',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3" data-testid="organization-monitoring-active-workloads">
        <div>
          <h4 className="text-base font-semibold text-foreground">Active Workloads</h4>
          <p className="text-sm text-muted-foreground">Track running workloads deployed for this organization.</p>
        </div>
        <WorkloadsTable
          workloads={workloads}
          query={workloadsQuery}
          showRunnerColumn
          testIdPrefix="organization-workloads"
        />
      </div>
      {stubSections.map((section) => (
        <div key={section.id} className="space-y-3" data-testid={`organization-monitoring-${section.id}`}>
          <div>
            <h4 className="text-base font-semibold text-foreground">{section.title}</h4>
            <p className="text-sm text-muted-foreground">{section.description}</p>
          </div>
          <Card className="border-border">
            <CardContent className="py-6 text-sm text-muted-foreground">{section.stub}</CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
