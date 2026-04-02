import { Card, CardContent } from '@/components/ui/card';

export function MonitoringPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">Monitoring</h2>
        <p className="text-sm text-[var(--agyn-gray)]">Observability for agents, runs, and models.</p>
      </div>
      <Card className="border-[var(--agyn-border-subtle)]">
        <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
          Monitoring dashboards and traces will be surfaced here.
        </CardContent>
      </Card>
    </div>
  );
}
