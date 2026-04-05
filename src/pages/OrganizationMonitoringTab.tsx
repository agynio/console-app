import { Card, CardContent } from '@/components/ui/card';

export function OrganizationMonitoringTab() {
  const sections = [
    {
      id: 'active-workloads',
      title: 'Active Workloads',
      description: 'Track running workloads deployed for this organization.',
      stub: 'Active workload monitoring requires a backend API addition (ListWorkloads on RunnersGateway with organization_id filter).',
    },
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
      <div>
        <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="organization-monitoring-heading">
          Monitoring
        </h3>
        <p className="text-sm text-[var(--agyn-gray)]">Observability for organization workloads.</p>
      </div>
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.id} className="space-y-3" data-testid={`organization-monitoring-${section.id}`}>
            <div>
              <h4 className="text-base font-semibold text-[var(--agyn-dark)]">{section.title}</h4>
              <p className="text-sm text-[var(--agyn-gray)]">{section.description}</p>
            </div>
            <Card className="border-[var(--agyn-border-subtle)]">
              <CardContent className="py-6 text-sm text-[var(--agyn-gray)]">{section.stub}</CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
