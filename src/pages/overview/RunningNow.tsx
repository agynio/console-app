import { NavLink } from 'react-router-dom';
import { BotIcon, TerminalIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RuntimeOwnerKind, WorkloadStatus, type Workload } from '@/gen/agynio/api/runners/v1/runners_pb';
import { formatAge } from '@/lib/format';

type RunningNowProps = {
  organizationId: string;
  workloads: Workload[];
  isPending: boolean;
  isError: boolean;
};

const MAX_ROWS = 5;

/** What the workload is, in the words of whatever owns it. */
function workloadName(workload: Workload): string {
  return workload.ownerName || workload.agentClassName || workload.agentName || workload.meta?.id || 'Workload';
}

export function RunningNow({ organizationId, workloads, isPending, isError }: RunningNowProps) {
  const rows = workloads.slice(0, MAX_ROWS);

  return (
    <Card className="gap-3 border-border px-4 py-3" data-testid="organization-overview-running">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">Running now</span>
        {workloads.length > rows.length ? (
          <NavLink
            to={`/organizations/${organizationId}/workloads`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {workloads.length} total
          </NavLink>
        ) : null}
      </div>
      <div>
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : isError ? (
          <div className="text-sm text-muted-foreground">Failed to load workloads.</div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">
            Nothing is running. Workloads start when an agent is spoken to.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((workload) => {
              const Icon = workload.ownerKind === RuntimeOwnerKind.SANDBOX ? TerminalIcon : BotIcon;
              return (
                <NavLink
                  key={workload.meta?.id}
                  to={`/organizations/${organizationId}/workloads/${workload.meta?.id}`}
                  className="flex items-center gap-3 py-2 first:pt-0 last:pb-0 hover:text-foreground"
                  data-testid="organization-overview-running-row"
                >
                  <span
                    className={
                      workload.status === WorkloadStatus.RUNNING
                        ? 'h-2 w-2 shrink-0 rounded-full bg-primary'
                        : 'h-2 w-2 shrink-0 animate-pulse rounded-full bg-muted-foreground'
                    }
                  />
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {workloadName(workload)}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {formatAge(workload.meta?.createdAt)}
                  </span>
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
