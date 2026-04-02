import { Card, CardContent } from '@/components/ui/card';

export function AgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">Agents</h2>
        <p className="text-sm text-[var(--agyn-gray)]">Manage agent fleets, MCPs, and assignments.</p>
      </div>
      <Card className="border-[var(--agyn-border-subtle)]">
        <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
          Agent management will appear here once connected to the gateway APIs.
        </CardContent>
      </Card>
    </div>
  );
}
