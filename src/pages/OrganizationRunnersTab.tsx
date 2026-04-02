import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RunnerStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { formatLabelPairs } from '@/lib/format';

function formatRunnerStatus(status: RunnerStatus): string {
  if (status === RunnerStatus.ENROLLED) return 'Enrolled';
  if (status === RunnerStatus.PENDING) return 'Pending';
  if (status === RunnerStatus.OFFLINE) return 'Offline';
  return 'Unspecified';
}

export function OrganizationRunnersTab() {
  const { id } = useParams();
  const organizationId = id ?? '';

  const runnersQuery = useQuery({
    queryKey: ['runners', organizationId, 'list'],
    queryFn: () => runnersClient.listRunners({ organizationId, pageSize: 200, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-[var(--agyn-dark)]">Runners</h3>
        <p className="text-sm text-[var(--agyn-gray)]">Organization-scoped runners.</p>
      </div>
      {runnersQuery.isPending ? (
        <div className="text-sm text-[var(--agyn-gray)]">Loading runners...</div>
      ) : null}
      {runnersQuery.isError ? (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load runners.</div>
      ) : null}
      <Card className="border-[var(--agyn-border-subtle)]">
        <CardContent className="px-0">
          <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_2fr]">
            <span>Runner</span>
            <span>Status</span>
            <span>Labels</span>
          </div>
          <div className="divide-y divide-[var(--agyn-border-subtle)]">
            {(runnersQuery.data?.runners ?? []).length === 0 ? (
              <div className="px-6 py-6 text-sm text-[var(--agyn-gray)]">No runners registered.</div>
            ) : (
              runnersQuery.data?.runners.map((runner) => (
                <div
                  key={runner.meta?.id ?? runner.name}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_2fr]"
                >
                  <div>
                    <div className="font-medium">{runner.name}</div>
                    <div className="text-xs text-[var(--agyn-gray)]">{runner.meta?.id}</div>
                  </div>
                  <Badge variant="secondary">{formatRunnerStatus(runner.status)}</Badge>
                  <span className="text-xs text-[var(--agyn-gray)]">{formatLabelPairs(runner.labels)}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
