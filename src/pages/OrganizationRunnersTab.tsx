import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { EnrollRunnerDialog } from '@/components/EnrollRunnerDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatLabelPairs, formatRunnerStatus } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationRunnersTab() {
  const { id } = useParams();
  const organizationId = id ?? '';
  const [enrollOpen, setEnrollOpen] = useState(false);

  const runnersQuery = useQuery({
    queryKey: ['runners', organizationId, 'list'],
    queryFn: () => runnersClient.listRunners({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground" data-testid="organization-runners-heading">
            Runners
          </h3>
          <p className="text-sm text-muted-foreground">Organization-scoped runners.</p>
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
            <span>Runner</span>
            <span>Status</span>
            <span>Labels</span>
          </div>
          <div className="divide-y divide-border">
            {(runnersQuery.data?.runners ?? []).length === 0 ? (
              <div className="px-6 py-6 text-sm text-muted-foreground">No runners registered.</div>
            ) : (
              runnersQuery.data?.runners.map((runner) => (
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
