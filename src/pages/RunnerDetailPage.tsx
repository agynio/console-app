import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatLabelPairs, formatRunnerStatus } from '@/lib/format';

export function RunnerDetailPage() {
  const { id } = useParams();
  const runnerId = id ?? '';

  const runnerQuery = useQuery({
    queryKey: ['runners', runnerId],
    queryFn: () => runnersClient.getRunner({ id: runnerId }),
    enabled: Boolean(runnerId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const runner = runnerQuery.data?.runner;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">Runner</h2>
        <p className="text-sm text-[var(--agyn-gray)]">Runner status and metadata.</p>
      </div>
      {runnerQuery.isPending ? (
        <div className="text-sm text-[var(--agyn-gray)]">Loading runner...</div>
      ) : null}
      {runnerQuery.isError ? (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load runner.</div>
      ) : null}
      {runner ? (
        <Card className="border-[var(--agyn-border-subtle)]">
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--agyn-dark)]">Details</h3>
              <p className="text-sm text-[var(--agyn-gray)]">Runner configuration and scope.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Name</div>
                <div className="text-sm text-[var(--agyn-dark)]">{runner.name}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Runner ID</div>
                <div className="text-sm text-[var(--agyn-dark)]">{runner.meta?.id}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Status</div>
                <Badge variant="secondary">{formatRunnerStatus(runner.status)}</Badge>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Scope</div>
                <div className="text-sm text-[var(--agyn-dark)]">
                  {runner.organizationId ? `Organization ${runner.organizationId}` : 'Cluster'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Identity ID</div>
                <div className="text-sm text-[var(--agyn-dark)]">{runner.identityId}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Labels</div>
                <div className="text-sm text-[var(--agyn-dark)]">{formatLabelPairs(runner.labels)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
