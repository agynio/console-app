import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatLabelPairs, formatRunnerStatus } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function RunnersListPage() {
  const runnersQuery = useQuery({
    queryKey: ['runners', 'list'],
    queryFn: () => runnersClient.listRunners({ pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const runners = (runnersQuery.data?.runners ?? []).filter((runner) => !runner.organizationId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">Cluster Runners</h2>
          <p className="text-sm text-[var(--agyn-gray)]">Runners enrolled at the cluster level.</p>
        </div>
        <Button variant="outline" size="sm">Enroll runner</Button>
      </div>
      {runnersQuery.isPending ? (
        <div className="text-sm text-[var(--agyn-gray)]">Loading runners...</div>
      ) : null}
      {runnersQuery.isError ? (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load runners.</div>
      ) : null}
      <Card className="border-[var(--agyn-border-subtle)]">
        <CardContent className="px-0">
          <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_2fr_120px]">
            <span>Runner</span>
            <span>Status</span>
            <span>Labels</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-[var(--agyn-border-subtle)]">
            {runners.length === 0 ? (
              <div className="px-6 py-6 text-sm text-[var(--agyn-gray)]">No cluster runners yet.</div>
            ) : (
              runners.map((runner) => (
                <div
                  key={runner.meta?.id ?? runner.name}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_2fr_120px]"
                >
                  <div>
                    <div className="font-medium">{runner.name}</div>
                    <div className="text-xs text-[var(--agyn-gray)]">{runner.meta?.id}</div>
                  </div>
                  <Badge variant="secondary">{formatRunnerStatus(runner.status)}</Badge>
                  <span className="text-xs text-[var(--agyn-gray)]">{formatLabelPairs(runner.labels)}</span>
                  <div className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <NavLink to={`/runners/${runner.meta?.id ?? ''}`}>View</NavLink>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
