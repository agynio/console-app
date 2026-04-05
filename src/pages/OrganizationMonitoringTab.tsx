import { Card, CardContent } from '@/components/ui/card';

export function OrganizationMonitoringTab() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="organization-monitoring-heading">
          Monitoring
        </h3>
        <p className="text-sm text-[var(--agyn-gray)]">Observability for organization workloads.</p>
      </div>
      <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-monitoring-placeholder">
        <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
          Monitoring dashboards will be available here.
        </CardContent>
      </Card>
    </div>
  );
}
