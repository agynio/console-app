import { Card, CardContent } from '@/components/ui/card';

export function VolumesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">Volumes</h2>
        <p className="text-sm text-[var(--agyn-gray)]">Provision storage for agents and apps.</p>
      </div>
      <Card className="border-[var(--agyn-border-subtle)]">
        <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
          Volume inventories and attachments will appear here.
        </CardContent>
      </Card>
    </div>
  );
}
