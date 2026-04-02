import { Card, CardContent } from '@/components/ui/card';

export function AppsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">Apps</h2>
        <p className="text-sm text-[var(--agyn-gray)]">Register and manage platform apps.</p>
      </div>
      <Card className="border-[var(--agyn-border-subtle)]">
        <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
          App registration and enrollment workflows will be available here.
        </CardContent>
      </Card>
    </div>
  );
}
